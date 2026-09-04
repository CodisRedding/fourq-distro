// Public image hosting via ImgBB, so eBay's Sell API (which requires publicly
// fetchable HTTPS image URLs) has something to point at. Free API key from
// https://api.imgbb.com/ — make sure "Keep EXIF data" is OFF in your account
// settings so GPS/location metadata isn't exposed on public listing photos.

const fs = require('fs');
const path = require('path');

function isConfigured() {
  return Boolean(process.env.IMGBB_API_KEY);
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ImgBB occasionally returns a 400 wrapping a backend DB hiccup
// ("SQLSTATE[HY000]: General error: 2006 MySQL server has gone away")
// that has nothing to do with the image itself — it clears up if you just
// retry the same upload.
function isTransientImgbbError(bodyText) {
  return /General error|MySQL server has gone away/i.test(bodyText);
}

async function uploadBuffer(buffer, filename, attempt = 1) {
  if (!isConfigured()) {
    const err = new Error('Image hosting is not configured — add IMGBB_API_KEY to .env.');
    err.code = 'IMGBB_NOT_CONFIGURED';
    throw err;
  }
  const form = new FormData();
  form.set('key', process.env.IMGBB_API_KEY);
  form.set('image', new Blob([buffer]), filename);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form
  });
  const bodyText = await res.text();

  if (!res.ok) {
    const transient = res.status >= 500 || isTransientImgbbError(bodyText);
    if (transient && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return uploadBuffer(buffer, filename, attempt + 1);
    }
    throw new Error(`Image upload failed (${res.status}): ${bodyText}`);
  }
  const json = JSON.parse(bodyText);
  if (!json.success) {
    throw new Error('Image upload failed: ' + JSON.stringify(json));
  }
  return json.data.url;
}

async function uploadImage(localFilePath) {
  return uploadBuffer(fs.readFileSync(localFilePath), path.basename(localFilePath));
}

module.exports = { isConfigured, uploadImage, uploadBuffer };
