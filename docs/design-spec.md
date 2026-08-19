# BX site — design spec

Showcase site only. Nothing signs in, nothing saves. Every button is a link
or a no-op.

## The idea

Apple product pages work because they are mostly empty. One thought fills a
screen, then there is silence, then the next thought. Colour arrives only
from the product. Type is large, tightly tracked, and short-lined.

For BX the "product" is a paper receipt turning into a filed row. That single
transformation is the whole pitch, so it becomes the WebGL centrepiece and
everything else is quiet around it.

## Colour tokens

```css
--ink:        oklch(0.22 0.04 264);  /* #111a2d navy — text and dark grounds */
--ink-soft:   oklch(0.42 0.03 264);  /* secondary text on light             */
--ink-faint:  oklch(0.62 0.02 264);  /* eyebrows, captions                  */
--cyan:       oklch(0.62 0.11 190);  /* #009b95 — the only accent           */
--cyan-deep:  oklch(0.46 0.085 195); /* cyan as text on light (AA-safe)     */
--paper:      oklch(0.97 0.005 260); /* #f3f5f9 page ground                 */
--paper-pure: oklch(1 0 0);          /* cards                               */
--rule:       oklch(0.90 0.008 260); /* hairlines                           */
```

`--cyan` at 3.14:1 on `--paper` fails AA as text. **Cyan is for fills, glows
and WebGL only.** Any cyan-coloured *text* uses `--cyan-deep` (6.21:1). This
is the exact trap the app shipped with; do not repeat it here.

Dark sections invert to `--ink` ground with `--paper` text (17.4:1).

## Type

System stack — no webfont, so nothing blocks first paint:

```css
--sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter",
        system-ui, "Helvetica Neue", Arial, sans-serif;
```

| role | size | weight | tracking | leading |
|---|---|---|---|---|
| display | `clamp(2.75rem, 7.5vw, 6.5rem)` | 600 | `-0.035em` | 0.98 |
| headline | `clamp(2rem, 4.5vw, 3.5rem)` | 600 | `-0.028em` | 1.06 |
| title | `clamp(1.35rem, 2.2vw, 1.875rem)` | 600 | `-0.02em` | 1.2 |
| body-lg | `clamp(1.0625rem, 1.5vw, 1.3125rem)` | 400 | `-0.01em` | 1.55 |
| body | `1.0625rem` | 400 | 0 | 1.6 |
| eyebrow | `0.8125rem` | 600 | `0.12em` uppercase | 1.2 |

Measure caps at **20ch** for display, **34ch** for body-lg. Short lines are
most of the Apple feel.

## Space

Scale: 4 8 12 16 24 32 48 64 96 128 160 220 (px).

- Content max width **1080px**; narrow blocks **660px**.
- Gutters: 24px ≤640, 40px ≤1024, 64px above.
- **Section vertical padding: `clamp(120px, 18vh, 220px)`.** This is the
  single most important rule on the page — resist compressing it.
- Every section holds exactly one idea. No section has two headlines.
- Hero and the WebGL act are `min-height: 100svh`.

## Motion

- Enter-on-scroll: opacity 0→1, `translateY(24px→0)`, **700ms**,
  `cubic-bezier(0.16, 1, 0.3, 1)`, triggered by IntersectionObserver at 15%,
  fired once. Stagger children by 80ms.
- Scroll-scrubbed WebGL is driven by section progress, never by a timer.
- `prefers-reduced-motion: reduce` → all enter animations become instant
  (opacity 1, no transform), the WebGL act renders **one static frame** at
  progress 0.5 and stops its loop.

## Sections

1. **Nav** — sticky, 64px, `backdrop-filter: blur(20px)`, hairline bottom
   that fades in after 40px of scroll. Wordmark left, three links centre-right,
   one filled cyan button.
2. **Hero** — 100svh. Display headline, one body-lg line, two buttons. Deep
   negative space below the buttons; the canvas glows faintly behind.
3. **The act (WebGL)** — the centrepiece, below. ~320vh tall, canvas pinned.
4. **The problem** — dark `--ink` ground, single narrow paragraph, large.
5. **Three steps** — three-up on desktop, stacked on mobile. Numeral, label,
   headline, two lines. Hairline dividers, no cards, no shadows.
6. **The accountant** — the differentiator. One huge pull line on light
   ground with enormous space around it.
7. **Your Drive** — trust. Narrow, quiet, with a small folder-path motif.
8. **Pricing** — one price, centred, five ticks, one button.
9. **FAQ** — `<details>` accordions, hairline separated, no chrome.
10. **Footer** — dark, two link columns, small print.

## The WebGL act

**What it shows.** A single paper receipt, seen at a slight angle. As the
reader scrolls it uncrumples, a cyan scan line sweeps down it, and the ink
lifts off the paper as a cloud of points which then settles into the neat
rows of a spreadsheet. One continuous move: paper → read → filed.

**Scene.** One `PlaneGeometry(2.6, 3.6, 48, 64)` for the paper with a custom
shader (vertex crumple via layered value noise, fragment paper grain + printed
line texture drawn procedurally). One `THREE.Points` cloud, 2400 points,
additive, cyan. One orthographic-ish perspective camera at z=6, fov 38. No
lights — everything is shaded in the fragment shader, which keeps draw calls
at 2 and costs nothing.

**Scroll mapping** (`p` = 0→1 across the pinned section):

| p | state |
|---|---|
| 0.00 | fully crumpled, tilted 18°, points hidden |
| 0.28 | flattened and squared to camera |
| 0.30–0.55 | cyan scan line sweeps top→bottom |
| 0.45–0.75 | points emerge from the printed lines and lift |
| 0.75–1.00 | points settle into a 6-column grid; paper fades to 0.06 |

**Degradation.**
- No WebGL context, or `navigator.hardwareConcurrency <= 2`: canvas is never
  created; a static poster (CSS-drawn receipt card, same composition) shows
  instead. The section shortens to 100svh.
- `prefers-reduced-motion`: canvas renders exactly one frame at p=0.5 — the
  receipt flat and mid-scan — then the RAF loop stops.
- Tab hidden: loop pauses.

**Budget.** ≤3 draw calls, ≤8k triangles, no textures loaded from disk (all
procedural), DPR clamped to 2, canvas resized on a debounced observer.
Target 60fps desktop / 30fps mid phone. Three is code-split into its own
chunk so the shell paints first.
