# Retro: building the Bixt site

Written 2026-08-20, after building a scroll-driven WebGL marketing site from an
empty folder. Read this before starting the next one.

## Why this exists

Almost everything expensive on this build fell into one of two categories:

1. **A measurement that agreed with itself but not with reality.** Every one of
   these produced a confident, wrong conclusion. Two of them nearly shipped a
   regression, and several sent me chasing bugs that did not exist.
2. **A structural decision that only revealed its cost later.** One uniform
   doing three jobs, keyframes hardcoded as fractions of a container's height,
   a token changed without re-fitting what depended on it.

Neither is fixed by being more careful. They are fixed by knowing the specific
traps in advance, which is what these files are for.

## The files

| File | Read it when |
|---|---|
| [01-verification.md](01-verification.md) | Before you write any script that measures a page. This is the most valuable file here. |
| [02-scroll-story-architecture.md](02-scroll-story-architecture.md) | Before designing a scroll-scrubbed WebGL story. |
| [03-css-layout.md](03-css-layout.md) | When layout does something inexplicable. |
| [04-accessibility.md](04-accessibility.md) | Before shipping anything with fixed-position content or a carousel. |
| [05-copy.md](05-copy.md) | Before writing or reviewing site copy. |
| [06-working-method.md](06-working-method.md) | How to run the work itself: edits, agents, verification discipline. |
| [PRE-SHIP-CHECKLIST.md](PRE-SHIP-CHECKLIST.md) | The short version. Run through it before calling anything done. |

## The one-paragraph version

Verify by executing, never by reading. Rasterise colours rather than parsing
them. Walk the scroll like a reader instead of teleporting. Prove a value has
converged, not merely that it stopped changing. Name every shader. Assert on
every string substitution. Give each animated thing its own uniform. Write down
which numbers depend on which other numbers, because the next person to change
a colour will not guess that it moves an accessibility threshold.
