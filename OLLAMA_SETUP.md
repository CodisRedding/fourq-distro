# Local photo AI via Ollama (one-time setup)

This uses a local vision LLM for two things during the cataloging workflow,
so they no longer need a Claude judgment call — it runs entirely on your
machine, no photos leave it:

1. **Tagging the dead wax photo.** Flags which uploaded photo shows the
   runout area (the blank vinyl ring between the label and the outer groove,
   where a matrix/catalog code is stamped, etched, or handwritten), so you
   can find it at a glance in the photo grid instead of clicking through
   every photo.
2. **Identifying a new arrival.** Reads the front cover, back cover, and
   printed label photos to fill in Step 2 — artist, title, label/catalog
   number, format, year, country — so a new arrival doesn't start from a
   completely blank form.

Note on (1): it only identifies *which photo* shows the runout — it does not
try to read the text itself. An earlier version tried that too, but the
local model regularly hallucinated confident, wrong text rather than
admitting it couldn't read something, which is worse than no auto-fill at
all for a field used to identify a specific pressing. Read the runout
yourself off the flagged photo, same as always. (2) doesn't have this
problem nearly as much — cover and label text is large, printed, and
high-contrast, so it's a much easier read than tiny etched dead wax — but
it's still told explicitly not to guess, and leaves a field blank rather
than invent something if it can't read it confidently.

1. Install Ollama: https://ollama.com/download (Windows installer).
2. Pull a vision-capable model:
   ```
   ollama pull qwen2.5vl:7b
   ```
   `qwen2.5vl:7b` is the default this app expects — reads small etched/stamped
   text noticeably better than `llava` in testing. Needs ~6GB free (RAM or
   VRAM if you have a GPU Ollama can use); drop to `qwen2.5vl:3b` if that's
   too much for your machine, or point `OLLAMA_VISION_MODEL` in `.env` at
   whatever you pull instead.
3. Make sure Ollama is running (the installer sets it up as a background
   service that starts automatically — `ollama serve` if you need to start it
   by hand).
4. Nothing else to configure — the app talks to `http://localhost:11434` by
   default. Only add to `.env` if you're running Ollama on a different
   host/port or want a different model:
   ```
   OLLAMA_URL=http://localhost:11434
   OLLAMA_VISION_MODEL=qwen2.5vl:7b
   ```
5. Restart the app (`npm start`).

Now, whenever photos are added to a record (zip upload or individual photo
upload), the app checks each new photo (one classification pass covers both
features) and:
- marks any that look like the runout area with a "⊙ Runout" badge in the
  photo grid — read the actual Matrix / Runout text off that photo yourself
  and type it into the field, same as always;
- if the record's artist and title are both still blank, tries to fill in
  Step 2 from whatever cover/label photos it found. It never overwrites a
  field you've already typed into, and it does **not** run the Discogs
  lookup for you — check the extracted fields, then click "Look up Discogs
  pricing" yourself as usual.

A couple of notes:
- Both are toggleable — "Auto-tag runout photos" and "Auto-identify from
  photos" in the toolbar, both on by default, no restart needed to flip
  either. Turn them off if you'd rather not wait on Ollama during upload
  (a 12-photo zip can take 30-60+ seconds with both on), or if it's not
  installed and you don't want the (harmless) delay from every upload
  trying to reach it.
- Neither is infallible. For runout tagging, click the ⊙ button on any
  photo to mark or unmark it by hand if it missed the runout photo or
  flagged the wrong one. For identification, just correct whatever's wrong
  in the Step 2 fields — same as if you'd typed it in yourself.
- If Ollama isn't installed or isn't running, both are skipped silently and
  photo upload works exactly as before — neither is a hard dependency.
