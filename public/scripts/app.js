/* Sahaja Yoga Leela Game — app.js (REV: stable screen-cap, html-to-image only)
   - Capture #resultCard ที่เห็นบนจอด้วย html-to-image
   - รูปสุ่ม inline เป็น Data URL ก่อนเสมอ (เซฟครั้งแรกมีรูปแน่นอน)
   - กันลั่นซ้ำจาก pointer events
   - Cooldown/Admin logic คงเดิม
*/

// ========== Constants ==========
const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
      '<rect width="100%" height="100%" fill="#f3f4f6"/>' +
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="36" fill="#9ca3af">Image</text>' +
    '</svg>'
  );

const cfgDailyLock = document.getElementById('cfgDailyLock');
const CONFIG_KEY = 'leela:config:v3'; // bump เวอร์ชัน
const LASTPLAY_PREFIX = 'leela:lastPlay:';
// ===== DEV switch (เปิด = ปิดล็อกวันละครั้ง/คูลดาวน์ทั้งหมด) =====
const DEV_BYPASS = false;   // <<< เปลี่ยนเป็น false ก่อนปล่อยจริง
// ========== DOM ==========
const inputCard     = document.getElementById('input-card'); // 💡 เพิ่ม DOM element ใหม่
const form          = document.getElementById('player-form');
const playArea      = document.getElementById('play-area');
const playerNameEl  = document.getElementById('playerName');

const spinButton    = document.getElementById('spinButton');
const resultCard    = document.getElementById('resultCard');
const resultTitle   = document.getElementById('resultTitle');
const quoteEN       = document.getElementById('quoteEN');
const quoteTH       = document.getElementById('quoteTH');
const resultMeta    = document.getElementById('resultMeta');
const resultImage   = document.getElementById('resultImage');

const saveCard      = document.getElementById('saveCard');
const playAgain     = document.getElementById('playAgain');

const cooldownNote  = document.getElementById('cooldownNote');
const cdEn          = document.getElementById('cooldownCountdown');
const cdTh          = document.getElementById('cooldownCountdownTH');

// Admin
const adminPanel    = document.getElementById('adminPanel');
const cfgCooldown   = document.getElementById('cfgCooldownMin');
const cfgTesting    = document.getElementById('cfgTestingMode');
const cfgApiKey     = document.getElementById('cfgApiKey');
const cfgSave       = document.getElementById('cfgSave');

// (ถ้ามี exportCard/exImage อยู่ใน DOM เราจะ “นิ่งไว้” และยัดรูปเป็น Data URL ให้ด้วยกัน error)
const exportCard    = document.getElementById('exportCard') || null;
const exImage       = document.getElementById('exImage') || null;

// ========== State ==========
let player = { firstName: '', lastName: '' };
let QUOTES = [];
let IMAGES = [];
let dataReady = false;
let preRenderedCanvas = null; // 💡 NEW: เก็บ Canvas ที่เรนเดอร์ล่วงหน้า

let lastResult = null;     // { qi, img, ts }
let resultImgReady = null; // Promise: รูปในการ์ดพร้อมจริงสำหรับเซฟ

let holdTimer = null, holdStart = 0, holdMs = 0;
let spinning = false;
let startedHold = false;
let isRevealing = false;
let holdBound = false;

// ========== Config ==========
const CONFIG = loadConfig();  // { cooldownMin, testingMode, apiKey }

function loadConfig(){
  try{
    const raw = localStorage.getItem(CONFIG_KEY);
    if(!raw) return { cooldownMin: 0, testingMode: false, dailyLock: true, apiKey: '' };
    const obj = JSON.parse(raw);
    return {
      cooldownMin: Number(obj.cooldownMin) || 60,
      testingMode: !!obj.testingMode,
      dailyLock:   obj.dailyLock === undefined ? true : !!obj.dailyLock, // ดีฟอลต์ "เปิด"
      apiKey: obj.apiKey || ''
    };
  }catch(e){
    return { cooldownMin: 0, testingMode: false, dailyLock: true, apiKey: '' };
  }
}

function saveConfig(){
  const obj = {
    cooldownMin: Number(cfgCooldown.value) || 60,
    testingMode: !!cfgTesting.checked,
    dailyLock:   !!cfgDailyLock.checked,
    apiKey: (cfgApiKey.value || '').trim()
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(obj));

  // sync ตัวแปรในหน่วยความจำ
  CONFIG.cooldownMin = obj.cooldownMin;
  CONFIG.testingMode = obj.testingMode;
  CONFIG.dailyLock   = obj.dailyLock;
  CONFIG.apiKey      = obj.apiKey;

  // รีคำนวณสถานะปุ่ม/คูลดาวน์ทันที
  const now = Date.now();
  const remain = msLeft(now);
  if(remain > 0){ hideSpin(); cooldownNote.classList.remove('hidden'); startCountdown(remain); }
  else { cooldownNote.classList.add('hidden'); showSpin(); }

  alert('Saved / บันทึกแล้ว');
}

cfgSave?.addEventListener('click', saveConfig);

// ===== Persist last result per player (today) =====
const LASTRESULT_PREFIX = 'leela:lastResult:';
function lastResultKey(){ return LASTRESULT_PREFIX + playerKey(); }

// เที่ยงคืนถัดไปตามเวลาเครื่องผู้ใช้
function nextLocalMidnight(ts = Date.now()){
  const d = new Date(ts);
  d.setHours(24,0,0,0);
  return d.getTime();
}
// ยังอยู่ในช่วงล็อกเดียวกันหรือไม่ (ก่อนเที่ยงคืนถัดไป)
function isSameLockPeriod(ts){
  return Date.now() < nextLocalMidnight(ts);
}

// โชว์ผลจาก row/imgPath/ts ที่มีอยู่ (ใช้ตอน restore)
function renderExistingResult({ row, imgPath, ts }){
  resultTitle.textContent = `คำสอนที่ถูกเลือกมาสำหรับคุณ ${player.firstName} ${player.lastName} / This quote has been chosen for you`;
  quoteEN.textContent = row.Quote || '';
  quoteTH.textContent = row.Translated || '';

  const qEN = formatQuoteDate(row.Date, 'en');
  const qTH = formatQuoteDate(row.Date, 'th');
  const pEN = formatPlayedAt(ts, 'en');
  const pTH = formatPlayedAt(ts, 'th');
  resultMeta.innerHTML =
    `Quote Date: ${qEN} • Played at: ${pEN}<br>` +
    `วันที่คำกล่าว: ${qTH} • เวลาเล่น: ${pTH}`;

  // ภาพบนการ์ด (พร้อม CORS)
  resultImage.crossOrigin = 'anonymous';
  resultImage.decoding = 'sync';
  resultImage.loading  = 'eager';
  resultImage.onerror  = () => { resultImage.onerror = null; resultImage.src = PLACEHOLDER_IMG; };
  resultImage.src      = imgPath;
  enableSaveNow();
  resultImage.addEventListener('load', enableSaveNow, { once:true });
  // ภาพฝั่ง export (ถ้ามี)
  if (exImage){
    exImage.crossOrigin = 'anonymous';
    exImage.decoding = 'sync';
    exImage.loading  = 'eager';
    exImage.onerror  = null;
    exImage.src      = imgPath;
  }

  // ให้ฟังก์ชันเซฟรู้ว่ารูปพร้อมเมื่อไหร่
  resultImgReady = waitImageReady(resultImage);

  // แสดงการ์ด + เปิดปุ่มบันทึก
  resultCard.hidden = false;
  playArea.classList.add('has-result');
  if (saveCard) saveCard.disabled = false;   // <-- เปิดปุ่ม Save ที่นี่

  hideSpin();

  // ตั้ง lastPlay และนับถอยหลังตามโหมดล็อก
  setLastPlay(ts);
  const remain = msLeft(Date.now());
  if (remain > 0){
    cooldownNote.classList.remove('hidden');
    startCountdown(remain);
    // (ออปชัน) ซ่อนปุ่มเล่นซ้ำถ้าล็อกวันละครั้ง
    playAgain?.classList.add('hidden');
  } else {
    cooldownNote.classList.add('hidden');
    playAgain?.classList.remove('hidden');
    playAgain.disabled = true; // ให้ผู้ใช้เซฟก่อน
    enableSaveNow();
  }

  // อัพเดต lastResult ให้ชื่อไฟล์เซฟถูกต้อง
  lastResult = { qi: QUOTES.indexOf(row), img: (imgPath.split('/').pop() || ''), ts };
}

// ========== Helpers ==========
function secureRandomInt(n){
  if (!n || n <= 0) return 0;
  if (window.crypto?.getRandomValues){
    const u32 = new Uint32Array(1);
    window.crypto.getRandomValues(u32);
    return u32[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function enableSaveNow(){
  if (!saveCard) return;
  saveCard.disabled = false;
  saveCard.classList.remove('is-disabled');
}

function waitNextFrame(){ return new Promise(r => requestAnimationFrame(()=>r())); }
async function waitFontsReady(){ try{ if(document.fonts?.ready) await document.fonts.ready; }catch(_){} }

async function waitImageReady(img){
  if(!img) return;
  if(!(img.complete && img.naturalWidth > 0)){
    await new Promise(res=>{
      const done = ()=>res();
      img.addEventListener('load', done, { once:true });
      img.addEventListener('error', done, { once:true });
    });
  }
  if(img.decode){ try{ await img.decode(); }catch(_){} }
  await waitNextFrame();
}

async function toDataURL(url){
  try{
    const res = await fetch(url, { cache: 'force-cache' });
    const blob = await res.blob();
    return await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }catch(e){
    console.warn('toDataURL failed, using placeholder:', e);
    return PLACEHOLDER_IMG;
  }
}

// Seeded RNG / numerology-ish
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
  while(n>9) n = n.toString().split('').reduce((a,b)=>a+Number(b),0);
  return n || 1;
}
//----- RNG 

// ====== Daily shuffle + No-repeat helpers ======
function todayStr(){
  const d = new Date();  // local time
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da= String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function makeDaySeed(dayStr){ // simple FNV-ish hash
  let h = 2166136261 >>> 0;
  for (const c of dayStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0; }
  return h || 0x9e3779b9;
}
function dailyPermutation(n, seedStr=todayStr()){
  const arr = Array.from({length:n}, (_,i)=>i);
  const rng = mulberry32(makeDaySeed(seedStr));
  for (let i=n-1; i>0; i--){
    const j = Math.floor(rng() * (i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// เปลี่ยนชื่อ→เลข (คงที่ต่อผู้เล่น)
function nameSlotForName(n, first='', last=''){
  const s = `${first} ${last}`.trim().toLowerCase();
  let h=0; for (const ch of s){ h = ((h<<5)-h) + ch.charCodeAt(0); h|=0; }
  return Math.abs(h) % Math.max(1,n);
}

// --- No-repeat window (ต่อผู้เล่น บนอุปกรณ์นี้) ---
const HISTORY_PREFIX = 'leela:hist:';   // key ต่อผู้เล่น
const NO_REPEAT_DAYS = 7;               // กันซ้ำ 7 วันล่าสุด
const MAX_TRIES = 4;

function playerHistKey(){               // reuse playerKey() ของคุณได้ แต่แยกไว้ให้ชัด
  return HISTORY_PREFIX + (playerKey?.() || 'anon');
}
function getHistory(){
  try{
    const raw = localStorage.getItem(playerHistKey());
    const arr = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - NO_REPEAT_DAYS*24*60*60*1000;
    return arr.filter(x => Number(x?.ts)||0 >= cutoff);
  }catch{ return []; }
}
function pushHistory(qi){
  const arr = getHistory();
  arr.push({ qi, ts: Date.now() });
  while (arr.length > 64) arr.shift();
  localStorage.setItem(playerHistKey(), JSON.stringify(arr));
}
function pickNonRepeatingIndex(baseQi, perm){
  const used = new Set(getHistory().map(x=>x.qi));
  if (!used.has(baseQi)) return baseQi;
  let pos = perm.indexOf(baseQi);
  for (let t=0; t<MAX_TRIES; t++){
    pos = (pos + 1) % perm.length;
    const cand = perm[pos];
    if (!used.has(cand)) return cand;
  }
  return baseQi; // ยอมซ้ำถ้าจำเป็น
}

// Seeded RNG
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeSeed(first,last,ts){
  const base = nameValue(first) + nameValue(last)*31 + digitalRoot(nameValue(first)+nameValue(last))*997;
  const mix = (base ^ (ts & 0xffffffff)) >>> 0;
  return mix || 123456789;
}

// ----- Date formatting helpers -----
const EN_MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const TH_MONTHS_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const pad2 = n => String(n).padStart(2,'0');

function parseQuoteDateParts(raw){
  if(!raw) return {y:null,m:null,d:null,raw:''};
  const s = String(raw).trim().replace(/^"|"$/g,'');
  // mm/dd/yyyy
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(mdy) return { y: +mdy[3], m: +mdy[1], d: +mdy[2], raw:s };
  // yyyy-mm
  const ym = s.match(/^(\d{4})-(\d{1,2})$/);
  if(ym) return { y: +ym[1], m: +ym[2], d: null, raw:s };
  // yyyy
  const y = s.match(/^(\d{4})$/);
  if(y) return { y: +y[1], m: null, d: null, raw:s };
  // not matched -> fallback to raw string
  return { y:null,m:null,d:null,raw:s };
}

function formatQuoteDate(raw, lang='en'){
  const {y,m,d,raw:s} = parseQuoteDateParts(raw);
  if(y==null) return s || '-';
  if(lang==='en'){
    if(m && d) return `${d} ${EN_MONTHS[m-1]} ${y}`;
    if(m && !d) return `${EN_MONTHS[m-1]} ${y}`;
    return String(y);
  }else{ // th
    const by = y + 543;
    if(m && d) return `${d} ${TH_MONTHS_ABBR[m-1]} ${by}`;
    if(m && !d) return `${TH_MONTHS_ABBR[m-1]} ${by}`;
    return String(by);
  }
}

function formatPlayedAt(ts, lang='en'){
  const d = new Date(ts);
  const day = d.getDate();
  const m = d.getMonth()+1;
  const y = d.getFullYear();
  const hh = pad2(d.getHours()), mm = pad2(d.getMinutes()), ss = pad2(d.getSeconds());
  if(lang==='en'){
    return `${day} ${EN_MONTHS[m-1]} ${y}, ${hh}:${mm}:${ss}`;
  }else{
    return `${day} ${TH_MONTHS_ABBR[m-1]} ${y+543}, ${hh}:${mm}:${ss}`;
  }
}


// ========== Data loading ==========
async function loadData(){
  try {
    // ลองโหลดไฟล์ที่แปลแล้วก่อน
    let res = await fetch('./data/quotes_th.json', { cache: 'no-store' });
    if (!res.ok) {
      console.warn('quotes_th.json not found, fallback to quotes.json');
      res = await fetch('./data/quotes.json', { cache: 'no-store' });
    }
    QUOTES = await res.json();
    if (!Array.isArray(QUOTES) || QUOTES.length === 0) throw new Error('quotes data empty');

    // โหลด manifest รูป (เหมือนเดิม)
    try {
      const r = await fetch('./assets/smjm-manifest.json', { cache: 'no-store' });
      IMAGES = r.ok ? await r.json() : [];
      if (!Array.isArray(IMAGES)) IMAGES = [];
    } catch(e){
      console.warn('manifest load fail:', e);
      IMAGES = [];
    }
    dataReady = true;
    console.log(`Loaded quotes: ${QUOTES.length}, images: ${IMAGES.length}`);
  } catch (e) {
    console.error('loadData failed:', e);
    alert('โหลดข้อมูลไม่สำเร็จ: ตรวจ public/data/quotes_th.json หรือ quotes.json แล้วรีเฟรชค่ะ');
  }
}

// ========== Hold-to-Spin visuals ==========
function speedFromHold(ms){ return Math.max(300, Math.min(1200, 1200 - (ms * 0.8))); }
function beginSpinVisual(){
  spinning = true;
  spinButton.classList.add('is-spinning');
  spinButton.style.setProperty('--spin-speed', '.9s');
}
function updateSpinVisual(ms){
  const spd = speedFromHold(ms);
  spinButton.style.setProperty('--spin-speed', `${Math.round(spd)}ms`);
}
function endSpinVisualEaseOut(){
  spinButton.style.setProperty('--spin-speed', '1200ms');
  setTimeout(() => { spinButton.classList.remove('is-spinning'); }, 600);
}
function resetSpinState(){
  spinning=false; startedHold=false; isRevealing=false;
  holdMs=0; holdStart=0;
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

// ========== Cooldown ==========
function playerKey(){
  const name = `${player.firstName} ${player.lastName}`.trim().toLowerCase();
  let h=0; for(const c of name){ h=((h<<5)-h)+c.charCodeAt(0); h|=0; }
  return LASTPLAY_PREFIX + h;
}

function nextLocalMidnight(ts = Date.now()){
  const d = new Date(ts);
  d.setHours(24,0,0,0);
  return d.getTime();
}

function msLeft(now = Date.now()){
  if (DEV_BYPASS) return 0;         // <<< ตัดคูลดาวน์ทั้งหมดระหว่างเทส
  if (CONFIG.testingMode) return 0;

  const last = getLastPlay();
  if (!last) return 0;

  if (CONFIG.dailyLock){
    const lockUntil = nextLocalMidnight(last);
    return Math.max(0, lockUntil - now);
  } else {
    const cd = (Number(CONFIG.cooldownMin)||0) * 60_000;
    if (cd <= 0) return 0;
    return Math.max(0, (last + cd) - now);
  }
}

function getLastPlay(){ const raw = localStorage.getItem(playerKey()); return raw ? Number(raw) : 0; }
function setLastPlay(ts){ localStorage.setItem(playerKey(), String(ts)); }

function stopCountdown(){ if(cdTimer){ clearInterval(cdTimer); cdTimer=null; } }
function updateCountdown(ms){
  const s = Math.ceil(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  const pad = n => String(n).padStart(2,'0');
  const en = (hh>0? `${hh}:`:'') + `${pad(mm)}:${pad(ss)}`;
  cdEn.textContent = en; cdTh.textContent = en;
}

// ========== Hold-to-Spin wiring ==========
function attachHoldToSpin(){
  if (holdBound) return; holdBound = true;

  // swallow click to avoid double-trigger
  spinButton.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, true);

  const start = (e) => {
    if (!dataReady || isRevealing || spinning) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch(_) {}

    startedHold = true;
    holdStart = Date.now();
    beginSpinVisual();
    holdTimer = setInterval(() => {
      holdMs = Date.now() - holdStart;
      updateSpinVisual(holdMs);
    }, 60);
  };

  const end = async (e) => {
    if (!startedHold) return;
    e.preventDefault();
    startedHold = false;
    clearInterval(holdTimer); holdTimer = null;
    holdMs = Date.now() - holdStart;

    endSpinVisualEaseOut();
    const settle = Math.min(1200, Math.max(600, holdMs * 0.6));
    await new Promise(r => setTimeout(r, settle));

    await revealLeelaResultOnce();
    spinning = false;
  };

  spinButton.addEventListener('pointerdown', start, {passive:false});
  spinButton.addEventListener('pointerup', end, {passive:false});
  spinButton.addEventListener('pointercancel', end, {passive:false});
  spinButton.addEventListener('pointerleave', end, {passive:false});

  // keyboard
  spinButton.addEventListener('keydown', (e)=>{
    if(e.code === 'Space' || e.code === 'Enter'){ e.preventDefault(); start(e); }
  });
  spinButton.addEventListener('keyup', (e)=>{
    if(e.code === 'Space' || e.code === 'Enter'){ e.preventDefault(); end(e); }
  });
}

// ========== Reveal & Render ==========
async function revealLeelaResultOnce(){
  if (isRevealing) return;
  isRevealing = true;

  try{
    if (!dataReady || QUOTES.length === 0){
      alert('Data not ready / ข้อมูลยังโหลดไม่เสร็จ');
      return;
    }

    const ts = Date.now();

    // ===== DEV branch: random ล้วน (ไม่ล็อก/ไม่คูลดาวน์/ไม่ restore) =====
    if (typeof DEV_BYPASS !== 'undefined' && DEV_BYPASS){
      try{ localStorage.removeItem(lastResultKey()); }catch(_){}

      // สุ่มจริง ๆ แบบไม่ล็อกกับชื่อ/วัน
      const qi = secureRandomInt(QUOTES.length);
      const row = QUOTES[qi];

      let imgPath = './assets/img/hero.jpg';
      if (Array.isArray(IMAGES) && IMAGES.length){
        const ii = secureRandomInt(IMAGES.length);
        imgPath = `./assets/smjm/${IMAGES[ii]}`;
      }

      lastResult = { qi, img: (imgPath.split('/').pop() || ''), ts };

      const inlinedImg = await toDataURL(imgPath);

      // เติมการ์ด
      resultTitle.textContent = `คำสอนที่ถูกเลือกมาสำหรับคุณ ${player.firstName} ${player.lastName} / This quote has been chosen for you`;
      quoteEN.textContent = row.Quote || '';
      quoteTH.textContent = row.Translated || '(Thai translation unavailable / ยังไม่มีคำแปล)';

      const qEN = formatQuoteDate(row.Date, 'en');
      const qTH = formatQuoteDate(row.Date, 'th');
      const pEN = formatPlayedAt(ts, 'en');
      const pTH = formatPlayedAt(ts, 'th');
      resultMeta.innerHTML =
        `Quote Date: ${qEN} • Played at: ${pEN}<br>` +
        `วันที่คำกล่าว: ${qTH} • เวลาเล่น: ${pTH}`;

      resultImage.decoding = 'sync';
      resultImage.loading  = 'eager';
      resultImage.onerror  = () => { resultImage.onerror = null; resultImage.src = PLACEHOLDER_IMG; };
      resultImage.src      = inlinedImg;

      enableSaveNow();
      resultImage.addEventListener('load', enableSaveNow, { once: true });  

      if (exImage){
        exImage.decoding = 'sync';
        exImage.loading  = 'eager';
        exImage.onerror  = null;
        exImage.src      = inlinedImg;
      }
      resultImgReady = waitImageReady(resultImage);

      resultCard.hidden = false;
      playArea.classList.add('has-result');
      hideSpin();

      // DEV: ไม่คูลดาวน์ ไม่บันทึก lastPlay/history เพื่อทดสอบต่อเนื่อง
      cooldownNote.classList.add('hidden');
      playAgain?.classList.remove('hidden');
      playAgain.disabled = false;
      if (saveCard) saveCard.disabled = false;

      return; // อย่าไปต่อกิ่ง Production
    }

    // ===== Production branch: Daily shuffle + No-repeat + วันละครั้ง =====

    // ล้างผลเดิมเพื่อเตรียมบันทึกผลใหม่ (กรณีวันใหม่)
    try{ localStorage.removeItem(lastResultKey()); }catch(_){}

    // 1) permutation รายวัน
    const quotePerm = dailyPermutation(QUOTES.length);
    const imagePerm = (Array.isArray(IMAGES) && IMAGES.length)
      ? dailyPermutation(IMAGES.length)
      : [];

    // 2) map ชื่อ → slot วันนี้ (คงที่ต่อผู้เล่น)
    const slot = nameSlotForName(QUOTES.length, player.firstName, player.lastName);

    // 3) base index สำหรับวันนี้
    const baseQi = quotePerm[slot];

    // 4) กันซ้ำช่วง X วัน
    const qi  = pickNonRepeatingIndex(baseQi, quotePerm);
    const row = QUOTES[qi];

    // 5) รูป: daily shuffle (+ jitter ตาม ts เพื่อความหลากหลายต่อการเล่น)
    let imgPath = './assets/img/hero.jpg';
    if (imagePerm.length){
      const jitter  = Math.abs((ts >>> 0) % imagePerm.length);
      const imgSlot = (slot + 7 + jitter) % imagePerm.length;
      const ii = imagePerm[imgSlot];
      imgPath = `./assets/smjm/${IMAGES[ii]}`;
    }

    // 6) บันทึกประวัติกันซ้ำ และตั้ง lastResult
    pushHistory(qi);
    lastResult = { qi, img: (imgPath.split('/').pop() || ''), ts };

    // inline รูปเพื่อความเสถียรตอน save
    const inlinedImg = await toDataURL(imgPath);

    // เติมการ์ด
    resultTitle.textContent = `คำสอนที่ถูกเลือกมาสำหรับคุณ ${player.firstName} ${player.lastName} / This quote has been chosen for you`;
    quoteEN.textContent = row.Quote || '';
    quoteTH.textContent = row.Translated || '(Thai translation unavailable / ยังไม่มีคำแปล)';

    const qEN = formatQuoteDate(row.Date, 'en');
    const qTH = formatQuoteDate(row.Date, 'th');
    const pEN = formatPlayedAt(ts, 'en');
    const pTH = formatPlayedAt(ts, 'th');
    resultMeta.innerHTML =
      `Quote Date: ${qEN} • Played at: ${pEN}<br>` +
      `วันที่คำกล่าว: ${qTH} • เวลาเล่น: ${pTH}`;

    resultImage.decoding = 'sync';
    resultImage.loading  = 'eager';
    resultImage.onerror  = () => { resultImage.onerror = null; resultImage.src = PLACEHOLDER_IMG; };
    resultImage.src      = inlinedImg;

    if (exImage){
      exImage.decoding = 'sync';
      exImage.loading  = 'eager';
      exImage.onerror  = null;
      exImage.src      = inlinedImg;
    }
    resultImgReady = waitImageReady(resultImage);

    resultCard.hidden = false;
    playArea.classList.add('has-result');
    hideSpin();

    // วันละครั้ง/คูลดาวน์
    setLastPlay(ts);

    // เซฟผลล่าสุดเพื่อ restore เมื่อ reload
    try{ localStorage.setItem(lastResultKey(), JSON.stringify(lastResult)); }catch(_){}

    // อัปเดต countdown + ปุ่ม
    const remain = msLeft(Date.now());
    if (remain > 0){
      cooldownNote.classList.remove('hidden');
      startCountdown(remain);
      playAgain?.classList.add('hidden');
    } else {
      cooldownNote.classList.add('hidden');
      playAgain?.classList.remove('hidden');
      playAgain.disabled = true;
    }
    if (saveCard) saveCard.disabled = false;

  } finally {
    setTimeout(()=>{ isRevealing = false; }, 200);
  }
}


// ========== Save as PNG (screen-cap resultCard) ==========
saveCard?.addEventListener('click', async () => {
  if (resultCard.hidden) return;

  saveCard.disabled = false;
  const oldLabel = saveCard.textContent;
  saveCard.textContent = 'Saving...';
  console.log('[DEBUG-SAVE] Save initiated. Applying 2-Pass Render Fix for Safari.');

  // >>> hoist ตัวแปรสำหรับ overlay/restore ออกมานอก try
  let overlay = null;
  let overlayRestore = null;

  try {
    await waitFontsReady();
    if (resultImgReady) await resultImgReady; else await waitImageReady(resultImage);
    await waitNextFrame();

    // ลดผลกระทบของเงา/ทรานส์ฟอร์มระหว่างแคป
    const prev = {
      opacity: resultCard.style.opacity,
      transform: resultCard.style.transform,
      boxShadow: resultCard.style.boxShadow
    };
    resultCard.style.opacity = '1';
    resultCard.style.transform = 'none';
    resultCard.style.boxShadow = 'none';

    const renderOptions = {
      backgroundColor: '#ffffff',
      pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      cacheBust: false,
      imagePlaceholder: PLACEHOLDER_IMG,
      filter: (node) => !(node.classList && node.classList.contains('result-actions')),
    };

    // [EXPORT TITLE OVERLAY — column-aware, no overlap]
    const prevCardPos = resultCard.style.position;
    const needRelative = getComputedStyle(resultCard).position === 'static';
    if (needRelative) resultCard.style.position = 'relative';

    overlay = document.createElement('div');
    overlay.textContent = 'Sahaja Yoga Leela Game';
    overlay.style.cssText = `
      position:absolute; text-align:center; font-weight:800; font-size:18px; letter-spacing:.2px;
      color:#111; pointer-events:none; z-index:10;
      padding:2px 8px; border-radius:10px;
      background:rgba(255,255,255,0.95); box-shadow:0 2px 6px rgba(0,0,0,.06);
      visibility:hidden;
    `;
    resultCard.appendChild(overlay);

    try {
      const cardRect  = resultCard.getBoundingClientRect();
      const titleRect = resultTitle.getBoundingClientRect();
      const imgRect   = resultImage.getBoundingClientRect();

      // ให้ overlay กว้างเท่าคอลัมน์ข้อความ และชิดซ้ายเท่าหัวข้อ
      const leftPx  = Math.max(0, titleRect.left - cardRect.left);
      const widthPx = Math.max(120, titleRect.width);
      overlay.style.left  = `${leftPx}px`;
      overlay.style.width = `${widthPx}px`;

      // รอวัดความสูงหลังตั้งความกว้าง
      overlay.style.visibility = 'hidden';
      await waitNextFrame();
      const overlayH = overlay.offsetHeight || 22;

      const GAP_ABOVE_TITLE = 10;  // เว้นเหนือหัวข้อ
      const GAP_BELOW_IMAGE = 8;   // เว้นใต้รูป

      const titleTopRel = titleRect.top - cardRect.top;
      const imgBottomRel = imgRect.bottom - cardRect.top;

      // ตรวจว่ารูป “ทับคอลัมน์ข้อความ” ในแนวนอนหรือไม่
      const overlapX = !(imgRect.right <= titleRect.left || imgRect.left >= titleRect.right);

      let topRel;
      if (overlapX) {
        // รูปกับข้อความอยู่คอลัมน์เดียว (เช่นมือถือ) → ห้ามทับรูป
        topRel = Math.max(imgBottomRel + GAP_BELOW_IMAGE,
                          titleTopRel - overlayH - GAP_ABOVE_TITLE);
      } else {
        // คอลัมน์ซ้าย/ขวา (เดสก์ท็อป) → ยึดเหนือหัวข้อเสมอ
        topRel = Math.max(8, titleTopRel - overlayH - GAP_ABOVE_TITLE);
      }

      overlay.style.top = `${topRel}px`;
      overlay.style.visibility = 'visible';

      // ดันหัวข้อ “คำตอบของคุณ …” ลงเท่าความสูงไตเติล + ช่องไฟเล็กน้อย
      const prevTitleMarginTop = resultTitle.style.marginTop;
      const currMT = parseFloat(getComputedStyle(resultTitle).marginTop) || 0;
      const EXTRA_GAP = 12;
      resultTitle.style.marginTop = (currMT + overlayH + EXTRA_GAP) + 'px';

      // ฟังก์ชันคืนค่า (ให้เก็บไว้เรียกใน finally)
      overlayRestore = () => {
        overlay && overlay.remove();
        resultTitle.style.marginTop = prevTitleMarginTop || '';
        if (needRelative) resultCard.style.position = prevCardPos || '';
      };
    } catch (e) {
      // fallback: กว้างเต็มคอลัมน์ ซ้อนด้านบนเล็กน้อย
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.top = '12px';
      overlay.style.visibility = 'visible';
      overlayRestore = () => {
        overlay && overlay.remove();
        if (needRelative) resultCard.style.position = prevCardPos || '';
      };
    }

    // 🎯 PASS 1: Dummy render
    console.log('[DEBUG-SAVE] Starting PASS 1 (Dummy Render) for Safari repaint...');
    await htmlToImage.toCanvas(resultCard, renderOptions);

    await new Promise(r => setTimeout(r, 50));
    await waitNextFrame();

    // 🎯 PASS 2: Final render → PNG
    console.log('[DEBUG-SAVE] Starting PASS 2 (Final Render) and converting to PNG.');
    const canvas = await htmlToImage.toCanvas(resultCard, renderOptions);
    const dataUrl = canvas.toDataURL('image/png');

    // ล้าง Canvas ชั่วคราว
    canvas.width = canvas.height = 0;

    // คืนค่า style ของการ์ด (เฉพาะส่วนของ resultCard)
    resultCard.style.opacity = prev.opacity;
    resultCard.style.transform = prev.transform;
    resultCard.style.boxShadow = prev.boxShadow;

    // ดาวน์โหลดไฟล์
    const safe = s => (s||'').toString().trim().replace(/\s+/g,'-').replace(/[^-\w]+/g,'');
    const f = safe(player.firstName), l = safe(player.lastName);
    const qid = (lastResult && typeof lastResult.qi === 'number') ? String(lastResult.qi).padStart(4,'0') : '0000';
    const stamp = new Date(lastResult?.ts || Date.now()).toISOString().slice(0,19).replace(/[:T]/g,'-');
    const filename = `LeelaCard-${f}-${l}-${qid}-${stamp}.png`;

    const a = document.createElement('a');
     
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();


    playAgain.disabled = false;

  } catch (err) {
    console.error('[DEBUG-SAVE] Save PNG failed:', err);
    alert('Save failed. Please try again / บันทึกไม่สำเร็จ ลองใหม่อีกครั้งค่ะ');
  } finally {
    // คืนค่า overlay/margin/position ที่เดียว ปลอดภัยเสมอ
    if (typeof overlayRestore === 'function') {
      try { overlayRestore(); } catch(_) {}
    }
    saveCard.disabled = false;
    saveCard.textContent = oldLabel;
  }
});


// ========== Form & Flow ==========
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  player.firstName = String(fd.get('firstName') || '').trim();
  player.lastName  = String(fd.get('lastName')  || '').trim();
  if(!player.firstName || !player.lastName){
    alert('กรุณากรอกชื่อและนามสกุล (ภาษาอังกฤษ)');
    return;
  }
  if(inputCard) inputCard.classList.add('hidden'); // ซ่อนส่วนกรอกชื่อ
  playerNameEl.textContent = `${player.firstName} ${player.lastName}`;
  playArea.hidden = false;
  // เริ่มต้นเป็นโหมดยังไม่มีผลลัพธ์
  playArea.classList.remove('has-result');
  resultCard.hidden = true;
  // if (saveCard) saveCard.disabled = true;
  if (playAgain) playAgain.disabled = true;

  window.scrollTo({top: playArea.offsetTop - 12, behavior: 'smooth'});

  if(QUOTES.length === 0) await loadData();

  // --- Restore today's result if exists for this player ---
  try{
    const savedRaw = localStorage.getItem(lastResultKey());
    if (!DEV_BYPASS && savedRaw){                 // <<< ข้าม restore เมื่อ DEV
      const saved = JSON.parse(savedRaw);
      if (saved && typeof saved.qi === 'number' && QUOTES[saved.qi] && isSameLockPeriod(saved.ts)){
        const row = QUOTES[saved.qi];
        const imgPath = saved.img ? (saved.img.includes('/') ? saved.img : `./assets/smjm/${saved.img}`) : './assets/img/hero.jpg';
        renderExistingResult({ row, imgPath, ts: saved.ts });
        return;
      }
    }
  }catch(_){}

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

// Admin: tap hero 7 ครั้งเพื่อเปิด panel
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
      if(cfgCooldown) cfgCooldown.value = CONFIG.cooldownMin;
      if(cfgTesting)  cfgTesting.checked = CONFIG.testingMode;
      if(cfgApiKey)   cfgApiKey.value = CONFIG.apiKey;
    }
  });
})();

playAgain?.addEventListener('click', () => {
  // 💡 NEW: ถ้าปุ่มถูก disable อยู่ การคลิกนี้จะไม่ทำงาน
  if(playAgain.disabled) return; 

  resultCard.hidden = true;
  quoteEN.textContent = '';
  quoteTH.textContent = '';
  resultMeta.textContent = '';

  // 💡 NEW: โชว์ปุ่ม Spin ทันที 
  // เนื่องจากเราจัดการ Visibility และ Disable ไว้ก่อนหน้านี้แล้ว
  cooldownNote.classList.add('hidden');
  showSpin();

  // และซ่อนปุ่ม Play Again
  playAgain.classList.add('hidden'); 
});


// Init
document.addEventListener('DOMContentLoaded', () => {
  if(cfgCooldown)  cfgCooldown.value   = CONFIG.cooldownMin;
  if(cfgTesting)   cfgTesting.checked  = CONFIG.testingMode;
  if(cfgDailyLock) cfgDailyLock.checked= CONFIG.dailyLock;
  if(cfgApiKey)    cfgApiKey.value     = CONFIG.apiKey;

  // <<<<<< เพิ่มบรรทัดนี้
  if (DEV_BYPASS){
    CONFIG.testingMode = true;                // กันพลาด
    if (cfgTesting){ cfgTesting.checked = true; cfgTesting.disabled = true; }
    if (cfgDailyLock){ cfgDailyLock.checked = false; cfgDailyLock.disabled = true; }
  }
  enableSaveNow();            // ให้ปุ่มพร้อมเสมอ
  loadData();
  attachHoldToSpin();
});