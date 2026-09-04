// Thin shared client for the local Ollama vision model — used by
// photoRoles.js (classifying what a photo shows), identify.js (extracting
// artist/title/label from cover/label photos), and deadwax.js (an unused-
// but-kept attempt at transcribing runout text). See OLLAMA_SETUP.md.

const fs = require('fs');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:7b';

async function isReachable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Ollama/qwen2.5vl caps vision tokens at roughly the same budget per image
// (~4100 tokens) regardless of input resolution — downscaling a photo
// before sending it doesn't save context, it just throws away detail.
// num_ctx needs to scale with how many images go in one request, not with
// their resolution — callers should keep batches small (a handful of
// photos, not a whole zip's worth) and pass a num_ctx that covers them.
async function generate(imagePaths, prompt, { numCtx = 8192, json = false } = {}) {
  const images = imagePaths.map(p => fs.readFileSync(p).toString('base64'));
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_VISION_MODEL,
      prompt,
      images,
      stream: false,
      ...(json ? { format: 'json' } : {}),
      options: { temperature: 0, num_ctx: numCtx }
    })
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return (data.response || '').trim();
}

module.exports = { isReachable, generate };
