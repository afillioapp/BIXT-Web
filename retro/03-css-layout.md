# CSS and layout traps

Specific things that cost real time.

## `overflow-x: hidden` silently kills `position: sticky`

A sticky nav simply stops sticking, with no error. Use `overflow-x: clip`,
which clips without creating a scroll container.

## `position: fixed` ignores the parent's padding

Chapter copy was `position: fixed` with `left: 0; right: 0; max-width: 1080px;
margin-inline: auto`, so it centred against the **viewport** and ignored the
section's gutter. The hero's copy was static, so it took the section gutter
*and then* centred in what remained, and landed 60px to the left of every other
title at 1440.

They only agree if the static one is given the same containing box. Removing
the section's padding and letting both resolve through the same rule fixed it
at every width.

**If two things must align, resolve them through the same box.** Do not
reproduce a box by hand in two positioning contexts.

## `opacity < 1` and `filter` create a containing block for fixed descendants

This kills `position: fixed` inside them. It ruled out the obvious way of
dimming all chapter copy at once (putting opacity on a shared ancestor), because
the copy is itself fixed.

`filter` on the fixed element itself is fine, because the effect applies to its
descendants, and it has none that are fixed.

## `filter: opacity()` multiplies with `opacity`

Genuinely useful. It gives you a **second, independent fade channel** that
composes with an existing opacity transition instead of overwriting it, and it
has no transition of its own so it tracks a scroll scrub per frame.

```css
.ch__text { opacity: 0; transition: opacity 420ms; filter: opacity(var(--veil, 1)); }
.ch.is-on .ch__text { opacity: 1; }
```

## `visibility: hidden` removes from the tab order; `opacity: 0` does not

Content faded to zero still takes keyboard focus. Five controls in a
fixed-position block 16,000px away were receiving focus with no ring and
nothing on screen. `visibility` also animates, so:

```css
.ch__text          { visibility: hidden;  transition: opacity 420ms, visibility 0s linear 420ms; }
.ch.is-on .ch__text{ visibility: visible; transition: opacity 620ms 380ms, visibility 0s; }
```

The delayed `visibility` transition hides it only after the fade completes.

## `display: none` makes `clientWidth` zero

Anything dividing by a measured width needs a guard, or it produces `NaN`
scroll positions and `NaN` indices:

```js
const usable = () => track.clientWidth > 0;
```

## Media-query overrides lose on source order

`.hero__tag { margin: 0 }` and `.ch__text--hero > * + * { margin-top: ... }`
have identical specificity (0-1-0), so the later one wins. The headline and its
tagline touched at every width while the button below them kept its spacing,
which is exactly the sort of half-working symptom that hides the cause.

Three separate instances of this on one project. **When a rule "does nothing",
check specificity and source order before anything else.** Prefer setting the
specific longhand (`margin-inline`, `margin-bottom`) over the shorthand, so you
do not reset a property another rule owns.

## `scroll-behavior: smooth` on a very tall page

An anchor click on a 17,800px page animates through the entire scroll, which
replayed the whole story as a 2-second strobe: the pile, the scan, the capture
flash and the full page inversion, all compressed. Restrict smooth scrolling to
short hops, or drop it.

## Tail plus footer must stay under half a viewport

If chapter copy is pinned by an IntersectionObserver with a `-50% 0px -50% 0px`
rootMargin, the chapter releases when its midline leaves the viewport centre. A
generous runway after the last chapter pushes the page past that point, so the
closing copy switches **itself** off and leaves a full blank screen above the
footer.

```
tail + footer height < viewport / 2
```

Ours was 58svh of tail plus a 72px footer against a 900px viewport. Write the
constraint in a comment next to the value.

## `ch` units freeze your line breaks

`max-width: 30ch` computes to the same pixel width at 390 and at 1440, so the
subheads broke identically at every viewport. That is convenient for
guaranteeing a two-line shape, but it means **the widow you see at 1440 is on
every device**, and no amount of responsive testing will show variation.

`text-wrap: balance` on body copy fixed a worst-case line balance of 0.18 (one
word on the second line). `pretty` barely moved it.

## Clamp maxima decide where your design stops responding

Every `clamp()` on this site reaches its maximum at 1440, so a 2560 screen gets
an identical 321px text column and 56px headline inside a 1080px band. Nothing
is broken; nothing responds either. Decide deliberately whether the design has
an upper bound.

## Type ratios collapse at the small end

A headline on `vw` against a body at a fixed `rem` means the hierarchy is
strongest where there is most room and weakest where there is least: 3.29x at
1440, 1.41x at 375. Raise the headline's floor rather than accepting it.

Negative tracking tuned for 56px is too tight at 24px. Clamp it too:

```css
letter-spacing: clamp(-0.028em, -0.05em + 0.28vw, -0.005em);
```

## Scroll-snap beats a scripted carousel

```css
.track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; }
.slide { flex: 0 0 100%; scroll-snap-align: center; scroll-snap-stop: always; }
```

Native swipe, native keyboard, works with no JS at all. Script only the dots
and the auto-advance. Give slides an `aspect-ratio` so the track reserves its
height before the images decode, or the block jumps when they arrive.

But: **a horizontal scroll-snap track inside a vertical scroll story fights the
reader's thumb on a phone.** We removed it on small screens entirely.
