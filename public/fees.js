// Fee rates as of Aug 2026, cross-checked against multiple sources (see DISCOGS_SETUP.md
// discussion / chat history for citations). These change over time — worth spot-checking
// against the platform's own fee page before relying on this for a high-value sale.
//
//   Discogs:  9% of (item + shipping), min $0.10 / max $150. Uses direct PayPal in this
//             account's setup, so PayPal's own fee applies ON TOP of the 9% (not bundled).
//   eBay:     13.25% of (item + shipping) for the Vinyl Records category, non-Store
//             seller, orders under $7,500. Payment processing is bundled into this fee.
//   Facebook: 10% (min $0.80) of the total if using FB's shipping/checkout, $0 for local
//             pickup (cash/Venmo/etc. handled outside the platform).
//   PayPal G&S: ~2.99% + $0.49 standard rate (Checkout/invoicing runs ~3.49% + $0.49
//             instead — using the lower standard figure as a default estimate).

const FEES = {
  discogs: { rate: 0.09, min: 0.10, max: 150 },
  ebay: { rate: 0.1325, min: 0, max: Infinity },
  fbShipped: { rate: 0.10, min: 0.80, max: Infinity },
  fbLocal: { rate: 0, min: 0, max: Infinity },
  paypal: { rate: 0.0299, fixed: 0.49 }
};

function mediaMailEstimate(format) {
  const f = (format || '').toLowerCase();
  if (f.includes('lp') || f.includes('12"') || f.includes('2 x vinyl')) return 6.00;
  if (f.includes('10"')) return 5.25;
  if (f.includes('7"') || f.includes('cassette')) return 5.00;
  return 5.50;
}

function platformFee(platformKey, grossAmount) {
  const cfg = FEES[platformKey];
  if (!cfg) return 0;
  const raw = grossAmount * cfg.rate;
  return Math.min(Math.max(raw, cfg.min), cfg.max);
}

function paypalFee(amount) {
  return amount * FEES.paypal.rate + FEES.paypal.fixed;
}

function computeNet({ platform, salePrice, shippingCharged, sellerShippingCost }) {
  const gross = salePrice + shippingCharged;
  const pFee = platformFee(platform, gross);
  const needsPaypal = platform === 'discogs';
  const payFee = needsPaypal ? paypalFee(gross) : 0;
  const net = gross - pFee - payFee - sellerShippingCost;
  return { gross, platformFee: pFee, paymentFee: payFee, net };
}

window.RecordFees = { FEES, mediaMailEstimate, computeNet };
