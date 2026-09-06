# Changelog

Notable changes to the app itself, newest first. Routine cataloging
(pricing/grading records, adding new arrivals) isn't tracked here — see
`git log` for that.

## 2026-09-06
- **12:20** — Fix stale ImgBB cache and oversized photos breaking Instagram publish
- **11:39** — Switch image hosting from ImgBB to Cloudinary
- **11:38** — Replace publish-failure alert() with a copyable error dialog

## 2026-09-04
- **22:51** — Add request timeouts to eBay, Instagram, and ImgBB calls
- **22:50** — Add recent-search history and clear button to search box
- **22:20** — Add eBay sold-status sync and fix Instagram tab reset on refresh
- **20:54** — Add Instagram engagement stats, post links, republish guard, and beta notice
- **20:07** — Add Instagram publishing (image/carousel posts via Instagram API with Instagram Login)
- **11:34** — Add project README
- **11:33** — Add local-Ollama photo auto-tagging and auto-identify
- **11:33** — Add photo lightbox/drag-reorder/dead-wax UI; fix sleeve grade popup
- **11:33** — Harden eBay publish: aspect truncation, 12-photo cap, price guard
- **11:33** — Retry ImgBB uploads on transient server errors

## 2026-09-01
- **10:45** — Document Claude session workflow (rename + clear between tasks)
- **07:57** — Add zip camera-roll upload and photo rotate endpoints
- **07:56** — Fix stale DailyDollar user agent in Discogs client

## 2026-08-11
- **12:51** — Add interactive API docs via OpenAPI + Scalar

## 2026-08-10
- **13:33** — Rename package to fourq-distro
- **13:07** — Initial commit of fourq-distro record listing manager
