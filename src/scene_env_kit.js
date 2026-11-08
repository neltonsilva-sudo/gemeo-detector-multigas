// Kit de construção de ambientes (agente RENDER): texturas procedurais PBR, céu, placas NR-26 em canvas,
// partículas animadas na GPU (pluma, fumaça, névoa fria, poeira, vapor) e utilitários. Nada de assets externos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { RoundedBoxGeometry };
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------------------------------------------------------------- texturas
function tex(c, srgb = true, rep = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  return t;
}
/** mapa de normais a partir de um canvas de altura (luminância) */
export function heightToNormal(hc, strength = 2) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = cvs(W, H), g = out.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x - 1, y) - h(x + 1, y)) * strength, dy = (h(x, y - 1) - h(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}
function blotches(g, R, N, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = R() * N, y = R() * N, r = rMin + R() * (rMax - rMin);
    const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, colorFn(R)); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { if (x + ox + r < 0 || x + ox - r > N || y + oy + r < 0 || y + oy - r > N) continue; g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); }
  }
}
function grain(g, N, R, amp, tint = [1, 1, 1]) {
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * amp; d[i] += n * tint[0]; d[i + 1] += n * tint[1]; d[i + 2] += n * tint[2]; }
  g.putImageData(img, 0, 0);
}

/** concreto (piso/mureta): cor, rugosidade, normal. `base` = cor CSS, `joints` = juntas por textura */
export function concreteSet({ seed = 1, base = '#8d8a84', joints = 0, rep = [4, 4], stains = 1 } = {}) {
  const N = 1024, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  blotches(g, R, N, 120 * stains, 40, 220, (r) => (r() < 0.6 ? `rgba(45,42,38,${0.05 + r() * 0.1})` : `rgba(190,186,176,${0.04 + r() * 0.08})`));
  grain(g, N, R, 18);
  const hc = cvs(N, N), hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, N, N); grain(hg, N, R, 40);
  blotches(hg, R, N, 400, 2, 7, (r) => `rgba(${r() < 0.5 ? 40 : 220},${r() < 0.5 ? 40 : 220},${r() < 0.5 ? 40 : 220},0.6)`);
  if (joints) {
    g.strokeStyle = 'rgba(30,28,25,0.8)'; hg.strokeStyle = '#000'; g.lineWidth = hg.lineWidth = 4;
    for (let k = 0; k <= joints; k++) { const p = k * N / joints; for (const ctx of [g, hg]) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, N); ctx.moveTo(0, p); ctx.lineTo(N, p); ctx.stroke(); } }
  }
  const rc = cvs(N, N), rg = rc.getContext('2d'); rg.fillStyle = '#d0d0d0'; rg.fillRect(0, 0, N, N);
  blotches(rg, R, N, 50, 30, 140, (r) => `rgba(90,90,90,${0.2 + r() * 0.4})`);
  return { map: tex(c, true, rep), roughnessMap: tex(rc, false, rep), normalMap: tex(heightToNormal(hc, 1.6), false, rep) };
}

/** aço pintado com ferrugem, escorrimentos e cordões de solda */
export function rustSteelSet({ seed = 2, paint = '#5d6468', rust = 1, rep = [2, 2], seams = 4 } = {}) {
  const N = 1024, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  g.fillStyle = paint; g.fillRect(0, 0, N, N);
  blotches(g, R, N, 140, 20, 160, (r) => `rgba(${100 + r() * 50},${45 + r() * 30},${18 + r() * 15},${(0.15 + r() * 0.45) * rust})`);
  blotches(g, R, N, 400, 3, 18, (r) => `rgba(${70 + r() * 40},${30 + r() * 20},10,${0.5 * rust})`);
  // escorrimentos verticais
  for (let i = 0; i < 70 * rust; i++) {
    const x = R() * N, y = R() * N, l = 60 + R() * 260, w = 2 + R() * 6;
    const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, `rgba(110,52,18,${0.35 * rust})`); gr.addColorStop(1, 'rgba(110,52,18,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, l);
  }
  grain(g, N, R, 14);
  const hc = cvs(N, N), hg = hc.getContext('2d'); hg.fillStyle = '#7a7a7a'; hg.fillRect(0, 0, N, N); grain(hg, N, R, 30);
  blotches(hg, R, N, 300, 3, 14, () => 'rgba(190,190,190,0.5)');
  hg.fillStyle = '#d8d8d8'; g.fillStyle = 'rgba(60,40,30,0.5)';
  for (let k = 0; k < seams; k++) { const y = (k + 0.5) * N / seams; hg.fillRect(0, y - 5, N, 10); g.fillRect(0, y - 3, N, 6); }
  const rc = cvs(N, N), rg = rc.getContext('2d'); rg.fillStyle = '#9a9a9a'; rg.fillRect(0, 0, N, N);
  blotches(rg, R, N, 140, 20, 160, (r) => `rgba(245,245,245,${0.3 * rust + r() * 0.2})`);
  return { map: tex(c, true, rep), roughnessMap: tex(rc, false, rep), normalMap: tex(heightToNormal(hc, 2.5), false, rep) };
}

/** chapa xadrez (piso de aço antiderrapante) */
export function treadPlateSet({ seed = 3, rep = [6, 6] } = {}) {
  const N = 512, R = rng(seed), hc = cvs(N, N), hg = hc.getContext('2d');
  hg.fillStyle = '#555'; hg.fillRect(0, 0, N, N);
  const s = N / 8;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    hg.save(); hg.translate(x * s + s / 2, y * s + s / 2); hg.rotate(((x + y) % 2 ? 1 : -1) * Math.PI / 4);
    const gr = hg.createLinearGradient(-s * 0.36, 0, s * 0.36, 0); gr.addColorStop(0, '#666'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#666');
    hg.fillStyle = gr; hg.beginPath(); hg.ellipse(0, 0, s * 0.36, s * 0.07, 0, 0, 7); hg.fill(); hg.restore();
  }
  const c = cvs(N, N), g = c.getContext('2d'); g.fillStyle = '#6c6f70'; g.fillRect(0, 0, N, N);
  blotches(g, R, N, 60, 10, 90, (r) => `rgba(${90 + r() * 40},${50 + r() * 20},25,${0.25 + r() * 0.3})`);
  blotches(g, R, N, 40, 10, 70, () => 'rgba(30,30,30,0.25)');
  grain(g, N, R, 16);
  const rc = cvs(N, N), rg = rc.getContext('2d'); rg.fillStyle = '#707070'; rg.fillRect(0, 0, N, N); blotches(rg, R, N, 60, 10, 90, () => 'rgba(230,230,230,0.4)');
  return { map: tex(c, true, rep), roughnessMap: tex(rc, false, rep), normalMap: tex(heightToNormal(hc, 3), false, rep) };
}

/** telha/chapa trapezoidal (galpões): ondas verticais + sujeira escorrida */
export function corrugatedSet({ seed = 4, paint = '#9aa2a6', rep = [6, 1] } = {}) {
  const W = 512, H = 512, R = rng(seed), hc = cvs(W, H), hg = hc.getContext('2d');
  for (let x = 0; x < W; x++) { const p = (x % 64) / 64; const v = p < 0.2 ? 255 : p < 0.3 ? 255 - (p - 0.2) * 2550 : p < 0.7 ? 0 : p < 0.8 ? (p - 0.7) * 2550 : 255; hg.fillStyle = `rgb(${v},${v},${v})`; hg.fillRect(x, 0, 1, H); }
  const c = cvs(W, H), g = c.getContext('2d'); g.fillStyle = paint; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { const x = R() * W, l = 40 + R() * 300; g.fillStyle = `rgba(70,60,50,${0.05 + R() * 0.12})`; g.fillRect(x, R() * H * 0.5, 2 + R() * 5, l); }
  grain(g, W, R, 10);
  return { map: tex(c, true, rep), normalMap: tex(heightToNormal(hc, 1.2), false, rep) };
}

/** parede de blocos de concreto */
export function blockWallSet({ seed = 5, base = '#a7a39b', rep = [3, 2] } = {}) {
  const N = 1024, R = rng(seed), c = cvs(N, N), g = c.getContext('2d'), hc = cvs(N, N), hg = hc.getContext('2d');
  g.fillStyle = '#6d6a64'; g.fillRect(0, 0, N, N); hg.fillStyle = '#000'; hg.fillRect(0, 0, N, N);
  const bw = N / 2, bh = N / 5;
  for (let r = 0; r < 5; r++) for (let k = -1; k < 3; k++) {
    const x = k * bw + (r % 2) * bw / 2, y = r * bh;
    const l = 0.9 + R() * 0.15; const b = parseInt(base.slice(1), 16);
    g.fillStyle = `rgb(${((b >> 16) & 255) * l | 0},${((b >> 8) & 255) * l | 0},${(b & 255) * l | 0})`; g.fillRect(x + 5, y + 5, bw - 10, bh - 10);
    hg.fillStyle = '#c8c8c8'; hg.fillRect(x + 6, y + 6, bw - 12, bh - 12);
  }
  blotches(g, R, N, 60, 30, 200, (r) => `rgba(40,38,34,${0.05 + r() * 0.12})`);
  grain(g, N, R, 22); grain(hg, N, R, 50);
  return { map: tex(c, true, rep), normalMap: tex(heightToNormal(hc, 2), false, rep) };
}

export function std(params, maps) { return new THREE.MeshStandardMaterial({ ...(maps || {}), ...params }); }

// ---------------------------------------------------------------- céu
export function makeSky({ zenith, horizon, ground, sunDir, sunColor = [1, 0.95, 0.85], sunSize = 0.9995, sunGlow = 0.35, clouds = 0.3, cloudColor = [1, 1, 1], overcast = 0 }) {
  const u = {
    zenith: { value: new THREE.Color(...zenith) }, horizon: { value: new THREE.Color(...horizon) }, ground: { value: new THREE.Color(...ground) },
    sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, sunColor: { value: new THREE.Color(...sunColor) },
    sunSize: { value: sunSize }, sunGlow: { value: sunGlow }, clouds: { value: clouds }, cloudColor: { value: new THREE.Color(...cloudColor) },
    overcast: { value: overcast }, time: { value: 0 },
  };
  const m = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */`
      uniform vec3 zenith, horizon, ground, sunColor, cloudColor; uniform vec3 sunDir; uniform float sunSize, sunGlow, clouds, overcast, time;
      varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(horizon, ground, clamp(-y * 6.0, 0.0, 1.0));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(sd, 8.0) * sunGlow + pow(sd, 64.0) * sunGlow * 1.5) * (1.0 - overcast * 0.85);
        if (y > 0.0) {
          vec2 p = d.xz / (y + 0.12) * 1.3 + vec2(time * 0.01, 0.0);
          float c = smoothstep(1.0 - clouds - 0.15, 1.0 - clouds + 0.35, fbm(p));
          float shade = 0.75 + 0.35 * fbm(p * 1.7 + 3.0);
          col = mix(col, cloudColor * shade * (1.0 + pow(sd, 6.0) * 0.6), c * smoothstep(0.0, 0.12, y) * 0.9);
          col = mix(col, horizon * 1.05, overcast * (0.6 + 0.4 * fbm(p * 0.6)));
        }
        if (sd > sunSize) col += sunColor * 18.0 * (1.0 - overcast);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  m.renderOrder = -100; m.frustumCulled = false; m.userData.sky = u;
  return m;
}

// ---------------------------------------------------------------- placas NR-26 (canvas nítido, PT-BR)
const COL = { vermelho: '#c8102e', amarelo: '#ffcc00', verde: '#00843d', azul: '#0055a5', preto: '#111111', branco: '#ffffff' };
function triangleIcon(g, x, y, s, inner) {
  g.save(); g.translate(x, y);
  g.fillStyle = COL.preto; g.beginPath(); g.moveTo(0, -s * 0.58); g.lineTo(s * 0.55, s * 0.4); g.lineTo(-s * 0.55, s * 0.4); g.closePath(); g.fill();
  g.fillStyle = COL.amarelo; g.beginPath(); g.moveTo(0, -s * 0.44); g.lineTo(s * 0.43, s * 0.32); g.lineTo(-s * 0.43, s * 0.32); g.closePath(); g.fill();
  g.fillStyle = COL.preto; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (inner === 'chama') {
    g.beginPath(); g.moveTo(0, -s * 0.22); g.bezierCurveTo(s * 0.22, -s * 0.02, s * 0.2, s * 0.24, 0, s * 0.26); g.bezierCurveTo(-s * 0.2, s * 0.24, -s * 0.22, s * 0.04, -s * 0.06, -s * 0.06);
    g.bezierCurveTo(-s * 0.04, s * 0.04, s * 0.02, s * 0.04, 0, -s * 0.22); g.fill();
  } else { g.font = `900 ${s * (inner.length > 1 ? 0.24 : 0.46)}px Arial, Helvetica, sans-serif`; g.fillText(inner, 0, s * 0.06); }
  g.restore();
}
function prohibIcon(g, x, y, s, what) {
  g.save(); g.translate(x, y);
  g.fillStyle = COL.branco; g.beginPath(); g.arc(0, 0, s * 0.46, 0, 7); g.fill();
  g.fillStyle = COL.preto;
  if (what === 'cigarro') { g.fillRect(-s * 0.3, -s * 0.05, s * 0.48, s * 0.1); g.fillRect(s * 0.2, -s * 0.05, s * 0.08, s * 0.1); g.fillStyle = '#777'; g.beginPath(); g.arc(s * 0.32, -s * 0.16, s * 0.05, 0, 7); g.fill(); }
  if (what === 'chama') { g.beginPath(); g.moveTo(0, -s * 0.3); g.bezierCurveTo(s * 0.22, -s * 0.06, s * 0.18, s * 0.26, 0, s * 0.28); g.bezierCurveTo(-s * 0.18, s * 0.26, -s * 0.22, -s * 0.02, 0, -s * 0.3); g.fill(); }
  g.strokeStyle = COL.vermelho; g.lineWidth = s * 0.1; g.beginPath(); g.arc(0, 0, s * 0.42, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.3, -s * 0.3); g.lineTo(s * 0.3, s * 0.3); g.stroke();
  g.restore();
}
function fitText(g, text, maxW, size, weight = 800) {
  let s = size; do { g.font = `${weight} ${s}px Arial, Helvetica, sans-serif`; s -= 2; } while (g.measureText(text).width > maxW && s > 10);
}
/**
 * Placa de segurança. kind: 'perigo' (faixa vermelha) | 'atencao' (amarela) | 'aviso' (azul) | 'seguranca' (verde).
 * icon: {type:'tri'|'proib', inner} ; lines: texto do corpo (PT-BR). Retorna Mesh (placa com borda e espessura).
 */
export function makeSign({ w = 0.6, h = 0.4, kind = 'perigo', title, lines = [], icon = null, dirt = 0.15, seed = 9 }) {
  const PX = 1400, CW = Math.round(PX * w / Math.max(w, h)), CH = Math.round(PX * h / Math.max(w, h));
  const c = cvs(CW, CH), g = c.getContext('2d'), R = rng(seed);
  const head = { perigo: COL.vermelho, atencao: COL.amarelo, aviso: COL.azul, seguranca: COL.verde }[kind];
  const headTxt = kind === 'atencao' ? COL.preto : COL.branco;
  g.fillStyle = COL.branco; g.fillRect(0, 0, CW, CH);
  const hb = CH * 0.27, m = CW * 0.035;
  g.fillStyle = head; g.fillRect(m, m, CW - 2 * m, hb);
  if (kind === 'perigo') { g.fillStyle = COL.preto; g.fillRect(m, m, CW - 2 * m, hb * 0.06); g.fillRect(m, m + hb * 0.94, CW - 2 * m, hb * 0.06); }
  g.fillStyle = headTxt; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, title, CW - 4 * m, hb * 0.72, 900); g.fillText(title, CW / 2, m + hb / 2 + 2);
  let x0 = m * 2, bodyW = CW - 4 * m;
  const bodyTop = m + hb + CH * 0.04, bodyH = CH - bodyTop - m * 1.5;
  if (icon) {
    const s = Math.min(bodyH, CW * 0.3);
    if (icon.type === 'tri') triangleIcon(g, x0 + s / 2, bodyTop + bodyH / 2, s, icon.inner);
    else prohibIcon(g, x0 + s / 2, bodyTop + bodyH / 2, s, icon.inner);
    x0 += s + m; bodyW -= s + m;
  }
  g.fillStyle = COL.preto; g.textAlign = 'left';
  const lh = Math.min(bodyH / Math.max(1, lines.length) * 0.92, CH * 0.13);
  lines.forEach((t, i) => { fitText(g, t, bodyW, lh * 0.82, 800); g.fillText(t, x0, bodyTop + lh * (i + 0.5) + (bodyH - lh * lines.length) / 2); });
  g.strokeStyle = '#222'; g.lineWidth = m * 0.25; g.strokeRect(m * 0.4, m * 0.4, CW - m * 0.8, CH - m * 0.8);
  // sujeira/desbotamento leve (realismo) — sem comprometer a leitura
  blotches(g, R, Math.max(CW, CH), 18, 30, 160, (r) => `rgba(90,80,60,${dirt * (0.2 + r() * 0.4)})`);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.0 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.4, metalness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), [edge, edge, edge, edge, face, edge]);
  return mesh;
}

// ---------------------------------------------------------------- partículas na GPU (sem custo de CPU por quadro)
/**
 * mode 'jet': pluma/fumaça a partir de `origin` na direção `dir`, com vento e turbulência.
 * mode 'box': partículas flutuando numa caixa (poeira, névoa rasteira, vapor).
 */
export function makeParticles({ count = 300, mode = 'jet', origin = [0, 0, 0], dir = [0, 1, 0], speed = 0.3, spread = 0.3, life = 4,
  size = [0.05, 0.6], color = [1, 1, 1], opacity = 0.35, wind = [0, 0, 0], turb = 0.1, box = [[-1, 0, -1], [1, 1, 1]], blending = 'normal', seed = 7, soft = 3.0, lit = 1 }) {
  const R = rng(seed), geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), sd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { sd.set([R(), R(), R(), R()], i * 4); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
  const u = {
    time: { value: 0 }, origin: { value: new THREE.Vector3(...origin) }, dir: { value: new THREE.Vector3(...dir).normalize() },
    speed: { value: speed }, spread: { value: spread }, life: { value: life }, s0: { value: size[0] }, s1: { value: size[1] },
    color: { value: new THREE.Color(...color).multiplyScalar(lit) }, opacity: { value: opacity }, wind: { value: new THREE.Vector3(...wind) }, turb: { value: turb },
    bmin: { value: new THREE.Vector3(...box[0]) }, bmax: { value: new THREE.Vector3(...box[1]) }, scale: { value: 600 }, soft: { value: soft }, fade: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    blending: blending === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    defines: { MODE_BOX: mode === 'box' ? 1 : 0 },
    vertexShader: /* glsl */`
      attribute vec4 seed; uniform float time, speed, spread, life, s0, s1, opacity, turb, scale;
      uniform vec3 origin, dir, wind, bmin, bmax; varying float vA; varying float vS;
      void main(){
        vec3 p; float a; vec3 j = seed.yzw * 2.0 - 1.0;
        #if MODE_BOX
          a = fract(time / life + seed.x);
          p = bmin + seed.yzw * (bmax - bmin);
          p += wind * (a - 0.5) * life + turb * vec3(sin(time * 0.7 + seed.x * 40.0), sin(time * 0.5 + seed.y * 30.0) * 0.4, cos(time * 0.6 + seed.z * 50.0));
          float sz = mix(s0, s1, seed.w);
          vA = opacity * sin(3.14159 * a);
        #else
          a = fract(time / life + seed.x);
          float tt = a * life;
          vec3 side = normalize(cross(dir, abs(dir.y) > 0.9 ? vec3(1,0,0) : vec3(0,1,0))); vec3 up2 = cross(dir, side);
          p = origin + dir * speed * tt + (side * j.x + up2 * j.y) * spread * a + wind * tt * tt * 0.5;
          p += turb * a * vec3(sin(time * 1.3 + seed.x * 60.0), sin(time * 1.1 + seed.y * 50.0), cos(time * 1.2 + seed.z * 40.0));
          float sz = mix(s0, s1, pow(a, 0.7));
          vA = opacity * smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.45, 1.0, a));
        #endif
        vS = seed.x;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(sz * scale / -mv.z, 1.0, 512.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float soft, fade; varying float vA; varying float vS;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
        if (d > 1.0) discard;
        float n = 0.75 + 0.25 * sin(q.x * 9.0 + vS * 40.0) * sin(q.y * 7.0 + vS * 23.0);
        float a = exp(-d * d * soft) * n * vA * fade;
        gl_FragColor = vec4(color, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.particles = u;
  return pts;
}

// ---------------------------------------------------------------- utilitários de geometria
export function pipe(r, len, mat, pos, axis = 'x', seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(...pos); return m;
}
export function flange(r, mat, pos, axis = 'x') { return pipe(r * 1.45, 0.035, mat, pos, axis, 24); }
export function box(w, h, d, mat, pos, round = 0) {
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(...pos); return m;
}
/** guarda-corpo amarelo (NR-12/NR-26) */
export function railing(len, mat, pos, rotY = 0) {
  const g = new THREE.Group();
  for (const y of [0.5, 1.05]) g.add(pipe(0.022, len, mat, [0, y, 0], 'x', 14));
  for (let x = -len / 2; x <= len / 2 + 1e-3; x += Math.min(1.5, len)) g.add(pipe(0.025, 1.08, mat, [x, 0.54, 0], 'y', 14));
  g.add(box(len, 0.1, 0.01, mat, [0, 0.05, 0]));
  g.position.set(...pos); g.rotation.y = rotY; return g;
}
export function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
  });
}
