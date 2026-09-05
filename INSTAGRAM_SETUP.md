# Connecting Instagram (one-time setup)

The app can post a record's photos (a carousel if there's more than one, up to
Instagram's 10-photo limit) with a caption built from the listing, directly to
Instagram via Meta's Graph API — a plain image/carousel post, not a Reel or Story.
Budget 30-45 minutes the first time — Meta's dashboard for this has several
non-obvious steps and changes fairly often.

This app never touches Instagram audio in any way. If you find a matching song for
a record, adding it is entirely up to you, done however you'd normally do it — not
something this feature attempts.

**Heads up:** Meta deprecated the older "Instagram Graph API with Facebook Login"
permissions (`instagram_basic`, `instagram_content_publish`, `pages_show_list`) on
2025-01-27. This app uses the current replacement, **Instagram API with Instagram
Login** — no Facebook Page involved at all; you authenticate directly against the
Instagram account. The steps below are what actually worked as of this writing —
Meta reorganizes this dashboard often enough that some labels may have moved by
the time you do this.

## 1. Convert your Instagram to a Business or Creator account
In the Instagram app: **Settings → Account type and tools → Switch to professional
account**, pick **Business** or **Creator**. You'll be walked through a short
onboarding wizard (bio, goals, how you want to connect with people) — none of it
affects this integration; answer honestly or take the defaults.

## 2. Create a Meta developer app and add the Instagram API use case
Go to https://developers.facebook.com/apps → **Create App** → type **Business**.
Once created, go to **Use cases** in the left sidebar and add
**"Manage messaging & content on Instagram"** (or whichever current use case
covers Instagram content publishing).

## 3. Add the required permissions
Inside **Use cases → Customize → Instagram API → Permissions and features**, add:
- `instagram_business_basic`
- `instagram_business_content_publish`

Click **Add** on each until both show **"Ready for testing"**. (The use case may
prompt you to add messaging/comments permissions too, like
`instagram_business_manage_comments` — harmless to include, but not required for
publishing.)

## 4. Get your Instagram App ID/Secret
Still under **Use cases → Customize**, switch the dropdown to **"API setup with
Instagram login"**. This page shows an **Instagram app ID** and **Instagram app
secret** — distinct from the top-level Facebook App ID/Secret in App Settings →
Basic. Add these to `.env`:
```
IG_APP_ID=your-instagram-app-id
IG_APP_SECRET=your-instagram-app-secret
```

## 5. Add yourself as an Instagram Tester
Since this app stays in Development mode (no App Review needed for a single-user
tool), your own account needs to be explicitly added as a tester:
1. Go to **App roles** → click the **"Roles"** link (or the Instagram Testers tab)
   → **Add People**
2. Select the **Instagram Tester** role (not Administrator/Developer/Tester —
   those are Facebook-account roles) and enter your Instagram username
3. On your phone: Instagram app → **Settings → Apps and websites** → find the
   pending tester invite from your app and accept it
4. Back in the dashboard, the role should flip from "Pending" to accepted

## 6. Generate an access token
Back on **"API setup with Instagram login"**, under **"2. Generate access
tokens"**, your tester account should now be listed (click **Add account** first
if it isn't). Click **Generate token** next to it — this hands you an access
token directly in the dashboard, and your numeric Instagram user ID is shown
right under your username on that same row. Add both to `.env`:
```
IG_ACCESS_TOKEN=the-generated-token
IG_USER_ID=the-numeric-id-shown-under-your-username
```
Restart the app (`npm start`). No separate image-hosting setup needed — this
reuses the same `IMGBB_API_KEY` already configured for eBay.

## 7. Done
The "Publish to Instagram" button on each record will now post all of its photos
(as a carousel, or a single image if there's only one) with a caption.

## Gotchas
- This token's exact expiry is unknown — it declined the normal 60-day
  long-lived-token exchange (Meta rejected it as an invalid grant for a
  dashboard-generated token), so treat it as good until proven otherwise. If
  publishing ever starts failing with an auth error, just repeat step 6 — the
  "Generate token" button regenerates one in seconds.
- The classic OAuth redirect flow (an `authorize` URL + a callback endpoint,
  like eBay uses) does **not** work for this setup as of this writing — Meta's
  "Instagram business login" (config-based) OAuth kept rejecting the redirect
  URI, and the dashboard's direct tester/token-generator route above turned out
  to be the one that actually works. Worth revisiting if Meta's flow changes.
- Instagram caps carousels at 10 photos — a record with more than that only
  posts the first 10; the rest are silently left out.
- A multi-photo carousel takes noticeably longer to publish than a single
  image, since each photo gets its own upload + processing step before the
  carousel itself can be created.
- If a publish attempt hangs, it's most likely Instagram still processing an
  uploaded photo — the app polls for up to a minute per photo before giving up
  and showing an error; it's safe to just try again.
