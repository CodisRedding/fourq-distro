const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

// Phones store rotation as EXIF metadata rather than baking it into the
// pixels — sharp ignores that by default, so anything downstream (the photo
// grid here, the branding border, eBay's hosted copy) can end up sideways
// unless we explicitly bake the rotation in once, up front.
async function normalizeOrientation(buffer) {
  return sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();
}

// --- tiny .env loader (no extra dependency) ---
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const store = require('./store');
const { generateListing, generateInstagramCaption } = require('./listing');
const { suggestPrice } = require('./pricing');
const ebay = require('./ebay');
const discogs = require('./discogs');
const photoHosting = require('./photoHosting');
const photoRoles = require('./photoRoles');
const identify = require('./identify');
const settings = require('./settings');
const tiering = require('./tiering');
const instagram = require('./instagram');

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
  const { tier, ebay_status, fb_status, discogs_status, instagram_status, search, sold } = req.query;

  if (tier) records = records.filter(r => r.tier.startsWith(tier));
  if (ebay_status) records = records.filter(r => r.status.ebay === ebay_status);
  if (fb_status) records = records.filter(r => r.status.fb === fb_status);
  if (discogs_status) records = records.filter(r => r.status.discogs === discogs_status);
  if (instagram_status) records = records.filter(r => r.status.instagram === instagram_status);
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

app.get('/api/settings', (req, res) => {
  res.json(settings.getSettings());
});

app.put('/api/settings', (req, res) => {
  res.json(settings.updateSettings(req.body || {}));
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
  res.json({
    ...generateListing(record),
    instagramCaption: generateInstagramCaption(record, { betaNotice: settings.getSettings().instagram_beta_notice })
  });
});

// ---- photos ----

// Runs the local-Ollama classification pass on a batch of newly-uploaded
// photos and, per the current settings, tags the dead-wax photo(s) and/or
// fills in Step 2 fields (artist/title/label/format/year/country) — one
// classification pass covers both, since both just need to know what each
// photo shows. Mutates `patch` in place; never throws (logs and no-ops on
// any failure, including Ollama not running).
async function autoTagAndIdentify(record, newPhotoAbsPaths, newPhotos, patch) {
  const current = settings.getSettings();
  if (!current.auto_tag_deadwax_photos && !current.auto_identify_from_photos) return;

  try {
    const roles = await photoRoles.classifyPhotos(newPhotoAbsPaths);

    if (current.auto_tag_deadwax_photos) {
      const flaggedUrls = newPhotoAbsPaths
        .filter(p => roles.get(p) === 'RUNOUT')
        .map(absPath => newPhotos[newPhotoAbsPaths.indexOf(absPath)]);
      if (flaggedUrls.length) {
        patch.deadwax_photos = [...new Set([...(record.deadwax_photos || []), ...flaggedUrls])];
      }
    }

    if (current.auto_identify_from_photos && !record.artist && !record.title) {
      const byRole = {
        front: newPhotoAbsPaths.filter(p => roles.get(p) === 'FRONT_COVER'),
        back: newPhotoAbsPaths.filter(p => roles.get(p) === 'BACK_COVER'),
        label: newPhotoAbsPaths.filter(p => roles.get(p) === 'LABEL')
      };
      const fields = await identify.identifyFromPhotos(byRole);
      if (fields) {
        for (const key of identify.FIELDS) {
          if (fields[key] && !record[key]) patch[key] = fields[key];
        }
      }
    }
  } catch (err) {
    console.error('Photo classification/identification failed:', err.message);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

app.post('/api/inventory/:id/photos', upload.array('photos', 10), async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const dir = path.join(PHOTOS_DIR, req.params.id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const newPhotos = [];
    const newPhotoAbsPaths = [];
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const normalized = await normalizeOrientation(f.buffer);
      const base = f.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.\-]/g, '_');
      const safe = Date.now() + '-' + i + '-' + base + '.jpg';
      const dest = path.join(dir, safe);
      fs.writeFileSync(dest, normalized);
      newPhotos.push(`/photos/${req.params.id}/${safe}`);
      newPhotoAbsPaths.push(dest);
    }
    const photos = [...(record.photos || []), ...newPhotos];
    const patch = { photos };
    await autoTagAndIdentify(record, newPhotoAbsPaths, newPhotos, patch);
    const updated = store.updateById(req.params.id, patch);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Photo processing failed: ' + err.message });
  }
});

// Accepts a zip of a phone's camera roll export for one record — extracts
// it, converts any HEIC photos to JPEG (iPhones export HEIC by default, and
// our image-processing pipeline can't read it), and appends everything to
// the record's photos in filename order (which matches capture order, so
// front-cover-first as long as that's the first shot taken).
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname) && file.mimetype !== 'application/zip' && file.mimetype !== 'application/x-zip-compressed') {
      return cb(new Error('Only .zip uploads are allowed on this endpoint'));
    }
    cb(null, true);
  }
});

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
const HEIC_EXT = new Set(['.heic']);

function walkFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function runHeicConvert(folder) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'tools', 'heic-convert.ps1');
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Folder', folder],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      });
  });
}

app.post('/api/inventory/:id/photos-zip', zipUpload.single('zip'), async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No zip file uploaded (field name must be "zip").' });

  const tempDir = path.join(os.tmpdir(), 'fourq-distro-zip-' + crypto.randomUUID());
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const zip = new AdmZip(req.file.buffer);
    zip.extractAllTo(tempDir, true);

    const allFiles = walkFiles(tempDir);
    const heicFiles = allFiles.filter(f => HEIC_EXT.has(path.extname(f).toLowerCase()));
    const heicFolders = new Set(heicFiles.map(f => path.dirname(f)));
    for (const folder of heicFolders) {
      await runHeicConvert(folder);
    }

    // Re-walk after conversion so the new .jpg siblings show up, and only
    // keep images (skip the now-redundant original .HEIC source files).
    const finalFiles = walkFiles(tempDir)
      .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));

    if (!finalFiles.length) {
      return res.status(400).json({ error: 'No usable images found in that zip (after HEIC conversion, if any).' });
    }

    const destDir = path.join(PHOTOS_DIR, req.params.id);
    fs.mkdirSync(destDir, { recursive: true });
    const newPhotos = [];
    const newPhotoAbsPaths = [];
    for (let i = 0; i < finalFiles.length; i++) {
      const f = finalFiles[i];
      const normalized = await normalizeOrientation(fs.readFileSync(f));
      const base = path.basename(f).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.\-]/g, '_');
      const safeName = Date.now() + '-' + i + '-' + base + '.jpg';
      const dest = path.join(destDir, safeName);
      fs.writeFileSync(dest, normalized);
      newPhotos.push(`/photos/${req.params.id}/${safeName}`);
      newPhotoAbsPaths.push(dest);
    }

    const photos = [...(record.photos || []), ...newPhotos];
    const patch = { photos };
    await autoTagAndIdentify(record, newPhotoAbsPaths, newPhotos, patch);
    const updated = store.updateById(req.params.id, patch);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Zip processing failed: ' + err.message });
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  }
});

app.delete('/api/inventory/:id/photos', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { url } = req.body;
  const photos = (record.photos || []).filter(p => p !== url);
  const deadwax_photos = (record.deadwax_photos || []).filter(p => p !== url);
  if (url) {
    const filePath = path.join(__dirname, '..', 'data', url.replace(/^\/photos/, 'photos'));
    fs.unlink(filePath, () => {});
  }
  const updated = store.updateById(req.params.id, { photos, deadwax_photos });
  res.json(updated);
});

// Manual correction for the auto-tagging in the upload routes above — the
// classification is usually right but not infallible, so the badge in the
// UI is toggleable on any photo rather than a fixed automatic-only label.
app.post('/api/inventory/:id/photos/toggle-deadwax', (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { url } = req.body;
  if (!url || !(record.photos || []).includes(url)) {
    return res.status(400).json({ error: 'Unknown photo url for this record.' });
  }
  const current = record.deadwax_photos || [];
  const deadwax_photos = current.includes(url)
    ? current.filter(p => p !== url)
    : [...current, url];
  const updated = store.updateById(req.params.id, { deadwax_photos });
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

// Manual rotate for when auto-orientation didn't catch it (or a photo was
// genuinely shot sideways on purpose). Rewrites the file in place and drops
// any cached hosted copy so the next publish re-uploads the corrected image
// instead of the stale rotated-wrong one.
app.post('/api/inventory/:id/photos/rotate', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { url, degrees } = req.body;
  if (!url || !(record.photos || []).includes(url)) {
    return res.status(400).json({ error: 'Unknown photo url for this record.' });
  }
  const turn = ((Number(degrees) % 360) + 360) % 360;
  const filePath = path.join(__dirname, '..', 'data', url.replace(/^\/photos/, 'photos'));
  try {
    // .rotate() with no args bakes in any leftover EXIF orientation from
    // photos uploaded before auto-normalization existed; .rotate(turn) then
    // applies the manual turn on top of that already-upright image.
    const rotated = await sharp(fs.readFileSync(filePath)).rotate().rotate(turn).jpeg({ quality: 92 }).toBuffer();
    fs.writeFileSync(filePath, rotated);
    const hostedUrls = { ...(record.photo_hosted_urls || {}) };
    delete hostedUrls[url];
    const updated = store.updateById(req.params.id, { photo_hosted_urls: hostedUrls });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Rotate failed: ' + err.message });
  }
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
    const knownCodes = ['EBAY_NOT_CONFIGURED', 'IMAGE_HOST_NOT_CONFIGURED', 'NO_PHOTOS', 'MISSING_PRICE'];
    const status = knownCodes.includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Manual, explicit sync — same "click to fetch, never auto-poll in the
// background" pattern as the Instagram stats sync. Only checks records
// eBay itself has PUBLISHED; flips status.ebay to 'sold' when the offer's
// soldQuantity confirms it. Doesn't touch Discogs/FB/Instagram status for
// the same physical record — pulling those listings once the one copy is
// gone stays a manual step, same as everywhere else in this app.
app.post('/api/ebay/sync-status', async (req, res) => {
  if (!ebay.isConfigured()) {
    return res.status(400).json({ error: 'eBay is not connected yet. See EBAY_SETUP.md.' });
  }
  const records = store.readAll().filter(r => r.status.ebay === 'listed' && r.ebay_sku);
  let synced = 0;
  let sold = 0;
  const errors = [];
  for (const r of records) {
    try {
      const status = await ebay.getSoldStatus(r.ebay_sku);
      if (status.sold) {
        store.updateById(r.id, { status: { ebay: 'sold' } });
        sold++;
      }
      synced++;
    } catch (err) {
      errors.push({ id: r.id, artist: r.artist, title: r.title, error: err.message });
    }
  }
  res.json({ synced, sold, total: records.length, errors });
});

// ---- Instagram ----
// No OAuth redirect routes here — IG_ACCESS_TOKEN/IG_USER_ID are obtained by
// hand from the Meta App Dashboard's own tester/token-generator UI. See
// INSTAGRAM_SETUP.md and the comment atop server/instagram.js for why.
app.get('/api/instagram/status', (req, res) => {
  res.json({ configured: instagram.isConfigured() });
});

app.post('/api/inventory/:id/publish-instagram', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!instagram.isConfigured()) {
    return res.status(400).json({ error: 'Instagram is not connected yet. See INSTAGRAM_SETUP.md.' });
  }
  try {
    const imageUrls = await photoHosting.ensureHostedPhotos(req.params.id);
    const caption = generateInstagramCaption(record, { betaNotice: settings.getSettings().instagram_beta_notice });

    const { postId, permalink } = await instagram.publishPost(imageUrls, caption);
    const updated = store.updateById(req.params.id, {
      instagram_post_id: postId,
      instagram_permalink: permalink,
      status: { instagram: 'listed' }
    });
    res.json(updated);
  } catch (err) {
    const knownCodes = ['INSTAGRAM_NOT_CONFIGURED', 'IMAGE_HOST_NOT_CONFIGURED', 'NO_PHOTOS'];
    const status = knownCodes.includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Manual, explicit refresh — same "click to fetch, never auto-poll in the
// background" pattern as the Discogs price lookup, so this never spends API
// calls the owner didn't ask for.
app.get('/api/inventory/:id/instagram-stats', async (req, res) => {
  const record = store.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!record.instagram_post_id) {
    return res.status(400).json({ error: 'This record has no Instagram post yet.' });
  }
  if (!instagram.isConfigured()) {
    return res.status(400).json({ error: 'Instagram is not connected yet. See INSTAGRAM_SETUP.md.' });
  }
  try {
    const stats = await instagram.getPostStats(record.instagram_post_id);
    const updated = store.updateById(req.params.id, {
      instagram_stats: { ...stats, synced_at: new Date().toISOString() }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk version for the inventory table — refreshes every record that has a
// live Instagram post, one at a time (personal-scale usage, no need for
// concurrency here).
app.post('/api/instagram/sync-stats', async (req, res) => {
  if (!instagram.isConfigured()) {
    return res.status(400).json({ error: 'Instagram is not connected yet. See INSTAGRAM_SETUP.md.' });
  }
  const records = store.readAll().filter(r => r.instagram_post_id);
  let synced = 0;
  const errors = [];
  for (const r of records) {
    try {
      const stats = await instagram.getPostStats(r.instagram_post_id);
      store.updateById(r.id, { instagram_stats: { ...stats, synced_at: new Date().toISOString() } });
      synced++;
    } catch (err) {
      errors.push({ id: r.id, artist: r.artist, title: r.title, error: err.message });
    }
  }
  res.json({ synced, total: records.length, errors });
});

app.listen(PORT, () => {
  console.log(`Record listing manager running at http://localhost:${PORT}`);
  if (!ebay.isConfigured()) {
    console.log('(eBay publishing is not configured yet — see EBAY_SETUP.md)');
  }
  if (!instagram.isConfigured()) {
    console.log('(Instagram publishing is not configured yet — see INSTAGRAM_SETUP.md)');
  }
  if (!require('./imagehost').isConfigured()) {
    console.log('(Image hosting not configured — see CLOUDINARY_SETUP.md for eBay/Instagram photos to work)');
  }
});
