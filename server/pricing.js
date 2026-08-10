const discogs = require('./discogs');

// Deliberately NOT a generic "% of near-mint" table applied to the current
// lowest listing price — that number's condition is unknown and often skews
// toward rougher copies, so discounting further from it is unfounded.
// Real suggestions come from Discogs' price_suggestions API, cached per record
// once you look it up (see /api/inventory/:id/discogs-lookup).

function suggestPrice(record) {
  const grade = record.condition_media || record.condition_sleeve;

  if (!record.discogs_price_by_grade) {
    return {
      suggested: null,
      reason: discogs.isConfigured()
        ? 'No grade-specific pricing yet — click "Look up Discogs pricing" below.'
        : 'No grade-specific pricing available yet. The $' +
          (record.discogs_low_price || '?') +
          ' figure is just the current cheapest active listing, in unknown condition — ' +
          'not a reliable reference point. Add a Discogs API token (see DISCOGS_SETUP.md) ' +
          'to get real per-grade suggested prices.'
    };
  }

  if (!grade) {
    return { suggested: null, reason: 'Add a media (or sleeve) grade to match it against the looked-up Discogs prices.' };
  }

  const value = discogs.lookupSuggestedPrice(record.discogs_price_by_grade, grade);
  if (value == null) {
    return { suggested: null, reason: `Discogs has no suggestion for grade "${grade}" on this release.` };
  }

  let demand = null;
  const c = record.discogs_community;
  if (c && c.have != null && c.want != null) {
    const ratio = c.have > 0 ? Math.round((c.want / c.have) * 100) / 100 : null;
    demand = `Have ${c.have} / Want ${c.want}` +
      (ratio != null ? ` (want:have ratio ${ratio})` : '') +
      (c.ratingCount ? `, rated ${c.ratingAverage} from ${c.ratingCount} rating${c.ratingCount === 1 ? '' : 's'}` : ', no ratings yet') +
      '. Higher want-than-have suggests real demand — worth pricing with more confidence rather than a fire-sale price; the reverse suggests common/low-interest, better suited to a bulk lot.';
  }

  return {
    suggested: Math.round(value * 4) / 4,
    reason: `Discogs' own price suggestion for a ${grade} copy of this specific release.`,
    demand
  };
}

module.exports = { suggestPrice };
