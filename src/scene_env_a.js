// Ambientes por cenário — dono: AGENTE AMBIENTE A (limpo, confinado, vazamento-h2s). Use peças de scene_env_kit.js / scene_env_common.js.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';
import { TRIPOD_H } from './tripod.js';
import { room, noticeBoard, workbench, floorGrating, pumpSet, lamp } from './scene_env_a_room.js';
import { SUN_DIR, shadowless, ground, mureta, signPost, drum, cylinderBottle, PAINT } from './scene_env_common.js';

export function limpo() {
  const G = new THREE.Group();
  const fy = -TRIPOD_H, H = 3.2, X0 = -3.2, X1 = 4.6, Z0 = -3.6, Z1 = 2.8;
  const wallSet = blockWallSet({ seed: 21, base: '#dcd8d0', rep: [10, 4] });
  const floorM = std({ roughness: 0.42, metalness: 0.05, color: 0xb9c4bc }, concreteSet({ seed: 22, base: '#7f8b84', joints: 1, rep: [2, 2], stains: 0.35 }));
  G.add(room({ fy, x0: X0, x1: X1, z0: Z0, z1: Z1, h: H, floor: floorM, wall: std({ roughness: 0.85 }, wallSet), ceil: std({ color: 0xe6e6e2, roughness: 0.9 }),
    band: std({ roughness: 0.6, color: 0x7d97ad }, wallSet), bandH: 1.05 }));
  // faixas amarelas de demarcação (NR-26) em frente à bancada e ao armário
  const paintM = std({ color: 0xd9a900, roughness: 0.55 });
  for (const [w, d, x, z] of [[4.2, 0.08, 1.9, -2.55], [0.08, 1.1, -0.15, -3.05], [0.08, 1.4, 3.35, -2.9]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paintM); s.rotation.x = -Math.PI / 2; s.position.set(x, fy + 0.002, z); G.add(s); }
  // bancada ao fundo, quadro de avisos, placa de EPI
  const wb = workbench(2.6, fy + 0.9, fy); wb.position.set(1.95, 0, Z0 + 0.4); G.add(wb);
  const nb = noticeBoard(0.95, 0.62); nb.position.set(0.5, 0.16, Z0 + 0.005); G.add(nb);
  const sign = makeSign({ w: 0.6, h: 0.4, kind: 'aviso', title: 'AVISO', lines: ['USO OBRIGATÓRIO DE EPI:', 'ÓCULOS, LUVAS E', 'DETECTOR DE GASES'], seed: 31 });
  sign.position.set(2.4, 0.2, Z0 + 0.006); G.add(sign);
  // armário de ferramentas e extintor na parede lateral
  const cab = std({ color: 0x8a2a22, roughness: 0.45, metalness: 0.4 });
  G.add(box(0.9, 1.8, 0.5, cab, [3.95, fy + 0.9, Z0 + 0.3], 0.01));
  for (const x of [3.73, 4.17]) G.add(box(0.02, 0.2, 0.03, PAINT.escuro, [x, fy + 1.0, Z0 + 0.56]));
  G.add(box(0.005, 1.7, 0.005, PAINT.escuro, [3.95, fy + 0.9, Z0 + 0.555]));
  const ext = cylinderBottle({ body: 0xc0201a, h: 0.55, r: 0.085 }); ext.position.set(X1 - 0.12, fy + 0.25, -2.0); G.add(ext);
  G.add(box(0.3, 0.3, 0.02, std({ color: 0xc0201a, roughness: 0.5 }), [X1 - 0.01, fy + 1.65, -2.0]));
  // tambor de coleta e carrinho ao lado
  G.add(drum(0x1d4f8a, [-1.6, fy, -3.1], 0.3));
  // luminárias de teto (painéis LED) — iluminação clara e uniforme
  for (const x of [-1.5, 0.8, 3.1]) for (const z of [-2.2, 0.4]) G.add(lamp('painel', [x, fy + H - 0.03, z], 3.2));
  shadowless(G);
  return {
    group: G,
    look: { keyDir: [0.25, 1.0, 0.35], keyColor: [1.0, 0.98, 0.95], keyI: 2.2, exposure: 1.0, envI: 1.15, fog: 0.004, fogColor: [0.8, 0.8, 0.78], contactOpacity: 0, bloom: 0.15, vignette: 0.12, shadowR: 14 },
    bake: { hemi: [[0.95, 0.95, 0.93], [0.55, 0.57, 0.55], 1.6], sun: 1.6 },
  };
}

// ============================================================================ 2. ESPAÇO CONFINADO — interior de tanque/galeria

export function confinado() {
  const ROOT = new THREE.Group(), G = new THREE.Group(); G.position.y = -TRIPOD_H; ROOT.add(G);
  // piso de chapa xadrez com boca de visita
  const hole = { x: 1.2, z: -1.5, r: 0.32 };
  const shape = new THREE.Shape(); shape.moveTo(-5, -5); shape.lineTo(5, -5); shape.lineTo(5, 5); shape.lineTo(-5, 5); shape.closePath();
  const hp = new THREE.Path(); hp.absarc(hole.x, -hole.z, hole.r, 0, Math.PI * 2, true); shape.holes.push(hp);
  const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 48 }); deckGeo.rotateX(-Math.PI / 2); deckGeo.translate(0, -0.012, 0);
  const tread = treadPlateSet({ seed: 41, rep: [4, 4] });
  G.add(new THREE.Mesh(deckGeo, std({ roughness: 0.55, metalness: 0.75, normalScale: new THREE.Vector2(1.2, 1.2) }, tread)));
  // gola da boca de visita + tampa articulada aberta
  const steel = rustSteelSet({ seed: 42, paint: '#4f5a5e', rust: 1.2, rep: [2, 1], seams: 1 });
  const collarM = std({ roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide }, steel);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(hole.r + 0.01, hole.r + 0.01, 0.07, 48, 1, true), collarM); collar.position.set(hole.x, 0.035, hole.z); G.add(collar);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(hole.r + 0.01, 0.014, 10, 48), collarM); lip.rotation.x = Math.PI / 2; lip.position.set(hole.x, 0.07, hole.z); G.add(lip);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(hole.r, hole.r, 3.2, 40, 1, true), std({ roughness: 0.8, metalness: 0.5, side: THREE.BackSide, color: 0x6a6a6a }, rustSteelSet({ seed: 43, rust: 1.6, rep: [2, 4] })));
  shaft.position.set(hole.x, -1.6, hole.z); G.add(shaft);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(hole.r + 0.04, hole.r + 0.04, 0.025, 48), std({ roughness: 0.55, metalness: 0.7 }, treadPlateSet({ seed: 44, rep: [0.6, 0.6] })));
  lid.position.set(hole.x - 0.12, 0.33, hole.z - 0.4); lid.rotation.x = -1.25; G.add(lid);
  // escada marinheiro descendo pela boca (com prolongamento de pega acima do piso)
  const lad = new THREE.Group(); const lm = std({ color: 0xc9a227, roughness: 0.5, metalness: 0.4 });
  for (const sx of [-0.18, 0.18]) { lad.add(pipe(0.014, 3.9, lm, [sx, -1.05, 0], 'y', 12)); }
  for (const sx of [-0.18, 0.18]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 16, Math.PI), lm); t.position.set(sx, 0.9, 0.1); t.rotation.y = Math.PI / 2; lad.add(t); }
  for (let y = 0.6; y > -3; y -= 0.3) lad.add(pipe(0.011, 0.36, lm, [0, y, 0], 'x', 10));
  lad.position.set(hole.x, 0, hole.z - hole.r + 0.06); G.add(lad);
  // casco do tanque: cilindro horizontal com ferrugem, nervuras e cordões de solda
  const R = 3.4, cy = 1.0;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 16, 72, 1, true), std({ roughness: 0.75, metalness: 0.55, side: THREE.BackSide }, rustSteelSet({ seed: 45, paint: '#5a6164', rust: 1.4, rep: [8, 3], seams: 3 })));
  hull.rotation.z = Math.PI / 2; hull.position.y = cy; G.add(hull);
  const ribM = std({ color: 0x5b5048, roughness: 0.7, metalness: 0.5 });
  for (let x = -6; x <= 6; x += 1.5) { const rb = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.045, 8, 72), ribM); rb.rotation.y = Math.PI / 2; rb.position.set(x, cy, 0); G.add(rb); }
  for (const x of [-8, 8]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), ribM); cap.position.set(x, cy, 0); cap.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2; G.add(cap); }
  // refletor portátil (tripé) ao fundo-esquerda + cabo
  const lamp = new THREE.Group();
  const lh = box(0.24, 0.17, 0.1, std({ color: 0xd8a200, roughness: 0.5 }), [0, 0.62, 0], 0.01);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), std({ color: 0xffffff, emissive: new THREE.Color(1, 0.93, 0.8), emissiveIntensity: 2.2, roughness: 0.2 }));
  lens.position.set(0, 0.62, 0.051); lamp.add(lh, lens);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; const leg = pipe(0.008, 0.68, PAINT.escuro, [Math.sin(a) * 0.12, 0.3, Math.cos(a) * 0.12], 'y', 8); leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); lamp.add(leg); }
  lamp.position.set(-1.6, 0, -1.9); lamp.rotation.y = 0.7; G.add(lamp);
  // placa NR-33 no casco (curvatura acompanhada)
  const sign = makeSign({ w: 0.66, h: 0.4, kind: 'perigo', title: 'PERIGO', lines: ['ESPAÇO CONFINADO', 'ENTRADA PROIBIDA', 'SEM PERMISSÃO (PET)'], icon: { type: 'tri', inner: '!' }, seed: 46, dirt: 0.3 });
  const zW = -Math.sqrt(R * R - (0.2 - cy) ** 2) + 0.03; sign.position.set(0.55, 0.2, zW); sign.rotation.x = -Math.atan2(cy - 0.2, -zW) * 0.0 - 0.24; G.add(sign);
  // poeira no ar (fica visível no feixe)
  const dust = makeParticles({ mode: 'box', count: 900, box: [[-2.2, 0.02, -2.6], [2.6, 1.6, 1.0]], size: [0.0015, 0.004], color: [1.0, 0.9, 0.75], lit: 1.6, opacity: 0.5, life: 9, wind: [0.04, 0.01, 0.02], turb: 0.05, blending: 'add', soft: 2.5 });
  G.add(dust);
  shadowless(ROOT);
  return {
    group: ROOT, particles: [dust],
    look: { keyDir: [0.62, 0.55, 0.58], keyColor: [1.0, 0.92, 0.78], keyI: 2.4, exposure: 1.35, envI: 0.85, fog: 0.16, fogColor: [0.06, 0.05, 0.04], contactOpacity: 0, bloom: 0.35, vignette: 0.42, shadowR: 10,
      spot: { pos: [1.7, 1.3, 1.6], target: [0.2, -TRIPOD_H, -1.0], color: [1.0, 0.9, 0.75], intensity: 9, angle: 0.55, penumbra: 0.7, distance: 9 } },
    bake: { hemi: [[0.16, 0.13, 0.1], [0.08, 0.07, 0.06], 1.0], sun: 2.0,
      extras: [(() => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(4), side: THREE.DoubleSide })); p.position.set(3, 2.2, 3); p.lookAt(0, 0, 0); return p; })()] },
  };
}

// ============================================================================ 3. VAZAMENTO DE H2S — casa de bombas / estação elevatória de esgoto fechada
export function vazamento() {
  const G = new THREE.Group();
  const gy = -TRIPOD_H, H = 3.0, X0 = -3.0, X1 = 4.6, Z0 = -3.6, Z1 = 2.5;
  const wallSet = blockWallSet({ seed: 54, base: '#9a968c', rep: [9.5, 3.8] });
  const floorM = std({ roughness: 0.6 }, concreteSet({ seed: 51, base: '#6e6b63', joints: 1, rep: [2, 2], stains: 2.6 }));
  G.add(room({ fy: gy, x0: X0, x1: X1, z0: Z0, z1: Z1, h: H, floor: floorM, wall: std({ roughness: 0.92 }, wallSet), ceil: std({ roughness: 0.95, color: 0x8a8780 }, concreteSet({ seed: 56, base: '#8a8780', rep: [2, 2] })),
    band: std({ roughness: 0.7, color: 0x5d6b5f }, wallSet), bandH: 1.2 }));
  const pm = std({ roughness: 0.55, metalness: 0.5 }, rustSteelSet({ seed: 57, paint: '#596660', rust: 0.7, rep: [1, 4], seams: 0 }));
  const conc = std({ roughness: 0.95, color: 0x8e8a83 });
  // bombas ao fundo com recalques subindo ao barrilete
  for (const [x, c] of [[0.9, 0x2f5d8a], [2.8, 0x2f5d8a]]) G.add(pumpSet([x, Z0 + 0.65], gy, { motor: c, pipeMat: pm, baseMat: conc, riserTop: gy + 2.35 }));
  G.add(pipe(0.1, X1 - X0, pm, [(X0 + X1) / 2, gy + 2.35, Z0 + 0.65]));
  // canaleta com grade de piso entre as bombas e a linha que vaza
  G.add(floorGrating(X1 - X0 - 0.4, 0.45, gy + 0.001, [(X0 + X1) / 2 + 0.1, -2.35]));
  // linha de esgoto/gás e válvula gaveta com vazamento no castelo
  G.add(pipe(0.16, X1 - X0, pm, [(X0 + X1) / 2, gy + 0.55, -1.75]));
  for (let x = X0 + 0.8; x < X1; x += 2.2) { G.add(flange(0.16, pm, [x, gy + 0.55, -1.75])); G.add(box(0.3, 0.38, 0.5, conc, [x + 1.1, gy + 0.19, -1.75])); }
  const vx = 1.75, vz = -1.75, vy = gy + 0.55;
  const vb = new THREE.Group();
  vb.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), pm));
  vb.add(flange(0.16, pm, [-0.2, 0, 0]), flange(0.16, pm, [0.2, 0, 0]));
  vb.add(pipe(0.09, 0.35, pm, [0, 0.3, 0], 'y'));
  vb.add(flange(0.09, pm, [0, 0.47, 0], 'y'));
  vb.add(pipe(0.02, 0.4, PAINT.aco, [0, 0.66, 0], 'y', 12));
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 10, 40), PAINT.vermelho); hw.rotation.x = Math.PI / 2; hw.position.y = 0.82; vb.add(hw);
  for (let i = 0; i < 3; i++) { const sp = pipe(0.008, 0.34, PAINT.vermelho, [0, 0.82, 0], 'x', 6); sp.rotation.y = i * Math.PI / 3; vb.add(sp); }
  // crostas amarelas de enxofre no castelo (vazamento crônico de H2S)
  const sulf = std({ color: 0xd6c23a, roughness: 0.9 }), R = rng(58);
  for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.008 + R() * 0.012, 0), sulf); s.position.set(Math.cos(a) * 0.13, 0.46 + R() * 0.05, Math.sin(a) * 0.13); vb.add(s); }
  vb.position.set(vx, vy, vz); G.add(vb);
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), std({ color: 0x2f2e26, roughness: 0.15, transparent: true, opacity: 0.6 })); stain.rotation.x = -Math.PI / 2; stain.position.set(vx + 0.1, gy + 0.003, vz + 0.35); G.add(stain);
  // pluma amarelada (gás + vapor) saindo do castelo e derivando para trás do aparelho (ar parado, H2S mais denso que o ar)
  const plume = makeParticles({ mode: 'jet', count: 420, origin: [vx, vy + 0.48, vz], dir: [-0.6, 0.45, 0.15], speed: 0.22, spread: 0.45, life: 6.5, size: [0.05, 0.6], color: [0.82, 0.8, 0.5], lit: 0.75, opacity: 0.075, wind: [-0.035, -0.012, 0.01], turb: 0.1, soft: 2.2 });
  const jetCore = makeParticles({ mode: 'jet', count: 160, origin: [vx, vy + 0.48, vz], dir: [-0.5, 0.6, 0.3], speed: 0.9, spread: 0.12, life: 0.9, size: [0.02, 0.16], color: [0.9, 0.88, 0.72], lit: 0.8, opacity: 0.12, soft: 2.5, seed: 9 });
  // névoa parada (ventilação deficiente)
  const haze = makeParticles({ mode: 'box', count: 70, box: [[-0.5, gy, -3.4], [4.4, gy + 1.4, -1.0]], size: [0.6, 1.4], color: [0.72, 0.72, 0.6], lit: 0.8, opacity: 0.05, life: 14, wind: [-0.02, 0, 0], turb: 0.08, seed: 13, soft: 2.0 });
  G.add(plume, jetCore, haze);
  // exaustor parado e empoeirado na parede lateral, arandelas blindadas
  const fan = new THREE.Group(); fan.add(box(0.62, 0.62, 0.12, std({ color: 0x55595b, roughness: 0.8, metalness: 0.4 }), [0, 0, 0]));
  for (let i = 0; i < 4; i++) { const b = box(0.24, 0.07, 0.01, std({ color: 0x3c3f40, roughness: 0.8 }), [0, 0, 0.065]); b.rotation.z = i * Math.PI / 2 + 0.3; b.translateX(0.12); fan.add(b); }
  fan.position.set(X1 - 0.06, gy + 2.0, -1.4); fan.rotation.y = -Math.PI / 2; G.add(fan);
  for (const x of [-0.6, 2.0]) G.add(lamp('arandela', [x, gy + 2.1, Z0], 1.6, [1.0, 0.9, 0.7]));
  // placa de perigo H2S na parede do fundo
  const sign = makeSign({ w: 0.7, h: 0.48, kind: 'perigo', title: 'PERIGO — H₂S', lines: ['GÁS SULFÍDRICO', 'TÓXICO / INFLAMÁVEL', 'USE DETECTOR PORTÁTIL'], icon: { type: 'tri', inner: 'H₂S' }, seed: 55, dirt: 0.3 });
  sign.position.set(0.7, -0.3, Z0 + 0.03); G.add(sign);
  shadowless(G);
  return {
    group: G, particles: [plume, jetCore, haze],
    look: { keyDir: [0.3, 1.0, 0.4], keyColor: [1.0, 0.9, 0.74], keyI: 1.1, exposure: 1.15, envI: 0.9, fog: 0.07, fogColor: [0.34, 0.34, 0.3], contactOpacity: 0, bloom: 0.25, vignette: 0.3, shadowR: 16 },
    bake: { hemi: [[0.55, 0.53, 0.47], [0.25, 0.24, 0.21], 1.2], sun: 0.9 },
  };
}

// ============================================================================ 4. CO DE MOTOR — galpão fechado com gerador ligado
