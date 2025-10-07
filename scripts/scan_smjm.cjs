#!/usr/bin/env node
// Scan public/assets/smjm → write public/assets/smjm-manifest.json
const fs = require('fs/promises');
const path = require('path');

const ROOT    = process.cwd();
const SRC_DIR = path.join(ROOT, 'public', 'assets', 'smjm');
const OUT     = path.join(ROOT, 'public', 'assets', 'smjm-manifest.json');

async function main(){
  const allow = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif']);
  let entries = await fs.readdir(SRC_DIR, { withFileTypes: true });

  // เอาเฉพาะไฟล์, ตัดไฟล์ซ่อน, ตัดนามสกุลที่ไม่ใช่รูป
  let files = entries
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(n => !n.startsWith('.'))
    .filter(n => allow.has(path.extname(n).toLowerCase()));

  // จัดเรียงแบบ natural (001, 2, 10, …)
  files.sort((a,b)=> a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  await fs.writeFile(OUT, JSON.stringify(files, null, 2), 'utf8');
  console.log(`Wrote ${files.length} items → ${path.relative(ROOT, OUT)}`);
}

main().catch(err => {
  console.error('[scan_smjm] failed:', err);
  process.exit(1);
});
