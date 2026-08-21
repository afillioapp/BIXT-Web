/* Page wiring: the scroll progress bar, chapter activation, and the fixed
   WebGL story driven by how far you are through the story section. */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ---------- hero + FAQ reveals ---------- */
{
  const items = document.querySelectorAll(".reveal");
  items.forEach((el) => el.style.setProperty("--d", el.dataset.delay || 0));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }
}

/* ---------- chapters take the stage as they arrive ---------- */
{
  const chapters = document.querySelectorAll(".ch");
  if (!("IntersectionObserver" in window)) {
    chapters.forEach((c) => c.classList.add("is-on"));
  } else {
    const io = new IntersectionObserver((es) => {
      for (const e of es) e.target.classList.toggle("is-on", e.isIntersecting);
    }, { rootMargin: "-50% 0px -50% 0px" });
    chapters.forEach((c) => io.observe(c));
  }
  // The hero is already on screen at load; don't make it wait for a scroll.
  document.querySelector(".ch--hero")?.classList.add("is-on");
}

/* ---------- the app screens ---------- */
{
  const track = document.getElementById("shots");
  const dots = document.getElementById("dots");
  if (track && dots) {
    const slides = [...track.querySelectorAll(".phone__shot")];
    // Hidden below 700px, where clientWidth is 0 and every index here would
    // divide by it.
    const usable = () => track.clientWidth > 0;
    const go = (i) => {
      if (!usable()) return;
      track.scrollTo({ left: track.clientWidth * i, behavior: reduceMotion ? "auto" : "smooth" });
    };

    slides.forEach((img, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Screen ${i + 1} of ${slides.length}`);
      b.setAttribute("aria-current", i === 0 ? "true" : "false");
      b.addEventListener("click", () => { stop(); go(i); });
      dots.append(b);
    });
    const buttons = [...dots.children];
    const mark = (i) => buttons.forEach((b, j) =>
      b.setAttribute("aria-current", j === i ? "true" : "false"));

    // Which slide is under the middle of the track is the one showing.
    let raf = 0;
    track.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (usable()) mark(Math.round(track.scrollLeft / track.clientWidth));
      });
    }, { passive: true });

    /* It advances on its own, but only while it is actually on screen and
       nobody is touching it, and never for a reader who asked for less
       motion. */
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const start = () => {
      if (timer || reduceMotion || !usable()) return;
      timer = setInterval(() => {
        go((Math.round(track.scrollLeft / track.clientWidth) + 1) % slides.length);
      }, 4200);
    };
    for (const ev of ["pointerenter", "focusin", "pointerdown"]) track.addEventListener(ev, stop);
    dots.addEventListener("pointerenter", stop);
    track.addEventListener("pointerleave", start);
    dots.addEventListener("pointerleave", start);
    track.addEventListener("focusout", start);

    const chapter = track.closest(".ch");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(() => (chapter.classList.contains("is-on") ? start() : stop()),
        { rootMargin: "-50% 0px -50% 0px" }).observe(chapter);
    } else start();
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  }
}

/* ---------- the story ---------- */
(async function story() {
  const bar = document.getElementById("bar");
  const storyEl = document.getElementById("story");
  const canvas = document.getElementById("gl");
  const poster = document.getElementById("poster");

  /** How far through the whole document, for the bottom bar. */
  const pageProgress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp01(window.scrollY / max) : 0;
  };

  /** How far through the story chapters, for the scene. */
  const storyProgress = () => {
    const r = storyEl.getBoundingClientRect();
    const travel = r.height - innerHeight;
    return travel > 0 ? clamp01(-r.top / travel) : 0;
  };

  const paintBar = (p) => { bar.style.transform = `scaleX(${p})`; };
  paintBar(pageProgress());

  const weak = (navigator.hardwareConcurrency || 4) <= 2;
  const supported = (() => {
    try { const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
  })();

  const showPoster = () => {
    canvas.remove();
    poster.hidden = false;
    // Without the scene there is nothing to scrub, so the chapters do not
    // need their extra scroll length.
    document.querySelectorAll(".ch").forEach((c) => { c.style.minHeight = "100svh"; });
    addEventListener("scroll", () => paintBar(pageProgress()), { passive: true });
  };

  if (!supported || weak) return showPoster();

  let scene;
  try {
    const { createStory } = await import("./gl/story.js");
    scene = createStory(canvas);
  } catch (err) {
    console.warn("[bx] story unavailable:", err);
  }
  if (!scene) return showPoster();

  scene.resize();

  let target = storyProgress();
  let current = target;
  let running = true;
  let queued = false;

  // Reduced motion keeps the story — it is scrubbed 1:1 by the reader's own
  // scrolling — but drops the inertia so nothing glides after they stop.
  const EASE = reduceMotion ? 1 : 0.1;
  let lastT = performance.now();

  const loop = () => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(64, now - lastT);
    lastT = now;
    // 0.1 per 16.7ms expressed as a rate, so 10fps and 120Hz settle alike.
    const k = reduceMotion ? 1 : 1 - Math.pow(1 - EASE, dt / 16.667);
    current += (target - current) * k;
    paintTheme(current);
    scene.apply(current);
    scene.render();
    if (Math.abs(target - current) > 0.0004) requestAnimationFrame(loop);
    else queued = false;
  };
  const kick = () => { if (queued || !running) return; queued = true; requestAnimationFrame(loop); };

  /* The ground carries the meaning: paper while the receipt is still paper,
     dark once it has been photographed. So it is not a class that flips at a
     section boundary — it is the light and dark token sets interpolated on the
     same scrubbed progress value that drives the capture itself. Scroll back
     up and the page returns to paper in step with the receipt.

     [light L,C,H,alpha] -> [dark L,C,H,alpha]. oklch interpolates cleanly,
     which is the reason the palette is written in it. --footer-* are absent on
     purpose: the footer never inverts. */
  const THEME = {
    "--paper":      [[0.945, 0.005, 265, 1], [0.205, 0.035, 264, 1]],
    "--paper-pure": [[0.985, 0.003, 265, 1], [0.260, 0.035, 264, 1]],
    "--ink":        [[0.220, 0.040, 264, 1], [0.970, 0.005, 260, 1]],
    "--ink-soft":   [[0.420, 0.030, 264, 1], [0.800, 0.015, 260, 1]],
    "--ink-faint":  [[0.505, 0.022, 264, 1], [0.685, 0.020, 260, 1]],
    "--rule":       [[0.900, 0.008, 260, 1], [1.000, 0.000, 0,   0.16]],
    "--cyan-deep":  [[0.460, 0.085, 195, 1], [0.800, 0.100, 190, 1]],
  };

  /* The hinge, and the same window story.js gives paperMat.uInvert: the
     ground turns over on precisely the scroll the receipt turns over on, so
     they are one movement. Keep these two in sync if either moves. The beats
     leading in are the frame locking (0.44), the flash (0.49) and the cyan
     sweep (0.50), so this begins well inside the capture. */
  const DARK_FROM = 0.520, DARK_TO = 0.580;
  const bodyStyle = document.body.style;
  let lastMix = -1;

  const smooth = (v) => { const c = clamp01(v); return c * c * (3 - 2 * c); };

  const paintTheme = (sp) => {
    const t = clamp01((sp - DARK_FROM) / (DARK_TO - DARK_FROM));
    const mix = smooth(t);                      // the scene's own smoothstep
    // Outside the crossing this settles and stops touching the cascade.
    if (Math.abs(mix - lastMix) < 0.002) return;
    lastMix = mix;

    /* Inverting a page continuously means the ground must pass through the
       lightness the text is already sitting at: measured at the midpoint, body
       copy hits 1.03:1 and is effectively invisible. So the words stand down
       through the hinge and come back on the other side, which is also the
       better reading of the moment. Anywhere contrast is unacceptable the veil
       has taken the text below 0.15, so it reads as absent rather than as
       something you ought to be able to read. */
    const veil = 1 - smooth(mix / 0.034) * (1 - smooth((mix - 0.88) / 0.08));
    bodyStyle.setProperty("--veil", veil.toFixed(4));
    for (const key in THEME) {
      const [a, b] = THEME[key];
      const L = a[0] + (b[0] - a[0]) * mix, C = a[1] + (b[1] - a[1]) * mix;
      const H = a[2] + (b[2] - a[2]) * mix, A = a[3] + (b[3] - a[3]) * mix;
      bodyStyle.setProperty(key,
        `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)}` +
        (A < 0.999 ? ` / ${A.toFixed(3)}` : "") + `)`);
    }
  };
  paintTheme(target);

  addEventListener("scroll", () => {
    target = storyProgress();
    paintBar(pageProgress());
    kick();
  }, { passive: true });

  addEventListener("resize", () => { scene.resize(); target = storyProgress(); kick(); }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    // Without this the first frame back from a background tab sees the whole
    // time it spent hidden and jumps.
    if (running) { lastT = performance.now(); queued = false; kick(); }
  });

  scene.apply(current);
  scene.render();
})();
