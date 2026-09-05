// eBay Sell API integration — scaffolded but INACTIVE until you provide your own
// eBay Developer credentials. See EBAY_SETUP.md for the one-time setup steps.
//
// This talks to eBay's *production* Sell APIs (Inventory + Offer) once configured:
//   https://developer.ebay.com/api-docs/sell/inventory/overview.html

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const API_BASE = 'https://api.ebay.com';
// sell.account (readonly) added so we can look up your Business Policy IDs
// (Fulfillment/Payment/Return) after you create them in Seller Hub — required
// for publishOffer to succeed, confirmed via eBay's own Developer AI Assistant.
const SCOPES = 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly';

// eBay Item Specific aspect values (Format, Release Title, etc. — the
// `aspects` object on an inventory item) each have their own 65-character
// cap, separate from the actual listing title/description which have their
// own much longer limits (built in listing.js). Confirmed via real publish
// failures (errorId 25002) on both Release Title and Format. Truncates
// rather than fails outright — these are secondary listing metadata, not
// the actual title/description buyers read.
function truncateAspect(value, max = 65) {
  if (!value || value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}

function truncateAspects(aspects) {
  return Object.fromEntries(
    Object.entries(aspects).map(([key, values]) => [key, values.map(v => truncateAspect(v))])
  );
}

function recordSize(format) {
  if (!format) return null;
  if (/12"/.test(format)) return '12"';
  if (/10"/.test(format)) return '10"';
  if (/7"/.test(format)) return '7"';
  return null;
}

function labelName(label) {
  // label field looks like "Some Label – CAT-001, Other Label – CAT-002"
  if (!label) return null;
  const first = label.split(',')[0];
  const name = first.split('–')[0].trim();
  return name || null;
}

function catalogNumber(label) {
  if (!label) return null;
  const first = label.split(',')[0];
  const parts = first.split('–');
  return parts.length > 1 ? parts[1].trim() || null : null;
}

function isConfigured() {
  return Boolean(
    process.env.EBAY_CLIENT_ID &&
    process.env.EBAY_CLIENT_SECRET &&
    process.env.EBAY_REFRESH_TOKEN
  );
}

function getAuthorizeUrl() {
  const clientId = process.env.EBAY_CLIENT_ID || '<your-client-id>';
  const ruName = process.env.EBAY_RUNAME || '<your-runame>';
  const scope = encodeURIComponent(SCOPES);
  return `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${ruName}&response_type=code&scope=${scope}`;
}

async function exchangeCodeForTokens(code) {
  const basicAuth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.EBAY_RUNAME
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay code exchange failed (${res.status}): ${text}`);
  }
  return res.json(); // { access_token, refresh_token, expires_in, refresh_token_expires_in, ... }
}

async function createInventoryLocation(locationKey, address) {
  const token = await getUserAccessToken();
  const res = await fetch(`${API_BASE}/sell/inventory/v1/location/${locationKey}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      location: {
        address: {
          addressLine1: address.addressLine1,
          city: address.city,
          stateOrProvince: address.stateOrProvince,
          postalCode: address.postalCode,
          country: address.country || 'US'
        }
      },
      locationTypes: ['WAREHOUSE'],
      name: address.name || 'Home',
      merchantLocationStatus: 'ENABLED'
    })
  });
  if (!res.ok) {
    throw new Error(`Failed to create inventory location (${res.status}): ${await res.text()}`);
  }
  return true;
}

async function getUserAccessToken() {
  if (!isConfigured()) {
    throw new Error('eBay is not configured yet. See EBAY_SETUP.md for the one-time setup.');
  }
  const basicAuth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.EBAY_REFRESH_TOKEN,
      scope: SCOPES
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

// Looks up your Business Policy IDs from Seller Hub (Fulfillment/Payment/Return) —
// these must exist already (created via Seller Hub UI, see EBAY_SETUP.md) and
// requires the sell.account.readonly scope on the refresh token.
async function getBusinessPolicies() {
  const token = await getUserAccessToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };

  const [fulfillmentRes, paymentRes, returnRes] = await Promise.all([
    fetch(`${API_BASE}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, { headers }),
    fetch(`${API_BASE}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, { headers }),
    fetch(`${API_BASE}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, { headers })
  ]);
  if (!fulfillmentRes.ok) throw new Error(`Failed to fetch fulfillment policies (${fulfillmentRes.status}): ${await fulfillmentRes.text()}`);
  if (!paymentRes.ok) throw new Error(`Failed to fetch payment policies (${paymentRes.status}): ${await paymentRes.text()}`);
  if (!returnRes.ok) throw new Error(`Failed to fetch return policies (${returnRes.status}): ${await returnRes.text()}`);

  const [fulfillmentJson, paymentJson, returnJson] = await Promise.all([
    fulfillmentRes.json(), paymentRes.json(), returnRes.json()
  ]);

  const fulfillment = fulfillmentJson.fulfillmentPolicies && fulfillmentJson.fulfillmentPolicies[0];
  const payment = paymentJson.paymentPolicies && paymentJson.paymentPolicies[0];
  const ret = returnJson.returnPolicies && returnJson.returnPolicies[0];

  if (!fulfillment || !payment || !ret) {
    throw new Error(
      'Could not find one or more Business Policies on your account. ' +
      'Make sure you created a Fulfillment, Payment, and Return policy in Seller Hub first.'
    );
  }

  return {
    fulfillmentPolicyId: fulfillment.fulfillmentPolicyId,
    fulfillmentPolicyName: fulfillment.name,
    paymentPolicyId: payment.paymentPolicyId,
    paymentPolicyName: payment.name,
    returnPolicyId: ret.returnPolicyId,
    returnPolicyName: ret.name
  };
}

async function publishListing(record, listingText, imageUrls) {
  if (!isConfigured()) {
    const err = new Error(
      'eBay is not connected yet. Follow EBAY_SETUP.md to register a developer app ' +
      'and authorize this tool, then add the credentials to your .env file.'
    );
    err.code = 'EBAY_NOT_CONFIGURED';
    throw err;
  }
  if (!imageUrls || !imageUrls.length) {
    const err = new Error('No photo URLs available — a listing needs at least one hosted image.');
    err.code = 'NO_PHOTOS';
    throw err;
  }
  // eBay's Sell Inventory API caps product.imageUrls at 12 — the "up to 24
  // photos" figure quoted around eBay is for the older Trading API/listing
  // tool, not this REST endpoint. Sending more fails inventory-item creation
  // outright (errorId 25601, "size for ImageLinks cannot exceed..."), so cap
  // here rather than let a well-photographed record fail to publish at all.
  // Keep the first 12 in the app's own photo order (the first photo is
  // already the primary/thumbnail image by convention).
  const ebayImageUrls = imageUrls.slice(0, 12);
  if (!record.asking_price || Number(record.asking_price) <= 0) {
    // Without this check, a blank/zero price silently became the string '0'
    // below and eBay rejected the offer with a cryptic "price is either
    // invalid or below the minimum price of FIXED_PRICE" 400 — same failure
    // mode Discogs' publish path already guards against explicitly.
    const err = new Error('Set an asking price before publishing to eBay.');
    err.code = 'MISSING_PRICE';
    throw err;
  }

  const token = await getUserAccessToken();
  // Reuse the SKU from a prior publish if one exists — SKU is the identity
  // eBay uses to match this to an existing inventory item/offer, so once a
  // record has been published, its SKU must never change (recomputing it
  // from record.id here, even with unchanged logic, is what caused Disturbia
  // to fork into a duplicate live listing instead of updating in place).
  const sku = record.ebay_sku || record.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 50);

  // 1. Create/replace the inventory item
  const invRes = await fetch(`${API_BASE}/sell/inventory/v1/inventory_item/${sku}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    },
    body: JSON.stringify({
      availability: { shipToLocationAvailability: { quantity: 1 } },
      // Category 176985 (Vinyl Records) only accepts conditionId 1000 (NEW)
      // or 3000, confirmed via eBay's own Metadata API getItemConditionPolicies.
      // 3000's ConditionEnum name is USED_EXCELLENT (not plain "USED" — the
      // enum name and the human-readable label don't match 1:1). Real grade
      // (NM/VG+/etc.) lives in the listing description instead of this field.
      condition: 'USED_EXCELLENT',
      // eBay's dedicated "Condition description" field — separate from the
      // general listing description, this is specifically where buyers look
      // for grade detail, and it was sitting blank before this fix.
      conditionDescription: [
        record.condition_media ? `Media: ${record.condition_media}` : '',
        record.condition_sleeve ? `Sleeve: ${record.condition_sleeve}` : ''
      ].filter(Boolean).join(', ') || undefined,
      product: {
        title: listingText.ebayTitle,
        description: listingText.ebayDescription,
        imageUrls: ebayImageUrls,
        // UPC is a required-looking field in eBay's UI, but these are obscure
        // punk/indie pressings that never had barcodes — "Does not apply" is
        // the standard way to satisfy it honestly instead of leaving it blank.
        upc: ['Does not apply'],
        // eBay Item Specific aspect *values* have their own 65-character cap
        // — confirmed the hard way on both Release Title and Format (a
        // record with a lot of format descriptors, e.g. "Vinyl, 7", 33 1/3
        // RPM, Limited Edition, Numbered, Remastered, Stereo", blew past it
        // too). Rather than truncate field-by-field as each one turns up in
        // a real failure, truncate every aspect value here — separate from
        // the actual listing title/description, which have their own much
        // longer limits and are unaffected.
        aspects: truncateAspects({
          Artist: [record.artist],
          Format: [record.format],
          Genre: ['Punk'],
          Style: ['Punk'],
          Material: ['Vinyl'],
          ...(labelName(record.label) ? { 'Record Label': [labelName(record.label)] } : {}),
          ...(record.title ? { 'Release Title': [record.title] } : {}),
          ...(recordSize(record.format) ? { 'Record Size': [recordSize(record.format)] } : {}),
          ...(record.year ? { 'Release Year': [String(record.year)] } : {}),
          ...(record.country ? { 'Country of Origin': [record.country] } : {}),
          ...(record.condition_media ? { 'Record Grading': [record.condition_media] } : {}),
          ...(record.condition_sleeve ? { 'Sleeve Grading': [record.condition_sleeve] } : {}),
          ...(catalogNumber(record.label) ? { 'Catalog Number': [catalogNumber(record.label)] } : {}),
          ...(record.matrix_number ? { 'Vinyl Matrix Number': [record.matrix_number] } : {})
        })
      }
    })
  });
  if (!invRes.ok) {
    throw new Error(`Failed to create inventory item (${invRes.status}): ${await invRes.text()}`);
  }

  // 2. Create an offer for that inventory item
  const offerHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Language': 'en-US',
    'Accept-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };
  const offerBody = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: process.env.EBAY_CATEGORY_ID || '176985', // Vinyl Records category
    listingDescription: listingText.ebayDescription,
    pricingSummary: {
      price: { value: record.asking_price, currency: 'USD' }
    },
    merchantLocationKey: process.env.EBAY_LOCATION_KEY,
    listingPolicies: {
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: process.env.EBAY_RETURN_POLICY_ID
    }
  };

  const offerRes = await fetch(`${API_BASE}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: offerHeaders,
    body: JSON.stringify(offerBody)
  });
  let offerId;
  if (!offerRes.ok) {
    const errText = await offerRes.text();
    // A prior failed attempt can leave an orphaned unpublished offer behind —
    // eBay's error includes its ID. Reuse it, but first PUT fresh data onto it
    // (price/policies/etc. may have changed, or not been set at all, since
    // that offer was originally created).
    let existingOfferId = null;
    try {
      const errJson = JSON.parse(errText);
      const dupError = errJson.errors && errJson.errors.find(e => e.errorId === 25002);
      const idParam = dupError && dupError.parameters && dupError.parameters.find(p => p.name === 'offerId');
      existingOfferId = idParam ? idParam.value : null;
    } catch { /* not JSON, fall through to throw below */ }

    if (!existingOfferId) {
      throw new Error(`Failed to create offer (${offerRes.status}): ${errText}`);
    }

    const updateRes = await fetch(`${API_BASE}/sell/inventory/v1/offer/${existingOfferId}`, {
      method: 'PUT',
      headers: offerHeaders,
      body: JSON.stringify(offerBody)
    });
    if (!updateRes.ok) {
      throw new Error(`Failed to update existing offer (${updateRes.status}): ${await updateRes.text()}`);
    }
    offerId = existingOfferId;
  } else {
    offerId = (await offerRes.json()).offerId;
  }

  // 3. Publish the offer to go live
  const pubRes = await fetch(`${API_BASE}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Language': 'en-US',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    }
  });
  if (!pubRes.ok) {
    throw new Error(`Failed to publish offer (${pubRes.status}): ${await pubRes.text()}`);
  }
  const published = await pubRes.json();
  return { listingId: published.listingId, sku };
}

// Checks whether a published offer's unit has sold. The Inventory API's
// `listing` container (only present on PUBLISHED offers — omitted entirely
// for UNPUBLISHED ones) carries `soldQuantity`, which eBay increments the
// moment it finishes processing a completed order. Since every offer here
// is always created with availableQuantity: 1 (see publishListing), any
// soldQuantity > 0 unambiguously means this one-of-a-kind record sold —
// no separate Fulfillment API call/scope (getOrders) needed just to answer
// that question.
async function getSoldStatus(sku) {
  const token = await getUserAccessToken();
  const res = await fetch(`${API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Language': 'en-US',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch offer status (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const offer = json.offers && json.offers[0];
  const listing = offer && offer.listing;
  return {
    sold: Boolean(listing && listing.soldQuantity > 0),
    listingStatus: (listing && listing.listingStatus) || null
  };
}

module.exports = {
  isConfigured,
  getAuthorizeUrl,
  publishListing,
  exchangeCodeForTokens,
  createInventoryLocation,
  getBusinessPolicies,
  getSoldStatus
};
