// Texturas procedurais do kit de calibração (dono: agente KIT). Tudo gerado em canvas/DataTexture — sem assets.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const COND = '"Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif';

function finishTex(t, { srgb = false, repeat = true, aniso = 8 } = {}) {
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true; return t;
}

// altura (Float32, linha 0 = v=0) → normal map tangente (OpenGL, +Y = +v)
export function normalFromHeight(h, w, hh, strength, wrapU = true, wrapV = true) {
  const d = new Uint8Array(w * hh * 4);
  for (let y = 0; y < hh; y++) {
    const ym = wrapV ? (y - 1 + hh) % hh : Math.max(0, y - 1), yp = wrapV ? (y + 1) % hh : Math.min(hh - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = wrapU ? (x - 1 + w) % w : Math.max(0, x - 1), xp = wrapU ? (x + 1) % w : Math.min(w - 1, x + 1);
      const nx = -(h[y * w + xp] - h[y * w + xm]) * strength, ny = -(h[yp * w + x] - h[ym * w + x]) * strength;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = (y * w + x) * 4;
      d[i] = (nx * l * 0.5 + 0.5) * 255; d[i + 1] = (ny * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  return finishTex(new THREE.DataTexture(d, w, hh), { repeat: wrapU || wrapV });
}

// riscos de escovamento: dir 'v' = riscos ao longo de v (verticais), 'u' = ao longo de u
function brushedHeight(w, h, { dir = 'v', count = 5000, minL = 30, maxL = 700, seed = 7, base = 0.35 } = {}) {
  const r = rng(seed), H = new Float32Array(w * h);
  const along = dir === 'v' ? h : w, across = dir === 'v' ? w : h;
  const idx = dir === 'v' ? (a, c) => a * w + c : (a, c) => c * w + a; // a = along, c = across
  // ruído de fundo por "trilha" (cada coluna tem sua altura média → listras finas contínuas)
  const lane = new Float32Array(across);
  for (let c = 0; c < across; c++) lane[c] = (r() - 0.5) * base;
  for (let c = 0; c < across; c++) { const v = lane[c] * 0.6 + lane[(c + 1) % across] * 0.2 + lane[(c - 1 + across) % across] * 0.2; for (let a = 0; a < along; a++) H[idx(a, c)] = v; }
  for (let k = 0; k < count; k++) {
    const c = Math.floor(r() * across), a0 = Math.floor(r() * along), L = minL + Math.pow(r(), 2.2) * (maxL - minL);
    const amp = (r() < 0.75 ? -1 : 1) * (0.25 + r() * 0.9), wide = r() < 0.18;
    for (let i = 0; i < L; i++) {
      const a = (a0 + i) % along, f = Math.sin(Math.PI * i / L);
      H[idx(a, c)] += amp * f;
      if (wide) { H[idx(a, (c + 1) % across)] += amp * f * 0.55; }
    }
  }
  return H;
}

// ---------------------------------------------------------------- alumínio do cilindro (riscos + gravações)
// rows: [{ v, r, text, size }] em mm; arcLen = comprimento total do perfil (mm)
export function aluminiumMaps({ arcLen, rows }) {
  const W = 2048, Hh = 2048;
  const H = brushedHeight(W, Hh, { dir: 'v', count: 9000, minL: 40, maxL: 1400, seed: 11, base: 0.5 });
  // gravações (estampadas): canvas com topo = v=1
  const c = cv(W, Hh), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
  g.filter = 'blur(1.1px)'; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const row of rows) {
    const pxU = W / (2 * Math.PI * row.r), pxV = Hh / arcLen; // px por mm
    for (const seg of row.segs) {
      g.save(); g.translate(seg.u * W, (1 - row.v) * Hh); g.scale(pxU / 10, pxV / 10);
      g.font = `600 ${row.size * 10}px ${COND}`; if ('letterSpacing' in g) g.letterSpacing = (row.size * 1.2) + 'px';
      g.fillText(seg.t, 0, 0); g.restore();
    }
  }
  const px = g.getImageData(0, 0, W, Hh).data;
  for (let y = 0; y < Hh; y++) { const ry = (Hh - 1 - y) * W; for (let x = 0; x < W; x++) H[ry + x] -= px[(y * W + x) * 4] / 255 * 5.0; }
  const normal = normalFromHeight(H, W, Hh, 0.55, true, false);
  // rugosidade: manchas suaves de manuseio (canal G)
  const rc = cv(512, 512), rg = rc.getContext('2d'), rr = rng(5);
  rg.fillStyle = 'rgb(0,215,0)'; rg.fillRect(0, 0, 512, 512); rg.filter = 'blur(18px)';
  for (let i = 0; i < 70; i++) { const v = 170 + rr() * 85; rg.fillStyle = `rgba(0,${v | 0},0,0.35)`; rg.beginPath(); rg.ellipse(rr() * 512, rr() * 512, 10 + rr() * 50, 20 + rr() * 90, 0, 0, 7); rg.fill(); }
  const rough = finishTex(new THREE.CanvasTexture(rc));
  return { normal, rough };
}

// níquel/latão torneado: riscos circunferenciais (ao longo de u)
export function turnedNormal(seed = 3) {
  const W = 1024, Hh = 512;
  const H = brushedHeight(W, Hh, { dir: 'u', count: 2600, minL: 60, maxL: 900, seed, base: 0.7 });
  return normalFromHeight(H, W, Hh, 0.6, true, true);
}

// recartilha diamante (knurl) — padrão periódico, tile com 8×8 diamantes
export function knurlHeightFn(u, v) { // u,v em "diamantes"
  const tri = (x) => 1 - 2 * Math.abs(x - Math.floor(x) - 0.5);
  return Math.min(tri(u + v), tri(u - v)); // pirâmides
}
export function knurlNormal() {
  const N = 512, D = 8, H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = Math.pow(knurlHeightFn(x / N * D, y / N * D), 0.8);
  return normalFromHeight(H, N, N, 9.0, true, true);
}

// borracha (pontilhado fino)
export function rubberNormal() {
  const N = 512, r = rng(23), H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = r();
  const B = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += H[((y + dy + N) % N) * N + ((x + dx + N) % N)];
    B[y * N + x] = s / 9;
  }
  return normalFromHeight(B, N, N, 1.2, true, true);
}

// ---------------------------------------------------------------- rótulo do cilindro
export function labelTexture(maxAniso = 8) {
  const W = 3072, H = 1904, c = cv(W, H), g = c.getContext('2d');
  const RED = '#c4161c', INK = '#2e2f31', GREY = '#6c6e70';
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, W, H);
  // grão de papel muito sutil
  const r = rng(99);
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(0,0,0,${0.012 + r() * 0.02})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  const T = (txt, x, y, size, { w = 400, col = INK, al = 'left', f = FONT, ls = 0 } = {}) => {
    g.font = `${w} ${size}px ${f}`; g.fillStyle = col; g.textAlign = al; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = ls + 'px';
    g.fillText(txt, x, y);
  };
  const X0 = 830, X1 = 2250;
  // logotipo fictício com colchete vermelho
  g.fillStyle = RED;
  g.fillRect(X0, 150, 14, 262); g.fillRect(X0, 150, 190, 14); g.fillRect(X0, 398, 190, 14);
  T('CALGAS', X0 + 42, 318, 112, { w: 700, col: '#3b3c3e', ls: 2 });
  g.font = `700 112px ${FONT}`; const wC = g.measureText('CALGAS').width + 12;
  T('·LAB', X0 + 42 + wC, 318, 112, { w: 700, col: RED });
  T('MISTURAS GASOSAS DE PRECISÃO', X0 + 46, 378, 34, { w: 500, col: GREY, ls: 3 });
  // campos de identificação
  const F = [['Código:', 'CG4-34-0525'], ['Lote nº:', '2611-0734-A'], ['FDS nº:', 'FDS-CG4-07']];
  F.forEach(([k, v], i) => { T(k, 1680, 222 + i * 78, 44, { w: 700, col: '#3a3b3d' }); T(v, 1920, 222 + i * 78, 44, { col: '#55575a' }); });
  // título
  T('MISTURA DE CALIBRAÇÃO · 4 GASES', (X0 + X1) / 2, 548, 70, { w: 700, al: 'center', col: '#202123', ls: 1 });
  g.fillStyle = RED; g.fillRect(X0, 578, X1 - X0, 6);
  // tabela
  const cx = [X0 + 10, 1560, 1960], hy = 668;
  ['Componente', 'Valor solicitado', 'Certificado'].forEach((t, i) => {
    T(t, cx[i], hy, 46, { w: 700, col: '#3a3b3d' }); g.font = `700 46px ${FONT}`; g.fillStyle = '#3a3b3d'; g.fillRect(cx[i], hy + 8, g.measureText(t).width, 3);
  });
  const rows = [['Sulfeto de hidrogênio (H₂S)', '25 ppm', '25 ppm'], ['Monóxido de carbono (CO)', '100 ppm', '101 ppm'],
    ['Metano (CH₄)', '2,5 % (50 % LIE)', '2,50 %'], ['Oxigênio (O₂)', '18 %', '18,0 %'], ['Nitrogênio (N₂)', 'balanço', 'balanço']];
  rows.forEach((row, i) => row.forEach((t, j) => T(t, cx[j], hy + 78 + i * 64, 44, { col: j ? '#3c3d3f' : '#4a4b4d' })));
  // datas / pressão
  const yd = hy + 78 + 5 * 64 + 40;
  g.fillStyle = '#c9c9c6'; g.fillRect(X0, yd - 58, X1 - X0, 2);
  T('Fabricação: 07/11/2026', X0 + 10, yd, 40, { col: '#4a4b4d' });
  T('Validade: 07/11/2028', 1420, yd, 40, { col: '#4a4b4d' });
  T('Tamanho: 34 L', 1960, yd, 40, { w: 700, col: '#3a3b3d' });
  T('Pressão: 34,5 bar (500 psi) a 21 °C     Exatidão analítica: ±2 % rel.', X0 + 10, yd + 58, 38, { col: '#4a4b4d' });
  // pictograma GHS04 (gás sob pressão)
  ghs04(g, 1010, yd + 300, 170);
  T('ATENÇÃO', 1230, yd + 200, 52, { w: 700, col: '#202123', ls: 2 });
  T('Contém gás sob pressão: pode explodir', 1230, yd + 252, 36, { col: '#4a4b4d' });
  T('sob ação do calor. Gás tóxico e inflamável.', 1230, yd + 294, 36, { col: '#4a4b4d' });
  T('Gás comprimido, N.O.S.', 1230, yd + 372, 50, { w: 700, col: '#2a2b2d' });
  T('(Sulfeto de hidrogênio, Monóxido de carbono,', 1230, yd + 418, 33, { col: '#4a4b4d' });
  T('Metano em Nitrogênio)  ·  ONU 1956  ·  Classe 2.2', 1230, yd + 458, 33, { col: '#4a4b4d' });
  // faixa inferior
  T('SOMENTE PARA CALIBRAÇÃO DE INSTRUMENTOS  ·  CILINDRO DESCARTÁVEL — NÃO RECARREGAR', W / 2, H - 120, 32, { w: 600, al: 'center', col: GREY, ls: 3 });
  g.fillStyle = RED; g.fillRect(0, H - 62, W, 22);
  g.fillStyle = '#3b3c3e'; g.fillRect(0, H - 34, W, 6);
  // costas: código de barras + frases de precaução
  const bx = 2440, by = 230;
  let x = bx; const rb = rng(4);
  g.fillStyle = '#1b1b1b';
  while (x < bx + 470) { const w = 3 + Math.floor(rb() * 4) * 3; if (rb() > 0.45) g.fillRect(x, by, w, 230); x += w + 3 + Math.floor(rb() * 3) * 3; }
  T('7 891234 560347', bx + 235, by + 284, 40, { al: 'center', col: INK, f: '"Courier New", monospace' });
  const P = ['P210 Manter afastado do calor, faísca e chama.', 'P260 Não inalar o gás.', 'P271 Usar em local bem ventilado.',
    'P403 Armazenar em local bem ventilado.', 'P410 Proteger da luz solar.', 'Não perfurar nem incinerar, mesmo vazio.',
    'Temperatura máxima: 52 °C.', 'Usar regulador de fluxo apropriado.', 'Emergência: 0800 000 0000'];
  P.forEach((t, i) => T(t, 2400, 640 + i * 52, 33, { col: '#4a4b4d' }));
  T('CALIBRATION GAS MIXTURE · 4 GAS', 90, 260, 44, { w: 700, col: '#3a3b3d' });
  ['H2S 25 ppm · CO 100 ppm', 'CH4 2.5 % vol (50 % LEL)', 'O2 18 % · N2 balance', 'Non-refillable · 34 L @ 500 psig'].forEach((t, i) => T(t, 90, 340 + i * 58, 38, { col: '#55575a' }));
  ghs04(g, 330, 1090, 120);
  // borda de sobreposição na costura (u≈0)
  const sg = g.createLinearGradient(0, 0, 18, 0); sg.addColorStop(0, 'rgba(0,0,0,0.20)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.fillRect(0, 0, 18, H);
  const t = new THREE.CanvasTexture(c); finishTex(t, { srgb: true, repeat: false, aniso: maxAniso });
  return t;
}

function ghs04(g, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
  const a = s / Math.SQRT2;
  g.fillStyle = '#d0151c'; g.fillRect(-a, -a, 2 * a, 2 * a);
  g.fillStyle = '#fff'; const b = a * 0.86; g.fillRect(-b, -b, 2 * b, 2 * b);
  g.restore();
  // cilindro de gás deitado (preto)
  g.save(); g.translate(cx, cy + s * 0.08); g.rotate(-0.38);
  g.fillStyle = '#111';
  const L = s * 0.92, R = s * 0.15;
  g.beginPath(); g.roundRect(-L / 2, -R, L, 2 * R, R); g.fill();
  g.fillRect(L / 2 - R * 0.2, -R * 0.42, R * 0.7, R * 0.84);
  g.fillRect(L / 2 + R * 0.35, -R * 0.75, R * 0.25, R * 1.5);
  g.restore();
}

// ---------------------------------------------------------------- mostrador do manômetro
// ângulo (graus, horário a partir das 12 h) para pressão em psi
export const DIAL_A0 = -95, DIAL_SWEEP = 185, DIAL_MAX = 1500;
export const psiToDeg = (psi) => DIAL_A0 + DIAL_SWEEP * Math.min(1.04, Math.max(-0.01, psi / DIAL_MAX));
export function dialTexture() {
  const N = 1024, c = cv(N, N), g = c.getContext('2d'), C = N / 2, R = N * 0.49;
  const RED = '#d4232b';
  const rad = (deg) => (deg - 90) * Math.PI / 180;
  const pol = (deg, r) => [C + Math.cos(rad(deg)) * r * R, C + Math.sin(rad(deg)) * r * R];
  const bg = g.createRadialGradient(C, C * 0.92, R * 0.1, C, C, R);
  bg.addColorStop(0, '#fdfdfc'); bg.addColorStop(0.8, '#f6f6f4'); bg.addColorStop(1, '#dcdcda');
  g.fillStyle = '#c8c8c6'; g.fillRect(0, 0, N, N);
  g.fillStyle = bg; g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();
  const tick = (deg, r0, r1, w, col) => { const [x0, y0] = pol(deg, r0), [x1, y1] = pol(deg, r1); g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  // anel externo de traços finos pretos
  g.lineCap = 'butt';
  for (let p = 0; p <= 1500; p += 20) tick(psiToDeg(p), p % 100 ? 0.925 : 0.9, 0.975, p % 100 ? 2.2 : 3.5, '#26272a');
  g.strokeStyle = '#26272a'; g.lineWidth = 2.5; g.beginPath(); g.arc(C, C, 0.975 * R, rad(psiToDeg(0)), rad(psiToDeg(1500))); g.stroke();
  // traços vermelhos
  for (let p = 0; p <= 1500; p += 50) {
    const maj = p % 300 === 0, mid = p % 100 === 0;
    tick(psiToDeg(p), maj ? 0.6 : 0.64, maj ? 0.78 : (mid ? 0.74 : 0.7), maj ? 9 : 6, RED);
  }
  // números psi (externos, tangenciais)
  const num = (txt, deg, r, size, col, rot = 1) => {
    const [x, y] = pol(deg, r); g.save(); g.translate(x, y); g.rotate(deg * Math.PI / 180 * rot);
    g.font = `600 ${size}px ${COND}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore();
  };
  [300, 600, 900, 1200, 1500].forEach((p) => num(String(p), psiToDeg(p), 0.855, 82, RED));
  [[21, 300], [41, 600], [62, 900], [83, 1200], [103, 1500]].forEach(([b, p]) => num(String(b), psiToDeg(p), 0.5, 60, RED, 0.35));
  num('0', psiToDeg(0) + 6, 0.85, 56, RED, 0.6);
  num('psi', psiToDeg(1500) + 15, 0.84, 56, '#26272a', 0.15);
  num('bar', psiToDeg(1500) + 23, 0.62, 52, RED, 0.15);
  // símbolo "isento de óleo"
  const [ox, oy] = pol(145, 0.62);
  g.save(); g.translate(ox, oy);
  g.strokeStyle = RED; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 58, 0, 7); g.stroke();
  g.strokeStyle = '#222'; g.lineWidth = 5; g.beginPath(); g.moveTo(-34, 6); g.lineTo(14, 6); g.lineTo(30, -12); g.lineTo(40, -6); g.moveTo(-34, 6); g.lineTo(-34, -14); g.lineTo(-10, -14); g.lineTo(-4, -24); g.lineTo(6, -14); g.lineTo(14, -14); g.lineTo(14, 6); g.stroke();
  g.fillStyle = '#222'; g.beginPath(); g.arc(-2, 26, 7, 0, 7); g.fill();
  g.strokeStyle = RED; g.lineWidth = 6; g.beginPath(); g.moveTo(-41, -41); g.lineTo(41, 41); g.stroke();
  g.restore();
  num('EN 837-1  ·  CL 2.5', 180, 0.8, 26, '#55575a', 0);
  // disco central de anéis concêntricos (como na foto)
  const r0 = 0.37 * R;
  const cg = g.createConicGradient(0.6, C, C);
  [[0, '#9a9da0'], [0.12, '#f4f5f6'], [0.25, '#b5b8bb'], [0.4, '#eef0f1'], [0.55, '#8f9295'], [0.7, '#e6e8ea'], [0.85, '#a9acaf'], [1, '#9a9da0']].forEach(([o, col]) => cg.addColorStop(o, col));
  g.fillStyle = cg; g.beginPath(); g.arc(C, C, r0, 0, 7); g.fill();
  for (let k = 0; k < 34; k++) { const rr = r0 * (1 - k / 34); g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(40,40,45,0.22)'; g.lineWidth = 2; g.beginPath(); g.arc(C, C, rr, 0, 7); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(C, C, r0, 0, 7); g.stroke();
  const hub = g.createRadialGradient(C - 8, C - 8, 2, C, C, 40); hub.addColorStop(0, '#f0f0f0'); hub.addColorStop(1, '#7c7f83');
  g.fillStyle = hub; g.beginPath(); g.arc(C, C, 38, 0, 7); g.fill();
  // sombra interna da borda (profundidade do aro)
  const sh = g.createRadialGradient(C, C, R * 0.86, C, C, R); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = sh; g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();
  return finishTex(new THREE.CanvasTexture(c), { srgb: true, repeat: false, aniso: 8 });
}

// ---------------------------------------------------------------- painel da empunhadura da sonda
// retorna { map, emissive } — canvas 512×1024 (u: largura 30 mm, v: altura 50 mm)
export function probePanelTextures() {
  const W = 600, H = 800, c = cv(W, H), g = c.getContext('2d'), e = cv(W, H), ge = e.getContext('2d'); // 30×40 mm (20 px/mm)
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.clearRect(0, 0, W, H);
  const oval = () => { g.beginPath(); g.ellipse(W / 2, H / 2, 268, 372, 0, 0, 7); };
  g.fillStyle = '#3a3d41'; oval(); g.fill();
  const gl = g.createLinearGradient(0, 0, W, H); gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(0.55, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = gl; oval(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 7; g.beginPath(); g.ellipse(W / 2, H / 2, 264, 368, 0, 0, 7); g.stroke();
  // janela preta dos LEDs (estádio)
  g.fillStyle = '#0c0d0f'; g.beginPath(); g.roundRect(222, 96, 128, 440, 64); g.fill();
  g.strokeStyle = '#5c6066'; g.lineWidth = 4; g.stroke();
  ['100%', '75%', '50%', '25%'].forEach((t, i) => {
    const y = 160 + i * 104, x = 262;
    g.strokeStyle = '#a9adb2'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 22, 0, 7); g.stroke();
    g.fillStyle = '#26292d'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill();
    g.font = `600 21px ${FONT}`; g.fillStyle = '#c9cdd2'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t, 292, y);
    ge.fillStyle = '#fff'; ge.beginPath(); ge.arc(x, y, 18, 0, 7); ge.fill();
  });
  // botão liga/desliga
  const bx = 340, by = 640;
  g.fillStyle = '#24272b'; g.beginPath(); g.arc(bx, by, 44, 0, 7); g.fill();
  g.strokeStyle = '#6d7277'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = '#d6dadf'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.arc(bx, by + 3, 20, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + 2 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(bx, by - 24); g.lineTo(bx, by - 2); g.stroke();
  const map = finishTex(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
  const emissive = finishTex(new THREE.CanvasTexture(e), { srgb: true, repeat: false });
  return { map, emissive };
}

// ponta perfurada: furos escuros (map) para o cilindro estriado
export function tipHolesTexture() {
  const W = 256, H = 128, c = cv(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#141414';
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse((i + 0.5 + row * 0.5) / 6 * W, H * (0.3 + row * 0.4), 9, 14, 0, 0, 7); g.fill(); }
  return finishTex(new THREE.CanvasTexture(c), { srgb: true });
}

// gravação "0,5 L/min" e marcas no corpo do regulador (map de cor sobre o níquel: só escurece)
export function regulatorPrintTexture() {
  const W = 1024, H = 512, c = cv(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a4a4a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 44px ${COND}`; g.fillText('0,5 L/min  FIXO', W * 0.25, H * 0.56);
  g.font = `500 30px ${COND}`; g.fillText('ENTRADA MÁX. 1000 psi · C-10', W * 0.25, H * 0.68);
  return finishTex(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

// ---------------------------------------------------------------- ambiente de reflexo para os metais do kit
// estúdio de fotografia de produto: caixa clara, softbox superior e laterais, bandeiras pretas verticais (dão as faixas
// escuras/claras típicas do alumínio e do níquel na foto). Gerado uma vez com o renderer do palco.
export function kitEnvironment(renderer) {
  const sc = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
  box.material.color.setScalar(0.5); sc.add(box);
  const quad = (w, h, c, pos, look) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(...look); sc.add(m); return m; };
  const L = (v) => new THREE.Color().setScalar(v);
  quad(4, 3, L(4.0), [0, 4.8, 0.6], [0, 0, 0]);          // softbox superior
  quad(1.6, 4.2, L(3.0), [-4.6, 1.0, 1.8], [0, 0.6, 0]);  // strip esquerda-frente
  quad(1.3, 4.2, L(2.4), [4.6, 0.8, 1.2], [0, 0.6, 0]);   // strip direita
  quad(3.0, 2.2, L(1.6), [0, 0.8, 4.9], [0, 0.4, 0]);     // rebatedor frontal
  quad(1.1, 6, L(0.015), [-2.2, 0.8, 4.0], [0, 0.6, 0]);  // bandeiras pretas
  quad(1.0, 6, L(0.015), [2.6, 0.8, 3.6], [0, 0.6, 0]);
  quad(1.4, 6, L(0.02), [-4.2, 0.6, -2.4], [0, 0.6, 0]);
  quad(1.4, 6, L(0.02), [4.2, 0.6, -2.6], [0, 0.6, 0]);
  quad(10, 4.4, L(0.26), [0, -2.9, 0], [0, 0, 0]).rotation.set(-Math.PI / 2, 0, 0); // piso cinza
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.02);
  pm.dispose();
  return rt.texture;
}
