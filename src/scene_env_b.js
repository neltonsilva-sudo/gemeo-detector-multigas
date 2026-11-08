// Ambientes por cenário — dono: AGENTE AMBIENTE B (co-motor, deficiencia-o2). Use peças de scene_env_kit.js / scene_env_common.js.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';
import { SUN_DIR, shadowless, ground, mureta, signPost, drum, cylinderBottle, PAINT } from './scene_env_common.js';

export function coMotor() {
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

export function deficiencia() {
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
