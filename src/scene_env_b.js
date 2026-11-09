// Ambientes por cenário — dono: AGENTE AMBIENTE B (co-motor, deficiencia-o2). Use peças de scene_env_kit.js / scene_env_common.js.
// O aparelho fica num tripé (sapata em y=0, piso em y=-TRIPOD_H). Câmera hero ~1,3 m acima do piso, olhando para +x/-z:
// o quadro cobre o piso de ~1,5 a 5 m e ~0–1,6 m de altura. Nada abaixo de y=0 num raio de 0,6 m do eixo do aparelho.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box,
} from './scene_env_kit.js';
import { SUN_DIR, shadowless, ground, signPost, drum, cylinderBottle, PAINT } from './scene_env_common.js';
import { TRIPOD_H } from './tripod.js';
import { genset, forklift, oilStain, sootDecal, wornPaintSet, label, frostMat, icyPipe, iceLump, dewar } from './scene_env_b_parts.js';

// ============================================================================ 4. CO — galpão fechado, gerador diesel ligado

export function coMotor() {
  const G = new THREE.Group();
  const gy = -TRIPOD_H;
  G.add(ground(gy, concreteSet({ seed: 61, base: '#6a6761', joints: 1, rep: [12, 12], stains: 2.6 }), 40));
  // demarcação de piso (faixa amarela gasta) e manchas de óleo
  const lane = std({ color: 0xc99a10, roughness: 0.8 }, wornPaintSet({ seed: 66, paint: '#c99a10', chips: 2.5, grime: 0.6, rep: [6, 0.2] }));
  const l1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.1), lane); l1.rotation.x = -Math.PI / 2; l1.position.set(2, gy + 0.002, -3.05); G.add(l1);
  const l2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 3), lane); l2.rotation.x = -Math.PI / 2; l2.position.set(1.15, gy + 0.002, -4.5); G.add(l2);
  [[0.4, -2.0, 1.4, 0.9, 1], [-0.6, -3.0, 1.8, 1.1, 2], [2.3, -2.45, 0.9, 0.6, 3], [3.3, -3.6, 1.6, 1.0, 4], [1.6, -4.1, 1.0, 0.8, 5], [4.4, -2.7, 0.7, 0.5, 6]]
    .forEach(([x, z, w, d, s]) => { const m = oilStain(600 + s, w, d); m.position.set(x, gy + 0.003 + s * 0.0004, z); G.add(m); });
  // galpão: parede de blocos com barra pintada (cinza-esverdeado até 1,2 m), pilares, portão de enrolar baixado
  const wallZ = -4.75;
  const low = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 0.2), std({ roughness: 0.85 }, blockWallSet({ seed: 63, base: '#4f5d58', rep: [11, 1] }))); low.position.set(1, gy + 0.6, wallZ); G.add(low);
  const up = new THREE.Mesh(new THREE.BoxGeometry(18, 5.8, 0.2), std({ roughness: 0.95 }, blockWallSet({ seed: 64, base: '#a39f97', rep: [11, 3.6] }))); up.position.set(1, gy + 1.2 + 2.9, wallZ - 0.01); G.add(up);
  G.add(box(18, 0.06, 0.03, PAINT.amareloSeg, [1, gy + 1.2, wallZ + 0.11]));
  const side = up.clone(); side.rotation.y = Math.PI / 2; side.position.set(-4.4, gy + 3.5, 0); G.add(side);
  const side2 = up.clone(); side2.rotation.y = Math.PI / 2; side2.position.set(9.6, gy + 3.5, 0); G.add(side2);
  const front = up.clone(); front.position.set(1, gy + 3.5, 6.0); G.add(front);
  for (const w of [side, side2, front]) w.scale.y = 7 / 5.8;
  const colM = std({ roughness: 0.55, metalness: 0.5 }, rustSteelSet({ seed: 67, paint: '#3e4a52', rust: 0.5, rep: [0.5, 3], seams: 0 }));
  for (const x of [-2.6, 2.9, 8.2]) { G.add(box(0.3, 7, 0.3, colM, [x, gy + 3.5, wallZ + 0.25])); G.add(box(0.3, 0.6, 0.02, PAINT.amareloSeg, [x, gy + 0.3, wallZ + 0.41])); }
  const roll = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 0.08), std({ roughness: 0.5, metalness: 0.6 }, corrugatedSet({ seed: 65, paint: '#6c757b', rep: [1, 14] })));
  roll.rotation.z = Math.PI / 2; roll.position.set(5.6, gy + 2.1, wallZ + 0.14); G.add(roll);
  G.add(box(4.0, 0.08, 0.12, PAINT.escuro, [5.6, gy + 0.04, wallZ + 0.18]));
  for (let i = 0; i < 8; i++) G.add(box(0.5, 0.12, 0.012, i % 2 ? PAINT.amareloSeg : std({ color: 0x111111, roughness: 0.6 }), [3.85 + i * 0.5, gy + 0.2, wallZ + 0.19]));
  // gerador diesel carenado (ligado) — atrás à esquerda, frente para a câmera
  const gen = genset({ L: 2.0, H: 1.05, D: 0.95 });
  gen.position.set(-0.5, gy, -2.7); gen.rotation.y = 0.12; G.add(gen);
  // silencioso sob a carenagem + escapamento baixo saindo pela frente, com curva para o corredor
  const exhM = std({ roughness: 0.8, metalness: 0.5 }, rustSteelSet({ seed: 68, paint: '#262320', rust: 0.7, rep: [1, 1], seams: 0 }));
  gen.add(pipe(0.065, 0.4, exhM, [0.45, 0.3, 0.53], 'x', 20));
  const tp = pipe(0.028, 0.22, exhM, [0.68, 0.3, 0.62], 'z', 14); gen.add(tp);
  const tip = pipe(0.03, 0.08, exhM, [0.69, 0.29, 0.75], 'z', 14); tip.rotation.y = 0.35; gen.add(tip);
  const soot = sootDecal(0.55, 0.5, 69, 1); soot.position.set(0.65, 0.42, 0.478); gen.add(soot);
  gen.updateMatrixWorld(true);
  const ex = new THREE.Vector3(0.71, 0.29, 0.8).applyMatrix4(gen.matrix);
  // tambores, lata de óleo e empilhadeira a GLP estacionada (direita, 2º plano)
  G.add(drum(0x23262a, [0.9, gy, -4.2]), drum(0x9e2a20, [1.5, gy, -4.35], 1), drum(0x1d4f8a, [-1.3, gy, -4.2], 2));
  const fl = forklift(); fl.position.set(3.75, gy, -3.75); fl.rotation.y = -0.18; G.add(fl);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 24), std({ color: 0xff5a10, roughness: 0.6 })); cone.position.set(2.0, gy + 0.25, -2.2); G.add(cone);
  G.add(box(0.34, 0.03, 0.34, std({ color: 0x222222, roughness: 0.8 }), [2.0, gy + 0.015, -2.2]));
  // placa NR-26 em pedestal, à direita do aparelho
  const sign = makeSign({ w: 0.9, h: 0.56, kind: 'perigo', title: 'PERIGO', lines: ['MONÓXIDO DE CARBONO', 'GÁS TÓXICO E INODORO', 'MANTENHA VENTILADO'], icon: { type: 'tri', inner: 'CO' }, seed: 65, dirt: 0.3 });
  const post = signPost(sign, [2.6, gy, -2.95], 1.12, PAINT.aco); post.rotation.y = -0.35; G.add(post);
  G.add(box(0.4, 0.04, 0.4, PAINT.escuro, [2.6, gy + 0.02, -2.97]));
  // fumaça do escapamento (cinza azulada) + névoa acumulada no ambiente e sob o teto
  const smoke = makeParticles({ mode: 'jet', count: 420, origin: ex.toArray(), dir: [0.2, 0.5, 0.45], speed: 0.2, spread: 0.8, life: 10, size: [0.05, 1.0], color: [0.4, 0.43, 0.48], lit: 1.0, opacity: 0.16, wind: [0.012, 0.018, -0.006], turb: 0.18, soft: 2.2, seed: 21 });
  const puff = makeParticles({ mode: 'jet', count: 140, origin: ex.toArray(), dir: [0.3, -0.25, 0.9], speed: 0.5, spread: 0.25, life: 2.4, size: [0.03, 0.3], color: [0.3, 0.32, 0.36], lit: 1.0, opacity: 0.3, wind: [0, 0.12, 0], turb: 0.05, soft: 2.0, seed: 22 });
  const haze = makeParticles({ mode: 'box', count: 110, box: [[-1.5, gy + 0.3, -4.5], [6, gy + 1.9, -2.0]], size: [1.4, 2.6], color: [0.42, 0.45, 0.5], lit: 1, opacity: 0.06, life: 16, wind: [0.06, 0.01, 0], turb: 0.25, soft: 1.5, seed: 11 });
  const ceil = makeParticles({ mode: 'box', count: 120, box: [[-4, gy + 2.6, -4.6], [7, gy + 4.4, 2]], size: [2, 3.5], color: [0.55, 0.57, 0.6], lit: 1, opacity: 0.12, life: 18, wind: [0.08, 0, 0.03], turb: 0.3, soft: 1.4, seed: 12 });
  G.add(haze, ceil, smoke, puff);
  // telhado e luminárias de galpão (fora do quadro hero; aparecem nas demais câmeras)
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), std({ roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }, corrugatedSet({ seed: 70, paint: '#7d858a', rep: [14, 1] })));
  roof.rotation.x = Math.PI / 2; roof.position.set(1, gy + 5.8, 1.2); G.add(roof);
  const lampM = std({ color: 0x222222, emissive: new THREE.Color(1, 0.98, 0.92), emissiveIntensity: 3 });
  for (const x of [-1.5, 1.5, 4.5]) for (const z of [-3, 0.5]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.06, 20), lampM); l.position.set(x, gy + 4.6, z); G.add(l); }
  shadowless(G);
  const fx = [];
  for (const x of [-2, 1, 4]) for (const z of [-3, 0.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(6), side: THREE.DoubleSide })); p.rotation.x = Math.PI / 2; p.position.set(x, gy + 4.4, z); fx.push(p); }
  return {
    group: G, particles: [haze, ceil, smoke, puff],
    look: { keyDir: [0.25, 1.0, 0.35], keyColor: [1.0, 0.96, 0.9], keyI: 1.6, exposure: 1.25, envI: 0.95, fog: 0.04, fogColor: [0.26, 0.28, 0.31], contactOpacity: 0, bloom: 0.28, vignette: 0.3, shadowR: 18 },
    bake: { hemi: [[0.34, 0.34, 0.35], [0.13, 0.12, 0.11], 0.9], sun: 1.3, extras: fx },
  };
}

// ============================================================================ 5. DEFICIÊNCIA DE O2 — área de nitrogênio líquido

export function deficiencia() {
  const G = new THREE.Group();
  const gy = -TRIPOD_H;
  // sala interna de armazenamento de N2: paredes de bloco pintadas, laje com luminárias, exaustor e porta fechada
  const roomZ = -8.6, roomH = 4.2;
  const wallSet = blockWallSet({ seed: 82, base: '#b9b6ae', rep: [9, 3] });
  const wallM = std({ roughness: 0.92 }, wallSet);
  const back = new THREE.Mesh(new THREE.BoxGeometry(15, roomH, 0.2), wallM); back.position.set(2.5, gy + roomH / 2, roomZ); G.add(back);
  for (const x of [-5, 10]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, roomH, 15), wallM); w.position.set(x, gy + roomH / 2, -1.1); G.add(w); }
  const fw = new THREE.Mesh(new THREE.BoxGeometry(15, roomH, 0.2), wallM); fw.position.set(2.5, gy + roomH / 2, 6.4); G.add(fw);
  const barM = std({ roughness: 0.8 }, blockWallSet({ seed: 83, base: '#5d6b74', rep: [9, 0.9] }));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(15, 1.2, 0.04), barM); bar.position.set(2.5, gy + 0.6, roomZ + 0.12); G.add(bar);
  for (const x of [-4.88, 9.88]) { const bb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 15), barM); bb.position.set(x, gy + 0.6, -1.1); G.add(bb); }
  G.add(box(15, 0.05, 0.03, PAINT.amareloSeg, [2.5, gy + 1.2, roomZ + 0.15]));
  const slab = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.2, 15.2), std({ roughness: 0.95 }, concreteSet({ seed: 84, base: '#9d9a94', rep: [4, 4], stains: 1.5 }))); slab.position.set(2.5, gy + roomH + 0.1, -1.1); G.add(slab);
  const lampM = std({ color: 0x222222, emissive: new THREE.Color(0.95, 0.98, 1), emissiveIntensity: 3 });
  for (const x of [-1.5, 2.5, 6.5]) for (const z of [-5.5, -1.5, 2.5]) { G.add(box(1.25, 0.06, 0.22, lampM, [x, gy + roomH - 0.05, z])); }
  // porta corta-fogo fechada e exaustor na parede do fundo (renovação de ar da sala)
  G.add(box(1.0, 2.1, 0.06, std({ roughness: 0.5, metalness: 0.4 }, wornPaintSet({ seed: 85, paint: '#7b8288', chips: 0.6, grime: 0.8 })), [-2.6, gy + 1.05, roomZ + 0.13]));
  G.add(box(0.03, 0.12, 0.05, PAINT.aco, [-2.2, gy + 1.0, roomZ + 0.18]));
  G.add(box(0.75, 0.75, 0.12, PAINT.escuro, [6.8, gy + 3.2, roomZ + 0.16]));
  for (let i = 0; i < 6; i++) { const lv = box(0.66, 0.02, 0.08, PAINT.cinza, [6.8, gy + 2.92 + i * 0.11, roomZ + 0.23]); lv.rotation.x = 0.6; G.add(lv); }
  G.add(ground(gy, concreteSet({ seed: 72, base: '#8f8b84', joints: 2, rep: [40, 40], stains: 1.6 })));
  // base de concreto (radier) da área criogênica com borda amarela
  const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 6), std({ roughness: 0.9 }, concreteSet({ seed: 74, base: '#a6a29a', joints: 2, rep: [3, 2], stains: 1.2 }))); pad.position.set(2.5, gy + 0.06, -5.6); G.add(pad);
  G.add(box(9, 0.02, 0.08, PAINT.amareloSeg, [2.5, gy + 0.125, -2.64]));
  const frost = frostMat();
  // ---- 1º plano (esquerda): dewar de N2 líquido com mangueira e manifold congelado
  const dw = dewar({ seed: 75 }); dw.position.set(-0.1, gy, -2.8); dw.rotation.y = 0.5; G.add(dw);
  const dw2 = dewar({ seed: 76 }); dw2.position.set(-1.2, gy + 0.12, -2.9); dw2.rotation.y = -0.3; G.add(dw2);
  const my = gy + 0.78, mz = -2.25;
  G.add(icyPipe(0.022, 1.6, [0.55, my, mz], 'x', 0.03, 3));
  G.add(icyPipe(0.022, 0.78, [1.35, gy + 0.39, mz], 'y', 0.035, 4));
  G.add(icyPipe(0.02, 0.6, [-0.25, my + 0.32, mz], 'y', 0.02, 5)); G.add(icyPipe(0.018, 0.5, [-0.17, my + 0.62, mz - 0.27], 'z', 0.015, 12));
  for (const [x, r, s] of [[0.05, 0.09, 6], [0.62, 0.11, 7], [1.35, 0.1, 8]]) G.add(iceLump(r, [x, my, mz], s, 0.9));
  // volante da válvula (sai do gelo) e válvula de alívio vazando
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 8, 24), std({ color: 0x1d4f8a, roughness: 0.5, metalness: 0.4 })); hw.position.set(0.62, my + 0.2, mz); hw.rotation.x = Math.PI / 2; G.add(hw);
  G.add(pipe(0.008, 0.12, PAINT.aco, [0.62, my + 0.13, mz], 'y', 8));
  const relief = icyPipe(0.016, 0.16, [0.95, my + 0.1, mz], 'y', 0.02, 9); G.add(relief);
  G.add(iceLump(0.05, [0.95, my + 0.2, mz], 10, 1.2));
  // pingos de gelo pendurados (estalactites)
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.008 + (i % 3) * 0.004, 0.05 + (i % 4) * 0.025, 6), frost); c.rotation.x = Math.PI; c.position.set(0.1 + i * 0.13, my - 0.06 - (i % 4) * 0.012, mz); G.add(c); }
  // suportes do manifold
  for (const x of [0.0, 1.0]) G.add(box(0.05, 0.75, 0.05, PAINT.cinza, [x, gy + 0.375, mz - 0.06]));
  G.add(iceLump(0.09, [1.35, gy + 0.02, mz], 11, 0.4));  // gelo no pé da descida
  // ---- 2º plano (direita): bateria de cilindros de N2 gasoso em baia com corrente + placa
  const rack = new THREE.Group();
  for (let i = 0; i < 6; i++) { const c = cylinderBottle({ body: 0x7f8589, shoulder: 0x1d1d1d }); c.position.set(i * 0.26, 0, (i % 2) * 0.03); c.rotation.y = i * 1.3; rack.add(c); }
  for (const y of [0.85, 1.15]) rack.add(pipe(0.006, 1.7, PAINT.aco, [0.65, y, 0.13], 'x', 6));
  rack.add(box(1.8, 1.4, 0.04, std({ roughness: 0.6, metalness: 0.5 }, rustSteelSet({ seed: 77, paint: '#59636a', rust: 0.6, rep: [1, 1], seams: 0 })), [0.65, 0.7, -0.17]));
  for (const x of [-0.25, 1.55]) rack.add(box(0.05, 1.5, 0.35, PAINT.escuro, [x, 0.75, 0]));
  const tag = label(0.34, 0.12, { bg: '#ffffff', text: ['N₂ — NITROGÊNIO', 'GÁS INERTE · ASFIXIANTE'], seed: 78 }); tag.position.set(0.65, 1.32, -0.145); rack.add(tag);
  rack.position.set(3.05, gy + 0.12, -3.45); rack.rotation.y = -0.25; G.add(rack);
  const sign = makeSign({ w: 0.9, h: 0.58, kind: 'atencao', title: 'ATENÇÃO', lines: ['ATMOSFERA POBRE', 'EM OXIGÊNIO', 'RISCO DE ASFIXIA'], icon: { type: 'tri', inner: 'O₂' }, seed: 73, dirt: 0.25 });
  const sp = signPost(sign, [2.35, gy + 0.12, -2.95], 1.05, PAINT.aco); sp.rotation.y = -0.3; G.add(sp);
  // ---- 3º plano: vaporizadores atmosféricos aletados com gelo pesado na base, tanque criogênico, alambrado
  const alu = std({ color: 0xc4c9cc, roughness: 0.35, metalness: 0.85 });
  const vap = new THREE.Group();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const x = i * 0.36, z = j * 0.36;
    vap.add(pipe(0.035, 3.2, alu, [x, 1.75, z], 'y', 10));
    for (let k = 0; k < 4; k++) { const f = box(0.28, 3.2, 0.01, alu, [x, 1.75, z]); f.rotation.y = k * Math.PI / 4; vap.add(f); }
    for (let k = 0; k < 4; k++) { const f = box(0.31, 1.1 - ((i + j + k) % 3) * 0.15, 0.03, frost, [x, 0.7 - ((i + j + k) % 3) * 0.075, z]); f.rotation.y = k * Math.PI / 4; vap.add(f); }
    vap.add(icyPipe(0.035, 1.1, [x, 0.7, z], 'y', 0.04, 20 + i * 2 + j));
  }
  vap.add(box(1.9, 0.12, 0.8, PAINT.aco, [0.72, 0.1, 0.18]));
  vap.add(icyPipe(0.03, 1.9, [0.72, 0.25, 0.75], 'x', 0.04, 40));
  vap.position.set(0.4, gy + 0.12, -5.0); G.add(vap);
  const tank = new THREE.Group(); const white = std({ color: 0xeef0f0, roughness: 0.45, metalness: 0.15 }, wornPaintSet({ seed: 79, paint: '#e9ecec', chips: 0.3, grime: 0.5, rep: [3, 2] }));
  tank.add(pipe(0.75, 1.9, white, [0, 1.85, 0], 'y', 48)); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.position.y = 2.8; tank.add(dome);
  const dome2 = dome.clone(); dome2.rotation.x = Math.PI; dome2.position.y = 0.9; tank.add(dome2);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; tank.add(box(0.1, 0.6, 0.1, PAINT.cinza, [Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6])); }
  tank.add(icyPipe(0.03, 1.2, [-0.85, 0.7, 0.3], 'y', 0.035, 41));
  const tl = label(0.9, 0.3, { bg: '#ffffff', text: ['NITROGÊNIO LÍQUIDO', 'N₂ · UN 1977'], seed: 80 }); tl.position.set(0, 2.0, 0.755); tank.add(tl);
  tank.position.set(4.8, gy + 0.12, -7.3); G.add(tank);
  // ---- névoa fria: pluma da válvula de alívio caindo, vapor nos vaporizadores e manto rasteiro escorrendo pelo piso
  const vent = makeParticles({ mode: 'jet', count: 260, origin: [0.95, my + 0.22, mz], dir: [0.15, -1, 0.1], speed: 0.22, spread: 0.45, life: 6, size: [0.04, 0.9], color: [0.95, 0.97, 1.0], lit: 1.05, opacity: 0.3, wind: [0.07, 0.055, 0.025], turb: 0.07, soft: 1.8, seed: 31 });
  const vapFog = makeParticles({ mode: 'jet', count: 160, origin: [1.1, gy + 0.9, -4.9], dir: [0.1, -1, 0.5], speed: 0.12, spread: 1.2, life: 8, size: [0.3, 1.5], color: [0.95, 0.97, 1.0], lit: 1.05, opacity: 0.18, wind: [0.04, 0.03, 0.05], turb: 0.1, soft: 1.6, seed: 32 });
  const blanket = makeParticles({ mode: 'box', count: 170, box: [[-1.0, gy + 0.02, -5.4], [3.2, gy + 0.25, -1.8]], size: [0.5, 1.1], color: [0.93, 0.96, 1.0], lit: 1.05, opacity: 0.15, life: 9, wind: [0.16, -0.005, 0.1], turb: 0.1, soft: 1.8, seed: 33 });
  G.add(blanket, vapFog, vent);
  shadowless(G);
  const fx = [];
  for (const x of [-1.5, 2.5, 6.5]) for (const z of [-5.5, -1.5, 2.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.98, 1).multiplyScalar(7), side: THREE.DoubleSide })); p.rotation.x = Math.PI / 2; p.position.set(x, gy + roomH - 0.1, z); fx.push(p); }
  return {
    group: G, particles: [blanket, vapFog, vent],
    look: { keyDir: [0.2, 1.0, 0.3], keyColor: [0.95, 0.98, 1.0], keyI: 1.5, exposure: 1.1, envI: 1.0, fog: 0.025, fogColor: [0.62, 0.66, 0.7], contactOpacity: 0, bloom: 0.2, vignette: 0.2, shadowR: 16 },
    bake: { hemi: [[0.6, 0.63, 0.66], [0.3, 0.29, 0.28], 1.1], sun: 1.0, extras: fx },
  };
}

// ============================================================================ 6. ATMOSFERA EXPLOSIVA — parque de tanques, fim de tarde
