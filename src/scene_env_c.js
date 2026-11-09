// Ambientes por cenário — dono: AGENTE AMBIENTE C (explosiva, enriquecimento-o2). Use peças de scene_env_kit.js / scene_env_common.js.
// Aparelho montado no TRIPÉ: sapata em y=0, piso em y=-TRIPOD_H; nada no cilindro r=0,6 m em volta do eixo abaixo de y=0.
import * as THREE from 'three';
import { concreteSet, blockWallSet, std, makeSign, makeParticles, pipe, box } from './scene_env_kit.js';
import { shadowless, drum, PAINT } from './scene_env_common.js';
import { TRIPOD_H } from './tripod.js';
import { stainDecal, chain, gauge, tubeAlong, bottlePaintSet } from './scene_env_c_parts.js';

// ============================================================================ 6. ATMOSFERA EXPLOSIVA — depósito fechado de inflamáveis
function room(G, F, { wz = -4.75, up = '#d9d6cd', lo = '#8d918f', seed = 92, floor = '#9a958c', stains = 1.6, tube = 0xfff4e0 } = {}) {
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), std({ roughness: 0.6, metalness: 0 }, concreteSet({ seed: seed - 1, base: floor, joints: 2, rep: [10, 10], stains })));
  fl.rotation.x = -Math.PI / 2; fl.position.y = F; G.add(fl);
  const wallUp = std({ roughness: 0.9 }, blockWallSet({ seed, base: up, rep: [6, 2] }));
  const wallLo = std({ roughness: 0.6 }, blockWallSet({ seed: seed + 3, base: lo, rep: [6, 0.7] }));
  G.add(box(12, 2.2, 0.2, wallUp, [2, F + 2.3, wz]), box(12, 1.2, 0.22, wallLo, [2, F + 0.6, wz + 0.01]));
  G.add(box(0.2, 3.4, 10, wallUp, [8, F + 1.7, 0]), box(0.2, 3.4, 10, wallUp, [-4, F + 1.7, 0]), box(12, 3.4, 0.2, wallUp, [2, F + 1.7, 4]));
  G.add(box(12, 0.1, 10, std({ color: 0xe6e6e2, roughness: 0.9 }), [2, F + 3.4, 0]));
  return { wz, tubeM: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: tube, emissiveIntensity: 3.0 }) };
}
function pillarSigns(G, F, signs) {
  const pil = std({ roughness: 0.9 }, concreteSet({ seed: 97, base: '#d6d3cc', rep: [0.3, 1], stains: 0.6 }));
  for (const [s, x, z, ry] of signs) {
    const g = new THREE.Group(); g.add(box(0.26, 3.4, 0.26, pil, [0, 1.7, -0.14])); s.position.set(0, TRIPOD_H, 0.0); g.add(s);
    g.position.set(x, F, z); g.rotation.y = ry; G.add(g);
  }
}
function spillPallet(x, z, F, drums) {
  const g = new THREE.Group();
  g.add(box(1.3, 0.3, 1.3, std({ color: 0xe0b000, roughness: 0.6 }), [0, 0.15, 0], 0.03));
  const grate = std({ color: 0x3a3d40, roughness: 0.6, metalness: 0.6 });
  for (let i = 0; i < 9; i++) g.add(box(1.2, 0.02, 0.025, grate, [0, 0.305, -0.56 + i * 0.14]));
  for (const [dx, dz, c, r] of drums) g.add(drum(c, [dx, 0.31, dz], r));
  g.position.set(x, F, z); return g;
}
function bombona(color, pos, ry = 0) {
  const g = new THREE.Group(), m = std({ color, roughness: 0.55 });
  g.add(box(0.3, 0.42, 0.24, m, [0, 0.21, 0], 0.04));
  g.add(pipe(0.035, 0.05, std({ color: 0x222222, roughness: 0.6 }), [0.08, 0.445, 0], 'y', 12));
  g.add(box(0.12, 0.03, 0.04, m, [-0.06, 0.44, 0], 0.01));
  g.position.set(...pos); g.rotation.y = ry; return g;
}
export function explosiva() {
  const G = new THREE.Group();
  const F = -TRIPOD_H;
  const { wz, tubeM } = room(G, F, { up: '#d8d3c8', lo: '#7f8582', floor: '#938d84', stains: 2.2, tube: 0xfff0d8 });
  // luminárias à prova de explosão (corpo fundido + globo com grade) — no teto, entram no reflexo
  const ex = std({ color: 0x5a5f63, roughness: 0.5, metalness: 0.6 });
  for (const x of [-1, 2, 5]) for (const z of [-3, 0, 2.5]) { G.add(pipe(0.12, 0.12, ex, [x, F + 3.28, z], 'y', 16)); G.add(box(1.1, 0.12, 0.14, tubeM, [x, F + 3.17, z])); }
  // manchas de solvente/óleo no piso (fora do raio do tripé)
  for (const [x, z, w, s] of [[1.3, -1.8, 1.0, 1], [0.9, -3.0, 1.4, 2], [-0.4, -2.7, 0.8, 3], [3.9, -3.7, 1.6, 4], [2.6, -2.4, 0.7, 5]]) {
    const d = stainDecal(w, w * 0.8, { seed: s, alpha: 0.5 }); d.position.set(x, F + 0.003, z); G.add(d);
  }
  // paletes de contenção com tambores (azul: solvente, vermelho: inflamável, preto: óleo)
  G.add(spillPallet(0.75, -3.55, F, [[-0.32, -0.32, 0x1d4f8a, 0.3], [0.32, -0.32, 0x9e2a20, 1.2], [-0.32, 0.32, 0x1d4f8a, 2.1], [0.32, 0.32, 0x222428, 0.7]]));
  G.add(spillPallet(4.2, -3.2, F, [[-0.32, -0.32, 0x9e2a20, 0.9], [0.32, -0.32, 0x9e2a20, 2.4], [-0.32, 0.32, 0x1d4f8a, 1.6]]));
  // estante porta-palete encostada na parede com bombonas e latas
  const blue = std({ color: 0x1f4f9a, roughness: 0.5, metalness: 0.4 }), orange = std({ color: 0xe0661c, roughness: 0.5, metalness: 0.4 }), deck = std({ color: 0x8a8f93, roughness: 0.5, metalness: 0.7 });
  const sx0 = 1.9, sx1 = 3.5, sz = wz + 0.55;
  for (const x of [sx0, sx1]) for (const z of [sz - 0.4, sz + 0.4]) G.add(box(0.07, 2.6, 0.07, blue, [x, F + 1.3, z]));
  for (const y of [0.12, 0.95, 1.8]) {
    for (const z of [sz - 0.4, sz + 0.4]) G.add(box(sx1 - sx0, 0.1, 0.05, orange, [(sx0 + sx1) / 2, F + y, z]));
    G.add(box(sx1 - sx0 - 0.05, 0.02, 0.8, deck, [(sx0 + sx1) / 2, F + y + 0.06, sz]));
  }
  const bc = [0x2a62b0, 0xf2f2ee, 0x2a62b0, 0x2b8a3e, 0xf2f2ee];
  for (let i = 0; i < 5; i++) G.add(bombona(bc[i], [sx0 + 0.2 + i * 0.3, F + 0.19, sz + (i % 2) * 0.08], i * 0.2));
  for (let i = 0; i < 4; i++) G.add(bombona(bc[(i + 2) % 5], [sx0 + 0.25 + i * 0.36, F + 1.02, sz], -i * 0.15));
  // exaustor junto ao piso (vapores mais pesados que o ar)
  const louver = std({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.8 });
  G.add(box(0.62, 0.5, 0.06, louver, [5.6, F + 0.4, wz + 0.14]));
  for (let i = 0; i < 6; i++) G.add(box(0.56, 0.02, 0.05, PAINT.escuro, [5.6, F + 0.2 + i * 0.075, wz + 0.18]));
  // vapor de solvente tremulando sobre os tambores e rente ao piso
  const haze = makeParticles({ mode: 'box', count: 200, box: [[-0.3, F + 0.05, -4.4], [5.5, F + 1.0, -2.4]], size: [0.6, 1.6], color: [0.95, 0.9, 0.78], lit: 1.1, opacity: 0.035, life: 8, wind: [0.12, 0.03, 0], turb: 0.25, soft: 1.6 });
  const leak = makeParticles({ mode: 'jet', count: 90, origin: [1.07, F + 1.2, -3.87], dir: [0.2, 1, 0.3], speed: 0.18, spread: 0.45, life: 3.5, size: [0.06, 0.6], color: [0.95, 0.9, 0.78], lit: 1.1, opacity: 0.07, wind: [0.05, 0.0, 0], turb: 0.1, soft: 2.0, seed: 88 });
  G.add(haze, leak);
  const sign = makeSign({ w: 0.46, h: 0.34, kind: 'perigo', title: 'PERIGO', lines: ['ÁREA CLASSIFICADA', 'PROIBIDO FONTES', 'DE IGNIÇÃO'], icon: { type: 'proib', inner: 'chama' }, seed: 84 });
  const sign2 = makeSign({ w: 0.46, h: 0.34, kind: 'atencao', title: 'INFLAMÁVEL', lines: ['LÍQUIDOS E VAPORES', 'NÃO FUME', 'NÃO USE CELULAR'], icon: { type: 'tri', inner: 'chama' }, seed: 85 });
  pillarSigns(G, F, [[sign, 0.45, -2.2, -0.15], [sign2, 2.1, -2.2, -0.45]]);
  shadowless(G);
  return {
    group: G, particles: [haze, leak],
    look: { keyDir: [0.15, 1.0, 0.4], keyColor: [1.0, 0.93, 0.82], keyI: 2.0, exposure: 0.95, envI: 1.0, fog: 0.01, fogColor: [0.7, 0.66, 0.6], contactOpacity: 0, bloom: 0.22, vignette: 0.2, shadowR: 10 },
    bake: { hemi: [[0.85, 0.8, 0.72], [0.42, 0.4, 0.36], 1.3], sun: 1.6 },
  };
}

// ============================================================================ 7. ENRIQUECIMENTO DE O2 — central de oxigênio (interna, luz fria)
function o2Bottle(mat, valveM) {
  const g = new THREE.Group(), r = 0.115, h = 1.38;
  const pts = [[0, 0], [r * 0.92, 0], [r, 0.03], [r, h - 0.22], [r * 0.85, h - 0.12], [r * 0.45, h - 0.05], [0.032, h - 0.02], [0.032, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat));
  g.add(pipe(0.024, 0.09, valveM, [0, h + 0.045, 0], 'y', 14));
  g.add(pipe(0.012, 0.05, valveM, [0, h + 0.05, 0.035], 'z', 10));
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 18), PAINT.escuro); hw.rotation.x = Math.PI / 2; hw.position.y = h + 0.1; g.add(hw);
  return g;
}
export function enriquecimento() {
  const G = new THREE.Group();
  const F = -TRIPOD_H;
  // sala fechada: piso epóxi claro e limpo, paredes de bloco com barra, teto com luminárias fluorescentes (entram no reflexo)
  const { wz, tubeM } = room(G, F, { up: '#dcdad3', lo: '#a9b3ae', floor: '#b3b2ad', stains: 0.35, tube: 0xe8f2ff });
  for (const x of [-1, 2, 5]) for (const z of [-3, 0, 2.5]) G.add(box(1.2, 0.04, 0.12, tubeM, [x, F + 3.33, z]));
  // demarcação amarela no piso (área dos cilindros) — NR-26
  const yel = std({ color: 0xe2b400, roughness: 0.55 });
  for (const [w, d, x, z] of [[5.6, 0.08, 2.6, -3.75], [0.08, 1.0, -0.2, -4.25], [0.08, 1.0, 5.4, -4.25]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), yel); s.rotation.x = -Math.PI / 2; s.position.set(x, F + 0.002, z); G.add(s); }
  // duas baterias de cilindros de O2 (verdes, padrão brasileiro) acorrentadas + coletor de cobre e painel com manômetros
  const bottleM = std({ roughness: 0.4, metalness: 0.15 }, bottlePaintSet({ seed: 96 }));
  const brass = std({ color: 0xb08d57, roughness: 0.3, metalness: 1 }), copper = std({ color: 0xb8734a, roughness: 0.3, metalness: 1 });
  const galv = std({ color: 0x9ea4a8, roughness: 0.4, metalness: 0.9 });
  const cz = -4.42, hy = F + 1.62;
  for (const x0 of [0.1, 3.75]) {
    const xs = []; for (let i = 0; i < 6; i++) xs.push(x0 + i * 0.27);
    for (const x of xs) {
      const b = o2Bottle(bottleM, brass); b.position.set(x, F, cz); b.rotation.y = x * 7; G.add(b);
      G.add(tubeAlong([[x, F + 1.5, cz + 0.035], [x, F + 1.6, cz + 0.07], [x, hy + 0.02, cz - 0.06], [x, hy, cz - 0.15]], 0.006, copper, 16));
    }
    const xa = x0 - 0.2, xb = x0 + 5 * 0.27 + 0.2, xm = (xa + xb) / 2;
    for (const y of [0.55, 1.05]) {
      G.add(pipe(0.016, xb - xa, galv, [xm, F + y, cz - 0.2], 'x', 10));
      G.add(chain([xa, F + y, cz + 0.13], [xb, F + y, cz + 0.13], galv, 0.035));
    }
    for (const x of [xa, xb]) G.add(box(0.05, 1.2, 0.3, galv, [x, F + 0.8, cz - 0.05]));
    G.add(pipe(0.016, xb - xa, copper, [xm, hy, cz - 0.15], 'x', 14));
  }
  // painel da central: caixa com 2 manômetros de alta, 1 de baixa, regulador e válvulas
  const px = 2.95, py = F + 1.28;
  G.add(box(0.62, 0.52, 0.14, std({ color: 0xe9e9e4, roughness: 0.45, metalness: 0.3 }), [px, py, wz + 0.18], 0.01));
  for (const [dx, dy, v] of [[-0.18, 0.1, 0.72], [0.18, 0.1, 0.66], [0, -0.1, 0.35]]) { const gg = gauge(0.055, 1, v, dy > 0 ? 'ALTA' : 'BAIXA'); gg.position.set(px + dx, py + dy, wz + 0.27); G.add(gg); }
  G.add(pipe(0.03, 0.12, brass, [px, py - 0.02, wz + 0.29], 'z', 16));
  G.add(pipe(0.016, 1.15, copper, [1.3, hy, cz - 0.15], 'x', 14), pipe(0.016, 1.15, copper, [3.6, hy, cz - 0.15], 'x', 14));
  for (const x of [px - 0.22, px + 0.22]) G.add(pipe(0.016, hy - py - 0.26, copper, [x, (hy + py + 0.26) / 2, cz - 0.15], 'y', 12));
  G.add(pipe(0.016, py - F - 0.26, copper, [px, (F + py - 0.26) / 2 + 0.6, wz + 0.2], 'y', 12));
  const sign = makeSign({ w: 0.46, h: 0.32, kind: 'perigo', title: 'OXIGÊNIO', lines: ['NÃO FUME', 'PROIBIDO CHAMAS'], icon: { type: 'proib', inner: 'cigarro' }, seed: 93 });
  const sign2 = makeSign({ w: 0.46, h: 0.32, kind: 'perigo', title: 'PROIBIDO', lines: ['ÓLEO OU GRAXA', 'NAS CONEXÕES DE O₂'], icon: { type: 'tri', inner: '!' }, seed: 94 });
  pillarSigns(G, F, [[sign, 0.45, -2.2, -0.15], [sign2, 2.1, -2.2, -0.45]]);
  const motes = makeParticles({ mode: 'box', count: 80, box: [[-0.5, F + 0.4, -4.2], [5, F + 2.2, -1.2]], size: [0.006, 0.014], color: [0.9, 0.95, 1.0], lit: 1.3, opacity: 0.25, life: 10, wind: [0.02, 0.01, 0], turb: 0.08, soft: 2.5, seed: 98 });
  G.add(motes);
  shadowless(G);
  return {
    group: G, particles: [motes],
    look: { keyDir: [0.2, 1.0, 0.35], keyColor: [0.88, 0.94, 1.0], keyI: 2.0, exposure: 0.95, envI: 1.0, fog: 0.006, fogColor: [0.75, 0.8, 0.86], contactOpacity: 0, bloom: 0.18, vignette: 0.15, shadowR: 10 },
    bake: { hemi: [[0.78, 0.85, 0.95], [0.45, 0.46, 0.46], 1.4], sun: 1.6 },
  };
}
