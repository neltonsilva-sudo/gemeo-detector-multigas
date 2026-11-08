// Peças auxiliares do AGENTE AMBIENTE C (explosiva, enriquecimento-o2). Procedural, sem assets externos.
import * as THREE from 'three';
import { heightToNormal, std, pipe, box, rng } from './scene_env_kit.js';

const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function ctex(c, srgb = true, rep = [1, 1]) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t;
}
function blobs(g, R, W, H, n, r0, r1, col) {
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = R() * H, r = r0 + R() * (r1 - r0);
    const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, col(R)); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

// ------------------------------------------------------------------ heat-haze (refração real via transmissão)
let _hazeN = null;
function hazeNormal() {
  if (_hazeN) return _hazeN;
  const N = 256, R = rng(301), hc = cvs(N, N), g = hc.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 160; i++) {
    const x = R() * N, y = R() * N, rx = 6 + R() * 22, ry = rx * (1.6 + R() * 1.4), v = R() < 0.5 ? 0 : 255;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const gg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rx); gg.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gg.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.save(); g.translate(x + ox, y + oy); g.scale(1, ry / rx); g.translate(-x - ox, -y - oy); g.fillStyle = gg; g.fillRect(x + ox - rx, y + oy - rx, 2 * rx, 2 * rx); g.restore();
    }
  }
  _hazeN = heightToNormal(hc, 3.0);
  return _hazeN;
}
/** Painel de ar tremulando (vapor de hidrocarboneto / ar quente). Distorce o que está atrás; bordas suaves. */
export function heatHaze({ w = 4, h = 2.5, pos = [0, 0, 0], face = [0, 0, 1], strength = 1, speed = 1, rep = [2, 1.2] }) {
  const nt = ctex(hazeNormal(), false, rep);
  const mc = cvs(128, 128), mg = mc.getContext('2d');
  const gx = mg.createLinearGradient(0, 0, 128, 0); gx.addColorStop(0, '#000'); gx.addColorStop(0.25, '#fff'); gx.addColorStop(0.75, '#fff'); gx.addColorStop(1, '#000');
  mg.fillStyle = gx; mg.fillRect(0, 0, 128, 128);
  mg.globalCompositeOperation = 'multiply';
  const gy = mg.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, '#000'); gy.addColorStop(0.45, '#bbb'); gy.addColorStop(0.85, '#fff'); gy.addColorStop(1, '#666');
  mg.fillStyle = gy; mg.fillRect(0, 0, 128, 128);
  const mt = ctex(mc, false); mt.wrapS = mt.wrapT = THREE.ClampToEdgeWrapping;
  const U = { hT: { value: 0 } };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, thickness: 0.9 * strength, thicknessMap: mt, ior: 1.06, roughness: 0, metalness: 0,
    specularIntensity: 0, normalMap: nt, normalScale: new THREE.Vector2(1, 1), depthWrite: false, fog: false,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hT = U.hT;
    sh.fragmentShader = 'uniform float hT;\n' + sh.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      'vec3 mapN = texture2D( normalMap, vNormalMapUv + vec2(sin(hT*0.7)*0.02, -hT*0.11) ).xyz + texture2D( normalMap, vNormalMapUv*vec2(1.6,1.3) + vec2(0.37, -hT*0.19) ).xyz - 1.0;');
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(...pos); mesh.lookAt(pos[0] + face[0], pos[1] + face[1], pos[2] + face[2]);
  const t0 = performance.now();
  mesh.onBeforeRender = () => { U.hT.value = (performance.now() - t0) / 1000 * speed; };
  // fora do bake do PMREM (renderizado no mesmo quadro da construção): aparece no quadro seguinte
  mesh.visible = false; requestAnimationFrame(() => requestAnimationFrame(() => { mesh.visible = true; }));
  return mesh;
}

// ------------------------------------------------------------------ texturas
/** pintura branca de tanque com escorrimentos, fuligem na base e cordões de solda (anéis de ~2,4 m) */
export function tankShellSet({ seed = 1, h = 12, circ = 30, paint = [222, 218, 208] } = {}) {
  const W = 1024, H = 1024, R = rng(seed), c = cvs(W, H), g = c.getContext('2d');
  g.fillStyle = `rgb(${paint})`; g.fillRect(0, 0, W, H);
  blobs(g, R, W, H, 90, 20, 140, (r) => `rgba(${120 + r() * 40},${100 + r() * 30},${80},${0.05 + r() * 0.08})`);
  // escorrimentos de ferrugem e sujeira a partir dos cordões
  const courses = Math.max(2, Math.round(h / 2.4)), ch = H / courses;
  for (let k = 1; k <= courses; k++) {
    const y = H - k * ch;
    for (let i = 0; i < 26; i++) {
      const x = R() * W, l = 20 + R() * ch * 0.8, w = 1 + R() * 3.5;
      const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, `rgba(${110 + R() * 30},60,25,${0.25 + R() * 0.35})`); gr.addColorStop(1, 'rgba(110,60,25,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, l);
    }
  }
  // base encardida (respingos, poeira)
  const gb = g.createLinearGradient(0, H, 0, H - ch * 0.9); gb.addColorStop(0, 'rgba(70,58,44,0.6)'); gb.addColorStop(1, 'rgba(70,58,44,0)');
  g.fillStyle = gb; g.fillRect(0, H - ch, W, ch);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,50,40,${R() * 0.3})`; g.fillRect(R() * W, H - R() * ch * 0.5, 1 + R() * 3, 1 + R() * 3); }
  // pintura descascada
  for (let i = 0; i < 60; i++) { const x = R() * W, y = R() * H, s = 2 + R() * 9; g.fillStyle = `rgba(${105 + R() * 30},${70 + R() * 20},45,0.85)`; g.beginPath(); g.ellipse(x, y, s, s * (0.5 + R()), R() * 3, 0, 7); g.fill(); }
  const hc = cvs(W, H), hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H);
  hg.fillStyle = '#d0d0d0'; g.fillStyle = 'rgba(90,80,70,0.35)';
  for (let k = 1; k < courses; k++) { const y = H - k * ch; hg.fillRect(0, y - 3, W, 6); g.fillRect(0, y - 2, W, 4); }
  // juntas verticais desencontradas (chapas de ~8 m)
  const plates = Math.max(3, Math.round(circ / 8));
  for (let k = 0; k < courses; k++) for (let p = 0; p < plates; p++) { const x = ((p + (k % 2) * 0.5) / plates) * W, y = H - (k + 1) * ch; hg.fillRect(x - 2, y, 4, ch); g.fillRect(x - 1, y, 2, ch); }
  const rc = cvs(256, 256), rg = rc.getContext('2d'); rg.fillStyle = '#8c8c8c'; rg.fillRect(0, 0, 256, 256);
  blobs(rg, R, 256, 256, 40, 8, 40, () => 'rgba(220,220,220,0.4)');
  return { map: ctex(c), normalMap: ctex(heightToNormal(hc, 1.5), false), roughnessMap: ctex(rc, false) };
}

/** mancha (óleo / água) — decalque no piso */
export function stainDecal(w, d, { seed = 1, color = [22, 18, 14], alpha = 0.75, rough = 0.25 } = {}) {
  const N = 256, R = rng(seed), c = cvs(N, N), g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = N / 2 + (R() - 0.5) * N * 0.45, y = N / 2 + (R() - 0.5) * N * 0.45, r = N * (0.12 + R() * 0.22);
    const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(${color},${alpha})`); gg.addColorStop(0.7, `rgba(${color},${alpha * 0.6})`); gg.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gg; g.fillRect(0, 0, N, N);
  }
  const t = ctex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = seed * 1.7; return mesh;
}

/** texto pintado/estêncil (plano transparente) */
export function stencil(text, w, h, { color = '#1a1a1a', font = 900, alpha = 0.92, seed = 3 } = {}) {
  const CW = 1024, CH = Math.round(1024 * h / w), c = cvs(CW, CH), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = color; g.globalAlpha = alpha; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = CH * 0.9; do { g.font = `${font} ${s}px Arial, Helvetica, sans-serif`; s -= 4; } while (g.measureText(text).width > CW * 0.96 && s > 10);
  g.fillText(text, CW / 2, CH / 2);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1;
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.6})`; g.fillRect(R() * CW, R() * CH, 2 + R() * 8, 1 + R() * 4); }
  const t = ctex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
}

/** pintura de cilindro (verde, riscos e marcas de manuseio) */
export function bottlePaintSet({ seed = 1, base = [24, 112, 58] } = {}) {
  const W = 512, H = 512, R = rng(seed), c = cvs(W, H), g = c.getContext('2d');
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, H);
  blobs(g, R, W, H, 40, 10, 80, (r) => (r() < 0.5 ? `rgba(10,40,20,${0.12 + r() * 0.12})` : `rgba(120,170,130,${0.05 + r() * 0.08})`));
  for (let i = 0; i < 120; i++) { // riscos horizontais (manuseio) mostrando metal/primer
    const x = R() * W, y = R() * H, l = 6 + R() * 50; g.strokeStyle = R() < 0.6 ? `rgba(150,150,140,${0.4 + R() * 0.4})` : `rgba(40,30,25,${0.3 + R() * 0.3})`;
    g.lineWidth = 0.6 + R() * 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5) * 4); g.stroke();
  }
  const gb = g.createLinearGradient(0, H, 0, H * 0.85); gb.addColorStop(0, 'rgba(40,35,30,0.55)'); gb.addColorStop(1, 'rgba(40,35,30,0)'); g.fillStyle = gb; g.fillRect(0, H * 0.85, W, H * 0.15);
  const rc = cvs(128, 128), rg = rc.getContext('2d'); rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, 128, 128); blobs(rg, R, 128, 128, 20, 5, 25, () => 'rgba(200,200,200,0.4)');
  return { map: ctex(c), roughnessMap: ctex(rc, false) };
}

// ------------------------------------------------------------------ peças
const boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
/** flange aparafusado (par de flanges + parafusos), eixo 'x' | 'y' | 'z' */
export function boltedFlange(r, mat, pos, axis = 'x', boltMat) {
  const g = new THREE.Group(); const R = r * 1.6, n = r > 0.12 ? 12 : 8;
  g.add(pipe(R, 0.03, mat, [0, -0.017, 0], 'y', 28), pipe(R, 0.03, mat, [0, 0.017, 0], 'y', 28));
  const bolts = new THREE.InstancedMesh(boltGeo, boltMat || mat, n); const M = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; M.compose(new THREE.Vector3(Math.cos(a) * R * 0.86, 0, Math.sin(a) * R * 0.86), new THREE.Quaternion(), new THREE.Vector3(Math.max(1, r * 9), 0.1, Math.max(1, r * 9))); bolts.setMatrixAt(i, M); }
  g.add(bolts);
  if (axis === 'x') g.rotation.z = Math.PI / 2; else if (axis === 'z') g.rotation.x = Math.PI / 2;
  g.position.set(...pos); return g;
}
/** volante (handwheel) */
export function handwheel(rw, mat) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rw, rw * 0.09, 8, 32), mat); rim.rotation.x = Math.PI / 2; g.add(rim);
  for (let k = 0; k < 3; k++) { const s = box(rw * 2, rw * 0.08, rw * 0.08, mat, [0, 0, 0]); s.rotation.y = k * Math.PI / 3; g.add(s); }
  g.add(pipe(rw * 0.18, rw * 0.3, mat, [0, 0, 0], 'y', 12));
  return g;
}
/** válvula gaveta com flanges, castelo e volante — tubo ao longo de x */
export function gateValve(r, bodyMat, wheelMat, pos, rotY = 0, boltMat) {
  const g = new THREE.Group();
  g.add(pipe(r * 1.25, r * 3.2, bodyMat, [0, 0, 0], 'x', 20));
  g.add(boltedFlange(r, bodyMat, [-r * 1.7, 0, 0], 'x', boltMat), boltedFlange(r, bodyMat, [r * 1.7, 0, 0], 'x', boltMat));
  g.add(box(r * 1.6, r * 2.2, r * 1.6, bodyMat, [0, r * 1.5, 0], r * 0.2));
  g.add(pipe(r * 0.95, 0.03, bodyMat, [0, r * 2.65, 0], 'y', 16));
  g.add(box(r * 0.9, r * 2.2, r * 0.5, bodyMat, [0, r * 3.8, 0]));
  g.add(pipe(0.012, r * 3.2, std({ color: 0xb9b2a0, roughness: 0.3, metalness: 1 }), [0, r * 5.2, 0], 'y', 8));
  const hw = handwheel(Math.max(0.09, r * 1.6), wheelMat); hw.position.y = r * 5.0; g.add(hw);
  g.position.set(...pos); g.rotation.y = rotY; return g;
}
/** corrente (elos instanciados) de a até b */
export function chain(a, b, mat, link = 0.03) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), n = Math.max(2, Math.floor(L / (link * 0.75)));
  const geo = new THREE.TorusGeometry(link * 0.42, link * 0.1, 5, 10); geo.scale(1.35, 1, 1);
  const im = new THREE.InstancedMesh(geo, mat, n); const M = new THREE.Matrix4(), q = new THREE.Quaternion(), dir = B.clone().sub(A).normalize();
  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = A.clone().lerp(B, t); p.y -= Math.sin(t * Math.PI) * L * 0.02; // leve catenária
    q.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), i % 2 ? Math.PI / 2 : 0));
    M.compose(p, q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, M);
  }
  return im;
}
/** manômetro de mostrador (caixa inox + vidro + escala); face para +z */
export function gauge(rad = 0.05, seed = 1, val = 0.7, label = 'kgf/cm²') {
  const g = new THREE.Group();
  const N = 256, c = cvs(N, N), x = c.getContext('2d');
  x.fillStyle = '#f4f2ec'; x.beginPath(); x.arc(N / 2, N / 2, N / 2, 0, 7); x.fill();
  x.strokeStyle = '#111'; x.lineWidth = 3; x.save(); x.translate(N / 2, N / 2);
  for (let i = 0; i <= 40; i++) { const a = -Math.PI * 1.25 + i / 40 * Math.PI * 1.5; x.lineWidth = i % 5 ? 2 : 4; const r0 = i % 5 ? 0.78 : 0.7; x.beginPath(); x.moveTo(Math.cos(a) * N * 0.42 * r0 / 0.85, Math.sin(a) * N * 0.42 * r0 / 0.85); x.lineTo(Math.cos(a) * N * 0.43, Math.sin(a) * N * 0.43); x.stroke(); }
  x.strokeStyle = '#c8102e'; x.lineWidth = 8; x.beginPath(); x.arc(0, 0, N * 0.4, Math.PI * 0.05, Math.PI * 0.25); x.stroke();
  x.fillStyle = '#111'; x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText(label, 0, N * 0.22); x.font = 'bold 16px Arial'; x.fillText('O₂ — SEM ÓLEO', 0, N * 0.33);
  const a = -Math.PI * 1.25 + val * Math.PI * 1.5; x.strokeStyle = '#111'; x.lineWidth = 5; x.beginPath(); x.moveTo(-Math.cos(a) * 14, -Math.sin(a) * 14); x.lineTo(Math.cos(a) * N * 0.38, Math.sin(a) * N * 0.38); x.stroke();
  x.fillStyle = '#222'; x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill(); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const caseM = std({ color: 0xc8ccce, roughness: 0.25, metalness: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, rad * 0.55, 32), caseM); body.rotation.x = Math.PI / 2; g.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.9, 32), std({ map: t, roughness: 0.15 })); face.position.z = rad * 0.28; g.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.94, rad * 0.07, 8, 32), caseM); ring.position.z = rad * 0.28; g.add(ring);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.9, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, metalness: 0 })); glass.position.z = rad * 0.3; g.add(glass);
  return g;
}
/** tubo curvo (serpentina/rabicho, cabos) ao longo de pontos */
export function tubeAlong(pts, r, mat, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, false), mat);
}
