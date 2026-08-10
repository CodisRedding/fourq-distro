// One-time import: collection_tiered.json -> data/inventory.json
// Adds the fields the listing manager app actually needs.
const fs = require('fs');

const recs = require('./collection_tiered.json');

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const seen = new Map();
const inventory = recs.map((r, i) => {
  const base = slug(r.artist) + '__' + slug(r.title) + '__' + slug(r.label).slice(0, 20);
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  const id = n > 1 ? `${base}__${n}` : base;

  return {
    id,
    artist: r.artist,
    title: r.title,
    year: r.year,
    country: r.country,
    format: r.format,
    label: r.label,
    tier: r.tier,
    discogs_low_price: r.discogs_low_price,
    copies_for_sale_on_discogs: r.copies_for_sale_on_discogs,
    asking_price: r.discogs_low_price || '',
    condition_media: '',
    condition_sleeve: '',
    notes: '',            // private — never included in any generated listing
    listing_extras: '',   // public — included in every listing description/comments
    photos: [],
    status: {
      ebay: 'unlisted',    // unlisted | listed | sold
      fb: 'unlisted',      // unlisted | listed | sold
      discogs: 'unlisted'  // unlisted | listed | sold
    },
    discogs_listing_id: null,
    ebay_listing_id: null,
    discogs_release_id: null,
    discogs_price_by_grade: null,
    discogs_community: null,
    photo_hosted_urls: {},
    discogs_sold_stats: { low: '', median: '', high: '', lastSoldDate: '' },
    sold: false
  };
});

fs.writeFileSync('./data/inventory.json', JSON.stringify(inventory, null, 2), 'utf8');
console.log('Wrote', inventory.length, 'records to data/inventory.json');
