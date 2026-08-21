# Verification: how measurements lied

Nine distinct false readings on one project. Every one was confident. Several
survived multiple runs because the harness agreed with itself.

**The rule that would have caught all of them: a measurement is not evidence
until you have tried to make it fail.** Self-test the maths against a known
value. Cross-check one instrument against a different one. When a result
surprises you, suspect the instrument first.

---

## 1. WebGL silently becomes a static poster

Headless Chrome without GPU flags fails to create a WebGL context. If the page
has a fallback, you review the fallback and never know.

```js
chromium.launch({ channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
```

**Always assert a tell before trusting anything else.** Ours was document
height: ~17,800px with the scene live, ~9,500px with the poster, because the
fallback collapses the chapters' scroll length. Print it at the top of every
run.

## 2. Reading pixels back from a WebGL canvas returns blank

`canvas.toDataURL()` and `readPixels()` return empty on a WebGL canvas without
`preserveDrawingBuffer: true`. This reads as "the scene is frozen" or "nothing
is rendering". It cost two false bug reports.

**Use `page.screenshot()`.** If you need pixel data, screenshot, then decode
the PNG in a *second* page by drawing it into a 2D canvas. That is real data
and it never touches the live GL context.

## 3. `getComputedStyle().color` returns `oklch()` verbatim

Chrome no longer normalises to `rgb()`. Naive parsing reads the oklch
components as RGB and reports nonsense: it scored a real 3.43:1 pair as 12.04:1.

**Rasterise instead.** Paint the colour onto a 1x1 2D canvas and read the
bytes. The canvas also does alpha compositing for you, so `white/60` is scored
as what it actually paints.

**Self-test before every run:**

```
white on black must be 21.00      #767676 on white must be 4.54
```

If those drift, nothing below them is trustworthy. Exit rather than report.

## 4. Screenshotting before the animation arrives

An eased scroll scrub under software rendering runs at roughly 10fps. A
screenshot 1.3s after `scrollTo` catches the animation still travelling, about
three-quarters of the way there.

This produced a whole investigation into "neon bars visible behind the CTA".
There were no bars. Probing the actual phase values showed all four at exactly
zero. The frame had simply been caught in transit.

## 5. "Stopped changing" is not "converged"

This is the subtle one, and it burned me twice after I thought I had fixed the
timing problem.

A settle function that waits for a value to stop changing is wrong whenever
that value is **clamped at an endpoint**. While the scrub is still travelling
toward the crossing, the ground colour is pinned at its light value and does
not move at all. Perfectly stable. Not remotely converged.

That produced a false "the ground is still light at p=0.60 on 1440" and a false
"the page does not return to light when you scroll back up".

**Walk the scroll instead of teleporting:**

```js
async function scrollTo(page, y, steps = 24) {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(v => window.scrollTo({ top: v, behavior: "instant" }),
      Math.round(from + (y - from) * (i / steps)));
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(1800);
}
```

Stepping keeps `current` near `target` throughout, so there is no long ease to
converge. It also mimics what a reader actually does, which is the behaviour
you wanted to test anyway.

**IntersectionObserver state lags an instant jump too.** A jump to the bottom
followed by an immediate read reported the closing copy blank when it was fine.

## 6. Sampling the background from the wrong pixel

To find what the art painted, I compared every pixel against a reference taken
at (0, 0). That pixel sits inside a translucent sticky nav, not on the page
ground. Every ordinary background pixel differed from it, so the detector
reported the art filling the entire viewport at every beat: bottom 899, width
1439, identical numbers eight times in a row.

**Identical numbers across cases that should differ means the instrument is
broken, not that the cases are identical.** Sample the reference from somewhere
provably plain, and print it.

## 7. Fixed-position furniture counts as content

Even with the correct reference, a 2px full-width progress bar fixed to the
bottom of the viewport registered as "art" and pinned the measured extent to
the last row.

**Exclude known chrome by geometry**, or hide it for the measurement. Hiding
the chapter copy was not enough, because the bar is not chapter copy.

## 8. Scoring a token against a surface nothing renders

From the sibling app, but the most expensive of all. Contrast was measured for
`--text-primary` against `--card`. The markup used literal `bg-white` in 23
places and imported the card component nowhere.

It manufactured a bug that did not exist (a "1.02:1 invisible title") **and**
blessed a change that would have put near-white text on real white cards at
1.11:1, including the screen where users proofread extracted values.

**Verify which class a surface actually uses before scoring a token against
it.** Token-versus-token maths is fiction when the markup hardcodes a literal.

## 9. Comparing two states, where a constant error cancels

Worth knowing because it explains why one instrument was right while another
was wrong on the same page. Measuring "art pixels in the copy band" as
*with-canvas minus without-canvas* is robust to a bad background reference,
because the error appears in both terms. Measuring absolute extent is not.

**Prefer differential measurements.** They survive instrument error that
absolute ones do not.

---

## The verification harness worth rebuilding

Keep these outside the repo so they never appear in a diff:

- A launcher with the GPU flags and the doc-height assertion baked in.
- A stepped `scrollTo`.
- A contrast function that rasterises, with the two self-tests running first.
- A screenshot decoder in a second page for pixel analysis.
- A background-reference sampler that takes its reference from a stated,
  provably plain coordinate and prints it.
