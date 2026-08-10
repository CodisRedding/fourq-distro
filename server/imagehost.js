// Public image hosting via ImgBB, so eBay's Sell API (which requires publicly
// fetchable HTTPS image URLs) has something to point at. Free API key from
// https://api.imgbb.com/ — make sure "Keep EXIF data" is OFF in your account
// settings so GPS/location metadata isn't exposed on public listing photos.

const fs = require('fs');
const path = require('path');

function isConfigured() {
  return Boolean(process.env.IMGBB_API_KEY);
}

async function uploadBuffer(buffer, filename) {
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
  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error('Image upload failed: ' + JSON.stringify(json));
  }
  return json.data.url;
}

async function uploadImage(localFilePath) {
  return uploadBuffer(fs.readFileSync(localFilePath), path.basename(localFilePath));
}

module.exports = { isConfigured, uploadImage, uploadBuffer };
