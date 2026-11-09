// Peças auxiliares do AGENTE AMBIENTE A: salas fechadas (paredes + teto), bancada, quadro de avisos, bomba, grade de piso.
import * as THREE from 'three';
import { std, pipe, box, rng } from './scene_env_kit.js';

/** sala fechada: piso em y=fy, paredes em x0..x1 / z0..z1, teto em fy+h. mats: {floor, wall, ceil, band?} */
export function room({ fy, x0, x1, z0, z1, h, floor, wall, ceil, band, bandH = 1.1 }) {
  const g = new THREE.Group(), W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floor); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, fy, cz); g.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceil); ce.rotation.x = Math.PI / 2; ce.position.set(cx, fy + h, cz); g.add(ce);
  const walls = [[W, [cx, fy + h / 2, z0 - 0.1], 0], [W, [cx, fy + h / 2, z1 + 0.1], Math.PI], [D, [x0 - 0.1, fy + h / 2, cz], Math.PI / 2], [D, [x1 + 0.1, fy + h / 2, cz], -Math.PI / 2]];
  for (const [len, p, ry] of walls) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.2), wall); w.position.set(...p); w.rotation.y = ry; g.add(w);
    if (band) { const b = new THREE.Mesh(new THREE.BoxGeometry(len, bandH, 0.012), band); b.position.set(p[0], fy + bandH / 2, p[2]); b.rotation.y = ry; b.translateZ(0.106); g.add(b); }
  }
  return g;
}

/** quadro de avisos (cortiça + papéis fixados), textura procedural */
export function noticeBoard(w = 0.9, h = 0.6, seed = 71) {
  const CW = 1024, CH = Math.round(CW * h / w), c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = '#a77a4a'; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 60 : 200},${R() < 0.5 ? 40 : 150},20,${0.12 + R() * 0.15})`; g.fillRect(R() * CW, R() * CH, 2 + R() * 3, 2 + R() * 3); }
  g.fillStyle = '#0055a5'; g.fillRect(0, 0, CW, CH * 0.12); g.fillStyle = '#fff'; g.font = `900 ${CH * 0.075}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('QUADRO DE AVISOS — SEGURANÇA', CW / 2, CH * 0.062);
  const papers = [
    [0.04, 0.17, 0.28, 0.42, '#ffffff', 'PERMISSÃO DE TRABALHO'], [0.35, 0.16, 0.26, 0.36, '#fff6b0', 'DDS — DIÁLOGO DIÁRIO'],
    [0.66, 0.18, 0.3, 0.3, '#ffffff', 'CALIBRAÇÃO DE DETECTORES'], [0.05, 0.63, 0.24, 0.33, '#d9ecff', 'ESCALA DE PLANTÃO'],
    [0.34, 0.56, 0.3, 0.4, '#ffffff', 'BUMP TEST DIÁRIO'], [0.68, 0.53, 0.27, 0.42, '#ffe0e0', 'EMERGÊNCIA: RAMAL 190'],
  ];
  for (const [px, py, pw, ph, col, title] of papers) {
    g.save(); g.translate((px + pw / 2) * CW, (py + ph / 2) * CH); g.rotate((R() - 0.5) * 0.06);
    const W2 = pw * CW, H2 = ph * CH; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-W2 / 2 + 4, -H2 / 2 + 5, W2, H2);
    g.fillStyle = col; g.fillRect(-W2 / 2, -H2 / 2, W2, H2);
    g.fillStyle = '#222'; g.font = `800 ${H2 * 0.085}px Arial`; g.textAlign = 'center'; g.fillText(title, 0, -H2 / 2 + H2 * 0.12, W2 * 0.92);
    g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let y = -H2 / 2 + H2 * 0.24; y < H2 / 2 - H2 * 0.08; y += H2 * 0.075) g.fillRect(-W2 * 0.42, y, W2 * (0.5 + R() * 0.34), H2 * 0.022);
    g.fillStyle = ['#c8102e', '#0055a5', '#00843d'][(R() * 3) | 0]; g.beginPath(); g.arc(0, -H2 / 2 + 8, 7, 0, 7); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: t, roughness: 0.85 })); face.position.z = 0.012; grp.add(face);
  const al = std({ color: 0xb9bec2, roughness: 0.35, metalness: 0.9 });
  for (const [bw, bh, x, y] of [[w + 0.04, 0.02, 0, h / 2 + 0.01], [w + 0.04, 0.02, 0, -h / 2 - 0.01], [0.02, h, -w / 2 - 0.01, 0], [0.02, h, w / 2 + 0.01, 0]]) grp.add(box(bw, bh, 0.025, al, [x, y, 0.012]));
  grp.add(box(w, h, 0.01, std({ color: 0x5a4632, roughness: 0.9 }), [0, 0, 0.004]));
  return grp;
}

/** bancada de manutenção (estrutura de aço, tampo de madeira, gaveteiro, morsa, caixa de ferramentas) com tampo em y=topY */
export function workbench(len, topY, fy) {
  const g = new THREE.Group(), hh = topY - fy;
  const frame = std({ color: 0x3c4a57, roughness: 0.5, metalness: 0.5 }), wood = std({ color: 0x8b6a45, roughness: 0.75 });
  g.add(box(len, 0.045, 0.75, wood, [0, topY - 0.022, 0], 0.004));
  for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) for (const z of [-0.32, 0.32]) g.add(box(0.05, hh - 0.045, 0.05, frame, [x, fy + (hh - 0.045) / 2, z]));
  g.add(box(len - 0.1, 0.04, 0.6, frame, [0, fy + 0.15, 0]));
  const drw = std({ color: 0x5a6f80, roughness: 0.45, metalness: 0.45 }), handle = std({ color: 0x1e2226, roughness: 0.4, metalness: 0.8 });
  g.add(box(0.55, hh - 0.1, 0.62, drw, [len / 2 - 0.35, fy + (hh - 0.1) / 2 + 0.02, 0]));
  for (let i = 0; i < 4; i++) { const y = topY - 0.12 - i * 0.18; g.add(box(0.5, 0.004, 0.006, handle, [len / 2 - 0.35, y - 0.08, 0.313]), box(0.18, 0.018, 0.02, handle, [len / 2 - 0.35, y, 0.32])); }
  // morsa
  const vise = std({ color: 0x23466e, roughness: 0.45, metalness: 0.5 });
  g.add(box(0.14, 0.09, 0.2, vise, [-len / 2 + 0.25, topY + 0.045, 0.22]), box(0.16, 0.07, 0.03, vise, [-len / 2 + 0.25, topY + 0.13, 0.3]));
  g.add(pipe(0.008, 0.22, handle, [-len / 2 + 0.25, topY + 0.07, 0.36], 'x', 8));
  // caixa de ferramentas
  const red = std({ color: 0xa3231b, roughness: 0.4, metalness: 0.4 });
  g.add(box(0.46, 0.2, 0.22, red, [0.1, topY + 0.1, -0.12], 0.01), box(0.3, 0.02, 0.02, handle, [0.1, topY + 0.23, -0.12]));
  // maleta de calibração e prancheta
  g.add(box(0.36, 0.12, 0.26, std({ color: 0x202326, roughness: 0.6 }), [-0.45, topY + 0.06, -0.05], 0.015));
  g.add(box(0.23, 0.006, 0.32, std({ color: 0xf2f2ee, roughness: 0.8 }), [0.62, topY + 0.003, 0.12]));
  return g;
}

/** grade de piso (barras portantes + travessas) sobre canaleta escura; centro em (x,z), topo em y */
export function floorGrating(w, d, y, pos, depth = 0.4) {
  const g = new THREE.Group();
  const gal = std({ color: 0x8e9396, roughness: 0.55, metalness: 0.8 });
  const nb = Math.round(d / 0.034), nc = Math.round(w / 0.1);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.03, 0.004), gal, nb + nc);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < nb; i++) { m.compose(new THREE.Vector3(0, y - 0.015, -d / 2 + (i + 0.5) * d / nb), q, s1); bars.setMatrixAt(i, m); }
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), sc = new THREE.Vector3(d / w, 0.4, 1.5);
  for (let i = 0; i < nc; i++) { m.compose(new THREE.Vector3(-w / 2 + (i + 0.5) * w / nc, y - 0.004, 0), qy, sc); bars.setMatrixAt(nb + i, m); }
  g.add(bars);
  const pit = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), std({ color: 0x14130f, roughness: 0.3, side: THREE.BackSide }));
  pit.position.y = y - depth / 2 - 0.01; g.add(pit);
  const sludge = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std({ color: 0x2a2a1c, roughness: 0.1, metalness: 0.2 })); sludge.rotation.x = -Math.PI / 2; sludge.position.y = y - depth * 0.75; g.add(sludge);
  g.position.set(pos[0], 0, pos[1]); return g;
}

/** motobomba centrífuga horizontal em base de concreto; descarga sobe até y=riserTop */
export function pumpSet(pos, fy, { motor = 0x2f5d8a, pipeMat, baseMat, riserTop = 1.5 } = {}) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.22, 0.55, baseMat, [0, fy + 0.11, 0]));
  const by = fy + 0.22, mm = std({ color: motor, roughness: 0.5, metalness: 0.4 });
  const mot = pipe(0.15, 0.48, mm, [-0.22, by + 0.2, 0], 'x', 28); g.add(mot);
  for (let i = 0; i < 9; i++) g.add(pipe(0.158, 0.012, mm, [-0.42 + i * 0.045, by + 0.2, 0], 'x', 24));
  g.add(pipe(0.155, 0.08, std({ color: 0x222628, roughness: 0.6, metalness: 0.5 }), [-0.5, by + 0.2, 0], 'x', 24));
  g.add(box(0.1, 0.06, 0.32, mm, [-0.22, by + 0.03, 0]));
  g.add(box(0.16, 0.14, 0.16, std({ color: 0xd4a017, roughness: 0.5, metalness: 0.3 }), [0.1, by + 0.2, 0]));
  const vol = pipe(0.2, 0.15, pipeMat, [0.3, by + 0.22, 0], 'x', 32); g.add(vol);
  g.add(box(0.16, 0.06, 0.3, pipeMat, [0.3, by + 0.03, 0]));
  g.add(pipe(0.07, 0.3, pipeMat, [0.52, by + 0.22, 0], 'x', 20), pipe(0.1, 0.03, pipeMat, [0.66, by + 0.22, 0], 'x', 20));
  const riserLen = riserTop - (by + 0.42);
  g.add(pipe(0.06, riserLen, pipeMat, [0.3, by + 0.42 + riserLen / 2, 0], 'y', 20));
  for (const y of [by + 0.47, by + 0.9]) g.add(pipe(0.088, 0.03, pipeMat, [0.3, y, 0], 'y', 20));
  g.add(pipe(0.085, 0.22, pipeMat, [0.3, by + 0.7, 0], 'y', 24)); // válvula de retenção
  g.position.set(pos[0], 0, pos[1]); return g;
}

/** luminária (painel LED de teto ou arandela blindada) — emissiva, entra no PMREM */
export function lamp(kind, pos, I = 2.5, color = [1, 0.97, 0.92]) {
  const g = new THREE.Group(), em = std({ color: 0xffffff, emissive: new THREE.Color(...color), emissiveIntensity: I, roughness: 0.3 });
  if (kind === 'painel') { g.add(box(0.62, 0.03, 0.62, std({ color: 0xdddddd, roughness: 0.4, metalness: 0.5 }), [0, 0.015, 0])); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), em); p.rotation.x = Math.PI / 2; p.position.y = -0.001; g.add(p); }
  else { g.add(box(0.16, 0.28, 0.1, std({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 }), [0, 0, 0.05], 0.01)); const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.13, 4, 12), em); p.position.z = 0.1; g.add(p);
    for (let i = -1; i <= 1; i++) g.add(box(0.13, 0.008, 0.008, std({ color: 0x222222, roughness: 0.5 }), [0, i * 0.07, 0.16])); }
  g.position.set(...pos); return g;
}
