// Agente CARCAÇA — texturas procedurais (canvas) e remendos de shader (micro-relevo procedural sem UV).
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
varying vec3 vOP;
uniform float uBump; uniform float uGrain; uniform float uTone; uniform float uBrush; uniform mat3 normalMatrix;
float dvH(vec3 p){ p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dvN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dvH(i), dvH(i + vec3(1,0,0)), f.x), mix(dvH(i + vec3(0,1,0)), dvH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dvH(i + vec3(0,0,1)), dvH(i + vec3(1,0,1)), f.x), mix(dvH(i + vec3(0,1,1)), dvH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float dvHeight(vec3 p){
  vec3 q = p * uGrain;
  q.y *= mix(1.0, 0.06, uBrush);           // escovado: estica ao longo de y
  float h = dvN(q) * 0.6 + dvN(q * 2.13 + 7.1) * 0.3 + dvN(q * 4.7 + 3.3) * 0.1;
  return h;
}
`;

/** Micro-relevo procedural (gradiente numérico em espaço de objeto) + variação de tom. */
export function patchSurface(mat, { bump = 0.25, grain = 2600, tone = 0.05, brush = 0 } = {}) {
  mat.userData.uniforms = { uBump: { value: bump }, uGrain: { value: grain }, uTone: { value: tone }, uBrush: { value: brush } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float tv = dvN(vOP * 220.0) * 0.65 + dvN(vOP * 900.0) * 0.35; diffuseColor.rgb *= 1.0 + uTone * (tv - 0.5) * 2.0; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float fp = length(fwidth(vOP)) * uGrain;                 // tamanho do pixel em células de ruído
          float amp = uBump * (1.0 - smoothstep(0.35, 1.4, fp));
          if (amp > 0.001) {
            float e = 0.25 / uGrain;
            float h0 = dvHeight(vOP);
            vec3 g = vec3(dvHeight(vOP + vec3(e,0,0)) - h0, dvHeight(vOP + vec3(0,e,0)) - h0, dvHeight(vOP + vec3(0,0,e)) - h0) / 0.25;
            vec3 gv = normalMatrix * g;
            normal = normalize(normal - amp * (gv - dot(gv, normal) * normal));
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'dvsurf' + (brush > 0 ? 'b' : '');
  return mat;
}

/** Emissivo modulado por atributo por vértice (máscara dos LEDs atrás das lentes leitosas). */
export function patchLedMask(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ledMask; varying float vLed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLed = ledMask;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLed;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLed;');
  };
  mat.customProgramCacheKey = () => 'dvled' + (prev ? 's' : '');
  return mat;
}

// ---------------- etiqueta do modelo (faixa preta abaixo do LCD) ----------------
// cobre x -23.6..23.6 mm, y 74.6..82.8 mm. Fundo transparente (o preto é a moldura).
export function makeModelLabel() {
  const PX = 60, W = 47.2, H = 8.2;
  const c = document.createElement('canvas'); c.width = Math.round(W * PX); c.height = Math.round(H * PX);
  const g = c.getContext('2d');
  const X = (mm) => (mm + W / 2) * PX, Y = (mm) => (82.8 - mm) * PX;
  // faixa amarela em paralelogramo
  const yT = 81.25, yB = 77.05, xL = -11.0, sl = 1.6, xR = 22.65, r = 1.3;
  g.fillStyle = '#f2c200';
  g.beginPath();
  g.moveTo(X(xL + sl), Y(yT)); g.lineTo(X(xR - r), Y(yT)); g.quadraticCurveTo(X(xR), Y(yT), X(xR), Y(yT - r));
  g.lineTo(X(xR), Y(yB)); g.lineTo(X(xL), Y(yB)); g.closePath(); g.fill();
  // texto "GasAlertMax XT II" em versalete itálico: GasAlert fino, Max XT II negrito
  const base = Y(yB + 0.78);
  const cap = 3.25 * PX, sc = 2.45 * PX;
  let x = X(xL + 2.3);
  const put = (txt, w, size, spacing = 0) => {
    g.font = `italic ${w} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    for (const ch of txt) { g.fillText(ch, x, base); x += g.measureText(ch).width + spacing * PX; }
  };
  g.fillStyle = '#050505';
  put('G', 400, cap, 0.02); put('AS', 400, sc, 0.02); put('A', 400, cap, 0.02); put('LERT', 400, sc, 0.02);
  put('M', 800, cap, 0.0); put('AX', 800, sc, 0.0); x += 0.75 * PX; put('XT', 800, cap * 1.05, 0.0); x += 0.25 * PX;
  put('II', 700, cap * 1.0, 0.05);
  // losango genérico (no lugar de logotipo), branco
  const cx = X(-17.2), cy = Y(78.9), s = 2.5 * PX;
  g.strokeStyle = '#f4f4f4'; g.lineWidth = 0.42 * PX; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.8, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.8, cy); g.closePath(); g.stroke();
  g.fillStyle = '#f4f4f4';
  g.beginPath(); g.moveTo(cx, cy - s * 0.42); g.lineTo(cx + s * 0.32, cy); g.lineTo(cx, cy + s * 0.42); g.lineTo(cx - s * 0.32, cy); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { texture: t, w: W, h: H, cx: 0, cy: (74.6 + 82.8) / 2 };
}

// ---------------- etiqueta traseira (34 × 37 mm, abaixo do clipe) ----------------
export function makeBackLabel() {
  const PX = 32, W = 34, H = 37;
  const c = document.createElement('canvas'); c.width = W * PX; c.height = H * PX;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, c.width, c.height);
  const T = (txt, x, y, size, w = 400, align = 'left', style = '') => { g.font = `${style} ${w} ${size * PX}px "Helvetica Neue", Arial, sans-serif`; g.textAlign = align; g.fillText(txt, x * PX, y * PX); };
  // faixa preta do topo com o modelo (sem logotipo do fabricante: losango genérico)
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, 4.6 * PX);
  g.strokeStyle = '#fff'; g.lineWidth = 0.3 * PX;
  g.beginPath(); g.moveTo(3 * PX, 0.8 * PX); g.lineTo(4.6 * PX, 2.3 * PX); g.lineTo(3 * PX, 3.8 * PX); g.lineTo(1.4 * PX, 2.3 * PX); g.closePath(); g.stroke();
  g.fillStyle = '#fff'; T('GasAlert', 7.6, 3.25, 2.2, 400, 'left', 'italic'); g.font = `italic 800 ${2.3 * PX}px "Helvetica Neue", Arial`;
  g.textAlign = 'left'; g.fillText('Max XT II', (7.6 + 9.0) * PX, 3.25 * PX);
  g.fillStyle = '#111';
  T('Detector multigás com bomba — modelo genérico de simulação', 1.2, 6.6, 1.05, 500);
  const lines = ['Intrinsecamente seguro  Ex ia IIC T4 Ga', 'Classe I Div. 1 Grupos A,B,C,D T4', '-20 °C ≤ Ta ≤ +50 °C   3,7 V Li-ion',
    'AVISO: carregar somente em área não', 'classificada. Leia o manual antes de usar.', 'Substituição de componentes pode', 'comprometer a segurança intrínseca.'];
  lines.forEach((l, i) => T(l, 9.4, 9.0 + i * 1.75, 1.08, 400));
  // selos genéricos (círculos/losangos)
  g.lineWidth = 0.22 * PX; g.strokeStyle = '#111';
  const circ = (x, y, r, t) => { g.beginPath(); g.arc(x * PX, y * PX, r * PX, 0, 7); g.stroke(); T(t, x, y + 0.45, 1.15, 800, 'center'); };
  circ(4.4, 10.2, 2.4, 'SP'); circ(4.4, 16.0, 2.2, 'IS');
  g.beginPath(); g.moveTo(4.4 * PX, 19.4 * PX); g.lineTo(6.8 * PX, 21.8 * PX); g.lineTo(4.4 * PX, 24.2 * PX); g.lineTo(2.0 * PX, 21.8 * PX); g.closePath(); g.stroke();
  T('Ex', 4.4, 22.3, 1.2, 800, 'center');
  circ(30.0, 23.0, 1.9, '10');
  // triângulo de aviso
  g.beginPath(); g.moveTo(25.5 * PX, 19.6 * PX); g.lineTo(27.9 * PX, 23.8 * PX); g.lineTo(23.1 * PX, 23.8 * PX); g.closePath(); g.stroke();
  T('!', 25.5, 23.4, 2.6, 800, 'center');
  // códigos de barras + nº de série
  let s = 777;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bars = (x0, x1, y, h) => { let x = x0; while (x < x1) { const w = 0.12 + rnd() * 0.32; if (rnd() > 0.38) g.fillRect(x * PX, y * PX, w * PX, h * PX); x += w + 0.1; } };
  T('M:  GA-SIM-XT2-0000', 2.0, 27.0, 1.05, 500); bars(2.0, 31.5, 27.6, 2.6);
  T('S/N: MA218-0472613', 2.0, 32.4, 1.05, 500); bars(2.0, 31.5, 33.0, 2.6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
