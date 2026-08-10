// Discogs API integration: grade-specific pricing lookups, plus (as of the
// createListing addition below) publishing an actual marketplace listing.
// Needs a free personal access token from https://www.discogs.com/settings/developers
// (no approval wait, unlike eBay — generate and go) and completed Seller Settings
// (see DISCOGS_SETUP.md) before either pricing or listing calls will work.

const API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'DailyDollarRecordManager/1.0';

// Discogs' price_suggestions response is keyed by these exact strings.
const GRADE_KEY_MAP = {
  'M': 'Mint (M)',
  'MINT': 'Mint (M)',
  'NM': 'Near Mint (NM or M-)',
  'NEAR MINT': 'Near Mint (NM or M-)',
  'VG+': 'Very Good Plus (VG+)',
  'VG': 'Very Good (VG)',
  'G+': 'Good Plus (G+)',
  'G': 'Good (G)',
  'F': 'Fair (F)',
  'FAIR': 'Fair (F)',
  'P': 'Poor (P)',
  'POOR': 'Poor (P)'
};

// The 8 Goldmine/Discogs standard grades, best-to-worst. Sleeve condition
// additionally allows a few sleeve-only states Discogs supports.
const STANDARD_MEDIA_GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];
const STANDARD_SLEEVE_GRADES = [...STANDARD_MEDIA_GRADES, 'Generic', 'No Cover', 'Not Graded'];

function isConfigured() {
  return Boolean(process.env.DISCOGS_TOKEN);
}

function authHeaders() {
  return {
    'User-Agent': USER_AGENT,
    'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`
  };
}

function extractCatNo(label) {
  // label field looks like "Some Label – CAT-001, Other Label – CAT-002"
  if (!label) return null;
  const first = label.split(',')[0];
  const parts = first.split('–');
  return parts.length > 1 ? parts[1].trim() : null;
}

async function findReleaseId(record) {
  if (!isConfigured()) {
    const err = new Error('Discogs is not configured — add DISCOGS_TOKEN to .env. See DISCOGS_SETUP.md.');
    err.code = 'DISCOGS_NOT_CONFIGURED';
    throw err;
  }
  const params = new URLSearchParams({
    type: 'release',
    release_title: record.title,
    artist: record.artist.replace(/\s*\(\d+\)/g, '').replace(/\*/g, ''),
  });
  const catno = extractCatNo(record.label);
  if (catno) params.set('catno', catno);

  const res = await fetch(`${API_BASE}/database/search?${params.toString()}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error(`Discogs search failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.results || !json.results.length) return null;
  return json.results[0].id;
}

async function getPriceSuggestions(releaseId) {
  if (!isConfigured()) {
    const err = new Error('Discogs is not configured — add DISCOGS_TOKEN to .env. See DISCOGS_SETUP.md.');
    err.code = 'DISCOGS_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${API_BASE}/marketplace/price_suggestions/${releaseId}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error(`Discogs price suggestions failed (${res.status}): ${await res.text()}`);
  }
  return res.json(); // { "Mint (M)": {currency, value}, "Very Good Plus (VG+)": {...}, ... }
}

function lookupSuggestedPrice(priceByGrade, grade) {
  if (!priceByGrade || !grade) return null;
  const key = GRADE_KEY_MAP[grade.trim().toUpperCase()];
  if (!key || !priceByGrade[key]) return null;
  return priceByGrade[key].value;
}

// Have/Want/Rating are real demand signals from Discogs' community data.
// NOTE: the "Low/Median/High sold" stat shown on the Discogs website release
// page is NOT available through the public API — checked both /releases/{id}
// and /marketplace/stats/{id} directly and neither returns sold-price history,
// only num_for_sale and the current lowest active listing.
async function getCommunityStats(releaseId) {
  if (!isConfigured()) {
    const err = new Error('Discogs is not configured — add DISCOGS_TOKEN to .env. See DISCOGS_SETUP.md.');
    err.code = 'DISCOGS_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${API_BASE}/releases/${releaseId}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error(`Discogs release lookup failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const c = json.community || {};
  return {
    have: c.have ?? null,
    want: c.want ?? null,
    ratingAverage: c.rating ? c.rating.average : null,
    ratingCount: c.rating ? c.rating.count : null
  };
}

function conditionKey(grade) {
  if (!grade) return null;
  return GRADE_KEY_MAP[grade.trim().toUpperCase()] || null;
}

// Creates a real, live "For Sale" listing on your Discogs marketplace account.
// Requires: release_id (from findReleaseId), a media condition (Discogs won't
// accept a listing without one), and a price.
async function createListing(record) {
  if (!isConfigured()) {
    const err = new Error('Discogs is not configured — add DISCOGS_TOKEN to .env. See DISCOGS_SETUP.md.');
    err.code = 'DISCOGS_NOT_CONFIGURED';
    throw err;
  }
  if (!record.discogs_release_id) {
    const err = new Error('No matched Discogs release yet — look up pricing first so it can find the release.');
    err.code = 'NO_RELEASE_ID';
    throw err;
  }
  const condition = conditionKey(record.condition_media);
  if (!condition) {
    const err = new Error('Discogs requires a media condition grade (e.g. VG+, NM) before it will accept a listing.');
    err.code = 'MISSING_CONDITION';
    throw err;
  }
  if (!record.asking_price) {
    const err = new Error('Set an asking price before publishing to Discogs.');
    err.code = 'MISSING_PRICE';
    throw err;
  }

  const body = {
    release_id: record.discogs_release_id,
    condition,
    price: parseFloat(record.asking_price),
    status: 'For Sale',
    allow_offers: false
  };
  const sleeveKey = conditionKey(record.condition_sleeve);
  if (sleeveKey) body.sleeve_condition = sleeveKey;
  const trustLine = 'Message me with any questions — happy to send additional photos or answer anything about condition before you buy.';
  body.comments = record.listing_extras ? `${record.listing_extras}\n\n${trustLine}` : trustLine;

  const res = await fetch(`${API_BASE}/marketplace/listings`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Discogs listing creation failed (${res.status}): ${await res.text()}`);
  }
  return res.json(); // { listing_id, resource_url, ... }
}

// Permanently removes a listing from the Marketplace (seller-only).
async function deleteListing(listingId) {
  if (!isConfigured()) {
    const err = new Error('Discogs is not configured — add DISCOGS_TOKEN to .env. See DISCOGS_SETUP.md.');
    err.code = 'DISCOGS_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${API_BASE}/marketplace/listings/${listingId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Discogs listing deletion failed (${res.status}): ${await res.text()}`);
  }
}

module.exports = {
  isConfigured,
  findReleaseId,
  getPriceSuggestions,
  lookupSuggestedPrice,
  getCommunityStats,
  createListing,
  deleteListing,
  GRADE_KEY_MAP,
  STANDARD_MEDIA_GRADES,
  STANDARD_SLEEVE_GRADES
};
