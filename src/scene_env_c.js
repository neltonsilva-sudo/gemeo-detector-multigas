// Ambientes por cenário — dono: AGENTE AMBIENTE C (explosiva, enriquecimento-o2). Use peças de scene_env_kit.js / scene_env_common.js.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';
import { SUN_DIR, shadowless, ground, mureta, signPost, drum, cylinderBottle, PAINT } from './scene_env_common.js';

export function explosiva() {
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

export function enriquecimento() {
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
