/* One continuous scroll-told story, drawn behind the whole page.

   The scene is a single paper receipt, a cloud of out-of-focus receipts
   behind it, and one spreadsheet. The receipt is found, photographed and
   turned over into the dark; the sheet writes itself out of it and keeps
   writing, cell by cell, for as long as the reader keeps scrolling; the month
   totals and becomes a picture of the spending; both are handed over.

   The receipt is a shader on a plane and the sheet is a 2D canvas uploaded as
   a texture, because the sheet's whole point is that it carries real dates and
   real numbers. Nothing here animates on a clock: every value below is a
   function of scroll position, so the story runs backwards as cleanly as it
   runs forwards. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
  InstancedBufferGeometry, InstancedBufferAttribute, IcosahedronGeometry,
  ShaderMaterial, MeshBasicMaterial, Mesh, Color, AdditiveBlending, Vector2, CanvasTexture, SRGBColorSpace,
} from "three";

const rnd = (a, b) => a + Math.random() * (b - a);

const INK = new Color("#111a2d");
const CYAN = new Color("#009b95");
const W = 1.55, H = 4.15;

/* ---------- paper ---------- */

const PAPER_VERT = /* glsl */ `
  uniform float uCrumple;
  varying vec2 vUv;
  varying float vShade;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vUv = uv;
    vec3 p = position;
    float n  = noise(uv * 4.0) * 2.0 - 1.0;
          n += (noise(uv * 9.0) * 2.0 - 1.0) * 0.5;
    float z = n * 0.13 * uCrumple;
    p.z += z; vShade = z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const PAPER_FRAG = /* glsl */ `
  uniform float uScan, uFade, uShutter, uWipe, uCyanHold, uInvert, uExtract;
  uniform vec3 uInk, uCyan;
  varying vec2 vUv; varying float vShade;

  // A horizontal rule from x0..x1 at height y, half-thickness h.
  float rule(vec2 uv, float y, float x0, float x1, float h) {
    return smoothstep(h, 0.0, abs(uv.y - y)) * step(x0, uv.x) * step(uv.x, x1);
  }
  // Same, but broken into dashes.
  float dashed(vec2 uv, float y, float x0, float x1, float h) {
    float on = step(0.5, fract(uv.x * 42.0));
    return rule(uv, y, x0, x1, h) * on;
  }

  void main() {
    // Same receipt throughout: only the palette inverts, so the reader keeps
    // recognising the paper they were just looking at.
    vec3 stock = mix(vec3(0.972, 0.974, 0.968), vec3(0.052, 0.078, 0.125), uInvert);
    vec3 inkc  = mix(uInk, vec3(0.93, 0.95, 0.97), uInvert);
    vec3 cyanc = mix(uCyan, vec3(0.28, 0.86, 0.79), uInvert);
    vec3 paper = stock * (1.0 - vShade * mix(0.85, 0.45, uInvert));
    float ink = 0.0;

    // Merchant name, then two small header lines.
    ink += rule(vUv, 0.940, 0.22, 0.78, 0.0125);
    ink += rule(vUv, 0.893, 0.28, 0.72, 0.0035);
    ink += rule(vUv, 0.862, 0.30, 0.70, 0.0035);
    ink += dashed(vUv, 0.815, 0.10, 0.90, 0.0020);

    // Line items: a description on the left, a price on the right.
    for (int i = 0; i < 7; i++) {
      float y = 0.762 - float(i) * 0.0475;
      float w = 0.26 + mod(float(i), 3.0) * 0.11;
      ink += rule(vUv, y, 0.12, 0.12 + w, 0.0030);
      ink += rule(vUv, y, 0.985 - 0.145, 0.985, 0.0030);
    }

    ink += dashed(vUv, 0.398, 0.10, 0.90, 0.0020);
    ink += rule(vUv, 0.352, 0.12, 0.34, 0.0030);   // subtotal
    ink += rule(vUv, 0.352, 0.84, 0.985, 0.0030);
    ink += rule(vUv, 0.310, 0.12, 0.30, 0.0030);   // tax
    ink += rule(vUv, 0.310, 0.84, 0.985, 0.0030);

    vec3 col = mix(paper, inkc, clamp(ink, 0.0, 1.0) * 0.80);

    // The total is the one line that carries colour.
    float total = rule(vUv, 0.246, 0.12, 0.40, 0.0090)
                + rule(vUv, 0.246, 0.74, 0.985, 0.0090);
    col = mix(col, cyanc, clamp(total, 0.0, 1.0) * 0.95);

    // Barcode.
    float bars = step(0.45, fract(vUv.x * 38.0)) * step(0.115, vUv.y) * step(vUv.y, 0.165)
               * step(0.20, vUv.x) * step(vUv.x, 0.80);
    col = mix(col, inkc, bars * 0.72);

    // What we actually read off it, once the capture has landed.
    // The two fields Bixt took off it, highlighted where they sit.
    float ex = rule(vUv, 0.246, 0.10, 0.99, 0.026) + rule(vUv, 0.940, 0.20, 0.80, 0.030);
    col = mix(col, cyanc, clamp(ex, 0.0, 1.0) * uExtract * 0.55);

    if (uScan >= 0.0) {
      float d = abs(vUv.y - (1.0 - uScan));
      col = mix(col, uCyan, smoothstep(0.085, 0.0, d) * 0.24 + smoothstep(0.009, 0.0, d) * 0.8);
    }

    // Torn off the roll: a ragged bottom edge, clean sides.
    float tear = 0.020 + 0.016 * abs(fract(vUv.x * 11.0) - 0.5) * 2.0;
    if (vUv.y < tear) discard;

    // The cyan takes the paper: a front sweeps down it, holds the whole
    // receipt, blows out, then lets go as the inverted receipt arrives.
    float front = 1.0 - uWipe;
    float wipe = smoothstep(front - 0.045, front + 0.045, vUv.y) * uCyanHold;
    float lead = smoothstep(0.05, 0.0, abs(vUv.y - front))
               * uCyanHold * step(0.002, uWipe) * step(uWipe, 0.998);
    float cy = clamp(max(wipe, uShutter), 0.0, 1.0);
    col = mix(col, uCyan, cy * 0.96);
    col += uCyan * lead * 0.40;
    col = mix(col, vec3(1.0), uShutter * 0.34);

    float edge = smoothstep(0.0, 0.030, vUv.x) * smoothstep(1.0, 0.970, vUv.x)
               * smoothstep(1.0, 0.988, vUv.y);
    gl_FragColor = vec4(col, min(1.0, uFade + max(cy, uShutter) * 0.9) * edge);
  }
`;

/* ---------- the pile: many receipts, out of focus ---------- */

const CROWD = 44;

const CROWD_VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aScale;
  attribute float aSeed;
  attribute vec3 aSpin;
  uniform float uCull, uAlpha;
  varying float vA, vSeed, vShade, vRim;
  varying vec3 vN;
  varying vec3 vView;

  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i), n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
  }

  mat3 rot(vec3 a) {
    float cx=cos(a.x), sx=sin(a.x), cy=cos(a.y), sy=sin(a.y), cz=cos(a.z), sz=sin(a.z);
    return mat3(cy*cz, -cy*sz, sy,
                sx*sy*cz + cx*sz, -sx*sy*sz + cx*cz, -sx*cy,
                -cx*sy*cz + sx*sz, cx*sy*sz + sx*cz, cx*cy);
  }

  void main() {
    vSeed = aSeed;
    vA = uAlpha * step(uCull, aSeed);

    // Screw the sphere up: layered noise pushed along the normal, so the
    // silhouette itself goes lumpy the way a balled-up receipt does.
    vec3 n = normalize(position);
    // Ridged noise: the abs() folds turn smooth lumps into creases, which is
    // what separates crumpled paper from a blob.
    float r1 = 1.0 - abs(noise(n * 2.7 + aSeed * 41.0) * 2.0 - 1.0);
    float r2 = 1.0 - abs(noise(n * 5.9 + aSeed * 17.0) * 2.0 - 1.0);
    float r3 = 1.0 - abs(noise(n * 11.3 + aSeed * 7.0) * 2.0 - 1.0);
    float d = (r1 - 0.5) + (r2 - 0.5) * 0.55 + (r3 - 0.5) * 0.28;
    vShade = d;

    vec3 p = n * (0.5 + d * 0.52) * aScale;
    p = rot(aSpin) * p;

    // Creases facing the light catch it; the rim softens the edge.
    vec3 wn = normalize(rot(aSpin) * n);
    vN = wn;
    vRim = 1.0 - abs(wn.z);
    vec4 mv = modelViewMatrix * vec4(p + aOffset, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const CROWD_FRAG = /* glsl */ `
  varying float vA, vSeed, vShade, vRim;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    if (vA < 0.01) discard;

    // White paper on a near-white ground only reads if it has real form, so
    // light it properly: a key from upper left, creases darkened, and the
    // whole thing flattened the further back it sits.
    float soft = 0.30 + vSeed * 0.42;
    // Facet normals from screen-space derivatives: paper folds are flat
    // planes meeting at hard edges, not a smooth surface.
    vec3 fn = normalize(cross(dFdx(vView), dFdy(vView)));
    vec3 L = normalize(vec3(-0.45, 0.72, 0.52));
    float lam = clamp(dot(fn, L) * 0.5 + 0.5, 0.0, 1.0);
    float crease = clamp(vShade, -0.5, 0.5);

    float lit = 0.52 + 0.48 * lam - crease * 0.30;
    lit = mix(lit, 0.93, soft * 0.55);                 // distance washes it out
    vec3 col = vec3(0.99, 0.99, 1.0) * clamp(lit, 0.55, 1.02);

    float a = vA * (0.92 - vSeed * 0.34) * (1.0 - vRim * 0.22);
    gl_FragColor = vec4(col, a);
  }
`;

function buildCrowd() {
  const base = new IcosahedronGeometry(1, 3);          // enough vertices to crumple
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.uv = base.attributes.uv;
  g.instanceCount = CROWD;

  const off = new Float32Array(CROWD * 3);
  const scl = new Float32Array(CROWD);
  const sed = new Float32Array(CROWD);
  const spin = new Float32Array(CROWD * 3);
  for (let i = 0; i < CROWD; i++) {
    // Clustered at the centre rather than spread evenly: three samples
    // averaged pulls the distribution toward the middle of the frame.
    const bell = () => (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
    off[i * 3] = bell() * 8.6;
    off[i * 3 + 1] = bell() * 5.6;
    off[i * 3 + 2] = -2.2 + bell() * 5.2;    // always behind the receipt
    scl[i] = rnd(0.42, 0.98);
    sed[i] = Math.random();
    spin[i * 3] = rnd(0, 6.28);
    spin[i * 3 + 1] = rnd(0, 6.28);
    spin[i * 3 + 2] = rnd(0, 6.28);
  }
  g.setAttribute("aOffset", new InstancedBufferAttribute(off, 3));
  g.setAttribute("aScale", new InstancedBufferAttribute(scl, 1));
  g.setAttribute("aSeed", new InstancedBufferAttribute(sed, 1));
  g.setAttribute("aSpin", new InstancedBufferAttribute(spin, 3));
  return g;
}

/* ---------- the hand-off rule ---------- */

/* The one mark left over from the folders that used to stand here: a solid
   cyan rule that runs under both halves when the accountant is given them.
   It is a rule rather than a shape because the site's line language is the
   solid rule under the wordmark. */

const RULE_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RULE_FRAG = /* glsl */ `
  uniform vec3 uCyan;
  uniform vec2 uHalf;
  uniform float uAlpha, uExt;
  varying vec2 vP;
  float rrect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    // Runs itself outward from the middle, so the rule is drawn rather than
    // faded on.
    float d = rrect(vP, vec2(uHalf.x * uExt, uHalf.y), uHalf.y);
    float core = smoothstep(0.010, 0.0, d);
    float glow = smoothstep(0.090, 0.0, d);
    float a = clamp(core + glow * 0.34, 0.0, 1.0) * uAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uCyan * (1.30 + core * 1.10), a);
  }
`;

/* ---------- the expenses sheet ---------- */

/* The structured half of the receipt: the same transaction written as a row,
   and then the rest of the month written in around it.

   This is not a picture that fades in. It is a canvas the reader's scroll
   writes: cells land one at a time behind a caret, the month totals itself,
   the totals become a chart. Redrawing is gated on a quantised signature, so
   a whole chapter of scrolling costs on the order of a hundred redraws rather
   than one per frame. */

const SHEET_ROWS = [
  ["04 Aug 2026", "Home Depot",    "Supplies", "142.11", "16.34", "IMG_0388"],
  ["09 Aug 2026", "Tim Hortons",   "Meals",     "18.75",  "2.16", "IMG_0394"],
  ["12 Aug 2026", "Esso",          "Gas",       "99.81", "11.48", "IMG_0412"],
  ["15 Aug 2026", "Canadian Tire", "Tools",     "77.40",  "8.90", "IMG_0423"],
  ["21 Aug 2026", "Petro-Canada",  "Gas",       "88.02", "10.12", "IMG_0441"],
];
// The receipt just photographed lands first — it is the one the reader watched
// happen — and the rest of the month fills in around it, in date order.
const SHEET_ORDER = [2, 0, 1, 3, 4];
const LIVE_ROW = 2;
const SHEET_TOTAL = 426.09, SHEET_HST = 49.0;
const SHEET_CATS = [["Gas", 187.83], ["Supplies", 142.11], ["Tools", 77.4], ["Meals", 18.75]];

const SH_BG = "#0d1420", SH_EDGE = "#26344a", SH_LINE = "#1e293a",
      SH_INK = "#eef2f7", SH_MUT = "#7d89a0", SH_CY = "#3fd6c6", SH_BAR = "#2b415c";

/* Two layouts, not one shrunk. Side by side with the photo the sheet gets a
   wide frame and can carry six columns; stacked above it on a phone the frame
   is nearly square and three columns at twice the size are what stays
   readable. Same canvas element either way.

   growRows / growBand are how much of the canvas height is drawn before the
   totals and the chart arrive: the card grows downward as the month fills it
   in, instead of standing there two thirds empty for two chapters. */
const SHEET_WIDE = {
  w: 1180, h: 880, pad: 44, title: 62, top: 118, rowH: 58, rows: 5,
  size: 25, head: 21,
  cols: [[66, "left"], [300, "left"], [520, "left"], [770, "right"], [900, "right"], [940, "left"]],
  keys: [0, 1, 2, 3, 4, 5],
  heads: ["Date", "Vendor", "Category", "Total", "HST", "Photo"],
  figs: [66, 480, 760], labelY: 476, bigY: 552, big: 62, sepY: 600,
  chart: { base: 800, top: 630, bw: 150, gap: 90, labelY: 842 },
};
const SHEET_TALL = {
  w: 820, h: 860, pad: 36, title: 58, top: 130, rowH: 62, rows: 5,
  size: 30, head: 25,
  cols: [[56, "left"], [240, "left"], [764, "right"]],
  keys: [0, 1, 3],                             // date, vendor, total
  heads: ["Date", "Vendor", "Total"],
  short: true,
  figs: [56, 456], labelY: 516, bigY: 594, big: 66, sepY: 634,
  chart: { base: 792, top: 664, bw: 130, gap: 50, labelY: 822 },
};

/* Derived, never typed: growRows is where the table ends and growBand is where
   the totals band ends, so moving `top`, `rowH` or `sepY` carries the card's
   bottom edge with them instead of leaving it behind by a few pixels. */
for (const M of [SHEET_WIDE, SHEET_TALL]) {
  M.growRows = (M.top + M.rows * M.rowH + 24) / M.h;
  M.growBand = (M.sepY + 12) / M.h;
}

function createSheet() {
  const cv = document.createElement("canvas");
  const g = cv.getContext("2d");
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;

  let M = null, sig = "";
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const font = (px, wt = "400") =>
    `${wt} ${px}px ui-monospace, "SF Mono", Menlo, monospace`;
  const money = (v) => "$" + v.toFixed(2);

  function rrect(x0, y0, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x0 + rr, y0);
    g.arcTo(x0 + w, y0, x0 + w, y0 + h, rr);
    g.arcTo(x0 + w, y0 + h, x0, y0 + h, rr);
    g.arcTo(x0, y0 + h, x0, y0, rr);
    g.arcTo(x0, y0, x0 + w, y0, rr);
    g.closePath();
  }

  /** Pick the layout the frame has room for. Returns the new width/height ratio. */
  function layout(compact) {
    const next = compact ? SHEET_TALL : SHEET_WIDE;
    if (next === M) return;
    M = next;
    cv.width = M.w; cv.height = M.h;
    sig = "";                                   // the canvas is blank again
  }

  function drawRows(s) {
    const L = M.pad, R = M.w - M.pad;

    g.font = font(M.head, "700"); g.fillStyle = SH_MUT; g.textBaseline = "alphabetic";
    M.cols.forEach(([x, align], i) => {
      g.textAlign = align;
      g.fillText(M.heads[i], x, M.top - 18);
    });
    g.textAlign = "left";

    // The grid exists before the numbers land in it: a sheet waiting to be filled.
    g.strokeStyle = SH_LINE; g.lineWidth = 2;
    for (let i = 0; i <= M.rows; i++) {
      const y = M.top + i * M.rowH;
      g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    }

    const nCols = M.cols.length;
    SHEET_ORDER.forEach((r, k) => {
      const t = clamp01(s.rows - k);
      if (t <= 0.001) return;
      const y = M.top + r * M.rowH, live = r === LIVE_ROW;

      // Each row lands lit and settles; the one we photographed keeps a wash.
      const flash = Math.max(live ? 0.15 : 0, clamp01(t * 6) * (1 - t) * 0.5);
      if (flash > 0.004) {
        g.fillStyle = SH_CY; g.globalAlpha = flash;
        g.fillRect(L, y + 2, R - L, M.rowH - 4); g.globalAlpha = 1;
      }

      const cells = SHEET_ROWS[r];
      const by = y + M.rowH * 0.5 + M.size * 0.36;
      g.font = font(M.size, live ? "700" : "400");
      g.fillStyle = live ? SH_CY : SH_INK;

      /* Each cell owns a slice of the row's window and fades in across it, so
         the numbers arrive rather than switching on. Alpha falls as c rises,
         which is why breaking out is safe. */
      const slice = 1 / (nCols + 2);
      let caret = L, caretA = 0;
      for (let c = 0; c < nCols; c++) {
        const a = clamp01((t - c * slice) / (slice * 1.7));
        if (a <= 0.012) break;
        const [x, align] = M.cols[c];
        const raw = cells[M.keys[c]];
        const txt = M.short && c === 0 ? raw.slice(0, 6) : raw;
        g.globalAlpha = a;
        g.textAlign = align;
        g.fillText(txt, x, by);
        caret = align === "right" ? x + 12 : x + g.measureText(txt).width + 12;
        caretA = 1 - a;                 // brightest just as the next cell starts
      }
      g.globalAlpha = 1;
      g.textAlign = "left";

      // The cell being written.
      if (caretA > 0.02 && t < 0.999) {
        g.fillStyle = SH_CY; g.globalAlpha = caretA * 0.8;
        g.fillRect(caret, y + M.rowH * 0.28, M.size * 0.55, M.rowH * 0.46);
        g.globalAlpha = 1;
      }
    });
  }

  function drawBand(s) {
    const L = M.pad, R = M.w - M.pad;
    const figs = [
      ["AUGUST TOTAL", money(SHEET_TOTAL * s.tally), SH_CY, 1],
      ["HST", money(SHEET_HST * s.tally), SH_INK, 0.56],
      ["RECEIPTS", String(Math.round(SHEET_ROWS.length * s.tally)), SH_INK, 0.56],
    ];
    g.globalAlpha = s.totals;
    g.textAlign = "left";
    M.figs.forEach((x, i) => {
      const [label, val, col, rel] = figs[i];
      g.font = font(M.head, "700"); g.fillStyle = SH_MUT;
      g.fillText(label, x, M.labelY);
      g.font = font(M.big * rel, "700"); g.fillStyle = col;
      g.fillText(val, x, M.bigY - M.big * (1 - rel) * 0.12);
    });
    g.strokeStyle = SH_LINE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(L, M.sepY); g.lineTo(R, M.sepY); g.stroke();
    g.globalAlpha = 1;
  }

  function drawChart(s) {
    const c = M.chart, L = M.pad, R = M.w - M.pad, span = SHEET_CATS.length;
    const wAll = span * c.bw + (span - 1) * c.gap;
    const x0 = L + ((R - L) - wAll) / 2;
    const maxH = c.base - c.top, peak = SHEET_CATS[0][1];

    g.globalAlpha = s.bars;
    g.strokeStyle = SH_LINE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(L, c.base); g.lineTo(R, c.base); g.stroke();

    SHEET_CATS.forEach(([name, v], i) => {
      // Staggered, so the bars rise one after another rather than as a block.
      const t = clamp01(s.bars * 1.45 - i * 0.13);
      const h = maxH * (v / peak) * t, x = x0 + i * (c.bw + c.gap);
      if (h > 1) {
        g.fillStyle = i === 0 ? SH_CY : SH_BAR;
        rrect(x, c.base - h, c.bw, h, 7); g.fill();
      }
      const lab = clamp01((t - 0.55) * 3);
      if (lab > 0.01) {
        g.textAlign = "center";
        g.globalAlpha = s.bars * lab;
        g.font = font(M.head * 0.95, "700"); g.fillStyle = i === 0 ? SH_CY : SH_INK;
        g.fillText(money(v), x + c.bw / 2, c.base - h - 14);
        g.font = font(M.head * 0.88); g.fillStyle = SH_MUT;
        g.fillText(name.toUpperCase(), x + c.bw / 2, c.labelY);
        g.globalAlpha = s.bars; g.textAlign = "left";
      }
    });
    g.globalAlpha = 1;
  }

  function draw(s) {
    g.clearRect(0, 0, M.w, M.h);
    // The card is only as tall as the month has filled it. Everything below
    // s.grow is cropped off the texture by the caller, so the rounded bottom
    // edge has to be drawn where the crop lands, not at the canvas floor.
    g.fillStyle = SH_BG; rrect(2, 2, M.w - 4, M.h * s.grow - 4, 20); g.fill();
    g.strokeStyle = SH_EDGE; g.lineWidth = 2; g.stroke();

    g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = font(M.head, "700"); g.fillStyle = SH_MUT;
    g.fillText("EXPENSES · AUGUST 2026", M.pad, M.title);

    // The accountant's beat, written on the sheet itself.
    if (s.shared > 0.01) {
      const cw = M.short ? 260 : 300, ch = M.head * 2.1;
      const cx = M.w - M.pad - cw, cy = M.title - ch * 0.72;
      rrect(cx, cy, cw, ch, ch / 2);
      g.globalAlpha = s.shared * 0.12; g.fillStyle = SH_CY; g.fill();
      g.globalAlpha = s.shared; g.strokeStyle = SH_CY; g.lineWidth = 2; g.stroke();
      g.font = font(M.head * 0.86, "700"); g.fillStyle = SH_CY; g.textAlign = "center";
      g.fillText("SHARED · VIEW ONLY", cx + cw / 2, M.title);
      g.textAlign = "left"; g.globalAlpha = 1;
    }

    drawRows(s);
    if (s.totals > 0.01) drawBand(s);
    if (s.bars > 0.01) drawChart(s);
  }

  /** Quantised so a frame that changes nothing visible does not repaint. */
  function set(s) {
    const key = M.w + "|" + Math.round(s.rows * 40) + "|" + Math.round(s.grow * 60)
      + "|" + Math.round(s.tally * 80) + "|" + Math.round(s.bars * 36)
      + "|" + Math.round(s.shared * 12);
    if (key === sig) return;
    sig = key; draw(s); tex.needsUpdate = true;
  }

  return {
    texture: tex, layout, set,
    get aspect() { return M.w / M.h; },
    get growRows() { return M.growRows; },
    get growBand() { return M.growBand; },
    dispose() { tex.dispose(); },
  };
}

/* ---------- capture frame ---------- */

/* The viewfinder that finds the receipt's edges, locks on, and takes it.
   Drawn in the plane's own coordinates so the brackets can start loose and
   converge onto the paper's real bounds. */

const CAP_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CAP_FRAG = /* glsl */ `
  uniform vec2 uHalf;
  uniform float uAlpha, uThick, uLen, uFull, uFlash;
  uniform vec3 uCyan;
  varying vec2 vPos;

  float seg(vec2 p, vec2 a, vec2 b, float t) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return smoothstep(t, 0.0, length(pa - ba * h));
  }

  void main() {
    vec2 h = uHalf;
    float m = 0.0, L = uLen;
    vec2 c;
    c = vec2( h.x,  h.y);
    m = max(m, seg(vPos, c, c - vec2(L, 0.0), uThick)); m = max(m, seg(vPos, c, c - vec2(0.0, L), uThick));
    c = vec2(-h.x,  h.y);
    m = max(m, seg(vPos, c, c + vec2(L, 0.0), uThick)); m = max(m, seg(vPos, c, c - vec2(0.0, L), uThick));
    c = vec2( h.x, -h.y);
    m = max(m, seg(vPos, c, c - vec2(L, 0.0), uThick)); m = max(m, seg(vPos, c, c + vec2(0.0, L), uThick));
    c = vec2(-h.x, -h.y);
    m = max(m, seg(vPos, c, c + vec2(L, 0.0), uThick)); m = max(m, seg(vPos, c, c + vec2(0.0, L), uThick));

    float inX = step(abs(vPos.x), h.x), inY = step(abs(vPos.y), h.y);
    float dx = abs(abs(vPos.x) - h.x), dy = abs(abs(vPos.y) - h.y);
    m = max(m, max(smoothstep(uThick, 0.0, dx) * inY,
                   smoothstep(uThick, 0.0, dy) * inX) * uFull);

    float a = clamp(m + inX * inY * 0.20 * uFlash, 0.0, 1.0);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uCyan, a * uAlpha);
  }
`;

export function createStory(canvas) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch { return null; }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 9.3);

  const paperMat = new ShaderMaterial({
    name: "paper",
    vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG, transparent: true,
    uniforms: { uCrumple: { value: 1 }, uScan: { value: -1 }, uFade: { value: 1 },
                uShutter: { value: 0 }, uExtract: { value: 0 },
                uWipe: { value: 0 }, uCyanHold: { value: 0 }, uInvert: { value: 0 },
                uInk: { value: INK }, uCyan: { value: CYAN } },
  });
  const paper = new Mesh(new PlaneGeometry(W, H, 48, 64), paperMat);
  scene.add(paper);

  const crowdMat = new ShaderMaterial({
    name: "crowd",
    vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG,
    transparent: true, depthWrite: false,
    // No uInk: the crowd lights itself off its own facet normals.
    uniforms: { uCull: { value: 0 }, uAlpha: { value: 0 } },
  });
  const crowd = new Mesh(buildCrowd(), crowdMat);
  crowd.renderOrder = -1;
  crowd.frustumCulled = false;
  scene.add(crowd);

  const capMat = new ShaderMaterial({
    name: "capture",
    vertexShader: CAP_VERT, fragmentShader: CAP_FRAG,
    transparent: true, depthWrite: false,
    uniforms: {
      uHalf: { value: new Vector2(W * 0.9, H * 0.7) },
      uAlpha: { value: 0 }, uThick: { value: 0.022 }, uLen: { value: 0.5 },
      uFull: { value: 0 }, uFlash: { value: 0 }, uCyan: { value: CYAN },
    },
  });
  const capture = new Mesh(new PlaneGeometry(W * 2.4, H * 1.5), capMat);
  capture.position.z = 0.06;
  scene.add(capture);

  // The hand-off: one rule under both halves when the accountant is given them.
  const linkMat = new ShaderMaterial({
    name: "link",
    vertexShader: RULE_VERT, fragmentShader: RULE_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uCyan: { value: CYAN }, uHalf: { value: new Vector2(3.4, 0.028) },
                uAlpha: { value: 0 }, uExt: { value: 0 } },
  });
  const link = new Mesh(new PlaneGeometry(9, 1), linkMat);
  link.frustumCulled = false;
  link.visible = false;
  scene.add(link);

  // A standard material on purpose: the custom sheet shader intermittently
  // failed to link, and when it did the spreadsheet never drew at all.
  const sheetArt = createSheet();
  sheetArt.layout(false);
  const sheetMat = new MeshBasicMaterial({
    name: "sheet", map: sheetArt.texture, transparent: true, depthWrite: false, opacity: 0,
  });
  const sheet = new Mesh(new PlaneGeometry(1, 1), sheetMat);   // scale carries size
  sheet.visible = false;
  scene.add(sheet);

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (v, a, b) => clamp01((v - a) / (b - a));

  /* The canvas is the content column, so the frame is narrow and its aspect
     barely changes with the viewport. The back half of the story lays the
     sheet and the photograph out inside whatever half-width the frame has:
     side by side when there is room, stacked when there is not. A six-column
     table scaled to a third of a phone is not a table, it is a texture. */
  const FOV_T = Math.tan((38 * Math.PI / 180) / 2);
  const SHEET_MAX_W = 4.05;            // the sheet at full size, on a wide frame
  let avail = 3.4, wide = 1;

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Centred in its own column now, rather than pushed aside to clear copy
    // that used to sit beside it.
    camera.position.x = 0;
    camera.position.z = 9.3;
    camera.updateProjectionMatrix();
    avail = FOV_T * camera.position.z * camera.aspect;
    wide = clamp01((avail - 1.80) / (3.00 - 1.80));
    sheetArt.layout(wide < 0.5);
  }

  /* p is progress through the whole story, 0 at the top, 1 at the bottom.

     Every number below is a position on that one value, and they are not
     arbitrary: `.ch` is 260svh and `.ch--hero` is 100svh, which makes the
     story 2700svh with 2600svh of travel, so each chapter is exactly a tenth
     of p and chapter n's copy is up from 0.0192 + 0.1(n-1) to 0.1 later.

       hero 0.000  01 .019  02 .119  03 .219  04 .319  05 .419
       06 .519   07 .619   08 .719   09 .819   cta .919

     Change either height in main.css and every window here moves. */
  function apply(p) {
    const ease = (v) => v * v * (3 - 2 * v);

    /* Where the two halves end up. The sheet takes what the frame will give
       it, the photograph is sized against it, and the pair hangs from one top
       edge so the sheet can grow downward without either of them drifting.

       Wide frames stand them side by side; narrow ones stack the photograph
       above the sheet, because a six-column table squeezed into a third of a
       phone is not a table any more. Whatever the arrangement, the pair is
       then scaled to fit the band above the chapter copy. */
    const sheetW0 = Math.min(SHEET_MAX_W, avail * (1.88 - 0.68 * wide));
    const sheetH0 = sheetW0 / sheetArt.aspect;
    const paperH0 = sheetH0 * (0.82 - 0.30 * (1 - wide));
    const stackGap = 0.28;
    const pairH0 = sheetH0 + (paperH0 + stackGap) * (1 - wide);

    // The copy owns the lower third of the frame; this is what is left.
    const k = Math.min(1, 3.6 / pairH0);
    const sheetW = sheetW0 * k, sheetH = sheetH0 * k;
    const paperH = paperH0 * k, paperW = paperH * (W / H);
    const pairH = pairH0 * k;
    const pairW = sheetW + (paperW + 0.10 * sheetW) * wide;

    const SHEET_X = (-pairW / 2 + sheetW / 2) * wide;
    const PAPER_X = (pairW / 2 - paperW / 2) * wide;
    const PAPER_TOP = 0.04 + pairH / 2;
    const SHEET_TOP = PAPER_TOP - (paperH + stackGap * k) * (1 - wide);

    // 07: the information separates. The receipt keeps the image and moves
    // aside; a second copy of it becomes the row in the sheet.
    const settle = ease(range(p, 0.519, 0.566));

    // The pile arrives with chapter 01 and empties out as the story advances:
    // that thinning is the promise the page is making.
    crowdMat.uniforms.uAlpha.value = range(p, 0.013, 0.058) * (1 - range(p, 0.292, 0.373));
    crowdMat.uniforms.uCull.value = range(p, 0.085, 0.355);

    paperMat.uniforms.uCrumple.value = 1 - range(p, 0.103, 0.265);
    paper.rotation.z = (1 - range(p, 0.031, 0.265)) * 0.28;
    // Keeps a little of its turn once it is filed, so the photograph beside
    // the sheet still reads as an object rather than a sticker.
    paper.rotation.y = (1 - range(p, 0.031, 0.283)) * -0.45 - settle * 0.10;

    const scan = range(p, 0.342, 0.393);
    paperMat.uniforms.uScan.value = p >= 0.342 && p <= 0.409 ? scan : -1;

    // Clear the stage before the call to action so it stands on its own.
    // The closing chapter's copy is up from 0.92, so this has to be finished
    // by then or the price is read through a spreadsheet.
    const clear = 1 - range(p, 0.882, 0.922);
    const arrive = range(p, 0.035, 0.085);
    // The receipt is no longer swallowed by a folder: it is the photograph
    // that was filed, so it stays on screen next to its own row until the
    // page hands over to the price.
    paperMat.uniforms.uFade.value = clear * arrive;

    // Loose in the frame while it is still paper; sized to stand beside the
    // sheet once it has been filed.
    const held = 0.84 * (0.78 + 0.22 * Math.min(1, avail / 3.0));
    const sc = held + (paperH / H - held) * settle;
    paper.scale.set(sc, sc, 1);

    paper.position.x = PAPER_X * settle;
    // A slow scroll-driven bob once it is filed, so the pair keeps moving
    // while the sheet writes itself.
    const paperRest = PAPER_TOP - paperH / 2;
    paper.position.y = -0.10 + (paperRest + 0.10) * settle
                     + Math.sin(p * 34.0) * 0.035 * settle;

    // Edges found, locked, taken. This is what earns the switch to dark.
    // 02 rectangle -> 03 cyan sweeps the paper -> 04 full cyan and a flash
    // -> 05 the same receipt, inverted.
    paperMat.uniforms.uWipe.value = ease(range(p, 0.445, 0.468));
    paperMat.uniforms.uCyanHold.value = range(p, 0.443, 0.448) * (1 - range(p, 0.481, 0.511));
    paperMat.uniforms.uShutter.value =
      ease(range(p, 0.463, 0.473)) * (1 - ease(range(p, 0.473, 0.493)));
    paperMat.uniforms.uInvert.value = ease(range(p, 0.463, 0.517));
    // The two fields it read stay lit until they have landed in the row.
    paperMat.uniforms.uExtract.value = range(p, 0.495, 0.531) * (1 - range(p, 0.620, 0.664));

    const lock = range(p, 0.391, 0.432);
    const e = lock * lock * (3.0 - 2.0 * lock);
    const psc = paper.scale.x;
    const tight = [(W / 2) * psc * 1.045, (H / 2) * psc * 1.015];
    capMat.uniforms.uHalf.value.set(
      tight[0] * (1 + (1 - e) * 0.62), tight[1] * (1 + (1 - e) * 0.06));
    capMat.uniforms.uLen.value = 0.58 - e * 0.28;
    capMat.uniforms.uFull.value = range(p, 0.429, 0.447);
    capMat.uniforms.uFlash.value =
      range(p, 0.438, 0.450) * (1 - range(p, 0.450, 0.472)) * 0.30;
    capture.visible = p > 0.373 && p < 0.535;
    capture.position.x = paper.position.x;
    capture.position.y = paper.position.y;
    capMat.uniforms.uAlpha.value =
      range(p, 0.382, 0.409) * (1 - range(p, 0.488, 0.526));

    /* The back half is one continuous object rather than three scenes: the
       sheet arrives, writes its rows, totals itself, and is handed over. The
       reader's scroll is the thing writing it, which is why the row count and
       the tally are values here rather than a canned loop. */
    const rows = ease(range(p, 0.572, 0.612))                 // the one just taken
               + 4 * ease(range(p, 0.626, 0.716));            // the rest of the month
    const totals = ease(range(p, 0.722, 0.752));
    const bars = ease(range(p, 0.774, 0.838));
    // How much of the card is drawn: the table, then the month's figures under
    // it, then the chart those figures make.
    const gR = sheetArt.growRows, gB = sheetArt.growBand;
    const grow = gR + (gB - gR) * totals + (1 - gB) * bars;
    sheetArt.set({
      rows, totals, bars, grow,
      tally:  ease(range(p, 0.730, 0.800)),
      shared: ease(range(p, 0.826, 0.866)),
    });

    sheet.visible = settle > 0.001 && clear > 0.001;
    sheetMat.opacity = range(p, 0.516, 0.548) * clear;

    /* Reveal by showing only the left fraction of the texture at 1:1, so the
       sheet writes itself in rather than stretching, and only the top `grow`
       fraction, so the card ends where its drawn bottom edge is. */
    const wipe = Math.max(0.001, ease(range(p, 0.522, 0.572)));
    sheetArt.texture.repeat.set(wipe, grow);
    sheetArt.texture.offset.y = 1 - grow;
    const ss = 0.30 + 0.70 * settle;
    const fullW = sheetW * ss, w = fullW * wipe, h = sheetH * ss * grow;
    sheet.scale.set(w, h, 1);
    sheet.position.set(
      SHEET_X * settle - (fullW - w) / 2,
      (SHEET_TOP - h / 2) * settle - Math.sin(p * 34.0) * 0.025 * settle,
      -0.05);

    // Handed over: one rule under both, run outward from the middle.
    const linkA = range(p, 0.830, 0.874) * clear;
    link.visible = linkA > 0.004;
    if (link.visible) {
      // Side by side it runs under both. Stacked there is no room under the
      // sheet — the chapter copy is already there — so it runs between them,
      // which is the same statement.
      const under = Math.min(SHEET_TOP - sheetH, PAPER_TOP - paperH) - 0.34;
      const between = SHEET_TOP + stackGap * k * 0.5;
      linkMat.uniforms.uHalf.value.set(pairW / 2 + 0.16, 0.028);
      linkMat.uniforms.uAlpha.value = linkA;
      linkMat.uniforms.uExt.value = ease(range(p, 0.832, 0.880));
      link.position.set(0, under * wide + between * (1 - wide), 0.06);
    }

    // The frame rises a little as the pair takes over, then drifts back.
    camera.position.y = -0.72 + range(p, 0.505, 0.585) * 0.10
                              - range(p, 0.60, 0.95) * 0.02;
  }

  return {
    resize, apply,
    render() { renderer.render(scene, camera); },
    dispose() {
      paper.geometry.dispose(); paperMat.dispose();
      crowd.geometry.dispose(); crowdMat.dispose();
      capture.geometry.dispose(); capMat.dispose();
      link.geometry.dispose(); linkMat.dispose();
      sheet.geometry.dispose(); sheetArt.dispose(); sheetMat.dispose();
      renderer.dispose();
    },
  };
}
