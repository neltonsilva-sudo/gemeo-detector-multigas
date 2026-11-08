// Peças auxiliares do AGENTE AMBIENTE B (co-motor, deficiencia-o2): texturas de desgaste, manchas de óleo,
// gerador carenado, empilhadeira a GLP, gelo/geada criogênica. Tudo procedural (canvas), escala em metros.
import * as THREE from 'three';
import { heightToNormal, std, pipe, box, rng } from './scene_env_kit.js';

const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function tex(c, srgb = true, rep = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  return t;
}
function blob(g, x, y, r, inner, outer = 'rgba(0,0,0,0)') {
  const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, inner); gg.addColorStop(1, outer);
  g.fillStyle = gg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}
function noise(g, W, H, R, amp) {
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
/** mancha irregular (óleo) feita de vários círculos sobrepostos */
function splat(g, R, x, y, r, col, n = 9) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = R() * 6.28, d = R() * r * 0.7; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.25 + R() * 0.45), 0, 7); g.fill(); }
}

// ---------------------------------------------------------------- tampo de bancada de oficina (aço oleoso, riscado)
export function benchTopSet(seed = 81) {
  const W = 1024, H = 512, R = rng(seed), c = cvs(W, H), g = c.getContext('2d');
  g.fillStyle = '#50565a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) blob(g, R() * W, R() * H, 30 + R() * 160, `rgba(${R() < 0.5 ? '25,24,22' : '120,118,110'},${0.05 + R() * 0.12})`);
  // ferrugem leve nas bordas e pontos
  for (let i = 0; i < 160; i++) blob(g, R() * W, R() < 0.5 ? R() * 40 : H - R() * 40, 3 + R() * 14, `rgba(110,60,25,${0.2 + R() * 0.3})`);
  // riscos (brilhantes) e marcas de lixa
  g.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = R() * W, y = R() * H, a = (R() - 0.5) * 0.7 + (R() < 0.5 ? 0 : Math.PI / 2), l = 8 + R() * 90;
    g.strokeStyle = `rgba(${R() < 0.7 ? '175,180,182' : '30,30,30'},${0.12 + R() * 0.35})`; g.lineWidth = 0.6 + R() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // manchas de óleo (escuras, borda marrom) + anéis de lata
  const rc = cvs(W, H), rg = rc.getContext('2d'); rg.fillStyle = '#a8a8a8'; rg.fillRect(0, 0, W, H);
  const oil = [[300, 260, 90], [520, 300, 55], [760, 150, 120], [140, 120, 50], [880, 380, 70], [420, 120, 40]];
  for (const [x, y, r] of oil) {
    splat(g, R, x, y, r * 1.15, 'rgba(70,52,30,0.18)', 7);
    splat(g, R, x, y, r, 'rgba(16,14,12,0.38)', 10);
    splat(rg, R, x, y, r, 'rgba(35,35,35,0.55)', 10);
  }
  for (let i = 0; i < 4; i++) { const x = 150 + R() * 700, y = 80 + R() * 350, r = 26 + R() * 14; g.strokeStyle = 'rgba(20,16,12,0.45)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); rg.strokeStyle = '#333'; rg.lineWidth = 4; rg.beginPath(); rg.arc(x, y, r, 0, 7); rg.stroke(); }
  noise(g, W, H, R, 14);
  const hc = cvs(W, H), hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H); noise(hg, W, H, R, 26);
  for (let i = 0; i < 260; i++) { hg.strokeStyle = 'rgba(40,40,40,0.5)'; hg.lineWidth = 1; const x = R() * W, y = R() * H; hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + (R() - 0.5) * 80, y + (R() - 0.5) * 20); hg.stroke(); }
  return { map: tex(c), roughnessMap: tex(rc, false), normalMap: tex(heightToNormal(hc, 1.2), false) };
}

// ---------------------------------------------------------------- pintura gasta (carenagens, empilhadeira)
export function wornPaintSet({ seed = 1, paint = '#2f5a3c', chips = 1, grime = 1, soot = 0, rep = [1, 1] } = {}) {
  const N = 1024, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  g.fillStyle = paint; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) blob(g, R() * N, R() * N, 40 + R() * 200, `rgba(${R() < 0.5 ? '20,20,18' : '210,205,190'},${0.04 + R() * 0.07})`);
  // sujeira escorrida + encardido na base
  const gr = g.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, `rgba(45,38,30,${0.15 * grime})`); gr.addColorStop(1, `rgba(35,28,20,${0.55 * grime})`); g.fillStyle = gr; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 120 * grime; i++) { const x = R() * N, y = R() * N * 0.7, l = 40 + R() * 260; const s = g.createLinearGradient(x, y, x, y + l); s.addColorStop(0, `rgba(40,32,24,${0.18 + R() * 0.2})`); s.addColorStop(1, 'rgba(40,32,24,0)'); g.fillStyle = s; g.fillRect(x, y, 1.5 + R() * 4, l); }
  // lascas de tinta (metal/primer exposto) e ferrugem
  const rc = cvs(N, N), rg = rc.getContext('2d'); rg.fillStyle = '#7a7a7a'; rg.fillRect(0, 0, N, N);
  for (let i = 0; i < 260 * chips; i++) {
    const x = R() * N, y = R() < 0.35 ? R() * N : N * (0.85 + R() * 0.15), r = 1 + R() * 5;
    const rust = R() < 0.45;
    g.fillStyle = rust ? `rgba(${105 + R() * 40},${48 + R() * 20},18,0.85)` : `rgba(${120 + R() * 30},${122 + R() * 30},${120 + R() * 30},0.9)`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R() * 0.6), R() * 3, 0, 7); g.fill();
    rg.fillStyle = rust ? '#e8e8e8' : '#505050'; rg.beginPath(); rg.ellipse(x, y, r, r * 0.6, 0, 0, 7); rg.fill();
  }
  for (let i = 0; i < 260; i++) { const x = R() * N, y = R() * N, a = R() * 6.28, l = 6 + R() * 50; g.strokeStyle = `rgba(160,160,155,${0.1 + R() * 0.3})`; g.lineWidth = 0.6 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  if (soot) { for (let i = 0; i < 6; i++) blob(g, N * (0.75 + R() * 0.2), N * (0.1 + R() * 0.4), 120 + R() * 160, `rgba(12,11,10,${0.35 * soot})`); }
  noise(g, N, N, R, 12);
  const hc = cvs(N, N), hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, N, N); noise(hg, N, N, R, 18);
  return { map: tex(c, true, rep), roughnessMap: tex(rc, false, rep), normalMap: tex(heightToNormal(hc, 0.8), false, rep) };
}

// ---------------------------------------------------------------- decalque de mancha de óleo no piso
export function oilStain(seed, w = 1.2, d = 0.8) {
  const N = 512, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  for (let k = 0; k < 3; k++) splat(g, R, N / 2 + (R() - 0.5) * 120, N / 2 + (R() - 0.5) * 120, 90 + R() * 70, `rgba(18,15,12,${0.22 + R() * 0.15})`, 12);
  splat(g, R, N / 2, N / 2, 60, 'rgba(10,9,8,0.35)', 8);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(15,12,10,${0.2 + R() * 0.3})`; g.beginPath(); g.arc(N / 2 + (R() - 0.5) * N * 0.8, N / 2 + (R() - 0.5) * N * 0.8, 2 + R() * 8, 0, 7); g.fill(); }
  const t = tex(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6.28; return m;
}

// ---------------------------------------------------------------- decalque genérico (fuligem, etc.) em canvas alfa
export function sootDecal(w, h, seed = 3, strength = 0.7) {
  const N = 256, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  for (let i = 0; i < 14; i++) blob(g, N / 2 + (R() - 0.5) * 70, N / 2 + (R() - 0.5) * 70 - R() * 50, 50 + R() * 70, `rgba(10,9,8,${0.18 * strength})`);
  blob(g, N / 2, N / 2, 60, `rgba(5,5,5,${0.6 * strength})`);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
}

// ---------------------------------------------------------------- etiqueta/adesivo simples (texto) em canvas
export function label(w, h, { bg = '#f2f2f2', fg = '#111', text = [], seed = 5, border = '#111' } = {}) {
  const PX = 512, CW = Math.round(PX * w / Math.max(w, h)), CH = Math.round(PX * h / Math.max(w, h));
  const c = cvs(CW, CH), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH); g.strokeStyle = border; g.lineWidth = CH * 0.04; g.strokeRect(CH * 0.03, CH * 0.03, CW - CH * 0.06, CH * 0.06 > 0 ? CH - CH * 0.06 : CH);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = CH / (text.length + 0.6);
  text.forEach((t, i) => { let s = lh * 0.7; g.font = `800 ${s}px Arial, Helvetica, sans-serif`; while (g.measureText(t).width > CW * 0.88 && s > 6) { s -= 1; g.font = `800 ${s}px Arial, Helvetica, sans-serif`; } g.fillText(t, CW / 2, lh * (i + 0.8)); });
  for (let i = 0; i < 10; i++) blob(g, R() * CW, R() * CH, 20 + R() * 60, 'rgba(70,60,45,0.12)');
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
}

// ---------------------------------------------------------------- gerador diesel carenado (frente = +z), base em y=0
export function genset({ L = 2.0, H = 1.05, D = 0.95, paint = '#2f5a3c', seed = 91 } = {}) {
  const gen = new THREE.Group();
  const ps = wornPaintSet({ seed, paint, chips: 0.35, grime: 1.1, soot: 0.6 });
  const body = std({ roughness: 0.55, metalness: 0.35 }, ps);
  const base = std({ color: 0x1e2022, roughness: 0.7, metalness: 0.5 }, wornPaintSet({ seed: seed + 1, paint: '#26292b', chips: 1.6, grime: 1.4 }));
  gen.add(box(L + 0.1, 0.14, D + 0.08, base, [0, 0.07, 0]));
  for (const x of [-L * 0.28, L * 0.28]) gen.add(box(0.22, 0.08, 0.02, std({ color: 0x050505 }), [x, 0.07, D / 2 + 0.045]));  // bolsões de garfo
  gen.add(box(L, H - 0.14, D, body, [0, 0.14 + (H - 0.14) / 2, 0], 0.02));
  // portas: frisos verticais, dobradiças, fechos
  const seamM = std({ color: 0x0d120e, roughness: 0.8 });
  for (const x of [-L / 2 + 0.55, -L / 2 + 1.1, L / 2 - 0.5]) gen.add(box(0.008, H - 0.26, 0.004, seamM, [x, 0.14 + (H - 0.14) / 2, D / 2 + 0.002]));
  const hw = std({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.8 });
  for (const x of [-L / 2 + 0.5, -L / 2 + 1.05]) { gen.add(box(0.03, 0.1, 0.03, hw, [x, 0.62, D / 2 + 0.015])); gen.add(box(0.018, 0.05, 0.02, hw, [x - 0.06, 0.62, D / 2 + 0.012])); }
  // venezianas de entrada de ar (lado esquerdo da frente)
  const louv = std({ color: 0x0e1410, roughness: 0.7, metalness: 0.3 });
  for (let i = 0; i < 8; i++) { const b = box(0.42, 0.022, 0.035, louv, [-L / 2 + 0.29, 0.36 + i * 0.065, D / 2 + 0.006]); b.rotation.x = 0.5; gen.add(b); }
  // painel de controle com visor e LED
  gen.add(box(0.34, 0.26, 0.03, std({ color: 0x15181b, roughness: 0.35 }), [L / 2 - 0.26, 0.72, D / 2 + 0.014]));
  const lcdM = std({ color: 0x050805, emissive: new THREE.Color(0.25, 0.55, 0.32), emissiveIntensity: 0.3, roughness: 0.2 });
  gen.add(box(0.16, 0.07, 0.004, lcdM, [L / 2 - 0.28, 0.77, D / 2 + 0.03]));
  const led = (x, col) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), std({ color: 0x111111, emissive: new THREE.Color(...col), emissiveIntensity: 0.7 })); m.position.set(x, 0.68, D / 2 + 0.031); gen.add(m); };
  led(L / 2 - 0.36, [0.2, 1, 0.3]); led(L / 2 - 0.32, [0.2, 1, 0.3]); led(L / 2 - 0.28, [0.05, 0.05, 0.05]);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), std({ color: 0xaa1111, roughness: 0.4 })); knob.rotation.x = Math.PI / 2; knob.position.set(L / 2 - 0.16, 0.68, D / 2 + 0.035); gen.add(knob);
  // adesivos na carenagem
  const st = label(0.3, 0.12, { bg: '#ffcc00', text: ['CUIDADO', 'SUPERFÍCIE QUENTE'], seed: seed + 3 }); st.position.set(L / 2 - 0.62, 0.55, D / 2 + 0.003); gen.add(st);
  const st2 = label(0.22, 0.09, { bg: '#ffffff', text: ['DIESEL', 'S-10'], seed: seed + 4 }); st2.position.set(L / 2 - 0.26, 0.45, D / 2 + 0.003); gen.add(st2);
  // olhal de içamento e tampa de combustível no teto
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), hw); eye.position.set(0, H + 0.05, 0); gen.add(eye);
  return gen;
}

// ---------------------------------------------------------------- empilhadeira a GLP (frente/garfos = +x), base y=0
export function forklift({ seed = 95 } = {}) {
  const F = new THREE.Group();
  const yel = std({ roughness: 0.5, metalness: 0.3 }, wornPaintSet({ seed, paint: '#d39a14', chips: 1.4, grime: 1.3 }));
  const dark = std({ roughness: 0.6, metalness: 0.4 }, wornPaintSet({ seed: seed + 1, paint: '#2a2c2e', chips: 1, grime: 1 }));
  const rub = std({ color: 0x141414, roughness: 0.9 });
  const steel = std({ color: 0x5c6064, roughness: 0.45, metalness: 0.85 });
  const W = 1.05;
  // chassi + contrapeso arredondado (traseira em -x)
  F.add(box(1.5, 0.5, W, yel, [0.1, 0.48, 0], 0.03));
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, W, 32, 1, false, Math.PI, Math.PI), dark); cw.rotation.x = Math.PI / 2; cw.scale.set(0.9, 1, 1); cw.position.set(-0.62, 0.62, 0); F.add(cw);
  F.add(box(0.45, 0.5, W, dark, [-0.5, 0.45, 0], 0.03));
  F.add(box(0.1, 0.12, 0.5, std({ color: 0x8a1a12, roughness: 0.5 }), [-1.0, 0.36, 0]));  // lanterna/para-choque
  // pneus
  const wheel = (x, r, w, z) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), rub); t.rotation.x = Math.PI / 2; t.position.set(x, r, z); F.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 20), yel); h.rotation.x = Math.PI / 2; h.position.set(x, r, z); F.add(h);
  };
  for (const s of [-1, 1]) { wheel(0.55, 0.3, 0.22, s * (W / 2 - 0.06)); wheel(-0.6, 0.24, 0.18, s * (W / 2 - 0.08)); }
  // banco, capô, volante
  F.add(box(0.75, 0.12, 0.8, dark, [-0.15, 0.78, 0], 0.03));
  F.add(box(0.4, 0.1, 0.45, std({ color: 0x1a1a1a, roughness: 0.75 }), [-0.25, 0.89, 0], 0.03));
  F.add(box(0.08, 0.42, 0.45, std({ color: 0x1a1a1a, roughness: 0.75 }), [-0.47, 1.12, 0], 0.03));
  F.add(box(0.22, 0.4, 0.7, dark, [0.42, 0.95, 0], 0.03));
  const col = pipe(0.025, 0.4, dark, [0.25, 1.15, 0], 'y', 10); col.rotation.z = 0.5; F.add(col);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 28), rub); sw.position.set(0.15, 1.33, 0); sw.rotation.y = Math.PI / 2; sw.rotation.x = 0.5; F.add(sw);
  // proteção do operador (santo-antônio)
  for (const x of [-0.5, 0.45]) for (const z of [-W / 2 + 0.06, W / 2 - 0.06]) { const p = pipe(0.035, 1.25, dark, [x, 1.55 + (x > 0 ? 0 : 0), z], 'y', 10); F.add(p); }
  F.add(box(1.05, 0.05, W - 0.05, dark, [-0.02, 2.17, 0]));
  for (let i = 0; i < 6; i++) F.add(box(1.0, 0.02, 0.03, dark, [-0.02, 2.2, -0.4 + i * 0.16]));
  // cilindro de GLP horizontal sobre o contrapeso
  const glp = new THREE.Group();
  const gb = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 6, 24), std({ color: 0xb9bec1, roughness: 0.4, metalness: 0.6 })); gb.rotation.x = Math.PI / 2; glp.add(gb);
  const vv = pipe(0.03, 0.08, std({ color: 0xb08d57, roughness: 0.3, metalness: 1 }), [0, 0.18, 0.28], 'y', 12); glp.add(vv);
  for (const z of [-0.2, 0.2]) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.01, 6, 24), dark); s.position.z = z; glp.add(s); }
  glp.position.set(-0.75, 1.17, 0); F.add(glp);
  F.add(box(0.06, 0.25, 0.7, dark, [-0.62, 1.0, 0]));
  // mastro, porta-garfos e garfos (baixados)
  for (const z of [-0.36, 0.36]) { F.add(box(0.1, 2.25, 0.08, steel, [0.92, 1.12, z])); F.add(box(0.08, 2.1, 0.06, steel, [0.98, 1.1, z * 0.8])); }
  F.add(box(0.06, 0.06, 0.8, steel, [0.96, 2.2, 0])); F.add(box(0.06, 0.06, 0.8, steel, [0.96, 0.3, 0]));
  const chainM = std({ color: 0x2b2b2b, roughness: 0.5, metalness: 0.8 }); for (const z of [-0.15, 0.15]) F.add(box(0.015, 1.6, 0.03, chainM, [0.9, 1.1, z]));
  F.add(box(0.05, 0.42, 0.9, dark, [1.05, 0.3, 0]));
  for (const z of [-0.28, 0.28]) { F.add(box(1.0, 0.045, 0.1, dark, [1.57, 0.03, z])); F.add(box(0.045, 0.4, 0.1, dark, [1.08, 0.22, z])); }
  // escapamento baixo na traseira
  F.add(pipe(0.025, 0.2, std({ color: 0x2b2420, roughness: 0.7, metalness: 0.6 }), [-0.98, 0.2, -0.32], 'x', 10));
  return F;
}

// ---------------------------------------------------------------- gelo / geada criogênica
let _frost = null;
export function frostMat() {
  if (_frost) return _frost;
  const N = 512, R = rng(77), c = cvs(N, N), g = c.getContext('2d');
  g.fillStyle = '#e8eef3'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 400; i++) blob(g, R() * N, R() * N, 4 + R() * 30, `rgba(${R() < 0.5 ? '255,255,255' : '170,190,205'},${0.2 + R() * 0.3})`);
  noise(g, N, N, R, 30);
  const hc = cvs(N, N), hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, N, N);
  for (let i = 0; i < 1600; i++) blob(hg, R() * N, R() * N, 2 + R() * 9, `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},255,0.5)`);
  noise(hg, N, N, R, 60);
  _frost = new THREE.MeshStandardMaterial({ map: tex(c, true, [2, 2]), normalMap: tex(heightToNormal(hc, 3), false, [2, 2]), roughness: 0.75, metalness: 0, color: 0xffffff, emissive: new THREE.Color(0.06, 0.07, 0.08) });
  return _frost;
}
/** tubo coberto de gelo: cilindro com raio irregular (ruído) */
export function icyPipe(r, len, pos, axis = 'x', ice = 0.025, seed = 1) {
  const R = rng(seed), geo = new THREE.CylinderGeometry(r + ice, r + ice, len, 20, Math.max(4, Math.round(len * 24)), false);
  const p = geo.attributes.position, ph = [R() * 6, R() * 6, R() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const n = 0.55 + 0.45 * Math.sin(y * 31 + ph[0] + Math.sin(a * 3 + ph[1]) * 2) * Math.sin(a * 5 + y * 17 + ph[2]) + (R() - 0.5) * 0.12;
    const rr = r + ice * Math.max(0.15, n); const l = Math.hypot(x, z) || 1;
    if (Math.abs(Math.abs(y) - len / 2) > 1e-4) { p.setX(i, x / l * rr); p.setZ(i, z / l * rr); }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, frostMat());
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(...pos); return m;
}
/** acúmulo de gelo em conexão (válvula/flange): bola irregular */
export function iceLump(r, pos, seed = 1, sy = 1) {
  const R = rng(seed), geo = new THREE.IcosahedronGeometry(r, 5), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const n = 1 + 0.16 * Math.sin(v.x / r * 3.1 + v.y / r * 2.3 + R() * 0.0) * Math.sin(v.z / r * 2.7) + 0.06 * Math.sin(v.x / r * 9 + v.z / r * 7); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y * sy, v.z); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, frostMat()); m.position.set(...pos); return m;
}
/** cilindro criogênico (dewar) inox, base y=0 */
export function dewar({ r = 0.26, h = 1.55, seed = 7 } = {}) {
  const g = new THREE.Group();
  const inox = std({ color: 0xc9cdd0, roughness: 0.28, metalness: 0.95 });
  const pts = [[0, 0], [r * 0.95, 0], [r, 0.04], [r, h - 0.12], [r * 0.9, h - 0.05], [r * 0.4, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 40), inox));
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.22, 32, 1, true), std({ color: 0xb0b4b7, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide })); ring.position.y = h + 0.08; g.add(ring);
  for (const y of [0.15, h - 0.35]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 8, 40), inox); b.rotation.x = Math.PI / 2; b.position.y = y; g.add(b); }
  const lb = label(0.3, 0.2, { bg: '#ffffff', text: ['NITROGÊNIO', 'LÍQUIDO', 'UN 1977 · −196 °C'], seed }); lb.position.set(0, h * 0.62, r + 0.004); g.add(lb);
  // geada na metade inferior (uso contínuo)
  const fr = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.006, r + 0.01, 0.45, 40, 1, true), frostMat()); fr.position.y = 0.3; g.add(fr);
  return g;
}
