// Attempt at transcribing the "dead wax" runout etching (the matrix/runout
// code stamped, etched, or handwritten into the blank vinyl ring between
// the label and the outer groove) via the local vision LLM. NOT wired into
// the automatic upload flow — see server/photoRoles.js for what actually is
// (classifying *which* photo shows the runout area, not reading it).
//
// In testing this regularly hallucinated confident, wrong, or completely
// fabricated text — especially on faint/handwritten etchings and even on
// photos that weren't the runout at all — rather than admitting it couldn't
// read something, even when explicitly prompted to say so when unsure.
// That's a real risk for a field used to help identify a specific pressing,
// so nothing currently calls this. Kept working in case it's worth
// revisiting against a stronger model later.

const ollama = require('./ollama');

const READ_PROMPT = `You are looking at one photo of a vinyl record. It may show the "dead wax" — the smooth blank vinyl ring between the label and the outer groove — with a matrix/runout code etched, stamped, or handwritten into it.

This is NOT the record label, sleeve, cover art, or any printed/typeset text — it is text scratched or stamped directly into the bare vinyl itself, usually small, faint, and at an angle to the light.

Only transcribe if this photo clearly shows that specific bare-vinyl area AND you can read the text with high confidence, character by character. Do not guess, complete, or infer characters you can't actually make out — partial illegible text is worthless and worse than nothing. If the photo doesn't show that area, or the etching is too faint/blurry/at a bad angle to be sure, respond with exactly: NONE

Respond with only the runout text (or NONE) — no explanation, no extra commentary.`;

// photoPaths: absolute local file paths. Checks each photo individually and
// combines any distinct readings found. Returns the runout text, or null if
// Ollama isn't running or nothing readable was found. Not currently called
// automatically — see file header.
async function readRunout(photoPaths) {
  if (!photoPaths || !photoPaths.length) return null;
  if (!(await ollama.isReachable())) return null;

  const seen = new Set();
  const findings = [];
  for (const p of photoPaths) {
    let text;
    try {
      text = await ollama.generate([p], READ_PROMPT, { numCtx: 8192 });
    } catch (err) {
      console.error(`Dead wax read failed for ${p}:`, err.message);
      continue;
    }
    if (!text || /^none\.?$/i.test(text)) continue;
    const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(text);
  }
  if (!findings.length) return null;
  return findings.join(' / ');
}

module.exports = { readRunout };
