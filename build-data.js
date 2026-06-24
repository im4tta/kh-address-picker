#!/usr/bin/env node
/**
 * build-data.js
 *
 * Converts the Cambodia Geographical List CSV into the tree-data.json
 * file that kh-address-picker.user.js fetches at runtime.
 *
 * Usage:
 *   node build-data.js path/to/Cambodia_Geographical_List_2025.csv > data/tree-data.json
 *   node build-data.js path/to/file.csv --list-headers   (just print the detected column headers)
 *
 * No external dependencies — works with plain `node build-data.js`.
 *
 * IMPORTANT: COLUMN_MAP below is a best guess at your CSV's header names.
 * Run with --list-headers first to see your actual headers, then adjust
 * COLUMN_MAP so each key points at the right column name in your file.
 */

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------
// 1. Adjust these to match your CSV's actual header row.
// ----------------------------------------------------------------
const COLUMN_MAP = {
  provinceCode: 'province_code',
  provinceKh:   'province_kh',
  provinceEn:   'province_en',
  districtCode: 'district_code',
  districtKh:   'district_kh',
  districtEn:   'district_en',
  communeCode:  'commune_code',
  communeKh:    'commune_kh',
  communeEn:    'commune_en',
  villageCode:  'village_code',
  villageKh:    'village_kh',
  villageEn:    'village_en',
};

// ----------------------------------------------------------------
// 2. Minimal RFC4180-ish CSV parser (handles quoted fields, commas
//    and newlines inside quotes, escaped quotes "").
// ----------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Normalize line endings, strip BOM
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // drop trailing empty row from a final newline
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function rowsToObjects(rows) {
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

// ----------------------------------------------------------------
// 3. Build the province -> district -> commune -> village tree.
//    Dedupes by code at each level so repeated rows collapse correctly.
// ----------------------------------------------------------------
function buildTree(records) {
  const provinces = new Map();

  for (const r of records) {
    const pCode = r[COLUMN_MAP.provinceCode];
    const dCode = r[COLUMN_MAP.districtCode];
    const cCode = r[COLUMN_MAP.communeCode];
    const vCode = r[COLUMN_MAP.villageCode];
    if (!pCode || !dCode || !cCode || !vCode) continue; // skip incomplete rows

    if (!provinces.has(pCode)) {
      provinces.set(pCode, {
        code: pCode,
        kh: r[COLUMN_MAP.provinceKh] || '',
        en: r[COLUMN_MAP.provinceEn] || '',
        districts: new Map(),
      });
    }
    const province = provinces.get(pCode);

    if (!province.districts.has(dCode)) {
      province.districts.set(dCode, {
        code: dCode,
        kh: r[COLUMN_MAP.districtKh] || '',
        en: r[COLUMN_MAP.districtEn] || '',
        communes: new Map(),
      });
    }
    const district = province.districts.get(dCode);

    if (!district.communes.has(cCode)) {
      district.communes.set(cCode, {
        code: cCode,
        kh: r[COLUMN_MAP.communeKh] || '',
        en: r[COLUMN_MAP.communeEn] || '',
        villages: new Map(),
      });
    }
    const commune = district.communes.get(cCode);

    if (!commune.villages.has(vCode)) {
      commune.villages.set(vCode, {
        code: vCode,
        kh: r[COLUMN_MAP.villageKh] || '',
        en: r[COLUMN_MAP.villageEn] || '',
      });
    }
  }

  // Convert nested Maps -> arrays
  const toArray = (province) => ({
    code: province.code,
    kh: province.kh,
    en: province.en,
    districts: [...province.districts.values()].map(d => ({
      code: d.code,
      kh: d.kh,
      en: d.en,
      communes: [...d.communes.values()].map(c => ({
        code: c.code,
        kh: c.kh,
        en: c.en,
        villages: [...c.villages.values()],
      })),
    })),
  });

  return [...provinces.values()].map(toArray);
}

function countVillages(provinces) {
  let n = 0;
  for (const p of provinces) for (const d of p.districts) for (const c of d.communes) n += c.villages.length;
  return n;
}

// ----------------------------------------------------------------
// 4. CLI
// ----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find(a => !a.startsWith('--'));
  const listHeadersOnly = args.includes('--list-headers');

  if (!csvPath) {
    console.error('Usage: node build-data.js path/to/file.csv [--list-headers]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parseCSV(text);
  if (!rows.length) {
    console.error('CSV appears to be empty.');
    process.exit(1);
  }

  if (listHeadersOnly) {
    console.error('Detected headers:');
    rows[0].forEach((h, i) => console.error(`  [${i}] ${h.trim()}`));
    process.exit(0);
  }

  const records = rowsToObjects(rows);

  // Sanity-check the column map against actual headers before building.
  const headerSet = new Set(rows[0].map(h => h.trim()));
  const missing = Object.entries(COLUMN_MAP).filter(([, col]) => !headerSet.has(col));
  if (missing.length) {
    console.error('COLUMN_MAP does not match this CSV. Missing columns:');
    missing.forEach(([key, col]) => console.error(`  ${key} -> "${col}" not found`));
    console.error('\nRun with --list-headers to see the actual column names, then edit COLUMN_MAP at the top of build-data.js.');
    process.exit(1);
  }

  const provinces = buildTree(records);
  const payload = {
    version: new Date().toISOString().slice(0, 10),
    generatedFrom: path.basename(csvPath),
    provinceCount: provinces.length,
    villageCount: countVillages(provinces),
    provinces,
  };

  process.stdout.write(JSON.stringify(payload));
  console.error(`\nOK: ${payload.provinceCount} provinces, ${payload.villageCount} villages -> wrote to stdout.`);
}

main();
