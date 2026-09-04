# Connecting eBay (one-time setup)

The app can publish listings directly to eBay via their official Sell API, but eBay
requires *you* to register a developer app and grant it permission — this can't be
done on your behalf, since it means logging into your own eBay account. Budget
30-45 minutes for the full thing the first time — eBay's portal has several
non-obvious steps.

## 1. Create a developer account
Go to https://developer.ebay.com and register. Note: eBay treats this as a separate
developer account from your regular buyer/seller login initially — it does not offer
to sign in with your existing eBay account during registration. New accounts go
through a manual review ("pending approval... at least one business day") before you
can create keys. This is normal, not an error — just wait for their approval email.

## 2. Create a keyset
In the developer portal under **Application Keys**, create a keyset for a new app,
making sure you're on the **Production** environment (not Sandbox — Sandbox is fake
listings only). You'll get two values — keep this tab open, you'll need them later:
- **Client ID** (also called App ID)
- **Client Secret** (also called Cert ID) — this one is on the Application Keys page
  specifically, *not* the User Tokens page, easy to miss

## 3. Grant the Marketplace Account Deletion exemption
The keyset will show as "disabled" with a prompt about "marketplace deletion/account
closure notification." This requirement is for apps that access *other* eBay
members' data — since this app only ever touches your own account, you're exempt:
1. Go to the **Marketplace Account Deletion** section of your developer dashboard
2. Toggle **"Not persisting eBay data"** to On
3. Confirm and pick the closest-matching exemption reason (e.g. "personal/single-user
   application")

## 4. Set up a redirect (RuName)
Under **User Tokens (eBay Sign-In)** → **"Get a Token from eBay via Your
Application"** → **Add eBay Redirect URL**. A couple of gotchas here:
- The Auth Accepted/Declined URL fields require `https://`, which a local dev server
  can't provide — **leave both blank**. The footnote confirms blank fields fall back
  to eBay's own generic accept/reject pages, which is exactly what we want (see step 6).
- Fill in a **Display Title** (e.g. "Record Inventory Manager"). The Privacy Policy
  URL field can usually be left blank too.
- Save. eBay generates a **RuName** value (looks like `YourName-YourApp-abc12345`) —
  this is what goes in `.env`, not a raw URL.
- **Ignore the "OAuth (new security)" radio button and "Sign in to Production"
  button further up the page** — clicking it triggers a confusing modal loop asking
  you to configure a redirect you've already configured. That whole section is
  eBay's own quick-token shortcut tool and isn't the flow we need; our app builds
  its own consent link instead (step 6).

## 5. Add what you have so far to `.env`
Copy `.env.example` to `.env` in this folder and fill in:
```
EBAY_CLIENT_ID=your-client-id
EBAY_CLIENT_SECRET=your-client-secret
EBAY_RUNAME=your-runame
```
Restart the app (`npm start`) so it picks these up.

## 6. Authorize the app (one-time consent)
- With the app running, open: `http://localhost:3000/api/ebay/authorize-url`
- That returns JSON `{ "url": "..." }` — open that URL in your browser
- Log into eBay and approve access. The permissions list should mention managing
  your inventory/offers and viewing your account — if it only shows generic "view
  public data" permissions, the scope wasn't requested correctly, don't proceed
- Since we left the redirect URLs blank, you'll land on eBay's own generic
  "Authorization successfully completed" page (a real page on `auth.ebay.com`, not
  a preview/mockup — ignore any "Preview"-watermarked example boxes you see
  elsewhere in eBay's docs, those aren't live pages)
- **Copy the full URL from your browser's address bar** — the authorization code is
  a `code=...` parameter tacked onto it. It expires in 5 minutes, so move quickly
  (regenerating a fresh one only takes a few seconds if it lapses)
- Give me that full URL and I'll run the exchange, which produces a **refresh
  token** valid for ~18 months — saved into `.env` as `EBAY_REFRESH_TOKEN`

## 7. Create a merchant inventory location
eBay requires every listing to be tied to a location (used for shipping calculations,
not shown publicly beyond your general area). Give me your shipping address once and
I'll run this for you — it's a one-time API call, and only the location *key* gets
saved to `.env` afterward (`EBAY_LOCATION_KEY=home`), never your actual address.

## 8. Set up Business Policies (Payment, Return, Fulfillment/Shipping)
eBay requires all three of these to exist on your account before any offer can
publish — there's no per-listing shortcut the way Discogs allows. Create them in
Seller Hub (**https://www.ebay.com/bp/manage**, or My eBay → Account → Business
Policies — opt in first if you don't see the option at all):

**Payment policy**
- Name it anything (e.g. "Standard Payment")
- Leave "Require immediate payment when buyer uses Buy It Now" checked
- Leave all "Allow offline payment" options (Cash/Check/Money Order) unchecked

**Return policy**
- Name it anything (e.g. "30-Day Returns")
- Domestic returns → Accept returns: **On**, 30-day window, buyer pays return
  shipping (eBay flags 30-day returns as helping with Top Rated Seller status)
- International returns: leave off

**Fulfillment (shipping) policy**
- Name it anything (e.g. "Standard Domestic Shipping")
- Shipping method: "Standard shipping: Small to medium items"
- Domestic shipping → Cost type: "Flat: Same cost to all buyers"
- Click **"+ Add primary service"** (easy to miss — the method/cost-type dropdowns
  alone don't set an actual rate) → select **USPS Media Mail** → set $5.00 first
  item / $2.00 each additional
- Local pickup: worth turning on, it's free flexibility with no downside — leave
  the optional "Collection fee" blank, pickup is *less* work for you, not more
- International shipping: leave off
- If you get an error about needing "at least one domestic shipping service" when
  saving, it means the primary service step above wasn't actually completed —
  Local Pickup alone doesn't count as a shipping service

Once all three exist, this app needs an **expanded OAuth scope**
(`sell.account.readonly` in addition to `sell.inventory`) to look up their IDs
automatically — meaning steps 5-6 get repeated once with the wider scope. After
that, hitting `http://localhost:3000/api/ebay/business-policies` returns the three
policy IDs, which get saved to `.env` as `EBAY_FULFILLMENT_POLICY_ID`,
`EBAY_PAYMENT_POLICY_ID`, and `EBAY_RETURN_POLICY_ID`.

## 9. Done
The "Publish to eBay" button on each record will now create a real fixed-price
listing. `EBAY_CATEGORY_ID` in `.env.example` defaults to `176985` — confirmed
correct for Vinyl Records via eBay's own Metadata API.

A couple of underlying gotchas already handled in the code, worth knowing about if
something breaks in the future:
- Category 176985 only accepts two top-level condition values: `NEW` or
  `USED_EXCELLENT` (which maps to eBay's internal conditionId 3000, labeled just
  "Used" in their UI — the enum name and the human-readable label don't match).
  The real grade (NM/VG+/etc.) lives in the listing description instead.
- Several Sell API calls need `Accept-Language: en-US` and
  `X-EBAY-C-MARKETPLACE-ID: EBAY_US` headers or they fail with a misleading
  "Invalid value for header Accept-Language" error that isn't really about that
  header.
- If a publish attempt fails partway through, it can leave an orphaned unpublished
  offer behind that blocks retrying — the code now detects this (errorId 25002) and
  reuses the existing offer automatically rather than erroring out.
- Publishing a record with no asking price used to send eBay `price: 0`, which it
  rejects with a genuinely cryptic 400 (`errorId 25016`, "price is either invalid or
  below the minimum price of FIXED_PRICE"). The app now checks for this upfront and
  shows a plain "Set an asking price before publishing to eBay" message instead —
  if you ever see the raw eBay error text again, that's the field to check first.
- The Sell Inventory API's `product.imageUrls` caps out at 12 images per item —
  the "up to 24 photos" figure quoted around eBay is for the older Trading
  API/listing tool, not this REST endpoint. A well-photographed record (12+
  photos, easy with a full camera-roll zip) used to fail inventory-item creation
  outright (`errorId 25601`, "size for ImageLinks cannot exceed..."). The app now
  only sends the first 12 photos in the record's own photo order (so it's whatever
  you've set as the primary/first photo onward) — reorder photos in the UI if you
  want different ones to make the cut.
- Every Item Specific aspect *value* (Format, Release Title, Record Label,
  etc. — the `aspects` object on an inventory item) has its own 65-character
  cap, separate from the actual listing title/description (which have their
  own much longer limits, built in `listing.js`). Confirmed the hard way on
  both a long compilation-style title and a format string with a lot of
  descriptors ("Vinyl, 7", 33 1/3 RPM, Limited Edition, Numbered,
  Remastered, Stereo") — both failed publishing outright (`errorId 25002`,
  "value is too long"). The app now truncates every aspect value with an
  ellipsis if needed — the real, full text is unaffected everywhere else in
  the listing (title, description).

---

Until all of this is set up, the "Publish to eBay" button just tells you it isn't
connected yet — everything else in the app (inventory tracking, listing text
generation, Discogs listing, FB Marketplace workflow) works with no setup at all.
