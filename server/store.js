const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NEW_ARRIVAL_TIER } = require('./tiering');

const DATA_FILE = path.join(__dirname, '..', 'data', 'inventory.json');

// A blank record for the "identify from photos" workflow — no pre-existing
// Discogs-collection data to seed it, everything gets filled in by hand
// (or by whoever's looking at the uploaded photos) after creation.
function createBlank() {
  return {
    id: crypto.randomUUID(),
    artist: '',
    title: '',
    year: '',
    country: '',
    format: '',
    label: '',
    tier: NEW_ARRIVAL_TIER,
    discogs_low_price: '',
    copies_for_sale_on_discogs: '',
    asking_price: '',
    condition_media: '',
    condition_sleeve: '',
    matrix_number: '',
    sealed: false,
    notes: '',
    listing_extras: '',
    photos: [],
    deadwax_photos: [],
    status: { ebay: 'unlisted', fb: 'unlisted', discogs: 'unlisted' },
    ebay_listing_id: null,
    ebay_sku: null,
    discogs_release_id: null,
    discogs_price_by_grade: null,
    discogs_community: null,
    discogs_sold_stats: { low: '', median: '', high: '', lastSoldDate: '' },
    discogs_listing_id: null,
    photo_hosted_urls: {},
    sold: false
  };
}

function create(record) {
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

function readAll() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeAll(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function getById(id) {
  const records = readAll();
  return records.find(r => r.id === id) || null;
}

function updateById(id, patch) {
  const records = readAll();
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return null;

  const current = records[idx];
  const merged = { ...current, ...patch };
  if (patch.status) {
    merged.status = { ...current.status, ...patch.status };
  }
  if (patch.discogs_sold_stats) {
    merged.discogs_sold_stats = { ...current.discogs_sold_stats, ...patch.discogs_sold_stats };
  }
  records[idx] = merged;
  writeAll(records);
  return merged;
}

module.exports = { readAll, writeAll, getById, updateById, createBlank, create, DATA_FILE };
