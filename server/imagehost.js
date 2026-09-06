// Public image hosting via Cloudinary, so eBay's Sell API and Instagram's
// Graph API (both of which fetch the image themselves from a public HTTPS
// URL) have something reliable to point at. Switched from ImgBB after its
// free CDN started intermittently accepting a connection and then hanging
// with no response at all, which surfaced as eBay/Instagram publish
// timeouts with nothing wrong on this app's end. See CLOUDINARY_SETUP.md.
//
// Uses a signed upload (api_key + timestamp + sha1 signature) rather than an
// unsigned upload preset, since this only ever runs server-side and the API
// secret never needs to leave this process.
//
// No metadata-stripping step needed here — every buffer passed in has
// already been through branding.js's sharp() pipeline, which drops EXIF/GPS
// data on output by default.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_FOLDER = 'fourq-distro';

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
// A stalled upload should fail fast and retry rather than block the whole
// publish flow indefinitely — the exact failure mode ImgBB's CDN produced.
const UPLOAD_TIMEOUT_MS = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cloudinary signs by sorting every non-file param alphabetically, joining
// as key=value pairs, then SHA-1'ing that string with the API secret
// appended — see https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
function signParams(params, apiSecret) {
  const base = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(base + apiSecret).digest('hex');
}

async function uploadBuffer(buffer, filename, attempt = 1) {
  if (!isConfigured()) {
    const err = new Error(
      'Image hosting is not configured — add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, ' +
      'and CLOUDINARY_API_SECRET to .env. See CLOUDINARY_SETUP.md.'
    );
    err.code = 'IMAGE_HOST_NOT_CONFIGURED';
    throw err;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ folder: UPLOAD_FOLDER, timestamp }, process.env.CLOUDINARY_API_SECRET);

  const form = new FormData();
  form.set('file', new Blob([buffer]), filename);
  form.set('api_key', process.env.CLOUDINARY_API_KEY);
  form.set('timestamp', String(timestamp));
  form.set('folder', UPLOAD_FOLDER);
  form.set('signature', signature);

  let res, bodyText;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    });
    bodyText = await res.text();
  } catch (err) {
    // A hang (no response at all) or network error is worth the same retry
    // as a completed-but-bad response below.
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return uploadBuffer(buffer, filename, attempt + 1);
    }
    throw new Error(`Image upload to Cloudinary timed out after ${MAX_ATTEMPTS} attempts: ${err.message}`);
  }

  if (!res.ok) {
    // 5xx from Cloudinary's own backend is transient; 4xx (bad signature,
    // misconfigured credentials, etc.) won't fix itself on retry.
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return uploadBuffer(buffer, filename, attempt + 1);
    }
    throw new Error(`Image upload failed (${res.status}): ${bodyText}`);
  }
  const json = JSON.parse(bodyText);
  return json.secure_url;
}

async function uploadImage(localFilePath) {
  return uploadBuffer(fs.readFileSync(localFilePath), path.basename(localFilePath));
}

module.exports = { isConfigured, uploadImage, uploadBuffer };
