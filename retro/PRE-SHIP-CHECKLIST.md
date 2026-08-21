# Pre-ship checklist

Run all of it. Each line here exists because it caught something real.

## The instrument first

- [ ] Contrast self-test passes: white/black **21.00**, `#767676`/white **4.54**
- [ ] WebGL is live, not the fallback (assert the document height)
- [ ] The background reference pixel is sampled from provably plain ground, and printed
- [ ] Scroll is walked in steps, never jumped, before any reading
- [ ] Any claim that surprised you has been checked with a second instrument

## Build and runtime

- [ ] `npm run build` clean; bundle sizes reported
- [ ] Zero console errors and zero page errors, on load **and** while scrolling the whole page
- [ ] No uniform or CSS custom property referenced but never declared
- [ ] No uniform multiplied by a literal zero (dead subsystem)
- [ ] Every `ShaderMaterial` has a `name`

## Layout

- [ ] No horizontal overflow at 375, 768, 1440, 2560
- [ ] Art never overlaps copy: measure the painted extent per beat against the copy's top
- [ ] Only one chapter's copy visible at a time
- [ ] Nothing overflows the fold at any width
- [ ] The closing block clears the footer at 360, 375, 430, 768, 1440
- [ ] Titles and copy share one left edge at every width, hero included
- [ ] `tail + footer < viewport / 2`

## Typography

- [ ] Subheads render the intended number of lines at 1440, 768, 390 **and** 360
- [ ] Headline-to-body ratio is still a hierarchy at the smallest width
- [ ] The closing headline is not smaller than the chapter headlines
- [ ] No one-word widows (`text-wrap: balance` on body copy)

## Motion

- [ ] Easing is frame-rate independent (elapsed-time normalised, not per-frame)
- [ ] Every beat has something to do; none is static for its whole window
- [ ] No hard cuts: check that beats overlap rather than swap
- [ ] Reduced motion keeps the story and drops only self-driven movement
- [ ] Nothing auto-animates while off screen (observe the container, not a fixed child)

## Accessibility

- [ ] Tab through: no stop lands on invisible content
- [ ] Every interactive element is at least 44x44
- [ ] Contrast sampled **through** every transition, not just at its endpoints
- [ ] Wherever text falls below 4.5:1, it is faded to effectively zero
- [ ] Focus rings visible on every control
- [ ] ARIA roles match a pattern actually implemented
- [ ] Alt text describes content, and differs between similar images

## Copy

- [ ] Every line read in one list, in order, checking for claims that contradict
- [ ] Every CTA has a real destination, or says only what it can do
- [ ] Titles within the word limit; no em dashes; model never named
- [ ] Nothing invented: no customers, testimonials, logos or statistics
- [ ] The spec document matches what shipped

## Before you call it done

- [ ] Every dependency between numbers is commented at the site of the number
- [ ] Anything you could not verify is stated plainly, not implied to be fine
