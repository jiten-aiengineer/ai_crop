import fs from 'node:fs';
import path from 'node:path';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cropList(value) {
  return String(value || '')
    .split(',')
    .map((crop) => crop.trim())
    .filter((crop) => crop && !/^(?:none(?: mentioned)?|n\/a|not mentioned|no crop)(?:\s*\([^)]*\))?$/i.test(crop));
}

const [csvPath, productsPath] = process.argv.slice(2);
if (!csvPath || !productsPath) {
  throw new Error('Usage: node scripts/apply-approved-crop-mapping.mjs <mapping.csv> <products.json>');
}

const csv = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const headers = csv.shift().map((header) => header.trim());
const records = csv.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
const idHeader = 'Product ID';
const legacyHeader = 'Current Crops (Extracted from Catalouge)';
const approvedHeader = 'Now Approved Crops as per CIB&RC';
for (const header of [idHeader, legacyHeader, approvedHeader]) {
  if (!headers.includes(header)) throw new Error(`Required mapping column is missing: ${header}`);
}

const mapping = new Map(records.map((record) => [record[idHeader].trim().toLowerCase(), record]));
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
if (!Array.isArray(products)) throw new Error('Product file must be a JSON array.');

const unknownProducts = products.filter((product) => !mapping.has(String(product.id).toLowerCase()));
const unusedRows = records.filter((record) => !products.some((product) => String(product.id).toLowerCase() === record[idHeader].trim().toLowerCase()));
if (unknownProducts.length || unusedRows.length) {
  throw new Error(`Mapping mismatch: ${unknownProducts.length} product(s) without a CSV row; ${unusedRows.length} CSV row(s) without an app product.`);
}

for (const product of products) {
  const record = mapping.get(String(product.id).toLowerCase());
  const approvedCrops = cropList(record[approvedHeader]);
  if (!approvedCrops.length) throw new Error(`No approved crops found for ${product.id}.`);
  product.catalogCrops = cropList(record[legacyHeader]);
  product.approvedCrops = approvedCrops;
  product.cropMappingSource = 'CIB&RC approved crop map supplied by CLSL';
}

fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);
const totalApprovedLinks = products.reduce((sum, product) => sum + product.approvedCrops.length, 0);
console.log(`Updated ${products.length} products with ${totalApprovedLinks} CIB&RC approved crop mappings.`);
