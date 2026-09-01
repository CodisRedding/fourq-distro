# Fourq Distro — Record Inventory & Listing Manager

Local Node/Express app (no build step, no database) for cataloging and
selling a personal vinyl collection across eBay, Discogs, and Facebook
Marketplace from one place. Single user, runs on the owner's Windows machine.
This folder (`C:\Users\rocky\Code\fourq-distro`) is the canonical, git-tracked
copy. A previous parallel working copy lives at
`C:\Users\rocky\Code\DailyDollar\DailyDollar` (note the doubled path segment)
— it is **not** a git repo and is retired/reference-only. **Never make code
changes there** — a whole session's worth of work (the zip-photo-upload and
photo-rotate endpoints) was accidentally built in that directory instead of
here on 2026-08-31 and had to be manually ported over afterward. If asked to
build a feature, always double check `pwd`/the file path is under
`fourq-distro` before writing code. A zipped snapshot,
`C:\Users\rocky\Code\DailyDollar - Copy.zip`, also exists but is not
extracted — ignore it unless the owner asks to dig through it.

**Prime directive: minimize Claude involvement in the day-to-day cataloging
workflow.** The owner is trying to get token usage as close to zero as
possible for routine record-listing. As much as possible should be driven
through the app's own web UI (`http://localhost:3000`) without an AI in the
loop. **Do not do mechanical steps yourself (uploading photos, running curl
one-liners, patching fields) unless the user explicitly asks** — point them
at the UI instead. Only step in for genuine judgment calls: identifying an
obscure/unclear record from a photo, pricing research the app can't automate,
or actual code changes/bug fixes.

**Claude session workflow, to keep token usage down when a Claude session
*is* warranted (a code change, bug fix, or judgment call):**

1. Finish the task.
2. `/rename` the session while it still has full context, so the name is
   meaningful if you ever `/resume` it later.
3. `/clear`.
4. Start the next task.

Clear between unrelated tasks even mid-session — e.g. after finishing a bug
fix, before starting a different feature — not just when stopping for the
day. `/context` isn't a required step every cycle; it's a spot-check, worth
running occasionally (every 30–60 min of active work) to catch the Messages
category creeping back up past ~100k, rather than after every single
`/clear`.

## Running the app

```bash
npm start   # http://localhost:3000
```

**Critical gotcha — silent restart failures.** After editing any file under
`server/`, the running node process must be killed and restarted, or your
change is not live even though it looks like it should be, and nothing
loudly announces the failure. This has genuinely happened and cost a full
session of confused debugging where an old process kept serving stale code
indefinitely. Always verify after restarting:
```bash
netstat -ano | grep ':3000' | grep LISTENING   # note the PID
taskkill //F //PID <pid>
npm start > server.log 2>&1   # run in background
sleep 2 && curl -s http://localhost:3000/api/stats   # confirm it actually came back up
```
If you just added/changed a route, hit it once to confirm the *new* behavior
is actually present before telling the user something is fixed.

## Architecture

- `server/server.js` — Express app, all routes.
- `server/store.js` — the entire "database": reads/writes `data/inventory.json`
  fresh on every call (no in-memory cache, no ORM). `createBlank()` defines
  the full record shape — check it before assuming a field exists. Confirmed
  present: `matrix_number`, `sealed`, `ebay_sku`.
- `server/discogs.js` — Discogs API: release matching, grade-specific price
  suggestions (`price_suggestions` endpoint — **never** use the plain "low"
  price as if it were a specific-grade price, that was an early bug), listing
  create/delete. Sold-price history (low/median/high/last sold) is **not**
  available via Discogs' API — it's manually entered by the owner from the
  Discogs stats web page into `discogs_sold_stats`.
- `server/ebay.js` — eBay Sell API (Inventory + Offer). Production only, no
  sandbox. See `EBAY_SETUP.md`'s "gotchas" section for hard-won quirks
  (required `Content-Language`/`X-EBAY-C-MARKETPLACE-ID` headers, the
  `USED_EXCELLENT` condition enum, business policies, and the SKU-stability
  rule — `ebay_sku` is stored on the record and always reused on republish,
  never recomputed, because recomputing it once forked a listing into a live
  duplicate).
- `server/photoHosting.js` — uploads photos to ImgBB for eBay/marketplace use;
  applies `branding.js` (border + optional sealed watermark) first. Caches
  hosted URLs per photo in `photo_hosted_urls`; a rotate should invalidate
  that photo's cache entry so republish re-uploads the corrected version.
- `server/branding.js` — adds the "FOURQ (DISTRO)" border (thin rules,
  Germs-LP-style) to every photo that goes out publicly, plus a diagonal
  "STILL SEALED" ribbon when `record.sealed` is true. Never touches the local
  originals in `data/photos/` — only the hosted copies.
- `server/listing.js` / `server/pricing.js` / `server/tiering.js` — shared
  listing text, price-suggestion logic, and tiering rules (Tier 1 individual
  high-value or no-comp, Tier 2 same-artist lot of 3+, Tier 3 bulk grab bag,
  "Unsorted - new arrival" until graded).
- `server/openapi.json` + Scalar docs at `/docs` — interactive API reference.
- `public/app.js` — the whole frontend (vanilla JS, no framework/build step).
- `tools/catalog.js` — CLI for the cataloging workflow, talks to the running
  app's own API rather than touching `data/inventory.json` directly.
- `tools/heic-convert.ps1` — converts HEIC photos to JPEG via the Windows
  Runtime imaging APIs (no external tool/npm dependency); invoked by the
  `photos-zip` route in `server/server.js`, not meant to be run standalone.

## Cataloging workflow

1. Owner opens a record's panel (or clicks "Add Record" for something not
   already in the catalog).
2. Drops a `.zip` of the phone's camera-roll export straight into the Photos
   field (`POST /api/inventory/:id/photos-zip`) — extraction, HEIC
   conversion, and orientation correction all happen server-side with no
   prep needed beforehand. A manual per-photo rotate endpoint
   (`POST /api/inventory/:id/photos/rotate`) exists for anything auto-
   orientation didn't catch.
3. Owner grades condition and sets price themselves — this used to be a
   photo-by-photo AI judgment call; don't offer to re-grade from photos
   unless explicitly asked.
4. Owner clicks Publish to eBay / Publish to Discogs directly from the panel.

## Setup docs

`EBAY_SETUP.md` and `DISCOGS_SETUP.md` cover one-time account/API setup and
every integration gotcha hit so far — read those before re-deriving eBay or
Discogs behavior from scratch.
