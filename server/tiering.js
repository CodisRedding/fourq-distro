// Same tiering rule used for the original 414-record batch sort, factored out
// so newly-added records (via the photo-ID workflow) get sorted consistently.
const NEW_ARRIVAL_TIER = 'Unsorted - new arrival';

function normArtist(a) {
  return String(a || '')
    .replace(/\*/g, '')
    .replace(/\s*\(\d+\)/g, '')
    .replace(/^The\s+/i, '')
    .trim()
    .toLowerCase();
}

// referencePrice should be the best price info available — prefer a real
// grade-based Discogs suggestion over the flawed "current lowest listing" comp.
function assignTier(referencePrice, artistName, allRecords) {
  if (referencePrice == null) return 'Tier 1 - Individual (no comp, needs research)';
  if (referencePrice >= 25) return 'Tier 1 - Individual (high value)';

  const na = normArtist(artistName);
  if (na && na !== 'various') {
    const count = allRecords.filter(r => normArtist(r.artist) === na).length;
    if (count >= 3) return `Tier 2 - Lot (${na})`;
  }
  return 'Tier 3 - Bulk grab bag';
}

module.exports = { assignTier, normArtist, NEW_ARRIVAL_TIER };
