/* The scroll-scrubbed act: a paper receipt uncrumples, a cyan line scans it,
   and the ink lifts off as points that settle into spreadsheet rows.

   Everything is procedural — no textures are fetched, so there is nothing to
   wait on and nothing to 404. Two draw calls total (paper + points). */

import {
  Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry, BufferGeometry,
  BufferAttribute, ShaderMaterial, Mesh, Points, Color, AdditiveBlending,
} from "three";

const INK = new Color("#111a2d");
const CYAN = new Color("#009b95");

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
    float z = n * 0.40 * uCrumple;
    p.z += z;
    vShade = z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const PAPER_FRAG = /* glsl */ `
  uniform float uScan;   // 0..1 sweep position; negative = scanner off
  uniform float uFade;   // paper opacity
  uniform vec3  uInk;
  uniform vec3  uCyan;
  varying vec2  vUv;
  varying float vShade;

  float band(float y, float c, float h){ return smoothstep(h, 0.0, abs(y - c)); }

  void main() {
    vec3 paper = vec3(0.99, 0.992, 1.0) * (1.0 - vShade * 0.55);

    // Printed content, drawn rather than textured.
    float ink = band(vUv.y, 0.88, 0.0075) * step(0.12, vUv.x) * step(vUv.x, 0.60);
    for (int i = 0; i < 5; i++) {
      float y = 0.72 - float(i) * 0.085;
      float w = 0.50 + mod(float(i), 2.0) * 0.24;
      ink += band(vUv.y, y, 0.0032) * step(0.12, vUv.x) * step(vUv.x, 0.12 + w);
    }
    ink += band(vUv.y, 0.26, 0.0016) * step(0.10, vUv.x) * step(vUv.x, 0.90);

    float total = band(vUv.y, 0.16, 0.0075) * step(0.12, vUv.x) * step(vUv.x, 0.70);

    vec3 col = mix(paper, uInk, clamp(ink, 0.0, 1.0) * 0.78);
    col = mix(col, uCyan, total * 0.92);

    if (uScan >= 0.0) {
      float d = abs(vUv.y - (1.0 - uScan));
      col = mix(col, uCyan, smoothstep(0.10, 0.0, d) * 0.26 + smoothstep(0.011, 0.0, d) * 0.8);
    }

    float edge = smoothstep(0.0, 0.025, vUv.x) * smoothstep(1.0, 0.975, vUv.x)
               * smoothstep(0.0, 0.018, vUv.y) * smoothstep(1.0, 0.982, vUv.y);

    gl_FragColor = vec4(col, uFade * edge);
  }
`;

const DUST_VERT = /* glsl */ `
  attribute vec3  aStart;
  attribute vec3  aEnd;
  attribute float aSeed;
  uniform float uProgress;   // 0..1
  uniform float uSize;
  varying float vAlpha;

  void main() {
    float e = clamp((uProgress - aSeed * 0.18) / 0.82, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 p = mix(aStart, aEnd, e);
    p.z += sin(e * 3.14159) * (0.18 + aSeed * 0.45);         // lift and settle
    p.x += sin(e * 3.14159) * (aSeed - 0.5) * 0.28;
    vAlpha = smoothstep(0.0, 0.15, uProgress) * (0.35 + 0.65 * e);
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

const W = 2.6, H = 3.6, COUNT = 2400;

/** Points start on the printed lines and land as rows of a table: 12 rows,
    4 column blocks, dense within each block so a row reads as filled cells. */
function buildDust() {
  const start = new Float32Array(COUNT * 3);
  const end = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const srcRows = [0.88, 0.72, 0.635, 0.55, 0.465, 0.38, 0.16];

  const ROWS = 12, COLS = 4;
  const gridW = W * 1.34, gridH = H * 0.72, cw = gridW / COLS;

  for (let i = 0; i < COUNT; i++) {
    const r = srcRows[i % srcRows.length];
    start[i * 3] = (0.12 + Math.random() * 0.58 - 0.5) * W;
    start[i * 3 + 1] = (r - 0.5) * H;
    start[i * 3 + 2] = 0.02;

    const row = i % ROWS;
    const col = (i / ROWS | 0) % COLS;
    end[i * 3] = -gridW / 2 + col * cw + cw * (0.10 + Math.random() * 0.62);
    end[i * 3 + 1] = gridH / 2 - (row / (ROWS - 1)) * gridH + (Math.random() - 0.5) * 0.03;
    end[i * 3 + 2] = 0;

    seed[i] = Math.random();
  }

  const g = new BufferGeometry();
  // `position` is unused by the shader but three still expects the attribute.
  g.setAttribute("position", new BufferAttribute(new Float32Array(COUNT * 3), 3));
  g.setAttribute("aStart", new BufferAttribute(start, 3));
  g.setAttribute("aEnd", new BufferAttribute(end, 3));
  g.setAttribute("aSeed", new BufferAttribute(seed, 1));
  return g;
}

export function createAct(canvas) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 8.6);

  const paperMat = new ShaderMaterial({
    vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG,
    transparent: true,
    uniforms: {
      uCrumple: { value: 1 }, uScan: { value: -1 }, uFade: { value: 1 },
      uInk: { value: INK }, uCyan: { value: CYAN },
    },
  });
  const paper = new Mesh(new PlaneGeometry(W, H, 48, 64), paperMat);
  scene.add(paper);

  const dustMat = new ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uSize: { value: 90 }, uCyan: { value: CYAN } },
  });
  const dust = new Points(buildDust(), dustMat);
  dust.visible = false;
  scene.add(dust);

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on narrow screens so the receipt always fits.
    camera.position.z = w / h < 0.8 ? 11.5 : 8.6;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uSize.value = Math.min(w, h) * 0.11;
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (v, a, b) => clamp01((v - a) / (b - a));

  /** Map scroll progress to scene state. Keyframes are in docs/design-spec.md. */
  function apply(p) {
    paperMat.uniforms.uCrumple.value = 1 - range(p, 0.0, 0.28);
    paper.rotation.z = (1 - range(p, 0, 0.3)) * 0.32;
    paper.rotation.y = (1 - range(p, 0, 0.32)) * -0.5;

    const scan = range(p, 0.30, 0.55);
    paperMat.uniforms.uScan.value = p >= 0.30 && p <= 0.58 ? scan : -1;

    const diss = range(p, 0.45, 0.86);
    dust.visible = diss > 0.001;
    dustMat.uniforms.uProgress.value = diss;

    paperMat.uniforms.uFade.value = 1 - range(p, 0.62, 0.92) * 0.94;
    camera.position.y = -range(p, 0.5, 1) * 0.25;
  }

  function render() { renderer.render(scene, camera); }

  return {
    resize,
    apply,
    render,
    dispose() {
      paper.geometry.dispose(); paperMat.dispose();
      dust.geometry.dispose(); dustMat.dispose();
      renderer.dispose();
    },
  };
}
