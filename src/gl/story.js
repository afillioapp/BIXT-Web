/* One continuous scroll-told story, drawn behind the whole page.

   The scene is a single paper receipt plus one cloud of points. The points
   are re-aimed at a different formation each chapter, so the same particles
   carry the narrative the whole way down: the ink of one receipt →
   the ink of one receipt → rows of a spreadsheet → twelve month folders →
   you and your accountant looking at the same thing → gone.

   Two draw calls, no textures. Formations are precomputed once; a chapter
   change copies two of them into the start/end attributes, and the shader
   does the interpolation. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry, BufferGeometry,
  InstancedBufferGeometry, InstancedBufferAttribute,
  BufferAttribute, ShaderMaterial, Mesh, Points, Color, AdditiveBlending, Vector2, CanvasTexture, SRGBColorSpace,
} from "three";

const rnd = (a, b) => a + Math.random() * (b - a);

const INK = new Color("#111a2d");
const CYAN = new Color("#009b95");
const W = 1.55, H = 4.15, COUNT = 2800;

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
    vec3 stock = mix(vec3(0.995, 0.995, 0.99), vec3(0.052, 0.078, 0.125), uInvert);
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

const CROWD = 38;

const CROWD_VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec2 aScale;
  attribute float aRot;
  attribute float aSeed;
  attribute vec2 aTilt;
  uniform float uCull, uAlpha;
  varying vec2 vUv;
  varying float vA, vSeed, vShade;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vUv = uv;
    vSeed = aSeed;
    // As uCull rises the pile thins out, one receipt at a time.
    vA = uAlpha * step(uCull, aSeed);

    // Crumple: two octaves, stretched along the roll so the creases run
    // across the paper the way they do when one is stuffed in a pocket.
    vec2 q = uv * vec2(2.6, 6.5) + aSeed * 53.0;
    float n  = noise(q) * 2.0 - 1.0;
          n += (noise(q * 2.4) * 2.0 - 1.0) * 0.45;
          n += (noise(q * 5.1) * 2.0 - 1.0) * 0.18;
    vShade = n;

    vec3 p = vec3(position.xy * aScale, n * 0.055 * aScale.x);

    // Tilt out of plane first, then spin in it.
    float cx = cos(aTilt.x), sx = sin(aTilt.x);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float cy = cos(aTilt.y), sy = sin(aTilt.y);
    p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
    float c = cos(aRot), sn = sin(aRot);
    p = vec3(p.x * c - p.y * sn, p.x * sn + p.y * c, p.z);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + aOffset, 1.0);
  }
`;

const CROWD_FRAG = /* glsl */ `
  uniform vec3 uInk;
  varying vec2 vUv;
  varying float vA, vSeed, vShade;

  void main() {
    if (vA < 0.01) discard;

    // No post-processing pass: depth of field is faked by softening the edges
    // and the printing in step with how far back the receipt sits.
    float blur = 0.045 + vSeed * 0.105;

    // Torn off the roll, and never a clean rectangle.
    float tear = 0.028 + 0.022 * abs(fract(vUv.x * 9.0 + vSeed * 7.0) - 0.5) * 2.0;
    if (vUv.y < tear) discard;

    float mask = smoothstep(0.0, blur, vUv.x) * smoothstep(1.0, 1.0 - blur, vUv.x)
               * smoothstep(tear, tear + blur * 0.5, vUv.y) * smoothstep(1.0, 1.0 - blur * 0.4, vUv.y);

    // Creases catch and lose the light; that shading is what reads as crumple.
    float lit = 1.0 - vShade * 0.115;
    vec3 col = vec3(1.0) * lit;

    float lines = 0.0;
    for (int i = 0; i < 7; i++) {
      float y = 0.84 - float(i) * 0.105;
      lines += smoothstep(0.012 + blur * 0.55, 0.0, abs(vUv.y - y))
             * step(0.19, vUv.x) * step(vUv.x, 0.55 + mod(float(i), 3.0) * 0.09);
    }
    col = mix(col, uInk, clamp(lines, 0.0, 1.0) * 0.17 * (1.0 - blur * 1.7));

    gl_FragColor = vec4(col, mask * vA * (0.40 - vSeed * 0.15));
  }
`;

function buildCrowd() {
  // Subdivided, or there are no vertices to crumple.
  const base = new PlaneGeometry(1, 1, 8, 20);
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.uv = base.attributes.uv;
  g.instanceCount = CROWD;

  const off = new Float32Array(CROWD * 3);
  const scl = new Float32Array(CROWD * 2);
  const rot = new Float32Array(CROWD);
  const sed = new Float32Array(CROWD);
  const tlt = new Float32Array(CROWD * 2);
  for (let i = 0; i < CROWD; i++) {
    off[i * 3] = rnd(-5.0, 5.0);
    off[i * 3 + 1] = rnd(-3.4, 3.4);
    off[i * 3 + 2] = rnd(-5.2, -1.4);          // always behind the hero receipt
    const w = rnd(0.40, 0.84);
    scl[i * 2] = w;
    scl[i * 2 + 1] = w * rnd(2.2, 3.4);        // till-roll proportions
    rot[i] = rnd(-1.1, 1.1);
    tlt[i * 2] = rnd(-0.34, 0.34);
    tlt[i * 2 + 1] = rnd(-0.34, 0.34);
    sed[i] = Math.random();
  }
  g.setAttribute("aOffset", new InstancedBufferAttribute(off, 3));
  g.setAttribute("aScale", new InstancedBufferAttribute(scl, 2));
  g.setAttribute("aRot", new InstancedBufferAttribute(rot, 1));
  g.setAttribute("aSeed", new InstancedBufferAttribute(sed, 1));
  g.setAttribute("aTilt", new InstancedBufferAttribute(tlt, 2));
  return g;
}

/* ---------- points ---------- */

const DUST_VERT = /* glsl */ `
  attribute vec3 aStart, aEnd;
  attribute float aSeed;
  uniform float uT, uSize, uAlpha, uArc;
  varying float vAlpha;
  void main() {
    float e = clamp((uT - aSeed * 0.16) / 0.84, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 p = mix(aStart, aEnd, e);
    float arc = sin(e * 3.14159) * uArc;
    p.z += arc * (0.4 + aSeed * 0.8);
    p.x += arc * (aSeed - 0.5) * 0.5;
    vAlpha = uAlpha;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uCyan;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uCyan, vAlpha * smoothstep(0.5, 0.0, d));
  }
`;

/* ---------- the expenses sheet ---------- */

/* The structured half of the receipt: the same transaction, written as a row
   in a spreadsheet. Drawn dark to match the inverted receipt it comes out of. */
function makeSheetTexture() {
  const w = 900, h = 620;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const x = cv.getContext("2d");
  const BG = "#0d1420", LINE = "#232e3f", INKC = "#eef2f7", MUT = "#8a94a6", CY = "#3fd6c6";
  const font = (px, wt = "400") => `${wt} ${px}px ui-monospace, "SF Mono", Menlo, monospace`;

  x.fillStyle = BG; x.fillRect(0, 0, w, h);

  const cols = [40, 210, 400, 560, 700, 840];
  const head = ["Date", "Vendor", "Category", "Total", "HST"];
  x.font = font(22, "700"); x.fillStyle = MUT;
  head.forEach((t, i) => { x.textAlign = "left"; x.fillText(t, cols[i], 52); });

  x.strokeStyle = LINE; x.lineWidth = 2;
  for (let r = 0; r <= 8; r++) {
    const y = 74 + r * 60;
    x.beginPath(); x.moveTo(24, y); x.lineTo(w - 24, y); x.stroke();
  }
  cols.forEach((c) => { x.beginPath(); x.moveTo(c - 16, 24); x.lineTo(c - 16, h - 24); x.stroke(); });

  const rows = [
    ["04 Aug 2026", "Home Depot", "Supplies", "142.11", "16.34"],
    ["09 Aug 2026", "Tim Hortons", "Meals", "18.75", "2.16"],
    ["12 Aug 2026", "Esso", "Gas", "99.81", "11.48"],
    ["15 Aug 2026", "Canadian Tire", "Tools", "77.40", "8.90"],
    ["21 Aug 2026", "Petro-Canada", "Gas", "88.02", "10.12"],
  ];
  rows.forEach((r, i) => {
    const y = 74 + i * 60, live = i === 2;          // the receipt we just read
    if (live) {
      x.fillStyle = CY; x.globalAlpha = 0.16;
      x.fillRect(24, y + 2, w - 48, 56); x.globalAlpha = 1;
    }
    x.font = font(23, live ? "700" : "400");
    x.fillStyle = live ? CY : INKC;
    r.forEach((cell, c) => { x.textAlign = "left"; x.fillText(cell, cols[c], y + 40); });
  });

  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const SHEET_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SHEET_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uAlpha, uWipeIn;
  uniform vec3 uCyan;
  varying vec2 vUv;
  void main() {
    if (uAlpha < 0.01) discard;
    // The sheet writes itself left to right as the data lands in it.
    float front = uWipeIn;
    float on = smoothstep(front + 0.05, front - 0.02, vUv.x);
    if (on < 0.01) discard;
    vec3 col = texture2D(uTex, vUv).rgb;
    col += uCyan * smoothstep(0.045, 0.0, abs(vUv.x - front)) * 0.5;
    float edge = smoothstep(0.0, 0.012, vUv.x) * smoothstep(1.0, 0.988, vUv.x)
               * smoothstep(0.0, 0.018, vUv.y) * smoothstep(1.0, 0.982, vUv.y);
    gl_FragColor = vec4(col, uAlpha * on * edge);
  }
`;

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

/* ---------- formations ---------- */

function buildFormations() {
  const f = (fn) => { const a = new Float32Array(COUNT * 3); fn(a); return a; };

  // The ink of one receipt — header, items, prices, total.
  const ink = f((a) => {
    const rows = [0.940, 0.893, 0.862, 0.762, 0.7145, 0.667, 0.6195, 0.572, 0.5245, 0.477,
                  0.352, 0.310, 0.246];
    for (let i = 0; i < COUNT; i++) {
      const y = rows[i % rows.length];
      // Two thirds sit in the description column, a third in the price column.
      const x = (i % 3 === 0) ? rnd(0.80, 0.97) : rnd(0.13, 0.52);
      a[i * 3] = (x - 0.5) * W;
      a[i * 3 + 1] = (y - 0.5) * H;
      a[i * 3 + 2] = 0.02;
    }
  });

  // A spreadsheet: 12 rows, 4 column blocks.
  const rows = f((a) => {
    const R = 12, C = 4, gw = W * 1.34, gh = H * 0.72, cw = gw / C;
    for (let i = 0; i < COUNT; i++) {
      const r = i % R, c = (i / R | 0) % C;
      a[i * 3] = -gw / 2 + c * cw + cw * rnd(0.10, 0.72);
      a[i * 3 + 1] = gh / 2 - (r / (R - 1)) * gh + rnd(-0.015, 0.015);
      a[i * 3 + 2] = 0;
    }
  });

  // Twelve months, as twelve tidy blocks — the infographic beat.
  const months = f((a) => {
    const cols = 4, rowsN = 3, sx = 1.55, sy = 1.25;
    for (let i = 0; i < COUNT; i++) {
      const m = i % 12, cx = (m % cols - (cols - 1) / 2) * sx, cy = ((rowsN - 1) / 2 - (m / cols | 0)) * sy;
      a[i * 3] = cx + rnd(-0.30, 0.30);
      a[i * 3 + 1] = cy + rnd(-0.24, 0.24);
      a[i * 3 + 2] = rnd(-0.05, 0.05);
    }
  });

  // You and your accountant, looking at the same folder.
  const share = f((a) => {
    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      if (t < 0.38) {            // left column — you
        a[i * 3] = -2.05 + rnd(-0.42, 0.42); a[i * 3 + 1] = rnd(-1.5, 1.5);
      } else if (t < 0.76) {     // right column — your accountant
        a[i * 3] = 2.05 + rnd(-0.42, 0.42); a[i * 3 + 1] = rnd(-1.5, 1.5);
      } else {                   // the link between them
        a[i * 3] = rnd(-1.5, 1.5); a[i * 3 + 1] = rnd(-0.05, 0.05);
      }
      a[i * 3 + 2] = rnd(-0.08, 0.08);
    }
  });

  // What Drive actually holds: the Expenses sheet, and Supporting Documents.
  const twoFolders = f((a) => {
    const fw = 1.55, fh = 1.15, gap = 0.42;
    for (let i = 0; i < COUNT; i++) {
      const right = i % 2 === 1;
      const cx = right ? (fw / 2 + gap / 2) : -(fw / 2 + gap / 2);
      const t = Math.random();
      let x, y;
      if (t < 0.62) {                                  // edge
        const u = Math.random() * (2 * fw + 2 * fh);
        if (u < fw)               { x = -fw / 2 + u;            y = -fh / 2; }
        else if (u < fw + fh)     { x = fw / 2;                 y = -fh / 2 + (u - fw); }
        else if (u < 2 * fw + fh) { x = fw / 2 - (u - fw - fh); y = fh / 2; }
        else                      { x = -fw / 2;                y = fh / 2 - (u - 2 * fw - fh); }
      } else if (t < 0.74) {                           // tab
        x = -fw / 2 + rnd(0, 0.62); y = fh / 2 + rnd(0, 0.20);
      } else if (right) {                              // photos stacked inside
        x = rnd(-0.42, 0.42); y = rnd(-0.34, 0.30);
      } else {                                         // sheet rows inside
        const row = i % 5;
        x = rnd(-0.52, 0.52); y = 0.30 - row * 0.15;
      }
      a[i * 3] = cx + x + rnd(-0.015, 0.015);
      a[i * 3 + 1] = y + rnd(-0.015, 0.015);
      a[i * 3 + 2] = rnd(-0.04, 0.04);
    }
  });

  // The dashboard in the app: a run of monthly bars under a header rule.
  const dashboard = f((a) => {
    const BARS = 7, bw = 0.42, gap = 0.20, span = BARS * bw + (BARS - 1) * gap;
    const hts = [0.55, 0.95, 0.72, 1.35, 1.05, 1.6, 1.25];
    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      if (t < 0.14) {                                  // header + baseline
        a[i * 3] = rnd(-span / 2, span / 2);
        a[i * 3 + 1] = t < 0.07 ? 1.95 : -1.02;
      } else {
        const b = i % BARS;
        a[i * 3] = -span / 2 + b * (bw + gap) + rnd(0.04, bw - 0.04);
        a[i * 3 + 1] = -1.0 + Math.random() * hts[b];
      }
      a[i * 3 + 2] = rnd(-0.03, 0.03);
    }
  });

  // Filed away: the outline of a folder, with the receipt back inside it.
  const folder = f((a) => {
    const fw = 2.5, fh = 1.75, tabW = 0.95;
    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      let x, y;
      if (t < 0.72) {                       // the folder's edge
        const u = Math.random() * (2 * fw + 2 * fh);
        if (u < fw)              { x = -fw / 2 + u;             y = -fh / 2; }
        else if (u < fw + fh)    { x = fw / 2;                  y = -fh / 2 + (u - fw); }
        else if (u < 2 * fw + fh){ x = fw / 2 - (u - fw - fh);  y = fh / 2; }
        else                     { x = -fw / 2;                 y = fh / 2 - (u - 2 * fw - fh); }
        a[i * 3] = x + rnd(-0.02, 0.02);
        a[i * 3 + 1] = y + rnd(-0.02, 0.02);
      } else if (t < 0.86) {                // the tab
        a[i * 3] = -fw / 2 + rnd(0, tabW);
        a[i * 3 + 1] = fh / 2 + rnd(0, 0.28);
      } else {                              // a little content inside
        a[i * 3] = rnd(-fw / 2 + 0.3, fw / 2 - 0.3);
        a[i * 3 + 1] = rnd(-fh / 2 + 0.25, fh / 2 - 0.25);
      }
      a[i * 3 + 2] = rnd(-0.04, 0.04);
    }
  });

  return { ink, rows, months, twoFolders, dashboard, share, folder };
}

/* Chapter keyframes across global page scroll. */
const KEYS = [
  [0.00, "ink"],       [0.72, "twoFolders"], [0.82, "share"],
  [0.91, "folder"],    [1.00, "folder"],
];

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
    vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG, transparent: true,
    uniforms: { uCrumple: { value: 1 }, uScan: { value: -1 }, uFade: { value: 1 },
                uShutter: { value: 0 }, uExtract: { value: 0 },
                uWipe: { value: 0 }, uCyanHold: { value: 0 }, uInvert: { value: 0 },
                uInk: { value: INK }, uCyan: { value: CYAN } },
  });
  const paper = new Mesh(new PlaneGeometry(W, H, 48, 64), paperMat);
  scene.add(paper);

  const crowdMat = new ShaderMaterial({
    vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG,
    transparent: true, depthWrite: false,
    uniforms: { uCull: { value: 0 }, uAlpha: { value: 0 }, uInk: { value: INK } },
  });
  const crowd = new Mesh(buildCrowd(), crowdMat);
  crowd.renderOrder = -1;
  crowd.frustumCulled = false;
  scene.add(crowd);

  const capMat = new ShaderMaterial({
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

  const sheetMat = new ShaderMaterial({
    vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTex: { value: makeSheetTexture() }, uAlpha: { value: 0 },
                uWipeIn: { value: 0 }, uCyan: { value: CYAN } },
  });
  const sheet = new Mesh(new PlaneGeometry(3.5, 2.4), sheetMat);
  sheet.visible = false;
  scene.add(sheet);

  const F = buildFormations();
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(COUNT * 3), 3));
  geo.setAttribute("aStart", new BufferAttribute(F.ink.slice(), 3));
  geo.setAttribute("aEnd", new BufferAttribute(F.ink.slice(), 3));
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) seeds[i] = Math.random();
  geo.setAttribute("aSeed", new BufferAttribute(seeds, 1));

  const dustMat = new ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSize: { value: 90 }, uAlpha: { value: 0 },
                uArc: { value: 0.3 }, uCyan: { value: CYAN } },
  });
  const dust = new Points(geo, dustMat);
  scene.add(dust);

  // Swapping formations means rewriting two attributes, so only do it when the
  // chapter actually changes rather than every frame.
  let segment = -1;
  function setSegment(i) {
    if (i === segment) return;
    segment = i;
    geo.attributes.aStart.array.set(F[KEYS[i][1]]);
    geo.attributes.aEnd.array.set(F[KEYS[i + 1][1]]);
    geo.attributes.aStart.needsUpdate = true;
    geo.attributes.aEnd.needsUpdate = true;
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (v, a, b) => clamp01((v - a) / (b - a));

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w / h < 0.95;
    camera.position.z = w / h < 0.8 ? 12.4 : 9.3;
    camera.position.x = narrow ? 0 : -0.95;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uSize.value = Math.min(w, h) * 0.10;
  }

  /** p is progress through the whole page, 0 at the top, 1 at the bottom. */
  function apply(p) {
    const ease = (v) => v * v * (3 - 2 * v);
    // 07: the information separates. The receipt keeps the image and moves
    // aside; a second copy of it becomes the row in the sheet.
    const settle = ease(range(p, 0.560, 0.660));

    let i = 0;
    while (i < KEYS.length - 2 && p >= KEYS[i + 1][0]) i++;
    setSegment(i);
    dustMat.uniforms.uT.value = range(p, KEYS[i][0], KEYS[i + 1][0]);

    // The pile is chaotic; ordered formations should not wobble.
    dustMat.uniforms.uArc.value = p < 0.55 ? 0.26 : 0.06;
    // Points arrive after the hero and leave before the FAQ.
    // The pile arrives with chapter 01 and empties out as the story advances:
    // that thinning is the promise the page is making.
    crowdMat.uniforms.uAlpha.value = range(p, 0.03, 0.09) * (1 - range(p, 0.40, 0.54));
    crowdMat.uniforms.uCull.value = range(p, 0.12, 0.46);

    // Hold the folder while its chapter is read, then clear the stage so the
    // call to action is not competing with two thousand dots.
    // The bars are the chart for this stretch; the cloud would only fight it.
    const chartHold = range(p, 0.618, 0.652) * (1 - range(p, 0.772, 0.806));
    dustMat.uniforms.uAlpha.value =
      range(p, 0.720, 0.780) * (1 - range(p, 0.945, 0.985) * 0.96);

    paperMat.uniforms.uCrumple.value = 1 - range(p, 0.12, 0.30);
    paper.rotation.z = (1 - range(p, 0.04, 0.30)) * 0.28;
    paper.rotation.y = (1 - range(p, 0.04, 0.32)) * -0.45;

    const scan = range(p, 0.29, 0.41);
    paperMat.uniforms.uScan.value = p >= 0.29 && p <= 0.43 ? scan : -1;

    // The receipt empties out once its numbers have lifted off, then comes
    // back small inside the folder: the journey ends where it is kept, not in
    // a puff of particles.
    const gone = range(p, 0.628, 0.692);
    const filed = range(p, 0.88, 0.94);
    // Clear the stage before the call to action so it stands on its own.
    const clear = 1 - range(p, 0.945, 0.985);
    const arrive = range(p, 0.045, 0.10);
    paperMat.uniforms.uFade.value = ((1 - gone * 0.998) + filed * 0.92) * clear * arrive;
    const sc = 0.84 * (1 - settle * 0.44) * (1 - filed * 0.55);
    paper.scale.set(sc, sc, 1);
    paper.position.y = -filed * 0.10;

    // Edges found, locked, taken. This is what earns the switch to dark.
    // 02 rectangle -> 03 cyan sweeps the paper -> 04 full cyan and a flash
    // -> 05 the same receipt, inverted.
    paperMat.uniforms.uWipe.value = ease(range(p, 0.432, 0.462));
    paperMat.uniforms.uCyanHold.value = range(p, 0.430, 0.436) * (1 - range(p, 0.478, 0.514));
    paperMat.uniforms.uShutter.value =
      ease(range(p, 0.459, 0.468)) * (1 - ease(range(p, 0.468, 0.488)));
    paperMat.uniforms.uInvert.value = ease(range(p, 0.470, 0.510));
    paperMat.uniforms.uExtract.value = range(p, 0.500, 0.545) * (1 - range(p, 0.620, 0.660));

    const lock = range(p, 0.352, 0.418);
    const e = lock * lock * (3.0 - 2.0 * lock);
    const psc = paper.scale.x;
    const tight = [(W / 2) * psc * 1.045, (H / 2) * psc * 1.015];
    capMat.uniforms.uHalf.value.set(
      tight[0] * (1 + (1 - e) * 0.62), tight[1] * (1 + (1 - e) * 0.34));
    capMat.uniforms.uLen.value = 0.58 - e * 0.28;
    capMat.uniforms.uFull.value = range(p, 0.408, 0.430);
    capMat.uniforms.uFlash.value =
      range(p, 0.418, 0.430) * (1 - range(p, 0.430, 0.452)) * 0.30;
    capture.visible = p > 0.30 && p < 0.53;
    capture.position.x = paper.position.x;
    capture.position.y = paper.position.y;
    capMat.uniforms.uAlpha.value =
      range(p, 0.326, 0.356) * (1 - range(p, 0.470, 0.512));

    sheet.visible = settle > 0.001 && p < 0.70;
    sheetMat.uniforms.uAlpha.value = range(p, 0.548, 0.585) * (1 - range(p, 0.628, 0.692));
    sheetMat.uniforms.uWipeIn.value = ease(range(p, 0.560, 0.645));
    sheet.position.set(-1.95 * settle, 0.30 * settle, -0.05);
    const ss = 0.30 + 0.70 * settle;
    sheet.scale.set(ss, ss, 1);

    // The paper itself becomes the supporting document.
    paper.position.x = 1.75 * settle;
    paper.position.y = -0.10 - 0.16 * settle;

    camera.position.y = -0.42 - range(p, 0.6, 0.95) * 0.25;
  }

  return {
    resize, apply,
    render() { renderer.render(scene, camera); },
    dispose() {
      paper.geometry.dispose(); paperMat.dispose();
      geo.dispose(); dustMat.dispose();
      crowd.geometry.dispose(); crowdMat.dispose();
      capture.geometry.dispose(); capMat.dispose();
      sheet.geometry.dispose(); sheetMat.uniforms.uTex.value.dispose(); sheetMat.dispose();
      renderer.dispose();
    },
  };
}
