// Sahaja Yoga Leela Game — MVP template
// NOTE: This file is a placeholder. You will add logic for:
// - loading CSV
// - generating seed from name + timestamp
// - randomizing quote + image
// - translating (optional)
// - exporting card as PNG (optional)
// ====== Elements ======
const form = document.getElementById('player-form');
const playArea = document.getElementById('play-area');
const playerNameEl = document.getElementById('playerName');

// ====== DOM ======
const spinButton   = document.getElementById('spinButton');
const resultCard   = document.getElementById('resultCard');
const playAgain    = document.getElementById('playAgain');
const cooldownNote = document.getElementById('cooldownNote');
const cdEn         = document.getElementById('cooldownCountdown');
const cdTh         = document.getElementById('cooldownCountdownTH');

// Admin controls
const adminPanel   = document.getElementById('adminPanel');
const cfgCooldown  = document.getElementById('cfgCooldownMin');
const cfgTesting   = document.getElementById('cfgTestingMode');
const cfgApiKey    = document.getElementById('cfgApiKey');
const cfgSave      = document.getElementById('cfgSave');

const resultTitle = document.getElementById('resultTitle');
const quoteEN = document.getElementById('quoteEN');
const quoteTH = document.getElementById('quoteTH');
const resultMeta = document.getElementById('resultMeta');
const resultImage = document.getElementById('resultImage');
const saveCard = document.getElementById('saveCard');

// ====== Config & Storage ======
const CONFIG_KEY = 'leela:config';
const LASTPLAY_PREFIX = 'leela:lastPlay:'; // per player key

const CONFIG = loadConfig();  // { cooldownMin, testingMode, apiKey }

function loadConfig(){
  try{
    const raw = localStorage.getItem(CONFIG_KEY);
    if(!raw) return { cooldownMin: 0, testingMode: true, apiKey: '' };
    const obj = JSON.parse(raw);
    return {
      cooldownMin: Number(obj.cooldownMin) || 0,
      testingMode: !!obj.testingMode,
      apiKey: obj.apiKey || ''
    };
  }catch(e){ return { cooldownMin: 0, testingMode: true, apiKey: '' }; }
}
function saveConfig(){
  const obj = {
    cooldownMin: Number(cfgCooldown.value) || 0,
    testingMode: cfgTesting.checked,
    apiKey: cfgApiKey.value.trim()
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(obj));
  alert('Saved / บันทึกแล้ว');
}
cfgSave?.addEventListener('click', saveConfig);

// ====== Data ======
let player = { firstName: '', lastName: '' };
let QUOTES = [];
let IMAGES = [];
let dataReady = false;

// ====== Utils ======
// Simple CSV parser for 2 columns (Quote,Date) — assumes no embedded commas
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(",").map(s=>s.trim());
  const idxQuote = header.findIndex(h => /quote/i.test(h));
  const idxDate  = header.findIndex(h => /date/i.test(h));
  return lines.map(line=>{
    // split only first comma to keep commas inside quote text (basic)
    const firstComma = line.indexOf(",");
    let q = line, d = "";
    if(firstComma >= 0){ q = line.slice(0, firstComma); d = line.slice(firstComma+1); }
    return { Quote: q.replace(/^"|"$/g,''), Date: d.replace(/^"|"$/g,'') };
  });
}

async function loadData(){
  try {
    // โหลด JSON ที่เราแปลงไว้ล่วงหน้า
    const quotes = await fetch('./data/quotes.json', { cache: 'no-store' });
    if (!quotes.ok) throw new Error(`quotes.json HTTP ${quotes.status}`);
    QUOTES = await quotes.json();
    if (!Array.isArray(QUOTES) || QUOTES.length === 0) throw new Error('quotes.json empty');

    // โหลดรายชื่อรูป
    try {
      const r = await fetch('./assets/smjm-manifest.json', { cache: 'no-store' });
      IMAGES = r.ok ? await r.json() : [];
      if (!Array.isArray(IMAGES)) IMAGES = [];
    } catch(e){
      console.warn('manifest load fail:', e);
      IMAGES = [];
    }
    dataReady = true;
    console.log(`Loaded quotes: ${QUOTES.length}, images listed: ${IMAGES.length}`);
  } catch (e) {
    console.error('loadData failed:', e);
    alert('โหลดข้อมูลไม่สำเร็จ: กรุณาตรวจ public/data/quotes.json และลองรีเฟรช');
  }
}


// ====== Hold-to-Spin animation state ======
function resetSpinState(){
  spinning = false;
  holdMs = 0;
  holdStart = 0;
  if (holdTimer){ clearInterval(holdTimer); holdTimer = null; }
  spinButton.classList.remove('is-spinning', 'pulse');
  // คืนค่าความเร็วให้เป็นค่าเริ่ม
  spinButton.style.removeProperty('--spin-speed');
}

// ปรับความเร็วหมุนตามระยะเวลาที่กดค้าง (0.6s → 0.3s)
function speedFromHold(ms){
  const clamped = Math.max(300, Math.min(1200, 1200 - (ms * 0.8))); // 0–1.5s
  return clamped; // milliseconds ต่อรอบ
}

function beginSpinVisual(){
  spinning = true;
  spinButton.classList.add('is-spinning');
  // เริ่มด้วยความเร็วพื้นฐาน
  spinButton.style.setProperty('--spin-speed', '.9s');
}

function updateSpinVisual(ms){
  const spd = speedFromHold(ms); // ms per 1 rotation
  spinButton.style.setProperty('--spin-speed', `${Math.round(spd)}ms`);
}

function endSpinVisualEaseOut(){
  // ชะลอหมุนก่อนหยุด
  spinButton.style.setProperty('--spin-speed', '1200ms');
  setTimeout(() => {
    spinButton.classList.remove('is-spinning');
  }, 600); // ปิดสปินเนอร์หลังชะลอ
}

// ====== Wiring hold events ======
function attachHoldToSpin(){
  const start = (e) => {
  if (!dataReady) return;
  if (spinning) return;
  resetSpinState();               // <-- เพิ่มบรรทัดนี้
  holdStart = Date.now();
  beginSpinVisual();
  holdTimer = setInterval(() => {
    holdMs = Date.now() - holdStart;
    updateSpinVisual(holdMs);
  }, 60);
};

  const end = async (e) => {
  if (!spinning) return;
  clearInterval(holdTimer); holdTimer = null;
  holdMs = Date.now() - holdStart;

  endSpinVisualEaseOut();
  const settle = Math.min(1200, Math.max(600, holdMs * 0.6));
  await new Promise(r => setTimeout(r, settle));

  await revealLeelaResult();
  spinning = false;               // ย้ำ
  // ไม่ resetSpinState ทันที เพื่อให้ผลลัพธ์แสดงก่อน
};

  // รองรับทั้ง mouse และ touch / pointer
  spinButton.addEventListener('pointerdown', start);
  spinButton.addEventListener('pointerup', end);
  spinButton.addEventListener('pointerleave', end);
  // สำหรับคีย์บอร์ด (Space/Enter)
  spinButton.addEventListener('keydown', (e)=>{
    if(e.code === 'Space' || e.code === 'Enter'){ start(); }
  });
  spinButton.addEventListener('keyup', (e)=>{
    if(e.code === 'Space' || e.code === 'Enter'){ end(); }
  });
}

// ====== สุ่ม & แสดงผล (เรียกตอนปล่อย) ======
async function revealLeelaResult(){
  // safety
  if (!dataReady || QUOTES.length === 0){
    alert('Data not ready / ข้อมูลยังโหลดไม่เสร็จ');
    return;
  }

  const ts = Date.now();
  const seed = makeSeed(player.firstName, player.lastName, ts);
  const rng1 = mulberry32(seed);
  const rng2 = mulberry32(seed + 1);

  const qi = Math.floor(rng1() * QUOTES.length);
  const row = QUOTES[qi];

  let imgPath = './assets/img/hero.jpg';
  if(Array.isArray(IMAGES) && IMAGES.length){
    const ii = Math.floor(rng2() * IMAGES.length);
    imgPath = `./assets/smjm/${IMAGES[ii]}`;
  }

  resultTitle.textContent = `คำตอบของคุณ ${player.firstName} ${player.lastName} / Your message`;
  quoteEN.textContent = row.Quote || '';

  // ไทย: ถ้ายังไม่มีระบบแปล ให้เป็นบรรทัดกำกับไว้ก่อน
  quoteTH.textContent = row.Translated ?? '(Thai translation will appear here / จะแสดงคำแปลภาษาไทยในขั้นถัดไป)';

  // เมทาดาต้า 2 ภาษา
  const playedAt = new Date(ts);
  resultMeta.innerHTML =
    `Quote Date: ${row.Date || '-'} • Played at: ${playedAt.toLocaleString()}<br>` +
    `วันที่คำกล่าว: ${row.Date || '-'} • เวลาเล่น: ${playedAt.toLocaleString('th-TH')}`;

  resultImage.src = imgPath;
  resultImage.alt = 'Shri Mataji';

  resultCard.hidden = false;
  // ซ่อนปุ่มเล่นทันที เพื่อให้ flow ไปกด Play Again เท่านั้น
  hideSpin();

  // บันทึกเวลาเล่น (ใช้สำหรับคูลดาวน์รอบหน้า)
  setLastPlay(Date.now());
}


// ====== เริ่มใช้งาน ======
document.addEventListener('DOMContentLoaded', () => {
  if(cfgCooldown) cfgCooldown.value = CONFIG.cooldownMin;
  if(cfgTesting)  cfgTesting.checked = CONFIG.testingMode;
  if(cfgApiKey)   cfgApiKey.value = CONFIG.apiKey;
  loadData();
  attachHoldToSpin();
});

// ====== Cooldown helpers ======
function playerKey(){
  const name = `${player.firstName} ${player.lastName}`.trim().toLowerCase();
  // simple hash
  let h=0; for(const c of name){ h = ((h<<5)-h) + c.charCodeAt(0); h|=0; }
  return LASTPLAY_PREFIX + h;
}
function getLastPlay(){
  const raw = localStorage.getItem(playerKey());
  return raw ? Number(raw) : 0;
}
function setLastPlay(ts){
  localStorage.setItem(playerKey(), String(ts));
}
function msLeft(now){
  const cd = (Number(CONFIG.cooldownMin)||0) * 60_000;
  if(CONFIG.testingMode || cd<=0) return 0;
  const last = getLastPlay();
  const until = last + cd;
  return Math.max(0, until - now);
}
let cdTimer = null;
function startCountdown(remMs){
  stopCountdown();
  updateCountdown(remMs);
  cdTimer = setInterval(()=>{
    remMs -= 1000;
    if(remMs <= 0){ stopCountdown(); showSpin(); cooldownNote.classList.add('hidden'); }
    else updateCountdown(remMs);
  }, 1000);
}
function stopCountdown(){
  if(cdTimer){ clearInterval(cdTimer); cdTimer=null; }
}
function updateCountdown(ms){
  const s = Math.ceil(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  const pad = n => String(n).padStart(2,'0');
  const en = (hh>0? `${hh}:`:'') + `${pad(mm)}:${pad(ss)}`;
  cdEn.textContent = en;
  cdTh.textContent = en;
}

// ====== Spin state (คงเดิม + รีเซ็ต) ======
let holdTimer = null, holdStart=0, holdMs=0, spinning=false;
function resetSpinState(){
  spinning=false; holdMs=0; holdStart=0;
  if(holdTimer){ clearInterval(holdTimer); holdTimer=null; }
  spinButton.classList.remove('is-spinning','pulse');
  spinButton.style.removeProperty('--spin-speed');
}
function hideSpin(){ spinButton.classList.add('hidden'); }
function showSpin(){
  resetSpinState();
  spinButton.classList.remove('hidden');
  setTimeout(()=>{ spinButton.classList.add('pulse'); setTimeout(()=>spinButton.classList.remove('pulse'),1200); }, 80);
}
// ====== Seeded RNG ======
// A1Z26 numeric value
function nameValue(str=''){
  let sum = 0;
  for(const ch of str.toUpperCase()){
    const code = ch.charCodeAt(0);
    if(code>=65 && code<=90) sum += (code-64);
  }
  return sum;
}
function digitalRoot(n){
  n = Math.abs(n);
  while(n>9){
    n = n.toString().split('').reduce((a,b)=>a+Number(b),0);
  }
  return n || 1;
}
// Mulberry32 PRNG
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic-ish seed from name + timestamp
function makeSeed(first,last,ts){
  const base = nameValue(first) + nameValue(last) * 31 + digitalRoot(nameValue(first)+nameValue(last))*997;
  // fold timestamp for per-click uniqueness
  const mix = (base ^ (ts & 0xffffffff)) >>> 0;
  return mix || 123456789;
}

// ====== UI Flow ======
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  player.firstName = String(fd.get('firstName') || '').trim();
  player.lastName = String(fd.get('lastName') || '').trim();
  if(!player.firstName || !player.lastName){
    alert('กรุณากรอกชื่อและนามสกุล (ภาษาอังกฤษ)');
    return;
  }
  playerNameEl.textContent = `${player.firstName} ${player.lastName}`;
  playArea.hidden = false;
  window.scrollTo({top: playArea.offsetTop - 12, behavior: 'smooth'});

  // lazy-load data first time
  if(QUOTES.length === 0) await loadData();
  
  const now = Date.now();
  const remain = msLeft(now);
  if(remain > 0){
    hideSpin();
    cooldownNote.classList.remove('hidden');
    startCountdown(remain);
  }else{
    cooldownNote.classList.add('hidden');
    showSpin();
  }
});

// ====== Admin trigger (hidden) ======
// คลิกภาพ hero 7 ครั้ง เพื่อ toggle admin panel
(function secretAdmin(){
  const hero = document.querySelector('.hero__image');
  if(!hero) return;
  let taps = 0, timer=null;
  const reset = ()=>{ taps=0; if(timer){clearTimeout(timer); timer=null;} };
  hero.addEventListener('click', ()=>{
    taps++;
    if(timer) clearTimeout(timer);
    timer = setTimeout(reset, 1200);
    if(taps>=7){
      adminPanel.classList.toggle('hidden');
      reset();
      // sync fields with current CONFIG
      cfgCooldown.value = CONFIG.cooldownMin;
      cfgTesting.checked = CONFIG.testingMode;
      cfgApiKey.value = CONFIG.apiKey;
    }
  });
})();

spinButton?.addEventListener('click', async () => {
  if (!dataReady) {
    alert('กำลังโหลดข้อมูล โปรดลองอีกครั้ง');
    return;
  }

  spinButton.disabled = true;
  const labelKeep = spinButton.textContent;
  spinButton.textContent = 'กำลังสุ่ม...';
  await new Promise(r => setTimeout(r, 900)); // ritual delay

  const ts = Date.now();
  const seed = makeSeed(player.firstName, player.lastName, ts);
  const rng1 = mulberry32(seed);
  const rng2 = mulberry32(seed + 1);

  // pick quote
  const qi = Math.floor(rng1() * QUOTES.length);
  const row = QUOTES[qi];

  // pick image (fallback to hero if manifest empty)
  let imgPath = './assets/img/hero.jpg';
  if(Array.isArray(IMAGES) && IMAGES.length){
    const ii = Math.floor(rng2() * IMAGES.length);
    imgPath = `./assets/smjm/${IMAGES[ii]}`;
  }

  // Render
  resultTitle.textContent = `คำตอบของคุณ ${player.firstName} ${player.lastName}`;
  quoteEN.textContent = row.Quote || '';
  quoteTH.textContent = '(ไทย: เปิดการแปลในรอบถัดไป หรือเตรียมไฟล์แปลล่วงหน้า)';
  resultMeta.textContent = `Quote Date: ${row.Date || '-'} • Played at: ${new Date(ts).toLocaleString()}`;

  resultImage.src = imgPath;
  resultImage.alt = 'Shri Mataji';

  resultCard.hidden = false;
  spinButton.disabled = false;
  spinButton.textContent = labelKeep;
});

// ====== Play Again ======
playAgain?.addEventListener('click', () => {
  // เคลียร์การ์ด
  resultCard.hidden = true;
  quoteEN.textContent=''; quoteTH.textContent=''; resultMeta.textContent='';

  const now = Date.now();
  const remain = msLeft(now);
  if(remain > 0){
    // ยังติดคูลดาวน์: ซ่อนปุ่ม spin, โชว์โน้ต + countdown
    hideSpin();
    cooldownNote.classList.remove('hidden');
    startCountdown(remain);
  }else{
    // เล่นได้ทันที
    cooldownNote.classList.add('hidden');
    showSpin();
    stopCountdown();
  }
});