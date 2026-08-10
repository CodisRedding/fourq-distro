const path = require('path');
const fs = require('fs');
const imagehost = require('./imagehost');
const branding = require('./branding');
const store = require('./store');

const PHOTOS_DIR = path.join(__dirname, '..', 'data', 'photos');

// Uploads any of this record's photos that aren't already hosted, caching the
// result on the record so a re-publish/refresh doesn't re-upload every time.
// Returns the hosted URLs in the same order as record.photos.
async function ensureHostedPhotos(recordId) {
  const record = store.getById(recordId);
  if (!record) throw new Error('Record not found');

  if (!record.photos || record.photos.length === 0) {
    const err = new Error('Upload at least one photo before publishing — a listing with no photos isn\'t usable.');
    err.code = 'NO_PHOTOS';
    throw err;
  }

  const cache = { ...(record.photo_hosted_urls || {}) };
  let changed = false;

  for (const webPath of record.photos) {
    if (cache[webPath]) continue;
    const localPath = path.join(PHOTOS_DIR, webPath.replace(/^\/photos\//, ''));
    const branded = await branding.addBorder(fs.readFileSync(localPath), { sealed: Boolean(record.sealed) });
    cache[webPath] = await imagehost.uploadBuffer(branded, path.basename(localPath));
    changed = true;
  }

  if (changed) {
    store.updateById(recordId, { photo_hosted_urls: cache });
  }

  return record.photos.map(p => cache[p]);
}

module.exports = { ensureHostedPhotos };
