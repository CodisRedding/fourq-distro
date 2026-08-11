const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

// --- tiny .env loader (no extra dependency) ---
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const store = require('./store');
const { generateListing } = require('./listing');
const { suggestPrice } = require('./pricing');
const ebay = require('./ebay');
const discogs = require('./discogs');
const photoHosting = require('./photoHosting');
const tiering = require('./tiering');

const app = express();
const PORT = process.env.PORT || 3000;
const PHOTOS_DIR = path.join(__dirname, '..', 'data', 'photos');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/photos', express.static(PHOTOS_DIR));

// ---- API docs ----
app.get('/api/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});
// @scalar/express-api-reference is ESM-only; the rest of this app is CommonJS,
// so it's loaded via dynamic import rather than require().
import('@scalar/express-api-reference').then(({ apiReference }) => {
  app.get('/docs', apiReference({ url: '/api/openapi.json', pageTitle: 'Fourq Distro API' }));
});

// ---- inventory list / filter ----
app.get('/api/inventory', (req, res) => {
  let records = store.readAll();
  const { tier, ebay_status, fb_status, discogs_status, search, sold } = req.query;

  if (tier) records = records.filter(r => r.tier.startsWith(tier));
  if (ebay_status) records = records.filter(r => r.status.ebay === ebay_status);
  if (fb_status) records = records.filter(r => r.status.fb === fb_status);
  if (discogs_status) records = records.filter(r => r.status.discogs === discogs_status);
  if (sold === 'true') records = records.filter(r => r.sold);
  if (sold === 'false') records = records.filter(r => !r.sold);
  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r =>
      r.artist.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      (r.label || '').toLowerCase().includes(q)
    );
  }
  res.json(records);
});

// A blank record for the photo-identification workflow — no pre-existing
// Discogs-collection data, everything gets filled in after looking at photos.
app.post('/api/inventory', (req, res) => {
  const record = store.createBlank();
  store.create(record);
  res.status(201).json(record);
});

app.get('/api/stats', (req, res) => {
  const records = store.readAll();
  const stats = {
    total: records.length,
    sold: records.filter(r => r.sold).length,
    byTier: {},
    ebayListed: records.filter(r => r.status.ebay === 'listed').length,
    fbListed: records.filter(r => r.status.fb === 'listed').length,
    discogsListed: records.filter(r => r.status.discogs === 'listed').length,
    ebayConfigured: ebay.isConfigured(),
    discogsConfigured: discogs.isConfigured()
  };
  for (const r of records) {
    stats.byTier[r.tier] = (stats.byTier[r.tier] || 0) + 1;
  }
  res.json(stats);
});

app.get('/api/grades', (req, res) => {
  res.json({
    media: discogs.STANDARD_MEDIA_GRADES,
    sleeve: discogs.STANDARD_SLEEVE_GRADES
  });
});

app.get('/api/inventory/:id', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(record);
});

app.delete('/api/inventory/:id', (req, res) => {
  const records = store.readAll();
  const idx = records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  records.splice(idx, 1);
  store.writeAll(records);
  res.json({ ok: true });
});

app.patch('/api/inventory/:id', (req, res) => {
  const allowed = [
    'artist', 'title', 'format', 'year', 'country', 'label',
    'asking_price', 'condition_media', 'condition_sleeve', 'matrix_number', 'sealed', 'notes', 'listing_extras',
    'status', 'sold', 'discogs_sold_stats'
  ];
  const patch = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  const updated = store.updateById(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.get('/api/inventory/:id/price-suggestion', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(suggestPrice(record));
});

app.post('/api/inventory/:id/discogs-lookup', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  try {
    let releaseId = record.discogs_release_id;
    if (!releaseId) {
      releaseId = await discogs.findReleaseId(record);
      if (!releaseId) {
        return res.status(404).json({ error: 'No matching release found on Discogs for this artist/title.' });
      }
      // Save the match immediately so a retry (e.g. after fixing seller settings) doesn't re-search.
      store.updateById(req.params.id, { discogs_release_id: releaseId });
    }
    const [priceByGrade, community] = await Promise.all([
      discogs.getPriceSuggestions(releaseId),
      discogs.getCommunityStats(releaseId)
    ]);
    let updated = store.updateById(req.params.id, {
      discogs_release_id: releaseId,
      discogs_price_by_grade: priceByGrade,
      discogs_community: community
    });

    // Newly-added records start untiered, and stay in the "no comp yet" bucket
    // until they're actually graded — re-sort any time we're still in one of
    // those provisional states, not just on the very first lookup.
    const stillProvisional = updated.tier === tiering.NEW_ARRIVAL_TIER ||
      updated.tier === 'Tier 1 - Individual (no comp, needs research)';
    if (stillProvisional) {
      const grade = updated.condition_media || updated.condition_sleeve;
      const referencePrice = grade ? discogs.lookupSuggestedPrice(priceByGrade, grade) : null;
      const allRecords = store.readAll();
      const newTier = tiering.assignTier(referencePrice, updated.artist, allRecords);
      updated = store.updateById(req.params.id, { tier: newTier });
    }

    res.json(updated);
  } catch (err) {
    const status = err.code === 'DISCOGS_NOT_CONFIGURED' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/inventory/:id/publish-discogs', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  try {
    let current = record;
    if (!current.discogs_release_id) {
      const releaseId = await discogs.findReleaseId(current);
      if (!releaseId) {
        return res.status(404).json({ error: 'No matching release found on Discogs for this artist/title.' });
      }
      current = store.updateById(req.params.id, { discogs_release_id: releaseId });
    }
    const listing = await discogs.createListing(current);
    const updated = store.updateById(req.params.id, {
      discogs_listing_id: listing.listing_id,
      status: { discogs: 'listed' }
    });
    res.json(updated);
  } catch (err) {
    const knownCodes = ['DISCOGS_NOT_CONFIGURED', 'NO_RELEASE_ID', 'MISSING_CONDITION', 'MISSING_PRICE'];
    const status = knownCodes.includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/inventory/:id/unlist-discogs', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!record.discogs_listing_id) {
    return res.status(400).json({ error: 'This record has no active Discogs listing.' });
  }
  try {
    await discogs.deleteListing(record.discogs_listing_id);
    const updated = store.updateById(req.params.id, {
      discogs_listing_id: null,
      status: { discogs: 'unlisted' }
    });
    res.json(updated);
  } catch (err) {
    const status = err.code === 'DISCOGS_NOT_CONFIGURED' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/inventory/:id/listing', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(generateListing(record));
});

// ---- photos ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(PHOTOS_DIR, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
      cb(null, safe);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

app.post('/api/inventory/:id/photos', upload.array('photos', 10), (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const newPhotos = (req.files || []).map(f => `/photos/${req.params.id}/${f.filename}`);
  const photos = [...(record.photos || []), ...newPhotos];
  const updated = store.updateById(req.params.id, { photos });
  res.json(updated);
});

app.delete('/api/inventory/:id/photos', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { url } = req.body;
  const photos = (record.photos || []).filter(p => p !== url);
  if (url) {
    const filePath = path.join(__dirname, '..', 'data', url.replace(/^\/photos/, 'photos'));
    fs.unlink(filePath, () => {});
  }
  const updated = store.updateById(req.params.id, { photos });
  res.json(updated);
});

// Reorders photos — matters because the first photo becomes the primary
// thumbnail on eBay (and most marketplaces). Body is the full new order;
// validated as a permutation of the existing set, not an arbitrary list.
app.post('/api/inventory/:id/photos/reorder', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { photos: newOrder } = req.body;
  const current = record.photos || [];
  const sameSet = Array.isArray(newOrder) &&
    newOrder.length === current.length &&
    [...newOrder].sort().join('|') === [...current].sort().join('|');
  if (!sameSet) {
    return res.status(400).json({ error: 'New order must contain exactly the same photos as before.' });
  }
  const updated = store.updateById(req.params.id, { photos: newOrder });
  res.json(updated);
});

// ---- eBay ----
app.get('/api/ebay/status', (req, res) => {
  res.json({ configured: ebay.isConfigured() });
});

app.get('/api/ebay/authorize-url', (req, res) => {
  res.json({ url: ebay.getAuthorizeUrl() });
});

// eBay redirects here after you approve access. Exchanges the one-time code
// for a refresh token and shows it to you to paste into .env — the app never
// stores or transmits it anywhere else.
app.get('/ebay/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send(`<p>eBay returned an error: ${escapeHtml(error)}</p>`);
  }
  if (!code) {
    return res.send('<p>No authorization code received.</p>');
  }
  try {
    const tokens = await ebay.exchangeCodeForTokens(code);
    res.send(`
      <h2>Connected!</h2>
      <p>Copy this refresh token into your <code>.env</code> file as <code>EBAY_REFRESH_TOKEN</code>, then restart the app:</p>
      <textarea style="width:100%;height:80px">${escapeHtml(tokens.refresh_token)}</textarea>
      <p>It's valid for about ${Math.round((tokens.refresh_token_expires_in || 0) / 86400)} days and won't be needed again unless it expires.</p>
    `);
  } catch (err) {
    res.status(500).send(`<p>Token exchange failed: ${escapeHtml(err.message)}</p>`);
  }
});

app.post('/api/ebay/setup-location', async (req, res) => {
  const { locationKey, addressLine1, city, stateOrProvince, postalCode, country } = req.body;
  if (!locationKey || !addressLine1 || !city || !postalCode) {
    return res.status(400).json({ error: 'locationKey, addressLine1, city, and postalCode are required' });
  }
  try {
    await ebay.createInventoryLocation(locationKey, {
      addressLine1, city, stateOrProvince, postalCode, country
    });
    res.json({ ok: true, locationKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ebay/business-policies', async (req, res) => {
  try {
    const policies = await ebay.getBusinessPolicies();
    res.json(policies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

app.post('/api/inventory/:id/publish-ebay', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!ebay.isConfigured()) {
    return res.status(400).json({ error: 'eBay is not connected yet. See EBAY_SETUP.md.' });
  }
  try {
    const imageUrls = await photoHosting.ensureHostedPhotos(req.params.id);
    const listingText = generateListing(record);
    const { listingId, sku } = await ebay.publishListing(record, listingText, imageUrls);
    const updated = store.updateById(req.params.id, {
      ebay_listing_id: listingId,
      ebay_sku: sku,
      status: { ebay: 'listed' }
    });
    res.json(updated);
  } catch (err) {
    const knownCodes = ['EBAY_NOT_CONFIGURED', 'IMGBB_NOT_CONFIGURED', 'NO_PHOTOS'];
    const status = knownCodes.includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Record listing manager running at http://localhost:${PORT}`);
  if (!ebay.isConfigured()) {
    console.log('(eBay publishing is not configured yet — see EBAY_SETUP.md)');
  }
  if (!require('./imagehost').isConfigured()) {
    console.log('(Image hosting not configured — add IMGBB_API_KEY to .env for eBay photos to work)');
  }
});
