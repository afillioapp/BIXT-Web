# Architecture of a scroll-scrubbed WebGL story

What the shape of this thing should have been from the start.

## The shape that worked

One fixed canvas behind, chapters of copy in front, and **a single 0..1
progress value** derived from the story container driving everything:

```js
const storyProgress = () => {
  const r = storyEl.getBoundingClientRect();
  const travel = r.height - innerHeight;
  return travel > 0 ? clamp01(-r.top / travel) : 0;
};
```

Every beat is then a `range(p, a, b)` against that one number. No animation
library, no timeline object. This part was right and I would do it again.

## Name every ShaderMaterial

**The single most expensive bug on this project.** The spreadsheet did not
render for days. I inspected the code, saw it was correct, and concluded it was
a SwiftShader artifact. It was not: the shader was failing to link, which
renders nothing and logs nothing you would notice.

It was only found once every material carried a `name:`. The fix was to stop
using a custom shader there at all and draw the sheet as a `MeshBasicMaterial`
with a canvas texture.

Two lessons, and the second matters more:

- `new ShaderMaterial({ name: "sheet", ... })` on every single material.
- **Do not explain away a rendering anomaly as a platform artifact.** "It is
  probably the software renderer" is the shape of a wrong answer. Prove it.

## Nothing validates your GLSL

Shaders are template strings. The bundler parses none of it, so `npm run build`
passes with a syntax error in the shader and you find out at runtime, where a
failed link renders nothing at all.

Two ways I broke it in ten minutes:

- `vec2(a, b, 0.0)` — a three-argument `vec2`. Build clean, shader dead.
- Replacing a block that happened to contain the `reveal` declaration used four
  lines below it. Build clean, shader dead.

Cheap guards that would have caught both, run at edit time:

```python
assert not re.findall(r"vec2\(\s*[^();]*?,[^();]*?,[^();]*?\)", src)   # arity
for name in ["reveal", "core", "glow", ...]:                            # declared?
    assert re.search(rf"\b(float|vec2|vec3|uniform float|varying float)\b[^;]*\b{name}\b", frag)
```

And always read the console after a shader edit: the error names the line.

## One uniform, one job

`uDraw` ended up driving three unrelated things: the folder outline's reveal,
the bar chart's growth, and the link rule's extension. That forced a piecewise
expression:

```js
// what one shared uniform does to you
uDraw = p < 0.690 ? ease(range(p, 0.630, 0.686))
      : p < 0.800 ? ease(range(p, 0.704, 0.762))
                  : ease(range(p, 0.812, 0.870));
```

Worse than ugly: **one element cannot rest while another moves**, because they
read the same number. That is what made folders/spending/accountant read as
three unrelated scenes instead of one continuous one. Splitting into `uDraw`,
`uGrow` and later `uSpend`/`uStack` fixed the storytelling problem, not just
the code.

## Keyframes are fractions, so heights are load-bearing

Every beat is a hardcoded fraction of the story container's scrollable travel.
Change any section's height and **every beat moves**.

This made otherwise trivial edits expensive: shortening the closing section
would have shifted the capture, the inversion and the veil all at once. Twice I
chose a worse layout because retuning the whole timeline was not worth it.

Next time, one of:

- Derive beat boundaries from measured section offsets rather than literals.
- Or fix the section heights early and treat them as API.

At minimum, write the dependency down where someone will see it.

## Instanced geometry is static; animate around it

Per-instance attributes are uploaded once. To move an arrangement you either
rewrite the buffer or transform the whole mesh. Scaling the parent
(`folders.scale.setScalar(fit)`) scales positions *and* sizes together, which
is exactly right for fitting a fixed arrangement into a variable frame.

## Two geometry mistakes worth knowing

**A bar grows from its own bottom edge.** Giving every bar the same centre `y`
with different heights puts each one on a different baseline. Offset the centre
by half the height:

```js
const bar = (x, h) => [x, BASE + h / 2, WIDTH, h, KIND, PHASE];
```

**Outline the union, not the parts.** A folder drawn as a body outline plus a
tab outline draws a doubled line where they meet. Union the distances first,
then take the outline of the result:

```glsl
float d = abs(min(body, tab));   // one continuous silhouette
```

**And normalise a reveal over the whole silhouette.** A bottom-up wipe
normalised over the body height sliced the tab flat, because the tab sits above
the body and normalises past 1.0.

## Dead code that renders nothing still costs everything

An alpha of `0.0 * range(...)` kept 2,800 particles, five formation buffers and
a per-segment attribute upload running every frame, drawing nothing, for weeks.
Removing it took 4kB off the bundle and let Three tree-shake two more classes.

**Grep for uniforms multiplied by literal zero.** They are the fossil record of
a design that changed.

## Fitting a fixed arrangement into a variable frame

Constraining the canvas to the content column made its aspect roughly square on
desktop but very tall on a phone, where a side-by-side arrangement simply does
not fit. Rather than let it clip, derive a fit factor:

```js
fit = Math.min(1, (FOV_TAN * camera.position.z * camera.aspect) / DESIGN_HALF_W);
```

and multiply every horizontal offset and the arrangement's scale by it. Small
and fully visible beats correct and cut off.

## Bind the ground to the art, not to a section

The page's light/dark inversion was originally a class toggled at a scroll
threshold with a 1200ms CSS transition. It fired a chapter and a half before
the receipt was photographed, so the ground carried no meaning.

Interpolating the tokens on the same scrubbed value the scene runs on, over
exactly the window the receipt inverts in, makes it feel like one movement and
makes it reversible for free. **A CSS transition then fights the scrub and must
be removed.**

```js
// per frame, from the same eased value the scene uses
const t = clamp01((sp - DARK_FROM) / (DARK_TO - DARK_FROM));
const mix = t * t * (3 - 2 * t);
```

## A continuous inversion always has a contrast hole

This is a property of the idea, not a bug to tune away. If the ground travels
from light to dark continuously, it **must** pass through the lightness the
text occupies. Measured at the midpoint: body copy at 1.03:1.

You get three options and no fourth:

1. Fade the copy out across the crossing and back in.
2. Make the crossing instant, which is the thing you were trying to avoid.
3. Accept unreadable text.

We took (1), with a second multiplying opacity applied as `filter: opacity()`
so it composes with the arrival fade instead of overwriting it.

**The crossing must be long enough to fade across.** With a short crossing the
fade is a blink; widening the fade alone leaves text legible at 3.4:1, which is
worse than absent. Lengthening the crossing itself is the fix.

**And the failing band moves when you change any colour.** Softening the page
white from `#f3f5f9` to `#ebedf0` dropped `--ink-faint` from 5.39 to 5.00 and
widened the failing band from `[0.06, 0.88]` to `[0.036, 0.876]`, silently
breaking the fit. Compute the band, do not guess it:

```
for mix in 0..1: worst = min(contrast(token, ground(mix)) for each text token)
band = the range where worst < 4.5
require: veil ≈ 0 across the whole band
```

## Frame-rate-independent easing

A fixed lerp per frame gives a different response at every frame rate: the same
`0.1` settled in ~550ms at 60fps and ~3.3s at 10fps. The art trailed the finger
on a slow machine and snapped on a fast one.

```js
const dt = Math.min(64, now - lastT);
const k = 1 - Math.pow(1 - EASE, dt / 16.667);
current += (target - current) * k;
```

Reset `lastT` on `visibilitychange`, or the first frame back from a background
tab sees the whole hidden interval and jumps.
