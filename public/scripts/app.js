// Sahaja Yoga Leela Game — MVP template
// NOTE: This file is a placeholder. You will add logic for:
// - loading CSV
// - generating seed from name + timestamp
// - randomizing quote + image
// - translating (optional)
// - exporting card as PNG (optional)

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

form?.addEventListener('submit', (e) => {
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
});

spinButton?.addEventListener('click', async () => {
  // MVP demo: fake delay then reveal a placeholder result
  spinButton.disabled = true;
  spinButton.textContent = 'กำลังสุ่ม...';
  await new Promise(r => setTimeout(r, 900));

  // Placeholder quote
  const exampleQuote = 'It was not very difficult for Me to open the Sahasrara...';
  const exampleDate = '1981-05-05';

  resultTitle.textContent = `คำตอบของคุณ ${player.firstName} ${player.lastName}`;
  quoteEN.textContent = exampleQuote;
  quoteTH.textContent = '(รอระบบแปลภาษาไทย — หรือกดสวิตช์แปลในเวอร์ชั่นถัดไป)';
  resultMeta.textContent = `Date: ${exampleDate} • Timestamp: ${new Date().toLocaleString()}`;

  // Placeholder image
  resultImage.src = './assets/img/hero.jpg';
  resultImage.alt = 'Shri Mataji';

  resultCard.hidden = false;
  spinButton.disabled = false;
  spinButton.textContent = 'กดค้างเพื่อสุ่ม (MVP: คลิกเพื่อสุ่ม)';
});

playAgain?.addEventListener('click', () => {
  resultCard.hidden = true;
  quoteEN.textContent = '';
  quoteTH.textContent = '';
  resultMeta.textContent = '';
});
