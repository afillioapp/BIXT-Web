# Copy

## Check the page against itself

The hero said "snap it, **send it**" and the closing body said Bixt "**shares
it**". Chapter eight closed on "**Nothing to send**", and the entire product
claim is that nothing is ever sent, shared or exported, because the accountant
already has read-only access to a folder the owner owns.

The page spent eight beats removing a thing its first line promised. Nobody
caught it for weeks because each line is fine in isolation.

**Read every line of a page in one list, in order, looking only for claims that
contradict each other.** It takes ten minutes and it is the highest-value copy
review available.

## A CTA that names an action needs somewhere to go

"Take the first photo" linked to `#top`. The one imperative on the site
scrolled the reader back to the hero. Either the verb has a destination or the
button should say what it can honestly do.

Related and worth catching early: every link on the site was an in-page anchor.
There was no signup, no app link, no capture of any kind. That is a product
decision, but it should be a *deliberate* one rather than something discovered
at the end.

## Measure the line-break band, do not guess it

The brief assumed a two-line subhead was 70 to 96 characters. Measured against
the real `.measure` (30ch, computing to 321px), the band was **46 to 88**.
Under ~45 it collapsed to one line, over ~88 it went to three.

Because the measure is in `ch`, that band is identical at every viewport, so
one measurement settles it for all of them.

```js
const lines = Math.round(el.getBoundingClientRect().height / lineHeight);
```

## The actor must not change

"**We** read the date, vendor, total and tax" was the only place a company
appeared. Everywhere else the actor is the product: "Bixt files it". Small, but
it is the difference between a tool and a vendor.

## Titles that could belong to any product

"Track your spending" over "a dashboard that fills itself in" would sit on any
finance app. "What August cost" is the same information as something the reader
wants. Prefer the number over the feature.

Also: if the title says "Two folders", the body should not immediately talk
about a spreadsheet. Count nouns have to line up.

## Docs drift, and drifted docs actively mislead

`docs/copy.md` described a nav link that did not exist, a button label that had
changed, an eight-beat story order that never shipped, and instructed writers
to name the model, which contradicted the rule stated ten lines above it.

A stale spec is worse than no spec: someone will follow it. Either update it in
the same commit as the change, or delete it.

## Rules worth keeping

- Titles three words or fewer, one keyword accented.
- No em dashes.
- Never name the model. The product does the reading.
- The logotype is a mark, not a word: `BX` in the wordmark, favicon and folder
  prefix; **Bixt** in every sentence.
- Banned: seamless, leverage, empower, streamline, effortless, AI-powered,
  solution, platform, ecosystem, unlock, supercharge, robust, cutting-edge.
- Invent nothing. No customers, testimonials, logos or statistics before they
  exist.
