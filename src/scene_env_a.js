// Ambientes por cenário — dono: AGENTE AMBIENTE A (limpo, confinado, vazamento-h2s). Use peças de scene_env_kit.js / scene_env_common.js.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';
import { SUN_DIR, shadowless, ground, mureta, signPost, drum, cylinderBottle, PAINT } from './scene_env_common.js';

export function limpo() {
  const G = new THREE.Group();
  const sun = SUN_DIR(-0.55, 0.72, 0.45);
  G.add(makeSky({ zenith: [0.16, 0.34, 0.78], horizon: [0.78, 0.86, 0.98], ground: [0.32, 0.31, 0.29], sunDir: sun.toArray(), sunColor: [1.4, 1.25, 1.0], clouds: 0.3 }));
  G.add(mureta());
  const gy = -0.95;
  G.add(ground(gy, concreteSet({ seed: 21, base: '#9c9890', joints: 2, rep: [40, 40] })));
  // faixa de circulação de pedestres (amarela, NR-26) e linha de borda
  const paintM = std({ color: 0xd9a900, roughness: 0.7 });
  for (const z of [-1.7, -3.1]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.1), paintM); s.rotation.x = -Math.PI / 2; s.position.set(0, gy + 0.002, z); G.add(s); }
  // dormentes de tubulação (pipe sleepers) com linhas de processo baixas — entram no quadro hero
  const conc = std({ roughness: 0.95 }, concreteSet({ seed: 23, base: '#8e8a83', rep: [1, 0.4] }));
  const lines = [[0.16, PAINT.cinza], [0.11, PAINT.amareloSeg], [0.08, PAINT.verde], [0.2, PAINT.cinza], [0.06, PAINT.vermelho]];
  for (let x = -8; x <= 10; x += 3.2) G.add(box(0.35, 0.4, 2.4, conc, [x, gy + 0.2, -5.2]));
  lines.forEach(([r, m], i) => { const z = -4.3 - i * 0.42; G.add(pipe(r, 26, m, [1, gy + 0.4 + r, z])); for (let x = -9; x < 11; x += 6.1) G.add(flange(r, m, [x + i * 0.7, gy + 0.4 + r, z])); });
  // galpão ao fundo: chapa trapezoidal, portão de enrolar, janelas zenitais
  const corr = corrugatedSet({ seed: 25, paint: '#b9c1c4', rep: [18, 1] });
  const shed = new THREE.Mesh(new THREE.BoxGeometry(44, 9, 0.3), std({ roughness: 0.55, metalness: 0.5 }, corr)); shed.position.set(2, gy + 4.5, -16); G.add(shed);
  const door = new THREE.Mesh(new THREE.BoxGeometry(5, 5.2, 0.1), std({ roughness: 0.5, metalness: 0.6 }, corrugatedSet({ seed: 26, paint: '#5f6a72', rep: [1, 12] })));
  door.rotation.z = 0; door.position.set(4, gy + 2.6, -15.8); G.add(door);
  const band = box(44, 0.6, 0.32, std({ color: 0x1d4f8a, roughness: 0.5 }), [2, gy + 8.4, -15.98]); G.add(band);
  // silo/tanque e estrutura metálica
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 9, 48), std({ color: 0xd9dcdc, roughness: 0.35, metalness: 0.6 })); silo.position.set(13, gy + 4.5, -12); G.add(silo);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 48), silo.material); cone.position.set(13, gy + 9.6, -12); G.add(cone);
  for (let x = -14; x <= -6; x += 4) for (const z of [-9, -12]) G.add(box(0.25, 6, 0.25, PAINT.escuro, [x, gy + 3, z]));
  G.add(box(8.5, 0.3, 3.4, PAINT.escuro, [-10, gy + 6, -10.5]));
  // chaminé listrada ao longe
  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) stack.add(pipe(1.1 - i * 0.05, 5, i % 2 ? PAINT.vermelho : std({ color: 0xeeeeee, roughness: 0.6 }), [0, i * 5 + 2.5, 0], 'y', 32));
  stack.position.set(-26, gy, -48); G.add(stack);
  // tambores e placa de EPI obrigatório
  G.add(drum(0x1d4f8a, [2.6, gy, -3.0], 0.3), drum(0x1d4f8a, [3.25, gy, -3.15], 1.2), drum(0x9e2a20, [2.9, gy, -2.45], 2));
  const sign = makeSign({ w: 0.9, h: 0.6, kind: 'aviso', title: 'AVISO', lines: ['ÁREA INDUSTRIAL', 'USO OBRIGATÓRIO DE EPI:', 'CAPACETE, ÓCULOS E DETECTOR'], seed: 31 });
  G.add(signPost(sign, [-1.2, gy, -3.6], 1.05, PAINT.aco));
  shadowless(G);
  return {
    group: G,
    look: { keyDir: sun.toArray(), keyColor: [1.0, 0.95, 0.86], keyI: 3.0, exposure: 0.82, envI: 1.0, fog: 0.006, fogColor: [0.62, 0.7, 0.82], contactOpacity: 0.72, bloom: 0.18, vignette: 0.12, shadowR: 5 },
    bake: { hemi: [[0.62, 0.72, 0.95], [0.4, 0.38, 0.34], 1.4], sun: 3.0 },
  };
}

// ============================================================================ 2. ESPAÇO CONFINADO — interior de tanque/galeria

export function confinado() {
  const G = new THREE.Group();
  // piso de chapa xadrez com boca de visita
  const hole = { x: -0.5, z: -0.32, r: 0.32 };
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
  shadowless(G);
  return {
    group: G, particles: [dust],
    look: { keyDir: [0.62, 0.55, 0.58], keyColor: [1.0, 0.92, 0.78], keyI: 2.4, exposure: 1.35, envI: 0.85, fog: 0.16, fogColor: [0.06, 0.05, 0.04], contactOpacity: 0.85, bloom: 0.35, vignette: 0.42, shadowR: 10,
      spot: { pos: [1.7, 1.3, 1.6], target: [0.2, 0.0, -1.0], color: [1.0, 0.9, 0.75], intensity: 9, angle: 0.55, penumbra: 0.7, distance: 9 } },
    bake: { hemi: [[0.16, 0.13, 0.1], [0.08, 0.07, 0.06], 1.0], sun: 2.0,
      extras: [(() => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(4), side: THREE.DoubleSide })); p.position.set(3, 2.2, 3); p.lookAt(0, 0, 0); return p; })()] },
  };
}

// ============================================================================ 3. VAZAMENTO DE H2S — ETE/refinaria, tarde nublada

export function vazamento() {
  const G = new THREE.Group();
  G.add(makeSky({ zenith: [0.42, 0.45, 0.5], horizon: [0.72, 0.74, 0.76], ground: [0.3, 0.3, 0.29], sunDir: [0.3, 0.55, -0.6], sunColor: [0.6, 0.58, 0.55], sunGlow: 0.15, clouds: 0.75, cloudColor: [0.78, 0.79, 0.8], overcast: 0.8 }));
  const gy = -0.62;
  G.add(ground(gy, concreteSet({ seed: 51, base: '#7f7c75', joints: 1, rep: [50, 50], stains: 1.6 })));
  // pedestal de concreto (suporte de tubulação) onde o aparelho está
  const ped = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.62, 0.62, 4, 0.02), std({ roughness: 0.95 }, concreteSet({ seed: 52, base: '#9a968e', rep: [1, 0.4], stains: 2 })));
  ped.position.set(0.25, -0.31, -0.1); G.add(ped);
  // linhas de processo e válvula gaveta com vazamento no castelo
  const pm = std({ color: 0x7b8287, roughness: 0.45, metalness: 0.55 });
  const yel = std({ color: 0xc89a10, roughness: 0.5, metalness: 0.3 });
  G.add(pipe(0.16, 20, pm, [0, gy + 0.55, -1.75]), pipe(0.1, 20, yel, [0, gy + 0.45, -2.3]), pipe(0.07, 20, pm, [0, gy + 0.35, -2.7]));
  for (let x = -8; x <= 8; x += 2.2) { G.add(flange(0.16, pm, [x, gy + 0.55, -1.75])); G.add(box(0.3, 0.32, 1.4, std({ roughness: 0.95, color: 0x8e8a83 }), [x + 1.1, gy + 0.16, -2.2])); }
  const vx = 1.75, vz = -1.75, vy = gy + 0.55;
  const vb = new THREE.Group();
  vb.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), pm));
  vb.add(flange(0.16, pm, [-0.2, 0, 0]), flange(0.16, pm, [0.2, 0, 0]));
  vb.add(pipe(0.09, 0.35, pm, [0, 0.3, 0], 'y'));
  const bonnet = flange(0.09, pm, [0, 0.47, 0], 'y'); vb.add(bonnet);
  vb.add(pipe(0.02, 0.4, PAINT.aco, [0, 0.66, 0], 'y', 12));
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 10, 40), PAINT.vermelho); hw.rotation.x = Math.PI / 2; hw.position.y = 0.82; vb.add(hw);
  for (let i = 0; i < 3; i++) { const sp = pipe(0.008, 0.34, PAINT.vermelho, [0, 0.82, 0], 'x', 6); sp.rotation.y = i * Math.PI / 3; vb.add(sp); }
  vb.position.set(vx, vy, vz); G.add(vb);
  // mancha de produto/condensado sob a válvula
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), std({ color: 0x3b3a30, roughness: 0.25, transparent: true, opacity: 0.55 })); stain.rotation.x = -Math.PI / 2; stain.position.set(vx + 0.2, gy + 0.003, vz + 0.3); G.add(stain);
  // pluma amarelada (gás + vapor d'água) saindo do castelo, arrastada pelo vento
  const plume = makeParticles({ mode: 'jet', count: 700, origin: [vx, vy + 0.48, vz], dir: [0.15, 1, 0.25], speed: 0.22, spread: 0.55, life: 6.5, size: [0.06, 1.1], color: [0.86, 0.83, 0.52], lit: 1.15, opacity: 0.2, wind: [0.07, 0.006, 0.03], turb: 0.12, soft: 2.2 });
  const jetCore = makeParticles({ mode: 'jet', count: 160, origin: [vx, vy + 0.48, vz], dir: [0.4, 1, 0.3], speed: 0.9, spread: 0.12, life: 0.9, size: [0.02, 0.22], color: [0.95, 0.93, 0.75], lit: 1.2, opacity: 0.28, soft: 2.5, seed: 9 });
  G.add(plume, jetCore);
  // decantador circular de concreto + guarda-corpo, prédio de grades ao fundo
  const clar = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.3, 64, 1, true), std({ roughness: 0.95, side: THREE.DoubleSide }, concreteSet({ seed: 53, base: '#8f8b84', rep: [10, 1] })));
  clar.position.set(4.5, gy + 0.65, -8.5); G.add(clar);
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.15, 48), std({ color: 0x3d4a3a, roughness: 0.15, metalness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.set(4.5, gy + 1.1, -8.5); G.add(water);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.03, 8, 96), PAINT.amareloSeg); ring.rotation.x = Math.PI / 2; ring.position.set(4.5, gy + 2.3, -8.5); G.add(ring);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) G.add(pipe(0.025, 1.0, PAINT.amareloSeg, [4.5 + Math.cos(a) * 4.2, gy + 1.8, -8.5 + Math.sin(a) * 4.2], 'y', 8));
  const bw = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 5), std({ roughness: 0.95 }, blockWallSet({ seed: 54, rep: [6, 2.6] }))); bw.position.set(-6.5, gy + 2, -12); G.add(bw);
  G.add(railing(6, PAINT.amareloSeg, [-1.5, gy, -4.2]));
  // placa de perigo H2S
  const sign = makeSign({ w: 0.9, h: 0.6, kind: 'perigo', title: 'PERIGO', lines: ['H₂S — GÁS SULFÍDRICO', 'TÓXICO / INFLAMÁVEL', 'USE DETECTOR PORTÁTIL'], icon: { type: 'tri', inner: 'H₂S' }, seed: 55, dirt: 0.25 });
  G.add(signPost(sign, [-1.05, gy, -3.3], 0.72, PAINT.aco));
  shadowless(G);
  return {
    group: G, particles: [plume, jetCore],
    look: { keyDir: [0.2, 1.0, 0.35], keyColor: [0.92, 0.94, 1.0], keyI: 1.0, exposure: 1.05, envI: 1.0, fog: 0.03, fogColor: [0.6, 0.62, 0.64], contactOpacity: 0.8, bloom: 0.22, vignette: 0.18, shadowR: 24 },
    bake: { hemi: [[0.72, 0.74, 0.78], [0.33, 0.32, 0.3], 1.6], sun: 0.8 },
  };
}

// ============================================================================ 4. CO DE MOTOR — galpão fechado com gerador ligado
