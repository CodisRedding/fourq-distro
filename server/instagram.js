// Instagram API with Instagram Login ("Business Login for Instagram") —
// publishes an image post (a carousel of up to Instagram's 10-photo limit,
// or a single-image post when there's only one) with a caption built from
// the listing. Scaffolded but INACTIVE until you provide your own Meta app
// credentials + tokens. See INSTAGRAM_SETUP.md for the one-time setup.
//
// This is a different, newer flow than the classic "Instagram Graph API
// with Facebook Login" — no Facebook Page involved at all; auth is directly
// against the Instagram professional account. Meta deprecated the old
// Facebook-Login-based scopes (instagram_basic, instagram_content_publish,
// pages_show_list) on 2025-01-27, which is why this app targets
// graph.instagram.com instead of graph.facebook.com.
//
// IG_ACCESS_TOKEN/IG_USER_ID are obtained by hand from the App Dashboard's
// own tester/token-generator UI, not through an OAuth redirect this app
// drives — Meta's "Instagram business login" (config_id-based) setup never
// got far enough to accept a plain redirect_uri, and the dashboard's direct
// token generator turned out to be the actually-working path. See
// INSTAGRAM_SETUP.md for the exact steps. Worth revisiting if that changes
// and a real OAuth flow becomes worth building here again.
//
// Deliberately just a static photo/carousel post, not a Reel/Story — this
// app never touches Instagram audio at all. If a record's song turns out to
// be findable, attaching it is on the owner, done by hand in whatever way
// they choose outside this app.

const GRAPH_BASE = 'https://graph.instagram.com';

// Without this, a stalled Graph API call (or a stalled fetch of the hosted
// image on Meta's end that never resolves back to us) would hang the whole
// publish flow indefinitely instead of failing fast.
const REQUEST_TIMEOUT_MS = 20000;

// How long to keep polling a media container for processing to finish
// before giving up. Image containers usually finish almost immediately,
// but Instagram's own docs still recommend checking status before publish.
const POLL_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 2000;

// Instagram carousels top out at 10 items — extra photos are silently
// dropped rather than erroring, same spirit as eBay's 12-photo cap.
const CAROUSEL_LIMIT = 10;

function isConfigured() {
  return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const json = await res.json();
  if (!res.ok) throw new Error(`Instagram Graph API error (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Instagram Graph API error (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForContainer(containerId) {
  const token = process.env.IG_ACCESS_TOKEN;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await get(`${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${token}`);
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram media processing failed (${status.status_code})`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for Instagram to finish processing the photo.');
}

// imageUrls: hosted photo URLs, in the order they should appear. A single
// URL publishes as a plain image post; 2+ publishes as a carousel (capped at
// CAROUSEL_LIMIT). Returns { postId, permalink }.
async function publishPost(imageUrls, caption) {
  if (!isConfigured()) {
    const err = new Error('Instagram is not connected yet. See INSTAGRAM_SETUP.md.');
    err.code = 'INSTAGRAM_NOT_CONFIGURED';
    throw err;
  }
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  const urls = imageUrls.slice(0, CAROUSEL_LIMIT);

  let creationId;
  if (urls.length === 1) {
    const container = await post(`${GRAPH_BASE}/${igUserId}/media`, {
      image_url: urls[0],
      caption,
      access_token: token
    });
    await waitForContainer(container.id);
    creationId = container.id;
  } else {
    const children = [];
    for (const url of urls) {
      const child = await post(`${GRAPH_BASE}/${igUserId}/media`, {
        image_url: url,
        is_carousel_item: true,
        access_token: token
      });
      await waitForContainer(child.id);
      children.push(child.id);
    }
    const carousel = await post(`${GRAPH_BASE}/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children,
      caption,
      access_token: token
    });
    await waitForContainer(carousel.id);
    creationId = carousel.id;
  }

  const published = await post(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token
  });

  const details = await get(`${GRAPH_BASE}/${published.id}?fields=permalink&access_token=${token}`);
  return { postId: published.id, permalink: details.permalink };
}

// Read-only engagement numbers for an already-published post. like_count and
// comments_count come straight off the media node; comment text is a
// separate edge call since Graph API doesn't reliably nest it in one request.
// Never attempts to surface DMs here — Instagram's API has no general way to
// tie a direct message back to a specific post (only when someone explicitly
// shares/replies to that post, which most "DM to buy" buyers won't do), so
// there's nothing trustworthy to show; checking the Instagram inbox directly
// stays a manual step.
async function getPostStats(mediaId) {
  const token = process.env.IG_ACCESS_TOKEN;
  const media = await get(`${GRAPH_BASE}/${mediaId}?fields=like_count,comments_count&access_token=${token}`);
  const commentsRes = await get(`${GRAPH_BASE}/${mediaId}/comments?fields=text,username,timestamp&limit=50&access_token=${token}`);

  return {
    like_count: media.like_count ?? null,
    comments_count: media.comments_count ?? null,
    comments: (commentsRes.data || []).map(c => ({
      id: c.id,
      text: c.text,
      username: c.username,
      timestamp: c.timestamp
    }))
  };
}

module.exports = { isConfigured, publishPost, getPostStats };
