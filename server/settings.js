// Small app-wide settings store, separate from data/inventory.json (which
// is a flat array of records with no room for global config). Same
// no-cache, read/write-fresh-every-call pattern as store.js.

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULTS = {
  // Runs a local-Ollama classification pass on newly uploaded photos to
  // flag which one(s) show the dead wax/runout ring, so they're marked in
  // the UI for the owner to read themselves — see photoRoles.js. On by
  // default: unlike actually transcribing the runout text (unreliable,
  // dropped from the auto-upload flow — see deadwax.js), yes/no "is this
  // the runout photo" is a much easier call for the model to get right,
  // and it's silently skipped if Ollama isn't running.
  auto_tag_deadwax_photos: true,

  // Runs a local-Ollama extraction pass on a new arrival's cover/label
  // photos to fill in artist/title/label/format/year/country (Step 2)
  // automatically — see identify.js. Only fills fields that are still
  // blank, and only attempts it while both artist and title are blank
  // (i.e. a genuinely unidentified new arrival). On by default: reading
  // large printed cover/label text is a much easier, more reliable task for
  // the model than the tiny etched dead wax text deadwax.js struggled
  // with. Does not auto-run the Discogs lookup — that's still the owner
  // clicking "Look up Discogs pricing" once they've glanced over the
  // extracted fields.
  auto_identify_from_photos: true,

  // Prepends a short disclosure to every Instagram caption noting that
  // posting is still in a testing phase on the owner's personal account
  // (while making clear the records themselves are genuinely for sale) —
  // see listing.js's generateInstagramCaption(). On by default while
  // posting goes out under the owner's personal account; meant to be
  // turned off once a dedicated storefront account exists and this stops
  // being a testing concern.
  instagram_beta_notice: true
};

function getSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function updateSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { getSettings, updateSettings };
