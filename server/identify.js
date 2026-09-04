// Extracts artist/title/label/format/year/country from a record's
// front-cover, back-cover, and label photos (already role-classified by
// photoRoles.js) via the local vision LLM — fills Step 2 of the cataloging
// workflow so it isn't fully manual for a brand-new arrival. See
// OLLAMA_SETUP.md.
//
// Unlike deadwax.js's abandoned runout-transcription attempt, this reads
// printed cover/label text — large, clear, high-contrast — which the model
// handles far more reliably than tiny etched dead wax. Still told
// explicitly not to guess, and every field is left blank rather than
// invented if it isn't legible.

const ollama = require('./ollama');

const FIELDS = ['artist', 'title', 'label', 'format', 'year', 'country'];

const EXTRACT_PROMPT = `You are looking at photos of a vinyl record — its front cover, back cover, and/or the printed label glued to the vinyl. Extract these fields as a JSON object:

{"artist": "", "title": "", "label": "", "format": "", "year": "", "country": ""}

- artist: the performing artist/band name as printed.
- title: the release/album title as printed.
- label: the record label name and catalog number together, e.g. "Deranged Records - DR-15" (omit the catalog number if none is printed/visible).
- format: what's visibly indicated about the physical format (e.g. "Vinyl, 7\\", 45 RPM" or "Vinyl, LP") — only from what's printed or visible (size, speed), never inferred from genre or guesswork.
- year: the release year, only if it's actually printed somewhere in the photos, else empty.
- country: the country of pressing/manufacture, only if it's actually printed somewhere in the photos, else empty.

Only fill a field if you can read it directly and are confident. Leave it as an empty string "" if it isn't visible or you're not sure — do not guess or infer. Respond with ONLY the JSON object, no other text.`;

// byRole: { front: [...], back: [...], label: [...] } absolute local file
// paths for photos already classified by photoRoles.js. Picks at most one
// front, one back, and two label photos to keep the request small (each
// full-res image costs ~4100 vision tokens regardless of size — see
// ollama.js). Returns an object with only the fields it's confident about
// (never empty-string placeholders), or null if nothing usable came back.
async function identifyFromPhotos({ front = [], back = [], label = [] } = {}) {
  const chosen = [...front.slice(0, 1), ...back.slice(0, 1), ...label.slice(0, 2)];
  if (!chosen.length) return null;
  if (!(await ollama.isReachable())) return null;

  let text;
  try {
    text = await ollama.generate(chosen, EXTRACT_PROMPT, { numCtx: 20480, json: true });
  } catch (err) {
    console.error('Photo identification failed:', err.message);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('Photo identification returned non-JSON response:', text);
    return null;
  }

  const fields = {};
  for (const key of FIELDS) {
    const v = typeof parsed[key] === 'string' ? parsed[key].trim() : '';
    if (v) fields[key] = v;
  }
  return Object.keys(fields).length ? fields : null;
}

module.exports = { identifyFromPhotos, FIELDS };
