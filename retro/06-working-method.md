# Working method

How the work itself went right and wrong.

## Assert on every string substitution

A `.replace()` that matches nothing fails silently and leaves the file valid but
wrong. On this project that produced undefined CSS custom properties (hover
states going transparent) and undefined GLSL uniforms (throwing every frame).

```python
def sub(old, new):
    assert s.count(old) == 1, f"expected 1 match, got {s.count(old)}: {old[:70]!r}"
    s = s.replace(old, new)
```

**Build the whole new string, then write once at the end.** A failed assert
then changes nothing on disk, and a partially-applied batch never exists. This
saved several edits from landing half-done, including one where five of six
substitutions matched.

Whitespace is the usual cause of a failed match. Print the real text and copy
from it rather than retyping.

## Never edit by offsets you have not just verified

A backwards slice (`s[:start] + s[end:]` with `end < start`) mangled a 900-line
file. Recovered with `git checkout --`, but only because it was committed.

**Commit before any structural edit**, and prefer removing a rule by matching
its text over cutting by line number.

## Verify by executing, never by reading

Every real defect on this project was found by running the page, and several
non-defects were "found" by reading it. Reading tells you what the code says;
only running tells you what it does.

The corollary: when you cannot look at something (a shader, or images you have
run out of budget to view), find a numeric proxy that would fail if the thing
were wrong. Scanlines across a shape proved the folder redesign had one
continuous outline and no doubled edge, which is a stronger claim than "it
looks right".

## Do not explain away an anomaly

"The spreadsheet does not render, but it is probably the software renderer."
That sentence cost the most time on this project. The shader was failing to
link.

An anomaly you have explained without evidence is an anomaly you have hidden.

## Measure the thing you are about to change, then again after

Twice I "fixed" something and reported it fixed on the strength of a reading
that was itself broken. Both times a second, differently-constructed
measurement disagreed. Cross-check with a different instrument before
reporting, especially when the result is what you hoped for.

## Report the failed readings too

I reported "the bars are still visible behind the CTA" and "the tail fix did
not work", both of which were harness errors. Saying so plainly costs one
sentence and stops the other person acting on a phantom.

## Agents

- **The agent registry loads at session start.** A brief written mid-session
  cannot be invoked by name until the next session. Inline the brief into a
  general-purpose agent instead; it works identically.
- **Give every agent the measurement traps in its brief.** The ones written
  without the settle-time warning produced exactly the false readings the
  warning describes. The ones written with it did not.
- **Background agents die on session and credit limits.** Six launched at once
  all died mid-run. Launch fewer, or accept losing them.
- **Specialised roles found different things**, and the split was real: the UX
  engineer found focus and timing defects, the copywriter found a factual
  contradiction in the product claim. Neither would have found the other's.
- **Do not take an agent's fix on faith.** The UX engineer's veil-widening fix
  was measured and broke the contrast invariant; the correct fix was to
  lengthen the crossing instead. Their *diagnosis* was right and their
  *prescription* was wrong, which is the normal case.

## Write down what depends on what

The costliest structural surprises were all invisible dependencies:

- Beat timings are fractions of a container height, so any section's height
  moves every beat.
- The theme's light values are declared in **two** places (`:root` and the
  JS interpolation table) and must not drift.
- The veil ramps are fitted to a contrast band that moves whenever the ground
  colour changes.
- `tail + footer < viewport / 2`, or the closing chapter blanks itself.

None of these are guessable from the code. Each is now a comment at the site of
the number, which is the only place someone will read it.

## Commit messages are the retro

Write what was wrong and how you know, with the measured values. A commit
saying "fix folder overlap" is worth nothing in three weeks; one saying "the
closing copy takes the screen at p=0.92, measured, and the folders were holding
until 0.958" reconstructs the whole problem.
