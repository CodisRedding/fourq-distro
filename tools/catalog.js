// Small CLI for the record-cataloging workflow — talks to the running app's
// own API (localhost:3000) so it stays consistent with tiering/status logic
// instead of touching data/inventory.json directly.
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

function usage() {
  console.log(`Usage:
  node tools/catalog.js find <text>
  node tools/catalog.js get <id>
  node tools/catalog.js newblank
  node tools/catalog.js set <id> key=value [key2=value2 ...]
  node tools/catalog.js set-json <id> '<json>'
  node tools/catalog.js upload <id> <folder>
  node tools/catalog.js lookup <id>
  node tools/catalog.js publish-ebay <id>
  node tools/catalog.js publish-discogs <id>
  node tools/catalog.js unlist-discogs <id>
`);
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(v) && !/^0[0-9]/.test(v)) return v; // keep numeric-looking strings as strings (asking_price etc. are stored as strings)
  return v;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'find') {
    const q = rest.join(' ');
    const res = await fetch(`${BASE}/api/inventory?search=${encodeURIComponent(q)}`);
    const records = await res.json();
    if (!records.length) { console.log('No matches.'); return; }
    records.forEach(r => console.log(`${r.id} | ${r.artist} - ${r.title} | ${r.format} | ${r.label} | tier=${r.tier} | price=${r.asking_price}`));
    return;
  }

  if (cmd === 'get') {
    const [id] = rest;
    const res = await fetch(`${BASE}/api/inventory/${id}`);
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  if (cmd === 'newblank') {
    const res = await fetch(`${BASE}/api/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const record = await res.json();
    console.log(record.id);
    return;
  }

  if (cmd === 'set') {
    const [id, ...pairs] = rest;
    const patch = {};
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      patch[key] = coerce(value);
    }
    const res = await fetch(`${BASE}/api/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(patch)
    });
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  if (cmd === 'set-json') {
    const [id, json] = rest;
    const res = await fetch(`${BASE}/api/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: json
    });
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  if (cmd === 'upload') {
    const [id, folder] = rest;
    const files = fs.readdirSync(folder)
      .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (!files.length) { console.log('No images found in ' + folder); return; }

    for (let i = 0; i < files.length; i += 10) {
      const batch = files.slice(i, i + 10);
      const form = new FormData();
      for (const f of batch) {
        const buf = fs.readFileSync(path.join(folder, f));
        form.append('photos', new Blob([buf]), f);
      }
      const res = await fetch(`${BASE}/api/inventory/${id}/photos`, { method: 'POST', body: form });
      if (!res.ok) { console.log('Upload batch failed:', await res.text()); return; }
      console.log(`Uploaded ${batch.length} (${i + batch.length}/${files.length}): ${batch.join(', ')}`);
    }
    const final = await (await fetch(`${BASE}/api/inventory/${id}`)).json();
    console.log(`Total photos on record: ${final.photos.length}`);
    return;
  }

  if (cmd === 'lookup') {
    const [id] = rest;
    const res = await fetch(`${BASE}/api/inventory/${id}/discogs-lookup`, { method: 'POST' });
    const r = await res.json();
    if (!res.ok) { console.log('Error:', r.error); return; }
    console.log(`release_id=${r.discogs_release_id}`);
    console.log('price_by_grade:', JSON.stringify(r.discogs_price_by_grade, null, 2));
    console.log('community:', JSON.stringify(r.discogs_community));
    return;
  }

  if (cmd === 'publish-ebay' || cmd === 'publish-discogs' || cmd === 'unlist-discogs') {
    const [id] = rest;
    const res = await fetch(`${BASE}/api/inventory/${id}/${cmd}`, { method: 'POST' });
    const r = await res.json();
    if (!res.ok) { console.log('Error:', r.error); return; }
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  usage();
}

main().catch(e => { console.error(e); process.exit(1); });
