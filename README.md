# GLO30 Short Pump — Google Ads landing page

Node server (no framework, no dependencies) serving a static page plus one lead route.
Runs on Railway via `npm start`.

```bash
npm start
```

Listens on `PORT` (Railway sets it), defaults to 3000.

---

## Files

```
server.js               Node http: static files + POST /api/lead -> GoHighLevel
package.json            start script, engines >=18. No dependencies.
index.html
thank-you/index.html    post-submit landing, Google Ads conversion placeholder
assets/
  css/styles.css
  js/main.js
  fonts/ArgentumSans-{Regular,Medium,Bold,Black}.woff2
  images/logo/logo-navy.svg   logo-white.svg
  images/hero/hero-nanoglo-{760,1280,1920}.{jpg,webp}
  video/  skin-analysis.{webm,mp4}   poster-skin-analysis.jpg
          client-review.{webm,mp4}   poster-client-review.jpg
fonts/    images/    logo/     <- ORIGINAL source assets, not referenced. Do not deploy.
```

---

## CRM: GoHighLevel lead delivery

Two independent paths, by design. Either one alone still captures the lead.

**(a) Primary — server-side.** The form POSTs to `/api/lead` in `server.js`, which calls
`POST https://services.leadconnectorhq.com/contacts/` with `Version: 2021-07-28` and a
Bearer token. It sends `firstName`/`lastName` (split from the single name field), `email`,
`phone`, `source: "Google Ads - Short Pump Lander"`, tag `short-pump-landing`, a second
tag `interest-<value>`, and an `attributionSource` block carrying the UTMs and `gclid`.

**(b) Secondary — client-side.** GHL's External Tracking script sits immediately before
`</body>` on both pages, exactly once. It watches the real `<form>` element and creates
its own GHL submission event, independent of (a).

The route **never fails the visitor**. A missing token, a GHL 4xx, a duplicate contact, a
network timeout — all log server-side and still return `{ok:true, redirect:"/thank-you/"}`,
because (b) already has the lead and a dead end costs a real booking. Delivery status is
in the JSON as `delivered: true|false`, and in the logs.

### Environment variables

Set these in the Railway dashboard. The code reads them from the environment only —
there are no defaults and no hardcoded fallbacks.

| Name | Required | Purpose |
|---|---|---|
| `GHL_PRIVATE_INTEGRATION_TOKEN` | yes | Bearer token for the v2 API |
| `GHL_LOCATION_ID` | yes | GHL sub-account the contact lands in |
| `GHL_INTEREST_FIELD_ID` | no | If set, the offer label is also written to this custom field. Without it, the offer is captured as a tag only. |
| `PORT` | no | Railway sets this automatically |

Without the two required vars the server boots, serves the site, and logs
`[server] GHL delivery DISABLED` — it does not crash.

`GET /healthz` returns `{"ok":true,"ghlConfigured":true|false}` — quickest way to confirm
Railway picked the vars up.

### Interest values posted

`smart-glo-99` · `tox` · `nano-glo` · `gloria-ai-scan`

### Log lines to watch

```
[lead] delivered to GHL { contactId: '...', interest: 'nano-glo', email: '...' }
[lead] GHL rejected 401 {"statusCode":401,"message":"Invalid JWT"}
[lead] NOT DELIVERED — missing env vars: GHL_PRIVATE_INTEGRATION_TOKEN
[lead] honeypot triggered, discarded
```

---

## Hero image

The hero is a **still**, not video — `2024_July_30_Glo30-359 (1).jpg` (NanoGLO treatment
close-up), served through `<picture>` at three widths in WebP with JPEG fallback:

| Width | WebP | JPEG |
|---|---:|---:|
| 760 | 19 KB | 27 KB |
| 1280 | 38 KB | 57 KB |
| 1920 | 64 KB | 101 KB |

Preloaded with `fetchpriority="high"` + `imagesrcset`, so the LCP element starts
downloading from the head. The scrim runs two gradients — a vertical wash plus a heavier
left-side ramp — so the headline sits on clean ground instead of over the subject's face.
On ≤960 px the left ramp is dropped for a plain vertical wash, since the copy is
full-width there.

```bash
ffmpeg -i src.jpg -vf scale=1920:-2 -q:v 5 hero-nanoglo-1920.jpg
ffmpeg -i src.jpg -vf scale=1920:-2 -c:v libwebp -quality 72 hero-nanoglo-1920.webp
```

The former hero clip (`Img 9233.webm`) and its encodes were deleted — nothing references
them.

## Video: what went where and why

Both remaining clips are 1080×1920 vertical social reels, silent, and loop acceptably.

| Source | Content | Placement | Reason |
|---|---|---|---|
| `Img 5749.webm` | Esthetician walking a client through her scan on the in-studio analysis mirror | **"Why GLO30" section** (`skin-analysis`) | Literally depicts the free-skin-analysis differentiator, so it earns a spot beside that copy instead of being decoration. |
| `Img 5752.webm` | Client filming herself in her car after an appointment, 3.5 s | **Proof section** (`client-review`) | Warm, real, human. Cropped to a circle beside the "thirty minutes" copy. |

### MP4 fallbacks — generated, not stubbed

Only `.webm` (VP8) was supplied. H.264 MP4 fallbacks **were generated** and are in
`assets/video/`, so every `<video>` ships with both `<source>` tags and there is no
webm-only path. Nothing further is needed before launch.

### Weight

The supplied clips were far too heavy for a paid-search lander — VP8 at 3.5–8.0 Mbps.
They were re-encoded (VP9 + H.264, 24 fps, downscaled to 540×960).

| Clip | Original | WebM now | MP4 now |
|---|---:|---:|---:|
| skin-analysis | 6.5 MB | 293 KB | 368 KB |
| client-review | 3.4 MB | 108 KB | 102 KB |
| **Total** | **9.9 MB** | **401 KB** | **470 KB** |

A visitor downloads one codec, not both, and no video loads until it is scrolled toward:

- **First paint / above the fold:** ~38 KB hero WebP + 140 KB fonts. No video at all.
- **Below the fold:** ~400 KB more, and only if the visitor scrolls that far.

Commands used, if a clip is ever re-cut:

```bash
ffmpeg -i in.webm -an -r 24 -vf scale=540:-2 -c:v libvpx-vp9 -crf 42 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 out.webm
ffmpeg -i in.webm -an -r 24 -vf scale=540:-2 -c:v libx264 -crf 31 -preset slow -profile:v main -pix_fmt yuv420p -movflags +faststart out.mp4
ffmpeg -ss 0.5 -i in.webm -frames:v 1 -vf scale=540:-2 -q:v 6 poster.jpg
```

### Playback behaviour

- Every clip: `muted autoplay loop playsinline` — `muted` + `playsinline` are what let
  iOS Safari autoplay at all.
- Every clip has a `poster` frame plus a CSS background colour underneath, so the slot
  is filled on first paint instead of flashing empty.
- Both clips are below the fold: `preload="none"` and **no** `src` in the markup. Real
  sources live in `data-src` and are attached by an `IntersectionObserver` in `main.js`
  (300 px root margin) that calls `load()` and `play()` on approach. If JS is off or the
  observer never fires, the poster stands in — the section never renders empty.
- `prefers-reduced-motion: reduce` swaps every clip for its poster still.

---

## Before launch — must change

Each one is marked with a `TODO` comment at the point of use.

| What | Where |
|---|---|
| Opening hours are still unverified — address and phone are now the real listing | `index.html` location section |
| The "$30 off" line was removed from the form card, but the sticky mobile CTA still reads "Book my facial — $30 off" and the footer disclaimer still references an offer | `index.html` sticky mobile CTA + footer |
| "With over 1,000 five-star reviews" — quantifiable claim, came from the client's Figma frame (529:316). Confirm it's still current before spend | `index.html` Reasons section, card 4 |
| `assets/images/reasons/rep.png` — the badge artwork itself reads **"5 Stars Reviwes"** (typo baked into the client's exported asset). Needs a corrected export | `assets/images/reasons/rep.png` |
| Reasons card images are 101×100 in the source Figma file — that is their native resolution, so they render soft on 2× displays. Ask the client for larger originals if crispness matters | `assets/images/reasons/*.png` |
| `<link rel="canonical">` points at `example.com` | `index.html` head |
| Google Ads conversion ID and label are empty strings — the tag is inert until filled | `thank-you/index.html` |

The page ships `noindex, nofollow` — correct for a paid lander. Remove it only if this
is meant to rank organically.

### Form submit flow

`main.js` validates, pushes `generate_lead` to `dataLayer`, then POSTs the form
url-encoded to `/api/lead` and redirects to the `redirect` path in the JSON response
(`/thank-you/`). On a network-level failure it redirects anyway — the GHL tracking
script has the lead either way.

The `<form>` keeps a real `action="/api/lead"` and `method="post"`, so it degrades to a
native POST with JS disabled and stays visible to GHL's form detection.

Hidden fields already capture `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`
and `gclid` from the query string, plus `landing_page=short-pump`. A honeypot field
named `company` silently drops bots.

The `interest` select is **required** and posts one of `smart-glo-99`, `tox`,
`nano-glo`, `gloria-ai-scan`. It defaults to a disabled "Choose one" so nobody's lead
gets silently tagged with the first option. The chosen value also rides along on the
`generate_lead` dataLayer push, so you can segment conversions by offer in GTM.

`data-cta` attributes on every button/link push a `cta_click` event with the button
name — hook GTM to those for click-level reporting.

---

## Verified

Checked at 1280 px, 390 px and 360 px: no horizontal overflow, fonts load, hero image
loads at the right srcset step, both below-fold clips hydrate on scroll, form blocks on
an unpicked `interest` and clears on change, empty/invalid/valid states all behave, UTM
and `gclid` capture works.

Lead route, tested locally against the live GHL endpoint:

- `GET /healthz` → `{"ok":true,"ghlConfigured":false}` with no env vars set
- `POST /api/lead` with no env vars → logs `NOT DELIVERED`, returns `redirect:/thank-you/`
- `POST /api/lead` with a deliberately invalid token → real request reaches GoHighLevel,
  which answers `401 {"statusCode":401,"message":"Invalid JWT"}`; server logs it and
  still returns `redirect:/thank-you/`
- Honeypot POST → discarded, success response
- POST with neither email nor phone → `400 email_or_phone_required`
- Browser submit → lands on `/thank-you/`, `lead_thank_you` in the dataLayer
- Path traversal (`/../../../Windows/win.ini`) → 404
- `https://go.cloudcrm.info/js/external-tracking.js` → 200

**Not verified:** a successful `201` from GoHighLevel. That needs a real token and
location id, which only exist in the Railway dashboard and the GHL account.

Not yet checked on real hardware — **test iOS Safari autoplay on an actual iPhone**
before spending money on it. Low Power Mode blocks autoplay outright; that is expected,
and the posters cover it.
