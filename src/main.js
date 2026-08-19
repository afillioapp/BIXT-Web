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
    }, { rootMargin: "-28% 0px -28% 0px" });
    chapters.forEach((c) => io.observe(c));
  }
  // The hero is already on screen at load; don't make it wait for a scroll.
  document.querySelector(".ch--hero")?.classList.add("is-on");
}

/* ---------- nav hairline ---------- */
{
  const nav = document.getElementById("nav");
  const on = () => nav.classList.toggle("is-stuck", window.scrollY > 40);
  on();
  addEventListener("scroll", on, { passive: true });
}

/* ---------- the story ---------- */
(async function story() {
  const bar = document.getElementById("bar");
  const progressEl = document.getElementById("progress");
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

  const paintBar = (p) => {
    bar.style.transform = `scaleX(${p})`;
    progressEl.setAttribute("aria-valuenow", Math.round(p * 100));
  };
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

  const loop = () => {
    if (!running) return;
    current += (target - current) * EASE;
    scene.apply(current);
    scene.render();
    if (Math.abs(target - current) > 0.0004) requestAnimationFrame(loop);
    else queued = false;
  };
  const kick = () => { if (queued || !running) return; queued = true; requestAnimationFrame(loop); };

  // Chapters 05 to 07 run dark, then the page returns to paper for the
  // call to action.
  const paintTheme = (sp) =>
    document.body.classList.toggle("is-dark", sp > 0.475 && sp < 0.855);
  paintTheme(target);

  addEventListener("scroll", () => {
    target = storyProgress();
    paintTheme(target);
    paintBar(pageProgress());
    kick();
  }, { passive: true });

  addEventListener("resize", () => { scene.resize(); target = storyProgress(); kick(); }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { queued = false; kick(); }
  });

  scene.apply(current);
  scene.render();
})();
