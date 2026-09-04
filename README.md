# Fourq Distro — Record Inventory & Listing Manager

Local Node/Express app (no build step, no database) for cataloging and
selling a personal vinyl collection across eBay, Discogs, and Facebook
Marketplace from one place. Single user, runs on the owner's Windows machine.

## Running the app

```bash
npm start   # http://localhost:3000
```

Interactive API docs are available at `/docs` once the server is running.

## Day-to-day use

The app is designed to be driven entirely through its own web UI at
`http://localhost:3000` — grading, pricing, photo upload, and publishing to
eBay/Discogs all happen there without any AI involved. See `CLAUDE.md` for
the full cataloging workflow and architecture notes.

## Working with Claude on this project

Claude is only brought in for genuine judgment calls (code changes, bug
fixes, identifying an obscure record, pricing research the app can't
automate) — not for routine cataloging, which stays in the UI. When a Claude
session is warranted, use this cycle to keep token usage down:

1. Finish the task.
2. `/rename` the session while it still has full context, so the name is
   meaningful if you ever `/resume` it later.
3. `/clear`.
4. Start the next task.

Notes:

- Clear between unrelated tasks even mid-session — e.g. after finishing a
  bug fix, before starting a different feature — not just when stopping for
  the day.
- `/context` isn't a required step every cycle; it's a spot-check. Run it
  occasionally (every 30–60 min of active work) to catch the Messages
  category creeping back up past ~100k, rather than after every single
  `/clear`.

Full project conventions, gotchas, and architecture notes for Claude live in
`CLAUDE.md`.
