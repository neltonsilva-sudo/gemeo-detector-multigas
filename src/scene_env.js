// Ambientes do agente RENDER: cena de iluminação para PMREM (estúdio com softboxes / galpão industrial),
// texturas procedurais (concreto, fundo de galpão desfocado). Tudo gerado em canvas — sem assets externos.
import * as THREE from 'three';

// ---------------------------------------------------------------- utilidades de canvas
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** máscara de softbox: centro uniforme, borda difusa curta, leve hot-spot central (difusor duplo real) */
function softboxTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d');
  const img = g.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W * 2 - 1, v = (y + 0.5) / W * 2 - 1;
    const e = Math.max(Math.abs(u), Math.abs(v));
    const edge = 1 - smooth(0.86, 0.99, e);              // borda definida mas não serrilhada
    const hot = 0.86 + 0.14 * Math.exp(-(u * u + v * v) * 2.2);
    const val = Math.round(255 * edge * hot);
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = val; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** faixa (strip light / fluorescente) — gradiente transversal */
function stripTexture() {
  const c = canvas(64, 8), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.12, '#bbb'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(0.88, '#bbb'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

// ---------------------------------------------------------------- cena de ambiente (PMREM)
/**
 * Uma única cena com os dois ambientes; `setBlend(t)` mistura (0 = estúdio, 1 = campo) escalando as cores,
 * e o PMREM é regenerado durante a transição.
 */
export function buildEnvScene() {
  const scene = new THREE.Scene();
  const items = []; // {mat, base:Color, w:'s'|'c'}
  const add = (mesh, color, w) => { items.push({ mat: mesh.material, base: color.clone(), w }); scene.add(mesh); return mesh; };

  // --- domo com gradiente por vértice (dois domos sobrepostos aditivamente: estúdio + campo)
  const dome = (fn, w) => {
    const geo = new THREE.SphereGeometry(20, 64, 32);
    const col = []; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i) / 20, p.getY(i) / 20, p.getZ(i) / 20); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    m.renderOrder = -10;
    return add(m, new THREE.Color(1, 1, 1), w);
  };
  // estúdio: chão branco do ciclorama iluminado embaixo, parede clara no horizonte, teto escuro (bandeiras pretas)
  dome((x, y, z) => {
    const c = new THREE.Color();
    if (y < 0) { const k = smooth(0, -0.35, y); c.setScalar(0.62 + 0.26 * k); }
    else { const k = smooth(0.0, 0.7, y); c.setScalar(0.62 * (1 - k) + 0.07 * k); }
    // lado de trás (atrás do produto = parede do ciclorama) um pouco mais clara que a frente do estúdio
    c.multiplyScalar(1 + 0.12 * Math.max(0, -z));
    // assimetria de estúdio: lado direito da câmera com menos rebatimento → modelagem/queda de luz nas bordas arredondadas
    if (y > -0.15) c.multiplyScalar(1 - 0.42 * smooth(-0.1, 0.9, x));
    return c;
  }, 's');
  // campo: galpão escuro (piso de concreto, paredes azuladas, teto quase preto)
  dome((x, y, z) => {
    const c = new THREE.Color();
    if (y < 0) c.setRGB(0.07, 0.068, 0.064);
    else { const k = smooth(0, 0.6, y); c.setRGB(0.11 * (1 - k) + 0.03 * k, 0.125 * (1 - k) + 0.035 * k, 0.145 * (1 - k) + 0.042 * k); }
    return c;
  }, 'c');

  const sbTex = softboxTexture(), stTex = stripTexture();
  const panel = (w, h, pos, color, wgt, tex = sbTex, look = new THREE.Vector3(0, 0, 0)) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.lookAt(look);
    return add(m, color, wgt);
  };
  const dirPos = (x, y, z, r) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(r);

  // ---- ESTÚDIO (5600 K levemente quente). Intensidades calibradas p/ tom Neutral exp 1.0:
  // reflexo especular de softbox fica < limiar do bloom (≈3) → não "estrela" no cromado.
  const W5600 = new THREE.Color(1.0, 0.985, 0.96);
  panel(5.2, 3.6, dirPos(-0.62, 0.62, 0.62, 6), W5600.clone().multiplyScalar(2.7), 's');      // KEY: grande, acima-esquerda-frente
  panel(4.2, 4.2, dirPos(0.85, 0.22, 0.6, 6.5), W5600.clone().multiplyScalar(1.05), 's');     // FILL: direita-frente, difuso
  panel(1.3, 6.0, dirPos(-0.62, 0.16, -0.78, 6), W5600.clone().multiplyScalar(2.6), 's', stTex); // RIM esq. (strip vertical, atrás-esquerda)
  panel(1.1, 6.0, dirPos(0.9, 0.18, -0.5, 6), W5600.clone().multiplyScalar(2.3), 's', stTex);   // RIM dir. (strip vertical)
  panel(4.0, 2.4, dirPos(0.05, 1.0, 0.18, 6), W5600.clone().multiplyScalar(1.5), 's');         // TOP: overhead p/ vidro/topo
  panel(6.0, 1.6, dirPos(0.0, 0.08, 1.0, 7), W5600.clone().multiplyScalar(0.9), 's');         // rebatedor frontal baixo (cartão branco)
  // bandeiras pretas (negativo) — geram o contraste nas bordas do metal
  const flag = (w, h, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); scene.add(m); m.userData.flag = true; return m; };
  const flags = [flag(2.2, 5, dirPos(-1, 0.25, 0.05, 5.5)), flag(2.2, 5, dirPos(1, 0.3, -0.05, 5.5)), flag(1.3, 5, dirPos(-0.5, 0.05, 0.86, 5.5))];

  // ---- CAMPO (galpão): fluorescentes frias no teto, portão com luz do dia ao fundo, lâmpada de vapor de sódio
  const COLD = new THREE.Color(0.86, 0.95, 1.12);
  for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
    const m = panel(0.35, 3.2, new THREE.Vector3(j * 3.2, 5.2, -5 + i * 3.4), COLD.clone().multiplyScalar(5.0), 'c', stTex, new THREE.Vector3(j * 3.2, 0, -5 + i * 3.4));
    m.rotateZ(Math.PI / 2);
  }
  panel(4.5, 4.0, new THREE.Vector3(-2, 2.2, -12), new THREE.Color(0.55, 0.66, 0.85).multiplyScalar(1.6), 'c'); // portão (luz do dia)
  panel(0.7, 0.7, new THREE.Vector3(8, 3.8, -3), new THREE.Color(1.0, 0.55, 0.18).multiplyScalar(4.0), 'c');   // sódio
  panel(3.0, 2.0, dirPos(-0.5, 0.35, 0.8, 6), new THREE.Color(0.8, 0.85, 0.95).multiplyScalar(0.7), 'c');      // rebatimento suave frontal (legibilidade)
  panel(1.4, 5.0, dirPos(-0.95, 0.15, -0.3, 7), new THREE.Color(0.6, 0.7, 0.85).multiplyScalar(1.1), 'c', stTex); // janela lateral (contorno no metal)
  panel(1.4, 5.0, dirPos(0.95, 0.15, 0.2, 7), new THREE.Color(0.75, 0.8, 0.9).multiplyScalar(0.8), 'c', stTex);

  function setBlend(t) {
    for (const it of items) {
      const k = it.w === 's' ? 1 - t : t;
      it.mat.color.copy(it.base).multiplyScalar(k);
      it.mat.visible = k > 0.002;
    }
    for (const f of flags) f.visible = t < 0.5;
  }
  setBlend(0);
  return { scene, setBlend };
}

// ---------------------------------------------------------------- concreto industrial
export function concreteTextures(seed = 7) {
  const N = 1024, R = rng(seed);
  const c = canvas(N, N), g = c.getContext('2d');
  const cr = canvas(N, N), gr = cr.getContext('2d');
  g.fillStyle = '#77736c'; g.fillRect(0, 0, N, N);
  // manchas grandes (umidade, óleo, desgaste)
  for (let i = 0; i < 140; i++) {
    const x = R() * N, y = R() * N, r = 30 + R() * 190, dark = R() < 0.6;
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + R() * 0.12;
    gg.addColorStop(0, dark ? `rgba(40,38,34,${a})` : `rgba(160,156,148,${a * 0.8})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // agregado fino
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 14 + (R() < 0.01 ? (R() - 0.5) * 60 : 0);
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.95;
  }
  g.putImageData(img, 0, 0);
  // juntas de dilatação (1 a cada "placa" — textura cobre 2 m) e trincas finas
  g.strokeStyle = 'rgba(25,24,22,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(N / 2, 0); g.lineTo(N / 2, N); g.moveTo(0, N / 2); g.lineTo(N, N / 2); g.stroke();
  g.strokeStyle = 'rgba(30,28,26,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 9; k++) {
    let x = R() * N, y = R() * N; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 30; s++) { x += (R() - 0.5) * 24; y += (R() - 0.3) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  // rugosidade: base alta, manchas de óleo mais lisas
  gr.fillStyle = '#c4c4c4'; gr.fillRect(0, 0, N, N);
  for (let i = 0; i < 60; i++) {
    const x = R() * N, y = R() * N, r = 20 + R() * 120;
    const gg = gr.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, `rgba(70,70,70,${0.3 + R() * 0.5})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    gr.fillStyle = gg; gr.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(cr);
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, rough };
}

/** pano de fundo cilíndrico do galpão: tubulação, pilares, bandejas, já desfocado (profundidade de campo) */
export function plantBackdropTexture(seed = 3) {
  const W = 2048, H = 512, R = rng(seed);
  const c = canvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0d1013'); sky.addColorStop(0.55, '#1c2126'); sky.addColorStop(1, '#2a2d2f');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.filter = 'blur(7px)';
  // janelas altas (luz fria de fora)
  for (let x = 40; x < W; x += 260) { g.fillStyle = 'rgba(120,150,185,0.35)'; g.fillRect(x, 40, 150, 70); }
  // pilares metálicos
  for (let x = 120; x < W; x += 340 + R() * 80) { g.fillStyle = '#15181b'; g.fillRect(x, 0, 34, H); g.fillStyle = 'rgba(160,140,40,0.35)'; g.fillRect(x, H * 0.78, 34, 18); }
  // tubulações horizontais (cinza, amarela de gás, vermelha de incêndio, verde de água)
  const pipes = [[0.42, 22, '#5c6166'], [0.5, 14, '#b8941c'], [0.56, 30, '#4d5257'], [0.63, 12, '#8e2a22'], [0.7, 18, '#3f5d48'], [0.35, 8, '#6a6f74']];
  for (const [yy, th, col] of pipes) {
    const y = yy * H + (R() - 0.5) * 10;
    g.fillStyle = col; g.fillRect(0, y, W, th);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y + th * 0.2, W, th * 0.18);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + th * 0.75, W, th * 0.25);
    for (let x = R() * 200; x < W; x += 180 + R() * 220) { g.fillStyle = 'rgba(30,30,30,0.8)'; g.fillRect(x, y - 3, 8, th + 6); } // flanges/suportes
  }
  // tubos verticais + válvulas
  for (let k = 0; k < 9; k++) { const x = R() * W, th = 10 + R() * 18; g.fillStyle = k % 3 ? '#4a4f54' : '#9a7c18'; g.fillRect(x, H * 0.3, th, H * 0.6); }
  // bandeja de cabos
  g.fillStyle = '#2c3034'; g.fillRect(0, H * 0.27, W, 10);
  // equipamentos ao nível do piso (tanques, painéis)
  for (let x = 60; x < W; x += 300 + R() * 200) {
    g.fillStyle = R() < 0.5 ? '#3a3f43' : '#4a4436'; const w = 90 + R() * 140, h = 60 + R() * 120;
    g.fillRect(x, H * 0.92 - h, w, h);
  }
  // luminárias (pontos quentes desfocados)
  g.filter = 'blur(10px)';
  for (let x = 90; x < W; x += 410) { g.fillStyle = 'rgba(255,190,110,0.55)'; g.beginPath(); g.arc(x, 150, 16, 0, 7); g.fill(); }
  g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
