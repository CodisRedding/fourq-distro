const fs = require('fs');
const path = require('path');

const files = ['raw_collection_1.txt', 'raw_collection_2.txt'];

const HEADER_LINES = new Set([
  'Search Collection', 'Show', '250', '', 'Data Quality', 'Title', 'Artist',
  'Year', 'Format', 'Label', 'For Sale', 'Rating'
]);

const MEDIA_RE = /^(Vinyl|Cassette|CD|Lathe Cut|Flexi-disc|DVD|Box Set|All Media|\d+\s*x\s*Vinyl|Vinyl,)/i;
const FORSALE_RE = /^\d+\s+(copy|copies)\s+for sale from\s+\$([\d.]+)/i;
const FLAG_SET = new Set(['New Submission', 'Recently Edited', 'Needs Changes']);

function isMediaLine(line) {
  return MEDIA_RE.test(line);
}
function isForSaleLine(line) {
  return FORSALE_RE.test(line);
}
function isFlagLine(line) {
  return FLAG_SET.has(line);
}

let allLines = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const lines = raw.split(/\r?\n/).map(l => l.trim());
  allLines.push(...lines.filter(l => !HEADER_LINES.has(l)));
}

// Find anchor indices: lines ending with " image" that also contain " - "
const anchorIdx = [];
for (let i = 0; i < allLines.length; i++) {
  if (allLines[i].endsWith(' image') && allLines[i].includes(' - ')) {
    anchorIdx.push(i);
  }
}

const records = [];
for (let a = 0; a < anchorIdx.length; a++) {
  const start = anchorIdx[a];
  const end = a + 1 < anchorIdx.length ? anchorIdx[a + 1] : allLines.length;
  const block = allLines.slice(start + 1, end).filter(l => l.length > 0);

  let idx = 0;
  const title = block[idx++] || '';
  const artist = block[idx++] || '';

  let yearCountry = '';
  if (idx < block.length && !isMediaLine(block[idx]) && !isForSaleLine(block[idx]) && !isFlagLine(block[idx])) {
    yearCountry = block[idx++];
  }

  const formatLines = [];
  while (idx < block.length && isMediaLine(block[idx])) {
    formatLines.push(block[idx++]);
  }

  const labelLines = [];
  while (idx < block.length && !isForSaleLine(block[idx]) && !isFlagLine(block[idx])) {
    labelLines.push(block[idx++]);
  }

  let forSaleText = '';
  let lowPrice = '';
  let copiesForSale = '';
  if (idx < block.length && isForSaleLine(block[idx])) {
    forSaleText = block[idx];
    const m = block[idx].match(FORSALE_RE);
    copiesForSale = m[0].match(/^\d+/)[0];
    lowPrice = m[2];
    idx++;
  }

  const flags = [];
  while (idx < block.length) {
    if (isFlagLine(block[idx])) flags.push(block[idx]);
    idx++;
  }

  let year = '';
  let country = '';
  if (yearCountry) {
    const m = yearCountry.match(/^(\d{4})\s*–\s*(.+)$/);
    if (m) { year = m[1]; country = m[2]; }
    else if (/^\d{4}$/.test(yearCountry)) { year = yearCountry; }
    else { country = yearCountry; }
  }

  records.push({
    artist,
    title,
    year,
    country,
    format: formatLines.join(' | '),
    label: labelLines.join(' | '),
    discogs_low_price: lowPrice,
    copies_for_sale_on_discogs: copiesForSale,
    status: flags[0] || ''
  });
}

// Write CSV
function csvEsc(v) {
  if (v == null) v = '';
  v = String(v);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
const cols = ['artist', 'title', 'year', 'country', 'format', 'label', 'discogs_low_price', 'copies_for_sale_on_discogs', 'status'];
const csvLines = [cols.join(',')];
for (const r of records) {
  csvLines.push(cols.map(c => csvEsc(r[c])).join(','));
}
fs.writeFileSync(path.join(__dirname, 'collection.csv'), csvLines.join('\n'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'collection.json'), JSON.stringify(records, null, 2), 'utf8');

// Duplicate detection (same artist+title+label = likely multiple physical copies)
const dupMap = new Map();
for (const r of records) {
  const key = `${r.artist}|||${r.title}|||${r.label}`;
  dupMap.set(key, (dupMap.get(key) || 0) + 1);
}
const dups = [...dupMap.entries()].filter(([k, c]) => c > 1);

console.log('Total parsed records:', records.length);
console.log('Unique artist+title+label combos:', dupMap.size);
console.log('Entries appearing more than once:', dups.length);
console.log('---sample dup groups---');
for (const [k, c] of dups.slice(0, 15)) {
  console.log(c + 'x  ' + k.replace(/\|\|\|/g, ' :: '));
}

const priced = records.filter(r => r.discogs_low_price).map(r => parseFloat(r.discogs_low_price));
const sum = priced.reduce((a, b) => a + b, 0);
console.log('\nRecords with a Discogs low-price comp:', priced.length, '/', records.length);
console.log('Sum of Discogs low prices (rough floor, not a real valuation):', sum.toFixed(2));
console.log('Median low price:', priced.sort((a,b)=>a-b)[Math.floor(priced.length/2)]);

const noPrice = records.filter(r => !r.discogs_low_price);
console.log('\nRecords with NO discogs comp parsed (need manual check):', noPrice.length);
