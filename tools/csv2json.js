// tools/csv2json.js
// Robust CSV -> JSON for Leela Game (auto delimiter, weird headers, BOM-safe)

import fs from "fs";

const INPUT = "public/data/excerptdata.csv";
const OUTPUT = "public/data/quotes.json";

// ลองเดลิมิเตอร์ที่พบบ่อย
const CANDIDATE_DELIMS = [",", ";", "\t", "|"];

function stripBOM(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function detectDelimiter(sample) {
  const firstLine = sample.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  let best = { delim: ",", hits: 0 };
  for (const d of CANDIDATE_DELIMS) {
    const parts = firstLine.split(d);
    if (parts.length > best.hits) best = { delim: d, hits: parts.length };
  }
  return best.delim;
}

function splitCSVLine(line, delim) {
  // แยกแบบง่ายแต่รองรับ "..." ที่มี delimiter อยู่ข้างใน
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } // escaped double quote
      else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/^"(.*)"$/, "$1"));
}

function normalizeKey(k) { return k.trim().toLowerCase(); }

function guessCols(headers) {
  const norm = headers.map(normalizeKey);
  let qi = norm.findIndex(h => h === "quote");
  let di = norm.findIndex(h => h === "date");
  if (qi < 0) qi = 0;                 // fallback = คอลัมน์แรก
  if (di < 0) di = headers.length>1 ? 1 : -1; // fallback = คอลัมน์ที่สอง ถ้ามี
  return { qi, di };
}

function run() {
  if (!fs.existsSync(INPUT)) {
    console.error("❌ Not found:", INPUT);
    process.exit(1);
  }
  const raw = stripBOM(fs.readFileSync(INPUT, "utf8"));
  if (!raw.trim()) {
    console.error("❌ CSV is empty");
    process.exit(1);
  }

  const delim = detectDelimiter(raw);
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  const headerLine = lines.shift();
  const headers = splitCSVLine(headerLine, delim);
  const { qi, di } = guessCols(headers);

  console.log("• Detected delimiter:", JSON.stringify(delim));
  console.log("• Headers:", headers);
  console.log("• Using Quote index =", qi, "Date index =", di);

  const rows = [];
  for (const line of lines) {
    const cells = splitCSVLine(line, delim);
    const q = (cells[qi] ?? "").trim();
    const d = di >= 0 ? (cells[di] ?? "").trim() : "";
    if (q) rows.push({ Quote: q, Date: d });
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2), "utf8");
  console.log("✅ Wrote", OUTPUT, "items:", rows.length);
}

run();

