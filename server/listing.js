function shortFormat(format) {
  if (!format) return '';
  if (/12"/.test(format)) return '12"';
  if (/10"/.test(format)) return '10"';
  if (/7"/.test(format)) return '7"';
  if (/\bLP\b/.test(format)) return 'LP';
  if (/Cassette/i.test(format)) return 'Cassette';
  if (/\bCD\b/.test(format)) return 'CD';
  return 'Vinyl';
}

function conditionLine(r) {
  const media = r.condition_media && r.condition_media.trim();
  const sleeve = r.condition_sleeve && r.condition_sleeve.trim();
  if (!media && !sleeve) {
    return 'Condition: please see photos and ask any questions before buying.';
  }
  const parts = [];
  if (media) parts.push('Media: ' + media);
  if (sleeve) parts.push('Sleeve: ' + sleeve);
  return 'Condition — ' + parts.join(', ') + '.';
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

const TRUST_LINE = 'Message me with any questions — happy to send additional photos or answer anything about condition before you buy.';

// Facts that are true no matter where this gets posted — computed once so
// eBay/FB/Discogs descriptions aren't independently re-stating the same thing.
function generateCoreFacts(r) {
  const fmt = shortFormat(r.format);
  const yearCountry = [r.year, r.country].filter(Boolean).join(' ');
  const lines = [
    `${r.artist} — "${r.title}"`,
    `${r.format}${yearCountry ? ' | ' + yearCountry : ''}`,
    r.label ? `Label/Cat#: ${r.label}` : '',
    conditionLine(r),
    r.matrix_number ? `Matrix/runout: ${r.matrix_number}` : '',
    r.listing_extras ? r.listing_extras.trim() : ''
  ].filter(Boolean);
  return { fmt, yearCountry, text: lines.join('\n') };
}

function generateListing(r) {
  const core = generateCoreFacts(r);
  const price = r.asking_price ? `$${r.asking_price}` : '(price TBD)';

  const ebayTitleRaw = `${r.artist} - ${r.title} ${core.fmt} ${r.year || ''} Vinyl Record Punk`.replace(/\s+/g, ' ').trim();
  const ebayTitle = truncate(ebayTitleRaw, 80);
  const ebayWrapper = [
    'From a private punk/oi/garage collection being sold off piece by piece.',
    '',
    'Shipping: carefully packed in a rigid record mailer, shipped via USPS (Media Mail eligible). Combined shipping available for multiple purchases — message before paying if buying more than one.',
    '',
    TRUST_LINE
  ].join('\n');
  const ebayDescription = [core.text, '', ebayWrapper].join('\n');

  const fbTitle = truncate(`${r.artist} - ${r.title} (${core.fmt}) - ${price}`, 100);
  const fbWrapper = [
    `Asking ${price}. Local pickup welcome, can also ship (buyer covers shipping, packed safely in a rigid mailer).`,
    '',
    TRUST_LINE
  ].join('\n');
  const fbDescription = [core.text, '', fbWrapper].join('\n');

  return {
    coreFacts: core.text,
    ebayTitle,
    ebayWrapper,
    ebayDescription,
    fbTitle,
    fbWrapper,
    fbDescription
  };
}

const IG_HASHTAGS = '#vinylrecords #vinylcollection #forsale #punkrock #recordcollector #fourqdistro';

// Real, direct URLs to wherever this record is actually live for sale —
// built from IDs the app already stores after a successful publish, not
// looked up fresh. Only includes a platform once it's both published *and*
// capable of producing a real URL, so this quietly does nothing for FB until
// that integration stores a listing ID/URL of its own — no caption code will
// need to change when it does.
function buildListingLinks(r) {
  const links = [];
  if (r.status.ebay === 'listed' && r.ebay_listing_id) {
    links.push({ platform: 'eBay', url: `https://www.ebay.com/itm/${r.ebay_listing_id}` });
  }
  if (r.status.discogs === 'listed' && r.discogs_listing_id) {
    links.push({ platform: 'Discogs', url: `https://www.discogs.com/sell/item/${r.discogs_listing_id}` });
  }
  return links;
}

// Instagram never makes a caption URL tappable (no API changes that — see
// instagram.js) so a link here is plain copyable text, not a real link. Still
// worth including: it's the actual place to buy, not just "DM me".
function generateInstagramCaption(r) {
  const core = generateCoreFacts(r);
  const price = r.asking_price ? `$${r.asking_price} + shipping` : 'DM for price';
  const links = buildListingLinks(r);

  const cta = [`Asking ${price}.`];
  if (links.length) {
    cta.push('Buy here:', ...links.map(l => `${l.platform}: ${l.url}`));
    cta.push("(Instagram doesn't make links tappable — comment or DM if you'd like it sent directly.)");
  } else {
    cta.push('Comment or DM to buy — first message gets it.');
  }

  return [core.text, cta.join('\n'), IG_HASHTAGS].join('\n\n');
}

module.exports = { generateListing, generateCoreFacts, generateInstagramCaption };
