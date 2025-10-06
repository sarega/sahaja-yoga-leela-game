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
const spinButton = document.getElementById('spinButton');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const quoteEN = document.getElementById('quoteEN');
const quoteTH = document.getElementById('quoteTH');
const resultMeta = document.getElementById('resultMeta');
const resultImage = document.getElementById('resultImage');
const saveCard = document.getElementById('saveCard');
const playAgain = document.getElementById('playAgain');

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
    const res = await fetch('./data/excerptdata.csv', { cache: 'no-store' });
    if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
    const csvText = await res.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors?.length) {
      console.warn('CSV parse errors (first 3):', parsed.errors.slice(0,3));
    }
    QUOTES = parsed.data.map(row => {
      const qKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'quote') ?? 'Quote';
      const dKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'date')  ?? 'Date';
      return {
        Quote: (row[qKey] ?? '').toString().trim(),
        Date:  (row[dKey]  ?? '').toString().trim(),
      };
    }).filter(r => r.Quote.length > 0);

    try {
      IMAGES = await fetch('./assets/smjm-manifest.json', { cache: 'no-store' }).then(r => r.json());
    } catch(e) {
      console.warn('manifest load fail:', e);
      IMAGES = [];
    }

    dataReady = QUOTES.length > 0;
    console.log(`Loaded quotes: ${QUOTES.length}, images listed: ${IMAGES.length}`);
  } catch (err) {
    console.error('loadData failed:', err);
    alert('โหลดข้อมูลไม่สำเร็จ: กรุณาตรวจ path /data/excerptdata.csv และลองรีเฟรชอีกครั้ง');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});


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
});

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

playAgain?.addEventListener('click', () => {
  resultCard.hidden = true;
  quoteEN.textContent = '';
  quoteTH.textContent = '';
  resultMeta.textContent = '';
});
