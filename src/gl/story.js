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
  InstancedBufferGeometry, InstancedBufferAttribute, IcosahedronGeometry,
  BufferAttribute, ShaderMaterial, Mesh, Points, Color, AdditiveBlending, Vector2, Vector4, CanvasTexture, SRGBColorSpace,
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

/* ---------- folders, drawn as solid lines ---------- */

/* Stroked geometry, not a cloud of points: at this size particles read as
   noise, and the site's line language is the solid rule under the wordmark. */

const FOLDER_VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec2 aSize;
  attribute float aKind;
  attribute float aPhase;
  uniform vec4 uPhaseA;
  varying vec2 vP;
  varying vec2 vHalf;
  varying float vKind;
  varying float vOn;
  void main() {
    vHalf = aSize * 0.5;
    vP = position.xy * (aSize + 0.9);
    vKind = aKind;
    // Each instance belongs to one beat; uPhaseA carries the three opacities.
    vOn = aPhase < 0.5 ? uPhaseA.x
        : aPhase < 1.5 ? uPhaseA.y
        : aPhase < 2.5 ? uPhaseA.z : uPhaseA.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(vP, 0.0) + aPos, 1.0);
  }
`;

const FOLDER_FRAG = /* glsl */ `
  uniform vec3 uCyan;
  uniform float uDraw, uThick;
  varying vec2 vP;
  varying vec2 vHalf;
  varying float vKind;
  varying float vOn;

  float rrect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }

  void main() {
    if (vOn < 0.01) discard;
    vec2 h = vHalf;

    // The link between the two surfaces is a solid rule, not a folder.
    if (vKind > 2.5) {
      float gh = h.y * (0.08 + 0.92 * clamp(uDraw * 1.3, 0.0, 1.0));
      float d3 = rrect(vP - vec2(0.0, gh - h.y), vec2(h.x, gh), min(h.x, 0.07));
      float core3 = smoothstep(0.012, 0.0, d3);
      float glow3 = smoothstep(0.11, 0.0, d3);
      float a3 = clamp(core3 + glow3 * 0.28, 0.0, 1.0) * vOn;
      if (a3 < 0.004) discard;
      gl_FragColor = vec4(uCyan * (1.15 + core3 * 0.9), a3);
      return;
    }

    if (vKind > 1.5) {
      float solid = smoothstep(0.012, 0.0, rrect(vP, h, h.y)) * step(0.30, uDraw);
      if (solid < 0.01) discard;
      gl_FragColor = vec4(uCyan * 1.6, solid * vOn);
      return;
    }

    // A real folder silhouette: back plate, tab, and the angled front flap.
    float d = abs(rrect(vP, vec2(h.x, h.y * 0.86), 0.10));

    float tab = abs(rrect(vP - vec2(-h.x + h.x * 0.42, h.y * 0.86 + h.y * 0.11),
                          vec2(h.x * 0.42, h.y * 0.11), 0.06));
    d = min(d, max(tab, -0.001));

    // Front flap: its top edge rises to the right, the way a folder sits open.
    float flap = seg(vP, vec2(-h.x, h.y * 0.18), vec2(h.x, h.y * 0.54));
    d = min(d, flap);

    // A couple of lines of contents, low and left.
    for (int i = 0; i < 2; i++) {
      float y = -h.y * (0.18 + float(i) * 0.24);
      d = min(d, seg(vP, vec2(-h.x * 0.62, y), vec2(-h.x * (0.16 - float(i) * 0.12), y)));
    }

    // Draws itself left to right.
    float reveal = step((vP.x + h.x) / (2.0 * h.x), uDraw + 0.02);

    // Neon: a bright core inside a soft halo.
    float core = smoothstep(uThick, 0.0, d);
    float glow = smoothstep(uThick * 9.0, 0.0, d);
    float a = clamp(core + glow * 0.42, 0.0, 1.0) * vOn * reveal;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uCyan * (1.25 + core * 1.15), a);
  }
`;

function buildFolders() {
  const base = new PlaneGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.uv = base.attributes.uv;

  //            x      y     w     h    kind  phase
  const inst = [
    [-1.95,  0.15,  2.60, 1.90,  0,  0],   // 06  expenses
    [ 1.95,  0.15,  2.60, 1.90,  1,  0],   // 06  supporting documents
    [-2.15,  0.15,  2.30, 1.70,  0,  1],   // 08  yours
    [ 2.15,  0.15,  2.30, 1.70,  0,  1],   // 08  your accountant's, same folder
    [ 0.00,  0.15,  1.70, 0.075, 2,  1],   // 08  the link between them
    [ 0.00,  0.15,  2.60, 1.90,  1,  2],   // 09  stored
    // 07  the dashboard, in the same neon line language
    [-2.55, -0.90,  0.30, 0.62,  3,  3],
    [-1.70, -0.90,  0.30, 1.18,  3,  3],
    [-0.85, -0.90,  0.30, 0.86,  3,  3],
    [+0.00, -0.90,  0.30, 1.72,  3,  3],
    [+0.85, -0.90,  0.30, 1.30,  3,  3],
    [+1.70, -0.90,  0.30, 2.05,  3,  3],
    [+2.55, -0.90,  0.30, 1.52,  3,  3],
  ];
  g.instanceCount = inst.length;
  const pos = new Float32Array(inst.length * 3), size = new Float32Array(inst.length * 2);
  const kind = new Float32Array(inst.length), phase = new Float32Array(inst.length);
  inst.forEach((r, i) => {
    pos[i * 3] = r[0]; pos[i * 3 + 1] = r[1]; pos[i * 3 + 2] = 0.05;
    size[i * 2] = r[2]; size[i * 2 + 1] = r[3];
    kind[i] = r[4]; phase[i] = r[5];
  });
  g.setAttribute("aPos", new InstancedBufferAttribute(pos, 3));
  g.setAttribute("aSize", new InstancedBufferAttribute(size, 2));
  g.setAttribute("aKind", new InstancedBufferAttribute(kind, 1));
  g.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
  return g;
}

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
    if (vOn < 0.01) discard;
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
  [0.00, "ink"],       [0.60, "ink"],   [0.82, "share"],
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
    uniforms: { uCull: { value: 0 }, uAlpha: { value: 0 }, uInk: { value: INK } },
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

  const folderMat = new ShaderMaterial({
    name: "folders",
    vertexShader: FOLDER_VERT, fragmentShader: FOLDER_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uCyan: { value: CYAN }, uPhaseA: { value: new Vector4(0, 0, 0, 0) },
                uDraw: { value: 0 }, uThick: { value: 0.016 } },
  });
  const folders = new Mesh(buildFolders(), folderMat);
  folders.frustumCulled = false;
  scene.add(folders);

  const sheetMat = new ShaderMaterial({
    name: "sheet",
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
    name: "dust",
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
      0.0 * range(p, 0.792, 0.836) * (1 - range(p, 0.945, 0.985) * 0.96);

    paperMat.uniforms.uCrumple.value = 1 - range(p, 0.12, 0.30);
    paper.rotation.z = (1 - range(p, 0.04, 0.30)) * 0.28;
    paper.rotation.y = (1 - range(p, 0.04, 0.32)) * -0.45;

    const scan = range(p, 0.29, 0.41);
    paperMat.uniforms.uScan.value = p >= 0.29 && p <= 0.43 ? scan : -1;

    // The receipt empties out once its numbers have lifted off, then comes
    // back small inside the folder: the journey ends where it is kept, not in
    // a puff of particles.
    const gone = range(p, 0.604, 0.648);
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

    // Solid folder outlines draw themselves around the two destinations.
    // 06 the pair, 08 the hand-off, 09 the one it ends in.
    const fA = range(p, 0.566, 0.598) * (1 - range(p, 0.606, 0.642));
    const fB = range(p, 0.756, 0.792) * (1 - range(p, 0.856, 0.892));
    const fC = range(p, 0.884, 0.918) * (1 - range(p, 0.958, 0.986));
    const fD = range(p, 0.664, 0.698) * (1 - range(p, 0.736, 0.766));   // 07
    folderMat.uniforms.uPhaseA.value.set(fA, fB, fC, fD);
    folderMat.uniforms.uDraw.value =
      p < 0.655 ? ease(range(p, 0.570, 0.624))
               : p < 0.74 ? ease(range(p, 0.668, 0.722))
               : p < 0.86 ? ease(range(p, 0.760, 0.818))
                          : ease(range(p, 0.888, 0.936));
    folders.visible = Math.max(Math.max(fA, fB), Math.max(fC, fD)) > 0.005;

    // 10 the rows condense toward the ring rather than simply fading.
    const toDash = ease(range(p, 0.606, 0.652));
    sheet.position.x += toDash * (0 - sheet.position.x) * 0.9;
    sheet.position.y += toDash * (1.15 - sheet.position.y) * 0.9;

    sheet.visible = settle > 0.001 && p < 0.65;
    sheetMat.uniforms.uAlpha.value = range(p, 0.548, 0.580) * (1 - range(p, 0.606, 0.642));
    sheetMat.uniforms.uWipeIn.value = ease(range(p, 0.556, 0.612));
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
      folders.geometry.dispose(); folderMat.dispose();
      sheet.geometry.dispose(); sheetMat.uniforms.uTex.value.dispose(); sheetMat.dispose();
      renderer.dispose();
    },
  };
}
