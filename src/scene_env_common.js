// Ajudantes compartilhados dos ambientes (dono: RENDER). Não editar sem combinar com os 3 agentes de ambiente.
import * as THREE from 'three';
import {
  concreteSet, rustSteelSet, treadPlateSet, corrugatedSet, blockWallSet, std, makeSky, makeSign, makeParticles,
  pipe, flange, box, railing, RoundedBoxGeometry, rng,
} from './scene_env_kit.js';
export { std, rng };

export const SUN_DIR = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
export const shadowless = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); return g; };

export function ground(y, set, size = 160) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), std({ roughness: 1 }, set));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}
/** mureta/bancada de concreto com o topo em y=0 */
export function mureta(w = 3.0, h = 0.95, d = 0.46, x = 0.3, z = -0.08, seed = 11) {
  const s = concreteSet({ seed, base: '#a29e96', rep: [1.2, 0.5], stains: 1.4 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.025), std({ roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }, s));
  m.position.set(x, -h / 2, z); return m;
}
export function signPost(sign, pos, postH, mat) {
  const g = new THREE.Group();
  g.add(sign); sign.position.y = postH;
  const p = pipe(0.025, postH + 0.2, mat, [0, (postH + 0.2) / 2 - 0.1, -0.02], 'y', 12); g.add(p);
  g.position.set(...pos); return g;
}
export function drum(color, pos, rot = 0) {
  const g = new THREE.Group();
  const mat = std({ color, roughness: 0.45, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 32), mat); body.position.y = 0.44; g.add(body);
  for (const y of [0.29, 0.59]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.012, 8, 40), mat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.015, 8, 40), std({ color: 0x777777, roughness: 0.4, metalness: 0.7 })); lid.rotation.x = Math.PI / 2; lid.position.y = 0.88; g.add(lid);
  g.position.set(...pos); g.rotation.y = rot; return g;
}
export function cylinderBottle({ body, shoulder, h = 1.45, r = 0.115 }) {
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
export const PAINT = {
  cinza: std({ color: 0x8a9196, roughness: 0.5, metalness: 0.4 }),
  amareloSeg: std({ color: 0xe8b400, roughness: 0.5, metalness: 0.2 }),
  vermelho: std({ color: 0x9e2a20, roughness: 0.5, metalness: 0.2 }),
  verde: std({ color: 0x3b6e46, roughness: 0.55, metalness: 0.2 }),
  aco: std({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.9 }),
  escuro: std({ color: 0x3a3f44, roughness: 0.6, metalness: 0.5 }),
};

// ============================================================================ 1. AR LIMPO — pátio industrial, dia claro
