# Accessibility findings

All of these were live on a page that looked finished.

## Invisible content keeps keyboard focus

Six tabs from the hero put focus inside the closing block: a button, a
scroller, and three dots, all painted at `opacity: 0`, sixteen thousand pixels
away. No ring, nothing on screen, and `scrollY` never moved because the block
is `position: fixed` so there is nothing to scroll *to*. Enter navigated
silently.

WCAG 2.4.7 Focus Visible, Level AA. Fix with `visibility: hidden` (see
[03-css-layout.md](03-css-layout.md)).

**Test it by tabbing.** Print, for each stop, the element and the computed
opacity/visibility of its nearest animated ancestor. Anything invisible holding
focus is a defect.

## IntersectionObserver on a fixed element always intersects

A carousel guarded its auto-advance with an observer on the track. The track
lives inside a `position: fixed` block, so its rect is inside the viewport at
every scroll position: the guard was always true. It advanced from page load,
forever, running a smooth-scroll, a rAF and three aria writes every 4.2s on a
page already at 10fps.

**Observe the thing that actually enters and leaves**, which here was the
chapter, not the element inside it.

Related: an auto-advancing carousel over 5 seconds needs a pause control to
satisfy WCAG 2.2.2 (Level A). We gated it to a single chapter and disabled it
under reduced motion; a visible pause control is the fuller answer.

## Pause-on-interaction needs a symmetric resume

`focusin` stopped the carousel and only `pointerleave` restarted it. On touch,
`pointerleave` never fires, so it stopped permanently. Pair every stop with a
resume that can actually happen on the same input type.

## Touch targets

Seven of ten interactive elements were under 44px, and the footer links at
22.4px failed even the 24px WCAG 2.5.8 floor. The dots, built later, were
exactly 44x44 around a 7px dot: the pattern was understood, the older elements
had simply never been checked.

```css
a { display: inline-flex; align-items: center; min-height: 44px; }
```

For a small mark, grow the target without moving it: `padding: 10px 0; margin: -10px 0;`

## Do not borrow ARIA roles from a pattern you have not implemented

The dots were `role="tab"` inside `role="tablist"`, with no `aria-controls` and
no `tabpanel` anywhere. There is one scroller, not one panel per dot, so the
tab pattern does not apply. Plain buttons with `aria-current` are correct and
honest.

## A progress bar that re-announces on every scroll event

`role="progressbar"` with `aria-valuenow` rewritten on each scroll gives a
screen reader a continuous stream of updates, and it duplicates information the
scrollbar already conveys. It is decoration: `aria-hidden="true"`.

## Reduced motion should reduce, not remove

The right call for a scroll-scrubbed story is to **keep the story** and drop
the inertia, because the animation is hand-driven: the reader is already in
control of it. What we disable is everything that moves on its own.

```js
const EASE = reduceMotion ? 1 : 0.1;   // still scrubs, no glide
```

Plus: hint animation hidden, reveal transitions off, hover transforms off,
carousel auto-advance off, smooth scrolling off.

## Contrast during a transition is still contrast

An interpolated theme has to be sampled *through* the transition, not just at
its endpoints. Both ends measured 15:1 and the midpoint measured 1.03:1.

The rule we settled on: **wherever any text pair falls below 4.5:1, the copy
must already be faded to effectively zero.** Assert that as an invariant in the
test, not as a comment. Ours said the veil was below 0.15 wherever contrast
failed; measurement showed 0.353 at 2.67:1. The comment was aspirational.

## Alt text should describe the content, not the container

Weak: "The Bixt app."
Better: "The insight screen: spending by week, and a ring showing how the month
splits between categories."

Three screenshots of the same app need three different descriptions, or they
are three copies of no information.
