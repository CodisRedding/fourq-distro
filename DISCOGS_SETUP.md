# Connecting Discogs pricing (one-time setup)

This is only used to look up real, grade-specific suggested prices for your records
via Discogs' `price_suggestions` API — read-only, nothing gets listed or posted to
Discogs. Much simpler than the eBay setup: no review, no waiting.

1. Go to https://www.discogs.com/settings/developers (log in first if needed).
2. Click **Generate new token**. Copy the token shown.
3. Add it to `.env` in this folder:
   ```
   DISCOGS_TOKEN=your-token-here
   ```
4. Restart the app (`npm start`).
5. **One more real gotcha**: Discogs' price_suggestions endpoint returns
   `"You must fill out your seller settings first"` even though you're not actually
   selling anything there — it's a blanket requirement of that API endpoint. Fix:
   log into Discogs → Settings → Seller Settings, and just fill in the required
   fields (shipping/payment info) and save. You don't need to list anything or pay
   for a subscription for this to satisfy the check.

Now, on any record's detail panel, click **"Look up Discogs pricing"** —
this finds the matching release on Discogs (by artist/title/catalog#) and pulls its
real suggested price for every standard grade (Mint through Poor). Once looked up,
the suggested price shown updates automatically based on whatever grade you enter in
the Media Condition field.

A couple of notes:
- The artist/title match is automatic and picks the first search result — for
  unusual band names or generic titles this can occasionally match the wrong
  release. Worth a quick sanity check against the label/catalog# before trusting the
  price for anything valuable.
- Discogs rate-limits API requests, so avoid mass-clicking "look up" across all 414
  records back to back — a handful at a time is fine.
