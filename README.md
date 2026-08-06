# GLO30 Short Pump — Google Ads landing page

Static, no build step. Serve the folder root; all asset paths are absolute (`/assets/...`).

```bash
python -m http.server 8123
```

---

## Files

```
index.html
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
| Phone number `(804) 555-0130` is a placeholder | `index.html` header, location section, footer CTA |
| Street address and hours are unverified | `index.html` location section |
| The "$30 off" line was removed from the form card, but the sticky mobile CTA still reads "Book my facial — $30 off" and the footer disclaimer still references an offer | `index.html` sticky mobile CTA + footer |
| "4.9★ Google rating" in the trust bar is unverified | `index.html` trust bar |
| Form `action` points at `#` and the submit handler only shows a message | `index.html` form, `assets/js/main.js` |
| `<link rel="canonical">` points at `example.com` | `index.html` head |

The page ships `noindex, nofollow` — correct for a paid lander. Remove it only if this
is meant to rank organically.

### Wiring the form

`main.js` validates, fires a `generate_lead` push to `dataLayer`, then stops. Pick one:

1. Let it POST natively — drop the `preventDefault()` and set a real `action`.
2. `fetch(form.action, {method:'POST', body:new FormData(form)})`, then redirect to a
   `/thank-you/` page. **Preferred** — a real URL gives Google Ads a clean conversion
   trigger and a place to fire the conversion tag.

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

Not yet checked on real hardware — **test iOS Safari autoplay on an actual iPhone**
before spending money on it. Low Power Mode blocks autoplay outright; that is expected,
and the posters cover it.
