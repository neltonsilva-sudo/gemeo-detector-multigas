// Mão com luva nitrílica azul tapando o bico de entrada da bomba (dono: agente CARCAÇA).
// UMA malha orgânica contínua gerada por SDF (surface nets, device_sdf.js): falanges cônicas com seção levemente
// elíptica, palma, polegar e punho unidos por smooth-union; unhas marcadas sob a luva; rugas finas nas articulações
// no shader. Espaço local (mm): a POLPA do indicador apoia no ponto (0,0,0) — o topo do bico —, com a polpa
// achatada 1 mm abaixo (o bico "some" sob o dedo); o antebraço sobe para +y/+z; depois o conjunto gira em y para
// vir pela frente-direita.
import * as THREE from 'three';
import { meshSDF, smin, smax, clamp } from './device_sdf.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dirYZ = (deg) => V(0, Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180));

// ---------------- esqueleto (mm) ----------------
function skeleton() {
  const segs = [];   // {a, b, ra, rb, w (escala lateral), dorsal, nail, wr (pontos de ruga)}
  const chain = (start, dirs, lens, radii, opts = {}) => {
    let p = start.clone(); const pts = [p.clone()];
    dirs.forEach((d, i) => {
      const q = p.clone().addScaledVector(d, lens[i]);
      segs.push({ a: p.clone(), b: q, ra: radii[i], rb: radii[i + 1], w: opts.w ?? 1.1, nail: opts.nail && i === 0 });
      p = q; pts.push(q.clone());
    });
    return pts;
  };
  // indicador: da ponta (centro da polpa) ao nó (MCP); falange distal ~25°, média ~40°, proximal ~52°
  const A = V(0, 6.3, -5.5);
  const idx = chain(A, [dirYZ(25), dirYZ(40), dirYZ(52)], [20, 25, 40], [6.4, 7.0, 7.7, 8.8], { nail: true });
  const mcp = idx[3];
  // palma: eixo u (do nó para o punho), largura em +x (mão direita, polegar em -x)
  const u = dirYZ(62);
  const palm = { c: mcp.clone().add(V(26, 0, 0)).addScaledVector(u, 40), u, hx: 39, hu: 41, ht: 12.5, r: 11 };
  // dedos fechados (médio, anelar, mínimo): flexão progressiva enrolando sob a palma
  const curled = [
    { x: 19.5, s: 2, L: [43, 27, 20], R: [8.6, 7.8, 7.1, 6.4] },
    { x: 37, s: -1, L: [40, 25, 19], R: [8.2, 7.5, 6.9, 6.2] },
    { x: 52.5, s: -8, L: [32, 21, 17], R: [7.3, 6.7, 6.1, 5.5] },
  ];
  const tips = [];
  curled.forEach((f, i) => {
    const m = mcp.clone().add(V(f.x, -1.5 * i, 0)).addScaledVector(u, -f.s);
    // direção "para fora" do dedo = 232° (para baixo e para longe do braço); flexão soma ângulo
    const pts = chain(m, [dirYZ(232 + 92 + i * 5), dirYZ(232 + 182 + i * 6), dirYZ(232 + 250 + i * 6)], f.L, f.R, { nail: false });
    tips.push(pts[3]);
  });
  // polegar: base no lado -x da palma, apoiado ao lado do indicador
  const cmc = palm.c.clone().add(V(-30, 0, 0)).addScaledVector(u, 14);
  const thumbPts = chain(cmc, [V(-0.12, -0.72, -0.68).normalize(), V(0.18, -0.6, -0.78).normalize(), V(0.32, -0.5, -0.8).normalize()],
    [30, 30, 25], [12.5, 10.0, 8.8, 7.8], { w: 1.05 });
  segs[segs.length - 1].nail = true;
  const wrist = palm.c.clone().addScaledVector(u, palm.hu + 6);
  const arm = dirYZ(58);
  return { segs, palm, wrist, arm, idxJoints: idx, thumbPts };
}

export function buildHand() {
  const root = new THREE.Group(); root.name = 'hand'; root.visible = false;
  const pose = new THREE.Group(); pose.scale.setScalar(0.001); root.add(pose);
  const YAW = 0.62;                                   // antebraço para a frente-direita
  pose.rotation.y = YAW;

  const glove = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#3d43d2'), roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.35,
    sheen: 0.7, sheenRoughness: 0.4, sheenColor: new THREE.Color('#8f8cff'), vertexColors: true,
  });
  patchGlove(glove);
  const fabric = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2a42'), roughness: 0.93 });
  patchFabric(fabric);
  const reflex = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#c9ced4'), roughness: 0.32, metalness: 0.35, clearcoat: 0.6 });

  let built = false;
  function build() {
    if (built) return; built = true;
    const t0 = performance.now();
    const S = skeleton();
    const segs = S.segs.map((s) => {
      const ab = s.b.clone().sub(s.a); const L = ab.length(); const d = ab.clone().divideScalar(L);
      // eixo lateral (achatamento) ~ horizontal perpendicular ao dedo; dorsal = d × lateral
      let lat = new THREE.Vector3(1, 0, 0).sub(d.clone().multiplyScalar(d.x)).normalize();
      const dor = new THREE.Vector3().crossVectors(lat, d).normalize();
      if (dor.y < 0 && Math.abs(d.y) < 0.95) dor.negate();
      return { ...s, d, L, lat, dor, bb: Math.max(s.ra, s.rb) + 8 };
    });
    const P = S.palm, pu = P.u, pn = new THREE.Vector3(0, -pu.z, pu.y);   // normal da palma (dorso para +)
    const cuffA = S.wrist.clone().addScaledVector(S.arm, -14), cuffB = S.wrist.clone().addScaledVector(S.arm, 52);

    const f = (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const px = x - s.a.x, py = y - s.a.y, pz = z - s.a.z;
        const t = px * s.d.x + py * s.d.y + pz * s.d.z;
        const h = clamp(t / s.L, 0, 1);
        const qx = px - s.d.x * s.L * h, qy = py - s.d.y * s.L * h, qz = pz - s.d.z * s.L * h;
        const cl = qx * s.lat.x + qy * s.lat.y + qz * s.lat.z;
        const cd = qx * s.dor.x + qy * s.dor.y + qz * s.dor.z;
        const ca = qx * s.d.x + qy * s.d.y + qz * s.d.z;
        const r = s.ra + (s.rb - s.ra) * h;
        // seção elíptica (mais larga que alta); juntas com leve volume
        const knuckle = 0.35 * Math.exp(-(((t - s.L) / 3.2) ** 2));
        let ds = Math.sqrt((cl / s.w) ** 2 + cd * cd + ca * ca) - r - knuckle;
        if (s.nail && t < 13 && t > -4 && cd > 0) {      // unha sob a luva: platô com borda
          const nb = Math.max(Math.abs(t - 5.5) - 6.0, Math.abs(cl) - 3.9);
          ds -= 0.38 * clamp(-nb / 0.7, 0, 1);
        }
        if (ds < d + 8) d = d > 1e8 ? ds : smin(d, ds, i < 3 ? 2.2 : 3.2);
      }
      // palma
      const qx = x - P.c.x, qy = y - P.c.y, qz = z - P.c.z;
      const pu_ = qx * 0 + qy * pu.y + qz * pu.z, pn_ = qy * pn.y + qz * pn.z;
      const ex = Math.abs(qx) - P.hx + P.r, eu = Math.abs(pu_) - P.hu + P.r, en = Math.abs(pn_) - P.ht + Math.min(P.r, P.ht - 1);
      const rr = Math.min(P.r, P.ht - 1);
      const palm = Math.min(Math.max(ex, Math.max(eu, en)), 0) + Math.hypot(Math.max(ex, 0), Math.max(eu, 0), Math.max(en, 0)) - rr - 0.0;
      d = smin(d, palm, 7);
      // punho da luva (cone curto) + aba enrolada
      {
        const ax = S.arm, px = x - cuffA.x, py = y - cuffA.y, pz = z - cuffA.z;
        const L = cuffB.distanceTo(cuffA); const t = px * ax.x + py * ax.y + pz * ax.z; const h = clamp(t / L, 0, 1);
        const rx = px - ax.x * L * h, ry = py - ax.y * L * h, rz = pz - ax.z * L * h;
        const c = Math.hypot(rx * 0.86, ry, rz) - (24 + 5 * h);
        d = smin(d, c, 9);
      }
      // polpa achatada pela pressão sobre o bico
      if (y < 8 && Math.abs(x) < 14 && z < 14) d = smax(d, -1.0 - y, 2.2);
      return d;
    };
    const m = meshSDF(f, [-48, -2, -18], [96, 190, 170], 0.62, { aoScale: 0.9, ao: [[1.2, 1], [3, 0.6], [6, 0.35], [10, 0.2]] });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    // cor (AO frio) + atributos de ruga: peso perto das juntas (lado dorsal) e coordenada axial
    const n = m.nv, col = new Float32Array(n * 3), wr = new Float32Array(n), wa = new Float32Array(n);
    const joints = [];
    for (const s of segs) joints.push({ p: s.b, d: s.d, dor: s.dor, r: s.rb });
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.pow(m.ao[i], 1.1);
      col[i * 3] = 0.42 + 0.58 * a; col[i * 3 + 1] = 0.4 + 0.6 * a; col[i * 3 + 2] = 0.62 + 0.38 * a;
      tmp.set(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
      let best = 0, ax = 0;
      for (const j of joints) {
        const q = tmp.clone().sub(j.p); const t = q.dot(j.d);
        if (Math.abs(t) > 6) continue;
        const rad = q.clone().addScaledVector(j.d, -t).length();
        if (rad > j.r + 4) continue;
        const w = Math.exp(-((t / 3.6) ** 2)) * clamp(q.dot(j.dor) / (j.r * 0.6) + 0.2, 0, 1);
        if (w > best) { best = w; ax = t; }
      }
      // punho: várias pregas irregulares de borracha fina
      const cq = tmp.clone().sub(cuffA); const ct = cq.dot(S.arm);
      if (ct > 4 && ct < 68) {
        const ang = Math.atan2(cq.x, cq.clone().addScaledVector(S.arm, -ct).dot(pn));
        const wc = Math.min(1, (ct - 4) / 10) * (0.75 + 0.25 * Math.sin(ang * 3 + ct * 0.2));
        if (wc > best) { best = wc; ax = ct * 0.55 + Math.sin(ang * 2.0 + ct * 0.13) * 1.6 + Math.sin(ang * 5.0) * 0.6; }
      }
      wr[i] = best; wa[i] = ax;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('wr', new THREE.BufferAttribute(wr, 1));
    g.setAttribute('wa', new THREE.BufferAttribute(wa, 1));
    g.computeBoundingSphere();
    const hand = new THREE.Mesh(g, glove); hand.castShadow = true; hand.receiveShadow = true; hand.name = 'gloveHand';
    pose.add(hand);

    // manga do uniforme (azul-marinho) com faixa refletiva
    const sleeveLen = 240;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(39, 35, sleeveLen, 56, 1, false), fabric);
    orientAlong(sleeve, S.arm); sleeve.position.copy(cuffB).addScaledVector(S.arm, sleeveLen / 2 - 18); sleeve.castShadow = true; pose.add(sleeve);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(35.2, 2.2, 12, 56), fabric);
    orientAlong(hem, S.arm); hem.position.copy(cuffB).addScaledVector(S.arm, -18); pose.add(hem);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(36.9, 36.6, 24, 56, 1, true), reflex);
    orientAlong(band, S.arm); band.position.copy(cuffB).addScaledVector(S.arm, 70); pose.add(band);
    root.userData.buildMs = Math.round(performance.now() - t0);
  }
  // gera fora do caminho crítico (ocioso); se for preciso antes, gera na hora
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => build(), { timeout: 4000 }); else setTimeout(build, 1500);

  // aproximação ao longo do eixo do indicador (do nó para a ponta)
  const approach = dirYZ(40).applyAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
  let k = 0;
  return {
    group: root,
    update(dt, cover, anchorWorld) {
      if (cover && !built) build();
      k += ((cover ? 1 : 0) - k) * Math.min(1, (dt || 0.016) * 15);   // ~0,2 s
      if (k < 0.01 && !cover) { root.visible = false; return; }
      root.visible = true;
      root.position.copy(anchorWorld).addScaledVector(approach, (1 - k) * 0.11 - 0.006);   // polpa pressiona o bico
    },
  };
}

function orientAlong(obj, dir) { obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); }

// Luva: micro-textura + rugas nas juntas (atributos wr/wa) via derivadas de tela.
function patchGlove(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wr; attribute float wa; varying float vWr; varying float vWa; varying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWr = wr; vWa = wa; vOP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWr; varying float vWa; varying vec3 vOP;
        float ghH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float ghN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(ghH(i), ghH(i + vec3(1,0,0)), f.x), mix(ghH(i + vec3(0,1,0)), ghH(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(ghH(i + vec3(0,0,1)), ghH(i + vec3(1,0,1)), f.x), mix(ghH(i + vec3(0,1,1)), ghH(i + vec3(1,1,1)), f.x), f.y), f.z); }
        vec3 ghPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float wrin = vWr * sin(vWa * 3.6 + ghN(vOP * 0.6) * 2.0) * (0.6 + 0.4 * ghN(vOP * 1.3));
          float grain = ghN(vOP * 2.2) * 0.5 + ghN(vOP * 5.1) * 0.25;
          float hgt = wrin * 0.9 + grain * 0.35;
          normal = ghPerturb(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)) * 0.9, faceDirection);
        }`);
  };
  mat.customProgramCacheKey = () => 'glove1';
}
// Tecido: trama fina procedural.
function patchFabric(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOPf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPf = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOPf;
        vec3 fbPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float a = atan(vOPf.x, vOPf.z) * 60.0; float w = sin(a) * sin(vOPf.y * 2.4);
          normal = fbPerturb(-vViewPosition, normal, vec2(dFdx(w), dFdy(w)) * 0.35, faceDirection); }`);
  };
  mat.customProgramCacheKey = () => 'fabric1';
}
