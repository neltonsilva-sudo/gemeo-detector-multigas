// Registro dos ambientes por cenário (dono: orquestrador). Builders em scene_env_a/b/c.js.
import * as THREE from 'three';
import {
  rng,
} from './scene_env_kit.js';
import { limpo, confinado, vazamento } from './scene_env_a.js';
import { coMotor, deficiencia } from './scene_env_b.js';
import { explosiva, enriquecimento } from './scene_env_c.js';

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

