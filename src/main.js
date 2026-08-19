/* Page wiring: scroll reveals, sticky-nav hairline, and the scroll-scrubbed
   WebGL act with its static fallbacks. */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- reveal on scroll ---------- */
{
  const items = document.querySelectorAll(".reveal");
  items.forEach((el) => el.style.setProperty("--d", el.dataset.delay || 0));

  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target); // fire once
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el) => io.observe(el));
  }
}

/* ---------- nav hairline ---------- */
{
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 40);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}

/* ---------- the act ---------- */
(async function act() {
  const section = document.getElementById("act");
  const canvas = document.getElementById("gl");
  const poster = document.getElementById("poster");
  const caps = [...document.querySelectorAll(".act__cap")];

  // Decide up front whether this device should run WebGL at all. A weak
  // machine gets the poster rather than a stuttering canvas.
  const weak = (navigator.hardwareConcurrency || 4) <= 2;
  const supported = (() => {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch { return false; }
  })();

  const showPoster = () => {
    canvas.remove();
    poster.hidden = false;
    section.classList.add("is-static");
    caps[0]?.classList.add("is-on");
  };

  if (!supported || weak) return showPoster();

  let scene;
  try {
    const { createAct } = await import("./gl/receipt.js");
    scene = createAct(canvas);
  } catch (err) {
    console.warn("[bx] WebGL act unavailable:", err);
  }
  if (!scene) return showPoster();

  scene.resize();

  // Progress through the pinned section, 0 at its top, 1 when its tail
  // reaches the top of the viewport.
  const progress = () => {
    const r = section.getBoundingClientRect();
    const travel = r.height - innerHeight;
    if (travel <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / travel));
  };

  const setCaption = (p) => {
    const i = p < 0.34 ? 0 : p < 0.68 ? 1 : 2;
    caps.forEach((c, n) => c.classList.toggle("is-on", n === i));
  };

  // Reduced motion keeps the story — it is scrubbed 1:1 by the reader's own
  // scrolling, not autoplayed — but loses the inertial easing, so nothing
  // carries on moving after the finger stops. Rendering a single frozen frame
  // here instead (the previous behaviour) just looked broken on any phone with
  // iOS "Reduce Motion" switched on.
  const EASE = reduceMotion ? 1 : 0.12;

  let target = progress();
  let current = target;
  let running = true;
  let queued = false;

  const loop = () => {
    if (!running) return;
    // Ease toward the scroll position so trackpad jitter doesn't show.
    current += (target - current) * EASE;
    scene.apply(current);
    scene.render();
    if (Math.abs(target - current) > 0.0005) {
      requestAnimationFrame(loop);
    } else {
      queued = false;
    }
  };

  const kick = () => {
    if (queued || !running) return;
    queued = true;
    requestAnimationFrame(loop);
  };

  addEventListener("scroll", () => { target = progress(); setCaption(target); kick(); }, { passive: true });
  addEventListener("resize", () => { scene.resize(); target = progress(); kick(); }, { passive: true });

  // Don't burn frames on a hidden tab.
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { queued = false; kick(); }
  });

  setCaption(target);
  scene.apply(current);
  scene.render();
})();
