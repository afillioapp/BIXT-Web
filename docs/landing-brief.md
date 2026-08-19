# BIXT Landing Page Brief

**How to use this file:** each phase below is a separate task. Do not attempt more than one phase per session. When asked to work on a phase, read only that phase plus the Ground Rules, implement it, and stop. Do not start the next phase without being asked.

Repo: `The Web`. Branch: `main`.

---

## Ground Rules (apply to every phase)

**Reuse, do not replace.** Whatever scroll and animation system already exists in this project stays. Stage content and timing change; the underlying driver does not. If you conclude the existing driver genuinely cannot express a required transition, stop and explain why before writing code.

**No new dependencies.** If you believe a new library is required, stop and make the case first.

**Asset locations (verified, do not search elsewhere):**
- `public/app-home.jpg` is the app home screen shot, already web-servable.
- `Screenshots/` at the repo root holds three additional JPEGs with UUID filenames. These are not under `public/`, so they are not served. If one is needed, copy it into `public/` with a descriptive name rather than referencing it in place.

**Do not touch:** existing routing, build config, `package.json`, or anything outside the landing page and its styles.

**Quality floor for every phase:** responsive at 375px, 768px, and 1440px; `prefers-reduced-motion: reduce` collapses animation to a static end state rather than disabling the section; no console errors.

**Report format when you finish a phase:** list the files you changed, what you removed, and anything you decided against doing and why. Do not mark work complete without a self-check against that phase's acceptance list.

---

## Phase 0: Inspection (read only, change nothing)

Answer these before any code is written:

1. What framework and build tool does the page use?
2. What animation library is installed, if any? Check `package.json`, not just imports.
3. How is scroll progress currently tracked? Name the file and the mechanism (ScrollTrigger, IntersectionObserver, raw scroll listener, CSS scroll-timeline, other).
4. How is the Magic Scroll section structured? Is it one pinned container with stages, or separate sections each with their own trigger?
5. How is the hero laid out? Grid, flex, absolute positioning?
6. Where is the background colour for the "Numbers come off" stage set, and what currently drives it?
7. What is the BIXT cyan? Give the exact value and where it is defined.

Output: a short written answer. No file changes.

---

## Phase 1: Hero Composition

The hero currently sits too low and reads as centred and generic.

**Do:**
- Reduce the top offset so the composition sits higher in the viewport.
- Move the text block left. Target a two-column layout: headline, supporting copy, and CTA on the left; an iPhone mockup on the right.
- Place `public/app-home.jpg` inside the phone frame. The phone should sit in the layout as a composed element, with the screen content cropped to the frame, not floated beside the text as a loose image.
- Keep spacing generous. The hero introduces; it does not compete with the Magic Scroll below it.

**Do not:** add new sections, change copy, or touch anything below the fold.

**Acceptance:**
- [ ] Hero content starts visibly higher than before.
- [ ] Two-column layout with text left, phone right, on desktop.
- [ ] `app-home.jpg` renders inside the phone frame, correctly cropped.
- [ ] Columns stack cleanly on mobile with the phone below the CTA.
- [ ] Nothing below the hero changed.

---

## Phase 2: The Light to Dark Capture Transition

This is the single most important change in the brief. Ship it on its own.

Right now the "Numbers come off" stage starts on a dark background. That breaks the story. The background is meant to carry the meaning:

- **Light background = the physical world.** Paper receipt.
- **Dark background = the digital world.** Captured receipt.

**Required sequence:**

1. **Physical receipt, light background.** A single paper receipt, centred, on light. Keep the existing slow revolving motion; its pacing is the reference for the whole page. Give it real scroll distance before anything else happens. It should hold long enough that a viewer can examine it.
2. **Capture.** The receipt shows it is being photographed or scanned. This is the hinge of the whole page.
3. **Background shift.** The light to dark transition begins **only** during the capture, driven by the same scroll progress value as the capture animation. It must not be a section boundary triggering a class change. If the viewer scrolls back up, the background returns to light in step with the receipt.

**Acceptance:**
- [ ] The receipt stage starts on light background.
- [ ] The dark background does not appear before the capture moment.
- [ ] Background interpolation is bound to the capture animation's scroll progress, reversible on scroll up.
- [ ] The receipt holds on screen for a meaningful scroll distance before the capture starts.
- [ ] No abrupt colour jump at any scroll speed.

---

## Phase 3: The Digital Stage, Simplified

Once dark, the story is: receipt photo, information extracted, organised information. Nothing more.

**Do:**
- Transform the receipt into a clean digital document showing date, vendor, total, tax. Real-looking values, not lorem.
- The actual photo of the receipt may stay visible as a supporting element on a white background, since it represents a photograph of paper.
- **Remove** the Fuel / Meals / Supplies / Tools category buttons. They interrupt the transformation and the point lands without them.
- Remove any other floating card, dashboard fragment, or UI chrome in this stage that does not serve the sentence: *BIXT reads the receipt and turns it into useful information.*

**Acceptance:**
- [ ] Receipt morphs into the digital document rather than being swapped for it.
- [ ] Category buttons are gone.
- [ ] No more than two visual objects on screen at once in this stage.

---

## Phase 4: One Object Carries the Rest

Currently the page jumps between folders, spending tracking, and the accountant as three unrelated scenes. Make it one progression, with the folder as the continuous object, the way the receipt was the continuous object earlier.

**Sequence:** digital document moves into a folder, the folder fills and evolves, its contents surface as visible spending, then the accountant accesses that same organised set.

**Explicit permission:** if any of these three stages cannot be connected smoothly, cut it. A clear three-beat story beats a choppy five-beat one. Say which you cut and why.

**Also in this phase:** remove leftover artifacts from the previous animation concept. Orphaned dark-receipt icons, duplicate receipt visuals, unused elements, anything appearing in a section it no longer belongs to.

**Acceptance:**
- [ ] The folder persists across stages rather than being replaced.
- [ ] No hard cut between folder, spending, and accountant.
- [ ] No leftover dark-receipt visuals anywhere on the page.
- [ ] Any cut stage is named in the report with a reason.

---

## Phase 5: Progress Indicator and Closing CTA

**Progress indicator:** a thin bar fixed at the bottom of the viewport, filling in BIXT cyan as the page scrolls. Minimal, no labels, no percentage, no glow.

**CTA:** the final section should read as the conclusion of what the viewer just watched, not a new section. Tie its copy back to the sequence they saw: paper, photo, organised, shared. Active voice on the button, and the same verb carries through to whatever happens next.

**Acceptance:**
- [ ] Progress bar tracks whole-page scroll smoothly, uses the exact cyan token.
- [ ] Bar stays out of the way of content on mobile.
- [ ] CTA copy references the journey rather than restating features.

---

## Direction

The whole page should read as one continuous product story:

**Paper receipt → captured → digital information → organised → visible → shared with the accountant → start now**

Prefer slow transformation, morphing, fading, scaling, and elements moving into one another. Avoid fast object swaps, instant appearances, simultaneous competing animations, and floating UI clutter.

The governing principle: **make fewer things happen, and make each one happen beautifully.** If an element does not move the story forward, remove it. If two stages can become one smooth transition, combine them. Do not solve a storytelling problem by adding another animation.
