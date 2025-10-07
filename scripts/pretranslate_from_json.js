// node scripts/pretranslate_from_json.js public/data/quotes.json public/data/quotes_th.json
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const [,, inJSON, outJSON] = process.argv;
if (!inJSON || !outJSON) {
  console.error('Usage: node scripts/pretranslate_from_json.js <in.json> <out.json>');
  process.exit(1);
}

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL   = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const DELAY   = Number(process.env.DELAY_MS || 1100);
const LIMIT   = Number(process.env.LIMIT || 0);

if (!API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in .env'); process.exit(1);
}

const cacheFile = path.join('scripts', '.trans-cache.json');
let cache = {};
(async () => {
  try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch {}
})();

const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function translate(text){
  const body = {
    model: MODEL,
    messages: [
      { role: 'system',
        content:
          'You are a professional Thai translator. Translate the user message into natural Thai. ' +
          'Keep proper nouns like Sahaja Yoga (สหจะโยคะ), Kundalini (คุนดาลินี), Shri Mataji (ศรี มาตาจี) appropriately. ' +
          'Do not add explanations. Output Thai only.' },
      { role: 'user', content: text }
    ],
    temperature: 0.2
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json?.choices?.[0]?.message?.content || '').trim();
}

(async () => {
  const raw = await fs.readFile(inJSON, 'utf8');
  let src = JSON.parse(raw);
  if (!Array.isArray(src)) throw new Error('Input JSON must be an array');

  if (LIMIT > 0) src = src.slice(0, LIMIT);

  const out = [];
  let done = 0, usedCache = 0;

  for (let i=0; i<src.length; i++){
    const row = src[i] || {};
    const en  = (row.Quote || '').toString().trim();
    const date= (row.Date  || '').toString().trim();

    if (!en) { out.push({ Quote: en, Date: date, Translated: '' }); continue; }

    const key = sha256(en);
    let th = cache[key];

    if (!th){
      try{
        th = await translate(en);
        if (th) {
          cache[key] = th;
          await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
        }
        await sleep(DELAY);
      }catch(e){
        console.warn(`[WARN] translate failed @${i}: ${e.message}`);
        th = ''; // ใส่ค่าว่างไว้ก่อน จะ resume ได้
      }
    } else {
      usedCache++;
    }

    out.push({ Quote: en, Date: date, Translated: th });
    done++;

    if (done % 25 === 0){
      const tmp = outJSON.replace(/\.json$/i, '.partial.json');
      await fs.writeFile(tmp, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Progress: ${done}/${src.length} (cache hits: ${usedCache})`);
    }
  }

  await fs.mkdir(path.dirname(outJSON), { recursive: true }).catch(()=>{});
  await fs.writeFile(outJSON, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Done. Wrote ${out.length} items → ${outJSON} (cache hits: ${usedCache})`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
