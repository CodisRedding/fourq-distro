// Classifies what each newly-uploaded photo of a record actually shows —
// one closed-set question per photo, which the local vision model is
// reliably good at (unlike freeform transcription — see deadwax.js). Shared
// by two features so a single classification pass covers both:
//   - server/server.js's dead-wax auto-tagging (role === RUNOUT)
//   - server/identify.js's artist/title/label extraction (FRONT_COVER /
//     BACK_COVER / LABEL feed the extraction prompt)

const ollama = require('./ollama');

const ROLES = ['FRONT_COVER', 'BACK_COVER', 'LABEL', 'RUNOUT', 'SPINE', 'OTHER'];
const ROLE_PATTERN = new RegExp(ROLES.join('|'), 'i');

const ROLE_PROMPT = `You are looking at one photo related to a vinyl record listing. Classify what it primarily shows. Respond with exactly one of these words, nothing else:

FRONT_COVER — the front of the sleeve/cover art
BACK_COVER — the back of the sleeve (tracklist, credits, back art)
LABEL — the printed paper label glued to the middle of the vinyl (not the blank vinyl ring around it)
RUNOUT — the "dead wax" — the blank, unprinted ring of bare vinyl between the label and the outer groove, possibly with etched/stamped/handwritten text on it
SPINE — the spine edge of the sleeve
OTHER — anything else (barcode close-up, price sticker, random detail shot, etc.)`;

async function classifyRole(photoPath) {
  const answer = await ollama.generate([photoPath], ROLE_PROMPT, { numCtx: 8192 });
  const match = answer.match(ROLE_PATTERN);
  return match ? match[0].toUpperCase() : 'OTHER';
}

// photoPaths: absolute local file paths. Classifies each individually (see
// ollama.js for why full-res photos aren't batched together). Returns a Map
// from path to role; missing entries mean classification failed for that
// photo (logged, not fatal) or Ollama isn't reachable (empty Map).
async function classifyPhotos(photoPaths) {
  const roles = new Map();
  if (!photoPaths || !photoPaths.length) return roles;
  if (!(await ollama.isReachable())) return roles;

  for (const p of photoPaths) {
    try {
      roles.set(p, await classifyRole(p));
    } catch (err) {
      console.error(`Photo role classification failed for ${p}:`, err.message);
    }
  }
  return roles;
}

module.exports = { classifyPhotos, ROLES };
