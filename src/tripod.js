// Tripé de monitoramento de área para o aparelho (dono: orquestrador).
// O topo da sapata fica em y=0 (base do aparelho); os pés tocam o piso em y=-TRIPOD_H.
import * as THREE from 'three';

export const TRIPOD_H = 1.15;

export function buildTripod() {
  const g = new THREE.Group(); g.name = 'tripod';
  const alu = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.75, roughness: 0.38 });
  const aluLight = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.28 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85, metalness: 0 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.1 });
  const H = TRIPOD_H;
  const crownY = -0.16;           // aranha onde as pernas se prendem
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };

  // sapata de engate rápido + berço com mordentes que seguram a base do aparelho
  add(new THREE.BoxGeometry(0.074, 0.006, 0.056), plastic, 0, -0.003, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.005, 0.016, 0.044), plastic, s * 0.0385, 0.004, 0);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 16), aluLight, s * 0.046, 0.0, 0).rotation.z = Math.PI / 2;
  }
  // cabeça: placa, rótula e alavanca
  add(new THREE.CylinderGeometry(0.022, 0.026, 0.02, 32), alu, 0, -0.016, 0);
  add(new THREE.SphereGeometry(0.02, 24, 16), aluLight, 0, -0.04, 0);
  const lever = add(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 12), plastic, 0.05, -0.04, 0.0);
  lever.rotation.z = Math.PI / 2.4;
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 32), alu, 0, -0.07, 0);
  // coluna central
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 20), aluLight, 0, -0.2, 0);
  // aranha
  add(new THREE.CylinderGeometry(0.038, 0.034, 0.04, 6), alu, 0, crownY, 0);

  // pernas telescópicas (3 seções) com travas
  const spread = 0.42;            // raio dos pés no chão
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const top = new THREE.Vector3(Math.cos(a) * 0.032, crownY, Math.sin(a) * 0.032);
    const foot = new THREE.Vector3(Math.cos(a) * spread, -H, Math.sin(a) * spread);
    const dir = foot.clone().sub(top); const len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const seg = (r, t0, t1, mat) => {
      const m = add(new THREE.CylinderGeometry(r, r, (t1 - t0) * len, 16), mat, 0, 0, 0);
      m.position.copy(top).addScaledVector(dir, ((t0 + t1) / 2) * len); m.quaternion.copy(q); return m;
    };
    seg(0.0115, 0.0, 0.40, alu);
    seg(0.0095, 0.38, 0.72, alu);
    seg(0.0078, 0.70, 0.98, aluLight);
    for (const t of [0.4, 0.72]) { const l = seg(0.0145, t - 0.025, t + 0.025, plastic); l.scale.set(1, 1, 1); }
    seg(0.012, 0.07, 0.22, rubber);           // empunhadura de espuma
    const f = add(new THREE.SphereGeometry(0.014, 16, 12), rubber, foot.x, -H + 0.01, foot.z); f.scale.y = 0.7;
    // estai da coluna até a perna
    const brA = new THREE.Vector3(0, -0.3, 0), brB = top.clone().addScaledVector(dir, 0.3 * len);
    const bd = brB.clone().sub(brA); const bl = bd.length();
    const br = add(new THREE.CylinderGeometry(0.0035, 0.0035, bl, 8), aluLight, 0, 0, 0);
    br.position.copy(brA).addScaledVector(bd, 0.5); br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bd.normalize());
  }
  g.traverse((o) => { if (o.isMesh) o.userData.noAO = true; });
  return g;
}
