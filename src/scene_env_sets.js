// Cenários realistas por situação de risco (agente RENDER). Cada builder devolve:
// { group, look, bake:{hemi:[sky,ground,int], sun:int, extras:[Object3D]}, particles:[Points], update(dt,t) }
// Convenções: metros; aparelho na origem apoiado em y=0 (topo do apoio); frente +z; a câmera hero (~0,4 m) enxerga o
// fundo até ~0,3 m acima do apoio a 3–5 m → elementos-chave (placas, válvulas, plumas) ficam baixos e atrás/à direita.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';

const SUN_DIR = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const shadowless = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); return g; };

function ground(y, set, size = 160) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), std({ roughness: 1 }, set));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}
/** mureta/bancada de concreto com o topo em y=0 */
function mureta(w = 3.0, h = 0.95, d = 0.46, x = 0.3, z = -0.08, seed = 11) {
  const s = concreteSet({ seed, base: '#a29e96', rep: [1.2, 0.5], stains: 1.4 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.025), std({ roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }, s));
  m.position.set(x, -h / 2, z); return m;
}
function signPost(sign, pos, postH, mat) {
  const g = new THREE.Group();
  g.add(sign); sign.position.y = postH;
  const p = pipe(0.025, postH + 0.2, mat, [0, (postH + 0.2) / 2 - 0.1, -0.02], 'y', 12); g.add(p);
  g.position.set(...pos); return g;
}
function drum(color, pos, rot = 0) {
  const g = new THREE.Group();
  const mat = std({ color, roughness: 0.45, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 32), mat); body.position.y = 0.44; g.add(body);
  for (const y of [0.29, 0.59]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.012, 8, 40), mat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.015, 8, 40), std({ color: 0x777777, roughness: 0.4, metalness: 0.7 })); lid.rotation.x = Math.PI / 2; lid.position.y = 0.88; g.add(lid);
  g.position.set(...pos); g.rotation.y = rot; return g;
}
function cylinderBottle({ body, shoulder, h = 1.45, r = 0.115 }) {
  const g = new THREE.Group();
  const pts = [[0, 0], [r * 0.92, 0], [r, 0.03], [r, h - 0.22], [r * 0.85, h - 0.12], [r * 0.45, h - 0.05], [0.032, h - 0.02], [0.032, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
  const geo = new THREE.LatheGeometry(pts, 36);
  const mb = std({ color: body, roughness: 0.38, metalness: 0.15 });
  const m = new THREE.Mesh(geo, mb); g.add(m);
  if (shoulder) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 1.002, 0.2, 36, 1, true), std({ color: shoulder, roughness: 0.35 })); sh.position.y = h - 0.18; g.add(sh); }
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.08, 16), std({ color: 0xb08d57, roughness: 0.3, metalness: 1 })); valve.position.y = h + 0.04; g.add(valve);
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 20), std({ color: 0x222222, roughness: 0.5 })); hw.rotation.x = Math.PI / 2; hw.position.y = h + 0.09; g.add(hw);
  return g;
}
const PAINT = {
  cinza: std({ color: 0x8a9196, roughness: 0.5, metalness: 0.4 }),
  amareloSeg: std({ color: 0xe8b400, roughness: 0.5, metalness: 0.2 }),
  vermelho: std({ color: 0x9e2a20, roughness: 0.5, metalness: 0.2 }),
  verde: std({ color: 0x3b6e46, roughness: 0.55, metalness: 0.2 }),
  aco: std({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.9 }),
  escuro: std({ color: 0x3a3f44, roughness: 0.6, metalness: 0.5 }),
};

// ============================================================================ 1. AR LIMPO — pátio industrial, dia claro
function limpo() {
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
function confinado() {
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
function vazamento() {
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
function coMotor() {
  const G = new THREE.Group();
  const gy = -0.9;
  G.add(ground(gy, concreteSet({ seed: 61, base: '#6f6c66', joints: 1, rep: [10, 10], stains: 2.2 }), 40));
  // bancada de aço com tampo de compensado naval (topo y=0)
  const topSet = rustSteelSet({ seed: 62, paint: '#4b5359', rust: 0.25, rep: [1.5, 0.6], seams: 0 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.045, 0.75, 3, 0.008), std({ roughness: 0.55, metalness: 0.6 }, topSet)); top.position.set(0.3, -0.0225, -0.12); G.add(top);
  for (const x of [-0.6, 1.2]) for (const z of [-0.45, 0.2]) G.add(box(0.05, 0.86, 0.05, PAINT.escuro, [x, gy + 0.43, z]));
  G.add(box(1.85, 0.03, 0.6, PAINT.escuro, [0.3, gy + 0.18, -0.12]));
  // paredes de bloco, portão de enrolar fechado
  const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.2), std({ roughness: 0.95 }, blockWallSet({ seed: 63, base: '#9e9a92', rep: [10, 4] }))); wall.position.set(1, gy + 3, -4.6); G.add(wall);
  const side = wall.clone(); side.rotation.y = Math.PI / 2; side.position.set(-4.2, gy + 3, 0); G.add(side);
  const roll = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 0.08), std({ roughness: 0.5, metalness: 0.6 }, corrugatedSet({ seed: 64, paint: '#6c757b', rep: [1, 10] }))); roll.rotation.z = Math.PI / 2; roll.position.set(4.3, gy + 1.8, -4.45); G.add(roll);
  G.add(box(3.8, 0.12, 0.1, PAINT.amareloSeg, [4.3, gy + 0.06, -4.4]));
  // gerador diesel carenado (ligado): carenagem com venezianas, painel, escapamento
  const gen = new THREE.Group();
  const genM = std({ color: 0x2f5d3a, roughness: 0.45, metalness: 0.4 });
  gen.add(box(1.6, 1.0, 0.85, genM, [0, 0.55, 0], 0.03));
  gen.add(box(1.7, 0.1, 0.95, PAINT.escuro, [0, 0.05, 0]));
  const louv = std({ color: 0x1d2a20, roughness: 0.6, metalness: 0.4 });
  for (let i = 0; i < 9; i++) gen.add(box(0.5, 0.025, 0.03, louv, [-0.45, 0.35 + i * 0.065, 0.43]));
  gen.add(box(0.36, 0.3, 0.04, std({ color: 0x15181b, roughness: 0.4 }), [0.45, 0.72, 0.44]));
  const ledG = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), std({ color: 0x111111, emissive: new THREE.Color(0.2, 1, 0.3), emissiveIntensity: 1.5 })); ledG.position.set(0.35, 0.8, 0.465); gen.add(ledG);
  const muff = pipe(0.07, 0.5, PAINT.escuro, [-0.55, 1.12, -0.1], 'x', 20); gen.add(muff);
  const tail = pipe(0.035, 0.3, std({ color: 0x2b2420, roughness: 0.7, metalness: 0.6 }), [-0.92, 1.12, -0.1], 'x', 16); gen.add(tail);
  gen.position.set(1.4, gy, -2.6); gen.rotation.y = -0.25; G.add(gen);
  const ex = new THREE.Vector3(-1.07, 1.12, -0.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.25).add(gen.position);
  // tambores de óleo, cone de sinalização
  G.add(drum(0x2a2a2a, [-1.6, gy, -3.6]), drum(0x9e2a20, [-0.95, gy, -3.85], 1));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 24), std({ color: 0xff5a10, roughness: 0.6 })); cone.position.set(0.1, gy + 0.25, -1.5); G.add(cone);
  // fumaça do escapamento (cinza azulada) + névoa de fumaça acumulada
  const smoke = makeParticles({ mode: 'jet', count: 650, origin: ex.toArray(), dir: [-1, 0.35, 0.15], speed: 0.45, spread: 0.6, life: 7, size: [0.05, 1.5], color: [0.42, 0.43, 0.45], lit: 1.0, opacity: 0.32, wind: [0.02, 0.07, 0.03], turb: 0.14, soft: 2.0 });
  const haze = makeParticles({ mode: 'box', count: 140, box: [[-4, -0.5, -4.4], [5, 1.4, -1.0]], size: [1.2, 2.6], color: [0.45, 0.45, 0.47], lit: 1, opacity: 0.07, life: 14, wind: [0.08, 0.02, 0], turb: 0.2, soft: 1.6, seed: 11 });
  G.add(haze, smoke);
  const sign = makeSign({ w: 1.0, h: 0.62, kind: 'perigo', title: 'PERIGO', lines: ['MONÓXIDO DE CARBONO (CO)', 'MOTOR A COMBUSTÃO LIGADO', 'MANTENHA A ÁREA VENTILADA'], icon: { type: 'tri', inner: 'CO' }, seed: 65, dirt: 0.3 });
  sign.position.set(-0.75, 0.15, -4.48); G.add(sign);
  shadowless(G);
  // luminárias de galpão (só no PMREM, acima do quadro)
  const fx = [];
  for (const x of [-2, 1, 4]) for (const z of [-3, 0.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.97, 1).multiplyScalar(6), side: THREE.DoubleSide })); p.rotation.x = Math.PI / 2; p.position.set(x, 3.2, z); fx.push(p); }
  return {
    group: G, particles: [smoke, haze],
    look: { keyDir: [0.15, 1.0, 0.25], keyColor: [0.95, 0.97, 1.0], keyI: 1.5, exposure: 1.3, envI: 0.9, fog: 0.09, fogColor: [0.22, 0.22, 0.23], contactOpacity: 0.82, bloom: 0.3, vignette: 0.3, shadowR: 18 },
    bake: { hemi: [[0.3, 0.3, 0.31], [0.12, 0.11, 0.1], 0.9], sun: 1.2, extras: fx },
  };
}

// ============================================================================ 5. DEFICIÊNCIA DE O2 — área de nitrogênio
function deficiencia() {
  const G = new THREE.Group();
  const sun = SUN_DIR(-0.4, 0.6, 0.55);
  G.add(makeSky({ zenith: [0.22, 0.38, 0.7], horizon: [0.8, 0.85, 0.92], ground: [0.33, 0.33, 0.32], sunDir: sun.toArray(), sunColor: [1.2, 1.15, 1.05], clouds: 0.45 }));
  G.add(mureta(3.0, 0.95, 0.46, 0.3, -0.08, 71));
  const gy = -0.95;
  G.add(ground(gy, concreteSet({ seed: 72, base: '#a19d96', joints: 2, rep: [40, 40] })));
  // tanque criogênico vertical branco + vaporizadores aletados com gelo
  const tank = new THREE.Group(); const white = std({ color: 0xeef0f0, roughness: 0.4, metalness: 0.2 });
  tank.add(pipe(1.1, 6.2, white, [0, 3.6, 0], 'y', 48)); const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.position.y = 6.7; tank.add(dome);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; tank.add(box(0.12, 0.6, 0.12, PAINT.cinza, [Math.cos(a) * 0.9, 0.3, Math.sin(a) * 0.9])); }
  tank.position.set(3.6, gy, -7); G.add(tank);
  const frost = std({ color: 0xf4f7fa, roughness: 0.85, metalness: 0.1 });
  const vap = new THREE.Group();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const x = i * 0.32, z = j * 0.32;
    vap.add(pipe(0.035, 2.6, frost, [x, 1.3, z], 'y', 10));
    for (let k = 0; k < 4; k++) { const f = box(0.26, 2.6, 0.012, frost, [x, 1.3, z]); f.rotation.y = k * Math.PI / 4; vap.add(f); }
  }
  vap.add(box(2.0, 0.08, 0.7, PAINT.aco, [0.8, 0.04, 0.16]));
  vap.position.set(0.6, gy, -4.2); G.add(vap);
  // bateria de cilindros de N2 (cinza) com corrente
  const rack = new THREE.Group();
  for (let i = 0; i < 7; i++) { const c = cylinderBottle({ body: 0x7d8387, shoulder: 0x2b2b2b }); c.position.x = i * 0.26; rack.add(c); }
  rack.add(pipe(0.006, 1.9, PAINT.aco, [0.78, 1.0, 0.12], 'x', 6));
  rack.add(box(2.0, 1.2, 0.04, PAINT.escuro, [0.78, 0.6, -0.16]));
  rack.position.set(-2.6, gy, -3.0); G.add(rack);
  // cerca de tela (alambrado) com textura em alfa
  const fc = document.createElement('canvas'); fc.width = fc.height = 128; const fg = fc.getContext('2d');
  fg.strokeStyle = '#c9cdd0'; fg.lineWidth = 5; fg.beginPath(); fg.moveTo(0, 64); fg.lineTo(64, 0); fg.lineTo(128, 64); fg.lineTo(64, 128); fg.closePath(); fg.stroke();
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(160, 16); ft.anisotropy = 8;
  const fence = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
  fence.position.set(2.5, gy + 1.1, -5.6); G.add(fence);
  for (let x = -4.5; x <= 9.5; x += 2.8) G.add(pipe(0.03, 2.3, PAINT.aco, [x, gy + 1.15, -5.6], 'y', 10));
  // névoa fria rasteira (N2 vaporizando) — desliza pelo chão
  const cold = makeParticles({ mode: 'box', count: 260, box: [[-3, gy + 0.02, -6.5], [5, gy + 0.45, -1.2]], size: [0.5, 1.4], color: [0.92, 0.95, 1.0], lit: 1.1, opacity: 0.16, life: 10, wind: [0.25, 0, 0.18], turb: 0.12, soft: 1.8 });
  const fall = makeParticles({ mode: 'jet', count: 220, origin: [1.4, gy + 0.3, -4.0], dir: [0.1, -0.15, 1], speed: 0.18, spread: 0.9, life: 6, size: [0.2, 1.2], color: [0.95, 0.97, 1.0], lit: 1.1, opacity: 0.14, wind: [0.02, -0.004, 0.03], turb: 0.08, seed: 13, soft: 1.8 });
  G.add(cold, fall);
  const sign = makeSign({ w: 0.95, h: 0.6, kind: 'atencao', title: 'ATENÇÃO', lines: ['ATMOSFERA POBRE', 'EM OXIGÊNIO', 'NITROGÊNIO — ASFIXIANTE'], icon: { type: 'tri', inner: 'O₂' }, seed: 73 });
  sign.position.set(-0.6, 0.1, -5.57); G.add(sign);
  shadowless(G);
  return {
    group: G, particles: [cold, fall],
    look: { keyDir: sun.toArray(), keyColor: [1.0, 0.97, 0.92], keyI: 2.6, exposure: 0.85, envI: 1.0, fog: 0.012, fogColor: [0.75, 0.8, 0.88], contactOpacity: 0.72, bloom: 0.18, vignette: 0.12, shadowR: 6 },
    bake: { hemi: [[0.65, 0.74, 0.92], [0.42, 0.41, 0.38], 1.4], sun: 2.6 },
  };
}

// ============================================================================ 6. ATMOSFERA EXPLOSIVA — parque de tanques, fim de tarde
function explosiva() {
  const G = new THREE.Group();
  const sun = SUN_DIR(-0.85, 0.2, -0.15);
  G.add(makeSky({ zenith: [0.2, 0.28, 0.5], horizon: [1.2, 0.72, 0.42], ground: [0.3, 0.25, 0.2], sunDir: sun.toArray(), sunColor: [1.6, 0.9, 0.45], sunGlow: 0.6, clouds: 0.35, cloudColor: [1.1, 0.75, 0.55] }));
  G.add(mureta(3.0, 0.95, 0.46, 0.3, -0.08, 81));
  const gy = -0.95;
  G.add(ground(gy, concreteSet({ seed: 82, base: '#8b8378', joints: 1, rep: [40, 40], stains: 2 })));
  // dique de contenção (bacia) em concreto
  const dique = new THREE.Mesh(new RoundedBoxGeometry(30, 1.05, 0.3, 3, 0.02), std({ roughness: 0.95 }, concreteSet({ seed: 83, base: '#9a948a', rep: [12, 0.5] })));
  dique.position.set(2, gy + 0.525, -4.6); G.add(dique);
  // tanques de teto fixo com escada helicoidal simplificada e anel de resfriamento
  const tw = std({ color: 0xe5e2dc, roughness: 0.45, metalness: 0.3 });
  for (const [x, z, r, h] of [[7, -16, 6, 9], [-9, -20, 5, 8], [20, -26, 7, 10]]) {
    const t = new THREE.Group(); t.add(pipe(r, h, tw, [0, h / 2, 0], 'y', 64));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.01, r * 0.18, 64), tw); roof.position.y = h + r * 0.09; t.add(roof);
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.06, 8, 96), PAINT.vermelho); ringC.rotation.x = Math.PI / 2; ringC.position.y = h - 0.4; t.add(ringC);
    for (let k = 0; k < 14; k++) { const a = k * 0.18; const st = box(0.9, 0.05, 0.3, PAINT.escuro, [Math.cos(a) * (r + 0.25), k * h / 14, Math.sin(a) * (r + 0.25)]); st.rotation.y = -a; t.add(st); }
    t.position.set(x, gy, z); G.add(t);
  }
  // tubulação sobre o dique
  for (const [y, r, m] of [[0.25, 0.12, PAINT.cinza], [0.45, 0.08, PAINT.amareloSeg]]) G.add(pipe(r, 30, m, [2, gy + 1.05 + y, -4.9]));
  // vapor de hidrocarboneto (distorção/tremulação sutil)
  const haze = makeParticles({ mode: 'box', count: 220, box: [[-4, gy + 1.0, -9], [8, gy + 2.2, -4.8]], size: [0.8, 2.0], color: [1.0, 0.85, 0.6], lit: 1.2, opacity: 0.06, life: 8, wind: [0.15, 0.08, 0], turb: 0.3, soft: 1.6 });
  G.add(haze);
  const sign = makeSign({ w: 1.0, h: 0.6, kind: 'perigo', title: 'PERIGO', lines: ['ÁREA CLASSIFICADA — ZONA 1', 'PROIBIDO FONTES', 'DE IGNIÇÃO'], icon: { type: 'proib', inner: 'chama' }, seed: 84 });
  sign.position.set(-0.4, 0.12, -4.44); G.add(sign);
  const sign2 = makeSign({ w: 0.7, h: 0.45, kind: 'atencao', title: 'ATENÇÃO', lines: ['LÍQUIDO INFLAMÁVEL', 'NÃO USE CELULAR'], icon: { type: 'tri', inner: 'chama' }, seed: 85 });
  sign2.position.set(1.9, 0.05, -4.44); G.add(sign2);
  shadowless(G);
  return {
    group: G, particles: [haze],
    look: { keyDir: sun.toArray(), keyColor: [1.0, 0.68, 0.38], keyI: 2.8, exposure: 0.95, envI: 1.0, fog: 0.012, fogColor: [0.85, 0.6, 0.42], contactOpacity: 0.75, bloom: 0.25, vignette: 0.2, shadowR: 7 },
    bake: { hemi: [[0.6, 0.5, 0.48], [0.32, 0.26, 0.2], 1.2], sun: 2.6 },
  };
}

// ============================================================================ 7. ENRIQUECIMENTO DE O2 — central de oxigênio
function enriquecimento() {
  const G = new THREE.Group();
  const sun = SUN_DIR(-0.5, 0.65, 0.6);
  G.add(makeSky({ zenith: [0.2, 0.38, 0.75], horizon: [0.8, 0.86, 0.95], ground: [0.33, 0.32, 0.3], sunDir: sun.toArray(), sunColor: [1.3, 1.2, 1.0], clouds: 0.3 }));
  const gy = -0.9;
  G.add(ground(gy, concreteSet({ seed: 91, base: '#a6a29b', joints: 2, rep: [30, 30] })));
  // mesa de aço inox (topo y=0)
  const inox = std({ color: 0xc9cdd0, roughness: 0.28, metalness: 1 });
  G.add(box(1.6, 0.03, 0.7, inox, [0.3, -0.015, -0.12], 0.006));
  for (const x of [-0.42, 1.02]) for (const z of [-0.42, 0.18]) G.add(pipe(0.02, 0.87, inox, [x, gy + 0.435, z], 'y', 12));
  // abrigo: parede de blocos, cobertura, grade
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.2), std({ roughness: 0.95 }, blockWallSet({ seed: 92, base: '#d5d1c8', rep: [5, 2] }))); wall.position.set(1, gy + 1.6, -2.6); G.add(wall);
  G.add(box(8.4, 0.12, 3.2, std({ color: 0x8c949a, roughness: 0.5, metalness: 0.6 }), [1, gy + 3.25, -1.2]));
  // cilindros de O2 (verde, padrão medicinal BR) em rack com corrente + manifold de cobre
  const rack = new THREE.Group(); const copper = std({ color: 0xb8734a, roughness: 0.3, metalness: 1 });
  for (let i = 0; i < 8; i++) {
    const c = cylinderBottle({ body: 0x1f7a3a, shoulder: 0xf2f2f2 }); c.position.x = i * 0.27; rack.add(c);
    const pig = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 8, 20, Math.PI), copper); pig.position.set(i * 0.27, 1.6, 0.05); pig.rotation.y = Math.PI / 2; rack.add(pig);
  }
  rack.add(pipe(0.016, 2.3, copper, [0.95, 1.69, 0.12], 'x', 14));
  for (const y of [0.55, 1.05]) rack.add(pipe(0.005, 2.3, PAINT.aco, [0.95, y, 0.13], 'x', 6));
  rack.add(box(0.3, 0.3, 0.12, std({ color: 0xd8d8d0, roughness: 0.4, metalness: 0.5 }), [2.35, 1.55, 0.1], 0.01));
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), std({ color: 0xffffff, roughness: 0.2 })); gauge.rotation.x = Math.PI / 2; gauge.position.set(2.35, 1.62, 0.17); rack.add(gauge);
  rack.position.set(-0.9, gy, -2.35); G.add(rack);
  const sign = makeSign({ w: 1.0, h: 0.62, kind: 'perigo', title: 'OXIGÊNIO', lines: ['NÃO FUME — SEM CHAMAS', 'SEM ÓLEO OU GRAXA', 'NAS CONEXÕES'], icon: { type: 'proib', inner: 'cigarro' }, seed: 93 });
  sign.position.set(2.75, 0.12, -2.48); G.add(sign);
  const sign2 = makeSign({ w: 0.6, h: 0.38, kind: 'seguranca', title: 'CENTRAL DE O₂', lines: ['ACESSO RESTRITO'], seed: 94 });
  sign2.position.set(-1.6, 0.22, -2.48); G.add(sign2);
  shadowless(G);
  return {
    group: G,
    look: { keyDir: sun.toArray(), keyColor: [1.0, 0.96, 0.9], keyI: 2.4, exposure: 0.9, envI: 1.0, fog: 0.008, fogColor: [0.7, 0.76, 0.86], contactOpacity: 0.72, bloom: 0.18, vignette: 0.12, shadowR: 8 },
    bake: { hemi: [[0.65, 0.72, 0.9], [0.4, 0.38, 0.34], 1.3], sun: 2.2 },
  };
}

export const SCENERY_BUILDERS = {
  limpo, confinado, 'vazamento-h2s': vazamento, 'co-motor': coMotor, 'deficiencia-o2': deficiencia, explosiva, 'enriquecimento-o2': enriquecimento,
};
export function buildScenery(id) {
  const b = SCENERY_BUILDERS[id]; if (!b) return null;
  const s = b(); s.id = id; s.particles = s.particles || [];
  let t = 0; const skyU = []; s.group.traverse((o) => { if (o.userData.sky) skyU.push(o.userData.sky); });
  s.update = (dt) => { t += dt; for (const p of s.particles) p.userData.particles.time.value = t; for (const u of skyU) u.time.value = t; };
  void rng;
  return s;
}
