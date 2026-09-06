# Connecting Cloudinary image hosting (one-time setup)

eBay's Sell API and Instagram's Graph API don't accept an uploaded file
directly — both require a publicly fetchable HTTPS URL, which they download
from on their own end when you publish. This app hosts a branded copy of
each photo (via `server/photoHosting.js`/`server/imagehost.js`) on Cloudinary
to give them something to fetch. Free tier, no billing details needed.

This replaced ImgBB on 2026-09-06 after its free CDN started intermittently
accepting a connection and then just hanging with no response — which showed
up as eBay/Instagram publish attempts timing out for reasons that had nothing
to do with this app. Already-published records keep pointing at their
existing `i.ibb.co` URLs (the hosting cache only uploads a photo once), so
nothing needs to be re-uploaded or re-published just from switching.

1. Create a free account at https://cloudinary.com/users/register/free.
2. On the dashboard home page, find the **Product Environment Credentials**
   card — it shows your **Cloud name**, **API Key**, and **API Secret**
   (click "reveal" to show the secret).
3. Add all three to `.env` in this folder:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```
4. Restart the app (`npm start`).

## Done
"Publish to eBay" and "Publish to Instagram" will now host photos on
Cloudinary automatically — nothing to click, nothing else to configure.
Uploads land in a `fourq-distro` folder in your Cloudinary Media Library,
one subfolder per listing (named after its record id), if you ever want to
browse or clean them up by hand. Records published before this per-listing
folder layout was added keep their photos in the flat `fourq-distro` root —
nothing retroactively moves them, since that would change already-live
listing image URLs out from under published eBay/Instagram posts.

A couple of notes:
- No separate metadata/privacy setting to flip here (ImgBB's "Keep EXIF data
  OFF" account setting had an equivalent concern) — every photo already
  passes through `branding.js`'s image-processing step before upload, which
  strips EXIF/GPS data as a side effect regardless of hosting provider.
- The free tier's storage/bandwidth limits are far beyond what a personal
  vinyl catalog's photos will ever use.
