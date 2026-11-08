// Geometria das peças do kit (cilindro 34 L, regulador de fluxo fixo + manômetro, sonda telescópica, tampa, adaptador).
// Unidades: metros (perfis escritos em mm e convertidos). Dono: agente KIT.
import * as THREE from 'three';
import * as TX from './kit_tex.js';

const MM = 0.001;
const V2 = (r, y) => new THREE.Vector2(r * MM, y * MM);

// perfil [r,y] mm → pontos (m) com subdivisão dos trechos longos; retorna também comprimentos de arco
function prof(pts, step = 1.0) {
  const out = [], s = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [r, y] = pts[i];
    if (i > 0) {
      const [r0, y0] = pts[i - 1], L = Math.hypot(r - r0, y - y0), k = Math.max(1, Math.ceil(L / step));
      for (let j = 1; j <= k; j++) { const t = j / k; out.push(V2(r0 + (r - r0) * t, y0 + (y - y0) * t)); acc += L / k; s.push(acc); }
    } else { out.push(V2(r, y)); s.push(0); }
  }
  return { pts: out, s, len: acc };
}
// spline suave por pontos de controle [r,y] → lista densa [r,y]
function smooth(ctrl, n = 60) {
  const c = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getPoints(n).map((p) => [p.x, p.y]);
}
// torno com v = comprimento de arco normalizado e costura atrás (u=0.5 → frente +z)
export function lathe(pts, segs = 96, step = 1.0, { phiStart = Math.PI } = {}) {
  const P = prof(pts, step);
  const g = new THREE.LatheGeometry(P.pts, segs, phiStart, Math.PI * 2);
  const uv = g.attributes.uv, np = P.pts.length;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < np; j++) uv.setY(i * np + j, P.s[j] / P.len);
  g.userData.arcLen = P.len; g.userData.s = P.s; g.userData.pts = P.pts; // mm
  return g;
}
const yToZ = (g) => g.rotateX(Math.PI / 2);     // eixo do torno y → +z
const yToX = (g) => g.rotateZ(-Math.PI / 2);    // eixo do torno y → +x
const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); if (name) o.name = name; return o; };

// ---------------------------------------------------------------- materiais
// vidro/plástico claro: rgb = difuso·a + especular (Fresnel) e alfa cresce na borda rasante (silhueta do tubo)
export function glassify(m, aBody, aEdge, kSpec = 1) {
  m.transparent = true; m.opacity = aBody; m.depthWrite = false;
  m.userData.noShadowCast = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.aEdge = { value: aEdge }; sh.uniforms.kSpec = { value: kSpec };
    sh.fragmentShader = 'uniform float aEdge; uniform float kSpec;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float nv = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
      float aB = mix( diffuseColor.a, aEdge, pow( 1.0 - nv, 3.0 ) );
      vec3 spec = ( reflectedLight.indirectSpecular + reflectedLight.directSpecular * 0.12 ) * kSpec;
      vec3 dif = max( outgoingLight - totalSpecular, vec3( 0.0 ) );
      gl_FragColor = vec4( ( dif * aB + spec ) / max( aB, 0.02 ), aB );`);
  };
  m.customProgramCacheKey = () => 'kitglass' + aEdge + '_' + kSpec;
  return m;
}
export function makeMaterials() {
  const knN = TX.knurlNormal(), turned = TX.turnedNormal(3), rubN = TX.rubberNormal();
  const M = {};
  M.nickel = new THREE.MeshPhysicalMaterial({ color: 0xe2dfd8, metalness: 1, roughness: 0.14, normalMap: turned, normalScale: new THREE.Vector2(0.07, 0.07), anisotropy: 0.0 });
  M.nickelBright = new THREE.MeshPhysicalMaterial({ color: 0xe4e2dc, metalness: 1, roughness: 0.12 });
  M.steel = new THREE.MeshPhysicalMaterial({ color: 0xc9cacc, metalness: 1, roughness: 0.22, anisotropy: 0.6, anisotropyRotation: Math.PI / 2 });
  M.chrome = new THREE.MeshPhysicalMaterial({ color: 0xe8e9ea, metalness: 1, roughness: 0.13 });
  M.brass = new THREE.MeshPhysicalMaterial({ color: 0xcfa968, metalness: 1, roughness: 0.3, normalMap: knN, normalScale: new THREE.Vector2(0.6, 0.6) });
  M.brassPlain = new THREE.MeshPhysicalMaterial({ color: 0xc8a463, metalness: 1, roughness: 0.26 });
  const knurl = knN.clone(); knurl.repeat.set(10, 2); knurl.needsUpdate = true;
  M.knob = new THREE.MeshPhysicalMaterial({ color: 0x18191b, metalness: 0.55, roughness: 0.36, normalMap: knurl, normalScale: new THREE.Vector2(0.9, 0.9), clearcoat: 0.2, clearcoatRoughness: 0.4 });
  M.knobPlain = new THREE.MeshPhysicalMaterial({ color: 0x141517, metalness: 0.5, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  M.black = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.45 });
  M.hole = new THREE.MeshBasicMaterial({ color: 0x080808 });
  const rub = rubN.clone(); rub.repeat.set(5, 9); rub.needsUpdate = true;
  M.rubber = new THREE.MeshPhysicalMaterial({ color: 0x0f1012, roughness: 0.34, normalMap: rub, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 0.35, clearcoatRoughness: 0.32, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x30333a) });
  M.dialInner = new THREE.MeshStandardMaterial({ color: 0xc9c9c7, roughness: 0.5, metalness: 0.3, side: THREE.BackSide });
  M.needle = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0e, roughness: 0.35, clearcoat: 0.5 });
  // transparentes: mistura alfa própria (o fundo do estúdio é desenhado em outra passada → transmission veria preto)
  M.glass = glassify(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, ior: 1.5, specularIntensity: 1 }), 0.02, 0.35);
  M.clearPC = glassify(new THREE.MeshPhysicalMaterial({ color: 0x3a4044, roughness: 0.08, ior: 1.58, side: THREE.DoubleSide }), 0.07, 0.8, 0.22);
  M.capPlastic = glassify(new THREE.MeshPhysicalMaterial({ color: 0xc4c9cc, roughness: 0.34, ior: 1.46, side: THREE.DoubleSide }), 0.5, 0.88, 0.5);
  M.filterEl = glassify(new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.7 }), 0.32, 0.7, 0.4);
  M.tygon = glassify(new THREE.MeshPhysicalMaterial({ color: 0xf6e6b0, roughness: 0.1, ior: 1.5, specularIntensity: 0.8, side: THREE.DoubleSide }), 0.1, 0.42, 0.7);
  M.tygon.userData.stageEnv = true;
  M.abs = new THREE.MeshPhysicalMaterial({ color: 0x1b1c1e, roughness: 0.48, clearcoat: 0.1 });
  return M;
}

// ---------------------------------------------------------------- cilindro de alumínio 34 L
export function buildCylinder(M) {
  const group = new THREE.Group(); group.name = 'cilindro';
  // perfil medido na foto (Ø76, ombro ~48 mm, gargalo Ø34)
  const dome = []; for (let i = 0; i <= 10; i++) { const t = i / 10; dome.push([29 * t, 6.5 - 4.6 * t * t]); }
  const shoulder = smooth([[38, 226], [37.8, 231], [36.9, 236.5], [35, 241.5], [32.5, 246.5], [29.5, 251.5], [26.5, 256.5], [23.4, 261.5], [20.6, 266.5], [18.6, 270.5], [17.4, 274], [17.0, 277]], 70);
  const pts = [...dome, [31, 0.6], [33.5, 0], [36, 0.7], [37.5, 2.3], [38, 4.6], [38, 120], ...shoulder, [17, 280.6], [17.25, 281.2], [17.25, 282.4], [16.6, 283.3], [15.8, 283.7], [9.5, 283.7]];
  const g = lathe(pts, 160, 0.8);
  // v e raio das linhas de gravação no ombro
  const S = g.userData.s, P = g.userData.pts, at = (y) => { let best = 0, d = 1e9; P.forEach((p, i) => { const dd = Math.abs(p.y / MM - y); if (dd < d && p.x / MM > 15) { d = dd; best = i; } }); return { v: S[best] / g.userData.arcLen, r: P[best].x / MM }; };
  const rows = [
    { ...at(255), size: 3.4, segs: [{ u: 0.4, t: 'DOT-39 NRC 300/375' }, { u: 0.63, t: 'M4415  11·26' }, { u: 0.9, t: 'CG-34' }, { u: 0.12, t: 'TC-39M' }] },
    { ...at(244), size: 3.6, segs: [{ u: 0.62, t: 'P 0034  LOTE 2611' }, { u: 0.25, t: 'NÃO RECARREGÁVEL' }, { u: 0.85, t: '34 L' }] },
    { ...at(232.5), size: 3.6, segs: [{ u: 0.49, t: 'CALGAS·LAB GASES & EQUIPAMENTOS LTDA' }, { u: 0.95, t: 'AL 6061-T6' }] },
  ];
  const al = TX.aluminiumMaps({ arcLen: g.userData.arcLen, rows });
  const alMat = new THREE.MeshPhysicalMaterial({ color: 0xe4e7ea, metalness: 1, roughness: 0.2, roughnessMap: al.rough, normalMap: al.normal, normalScale: new THREE.Vector2(0.5, 0.5), anisotropy: 0.3, anisotropyRotation: 0 });
  const body = mesh(g, alMat, 'cil_corpo'); group.add(body);
  // rótulo envolvente
  const lab = lathe([[38.16, 79], [38.16, 226]], 160, 200);
  const labMat = new THREE.MeshPhysicalMaterial({ map: TX.labelTexture(16), roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.22, sheen: 0 });
  group.add(mesh(lab, labMat, 'cil_rotulo'));
  // válvula C-10 (rosca 5/8") — fica coberta pela tampa ou dentro do regulador
  const th = [[8.6, 283.6], [8.6, 284.4]]; for (let y = 284.4; y < 291; y += 1.41) th.push([8.0, y + 0.35], [8.4, y + 0.7], [8.0, y + 1.05]);
  th.push([7.6, 291.6], [3.2, 291.6], [3.2, 288.5]);
  group.add(mesh(lathe(th, 64, 0.5), M.nickelBright, 'cil_valvula'));
  return { group, body, height: 0.2837, valveTop: 0.2916 };
}

// tampa plástica transparente/cinza (origem na base dela)
export function buildCap(M) {
  const pts = [[16.9, 11.6], [17.15, 0.5], [17.4, 0], [18.9, 0], [19.3, 0.6], [19.3, 2.6], [18.9, 3.3], [17.4, 3.6], [17.4, 13.0], [16.9, 14.0], [15.6, 14.9], [13.5, 15.2], [0, 15.4]];
  const g = lathe(pts, 120, 0.4);
  // estrias verticais na parte superior
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) / MM, z = p.getZ(i), r = Math.hypot(x, z) / MM;
    if (r > 17.0 && y > 4.2 && y < 12.6) {
      const a = Math.atan2(x, z), f = Math.pow(Math.max(0, Math.cos(a * 30)), 3) * 0.32 * Math.min(1, (y - 4.2) / 0.8, (12.6 - y) / 0.8);
      const k = (r + f) / r; p.setX(i, x * k); p.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  const m = mesh(g, M.capPlastic, 'tampa'); m.userData.noShadow = false;
  const grp = new THREE.Group(); grp.add(m); grp.name = 'tampa';
  return grp;
}

// ---------------------------------------------------------------- regulador de fluxo fixo 0,5 L/min + manômetro
export function buildRegulator(M) {
  const group = new THREE.Group(); group.name = 'regulador';
  const body = [[8.6, 7], [8.6, 0.8], [9.4, 0], [17.0, 0], [18.5, 0.9], [19.0, 2.4], [19.0, 42.4], [18.5, 43.0], [18.5, 44.3], [19.3, 44.6], [20.0, 45.4],
    [20.0, 92.4], [19.6, 93.4], [18.8, 94.0], [6.2, 107.4], [5.8, 107.8], [5.8, 110.2], [5.2, 110.8], [3.0, 111.0], [3.0, 111.4],
    [3.7, 111.9], [3.05, 116.3], [3.7, 116.8], [3.05, 121.4], [2.7, 122.4], [1.3, 122.4], [1.3, 118]];
  group.add(mesh(lathe(body, 128, 0.5), M.nickel, 'reg_corpo'));
  // furo de respiro no corpo
  const vent = mesh(new THREE.CircleGeometry(0.0009, 20), M.hole); const va = -0.35;
  vent.position.set(Math.sin(va) * 0.02005, 0.064, Math.cos(va) * 0.02005); vent.lookAt(vent.position.clone().multiplyScalar(2).setY(0.064)); group.add(vent);
  // haste do manômetro
  const stem = mesh(yToZ(new THREE.CylinderGeometry(0.0047, 0.0047, 0.009, 6)), M.nickelBright); stem.position.set(0, 0.012, 0.0205); group.add(stem);
  // ---- manômetro Ø50
  const gauge = new THREE.Group(); gauge.position.set(0, 0.012, 0.0245); gauge.scale.setScalar(1.1); group.add(gauge);
  const caseP = [[0, 0], [21.5, 0], [24.0, 0.7], [24.9, 2.2], [24.9, 9.0], [25.4, 9.6], [25.8, 11.2], [25.8, 12.6], [25.2, 14.3], [23.9, 15.3], [22.2, 15.4], [21.4, 14.8], [21.2, 13.8]];
  gauge.add(mesh(yToZ(lathe(caseP, 128, 0.3)), M.chrome, 'man_caixa'));
  const wall = mesh(yToZ(new THREE.CylinderGeometry(0.0213, 0.0213, 0.0038, 96, 1, true)), M.dialInner); wall.position.z = 0.0121; gauge.add(wall);
  const dial = mesh(new THREE.CircleGeometry(0.0216, 96), new THREE.MeshPhysicalMaterial({ map: TX.dialTexture(), roughness: 0.42, clearcoat: 0.0 }), 'man_mostrador');
  dial.position.z = 0.0102; gauge.add(dial);
  // ponteiro
  const sh = new THREE.Shape();
  sh.moveTo(-1.05 * MM, -4.2 * MM); sh.lineTo(1.05 * MM, -4.2 * MM); sh.lineTo(0.42 * MM, 15.6 * MM); sh.lineTo(0, 17.6 * MM); sh.lineTo(-0.42 * MM, 15.6 * MM); sh.closePath();
  const needle = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.00035, bevelEnabled: false }), M.needle, 'man_ponteiro');
  needle.position.z = 0.0109; gauge.add(needle);
  const hub = mesh(yToZ(new THREE.CylinderGeometry(0.0017, 0.0019, 0.0016, 24)), M.nickelBright); hub.position.z = 0.0116; gauge.add(hub);
  // vidro abaulado
  const Rs = 0.25, th = Math.asin(0.0214 / Rs);
  const glassG = new THREE.SphereGeometry(Rs, 72, 6, 0, Math.PI * 2, 0, th); yToZ(glassG);
  const glass = mesh(glassG, M.glass, 'man_vidro'); glass.position.z = 0.0146 - Rs; glass.userData.noShadow = true; gauge.add(glass);
  // ---- manopla preta recartilhada (eixo +x)
  const port = mesh(yToX(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0065, 6)), M.nickelBright); port.position.set(0.0215, 0.028, 0); group.add(port);
  const knob = new THREE.Group(); knob.name = 'manopla'; knob.position.set(0.0245, 0.028, 0); group.add(knob);
  const collar = [[5.2, 0], [10.4, 0.2], [11.0, 0.9], [11.0, 5.6], [12.4, 6.0], [12.4, 6.6]];
  knob.add(mesh(yToX(lathe(collar, 64, 0.4)), M.knobPlain));
  const kG = new THREE.CylinderGeometry(0.0141, 0.0141, 0.0152, 320, 60, true);
  {
    const p = kG.attributes.position, n = kG.attributes.normal; const D = 84;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
      const u = (a / (2 * Math.PI) + 0.5) * D, v = (y / (2 * Math.PI * 0.0141)) * D;
      const edge = Math.min(1, (0.0076 - Math.abs(y)) / 0.0007);
      const h = (TX.knurlHeightFn(u, v) - 0.5) * 0.00036 * Math.max(0, edge) - (1 - Math.max(0, edge)) * 0.0004;
      p.setX(i, x + n.getX(i) * h); p.setZ(i, z + n.getZ(i) * h);
    }
    const uv = kG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (84 / 80), uv.getY(i) * (0.0152 / (2 * Math.PI * 0.0141)) * (84 / 80) * 8 / 8);
  }
  const kM = mesh(yToX(kG), M.knob, 'manopla_recartilha'); kM.position.x = 0.0066 + 0.0076; knob.add(kM);
  const endP = [[12.6, 0], [13.5, 0.2], [13.9, 0.8], [13.9, 2.2], [13.3, 3.2], [12.0, 3.6], [0, 3.7]];
  const end = mesh(yToX(lathe(endP, 96, 0.3)), M.knobPlain); end.position.x = 0.0218; knob.add(end);
  knob.traverse((o) => { o.userData.action = 'valve'; }); knob.userData.action = 'valve';
  // âncora do bico espigão (saída) — ponta do espigão, apontando +y
  const barb = new THREE.Object3D(); barb.position.set(0, 0.1224, 0); group.add(barb);
  return { group, knob, needle, gauge, barb, gaugeCenterY: 0.012, gaugeR: 0.0258 * 1.1, height: 0.1224 };
}

// ---------------------------------------------------------------- sonda de amostragem telescópica
const handleA = (() => {
  const c = smooth([[0, 0], [0.7, 4.6], [2.2, 7.6], [5, 9.3], [12, 10.2], [30, 11.0], [50, 12.2], [70, 14.4], [90, 18.4], [105, 21.4], [117, 22.8], [126, 21.9], [133, 18.6], [138, 12.8], [141.5, 7.2], [144, 4.9], [146, 4.3], [157, 4.3]], 600);
  return (y) => { if (y <= 0) return 0; for (let i = 1; i < c.length; i++) if (c[i][0] >= y) { const t = (y - c[i - 1][0]) / Math.max(1e-6, c[i][0] - c[i - 1][0]); return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t; } return 4.3; };
})();
const handleKb = (y) => (y < 60 ? 0.88 : y < 90 ? 0.88 - (y - 60) / 30 * 0.15 : y < 128 ? 0.73 : y < 143 ? 0.73 + (y - 128) / 15 * 0.27 : 1);
const SE = 2.5;
function sePt(a, b, th) { const c = Math.cos(th), s = Math.sin(th); return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / SE), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / SE)]; }
function ribBump(y, th) {
  if (y < 8 || y > 60) return 0;
  const pitch = 6.4, ph = ((y - 9) % pitch + pitch) % pitch, w = 2.4;
  const prof = ph < w ? Math.sin(Math.PI * ph / w) : 0;
  const front = Math.sin(th); const mask = 1 - THREE.MathUtils.smoothstep(front, 0.3, 0.7);
  return prof * 0.95 * mask * Math.min(1, (y - 8) / 2, (60 - y) / 2);
}
function handleGeometry() {
  const ys = []; for (let y = 0; y <= 157.001;) { ys.push(y); y += (y < 3 ? 0.25 : (y > 6 && y < 62) ? 0.32 : 0.9); }
  const R = 112, pos = [], uv = [], idx = [];
  // costura atrás (θ = -π/2 ⇒ -z)
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j], a = handleA(y), b = a * handleKb(y);
    for (let k = 0; k <= R; k++) {
      const th = -Math.PI / 2 + k / R * Math.PI * 2;
      let [x, z] = sePt(a, b, th);
      const bump = ribBump(y, th); if (bump && a > 0) { const kk = (Math.hypot(x, z) + bump) / Math.max(1e-6, Math.hypot(x, z)); x *= kk; z *= kk; }
      pos.push(x * MM, y * MM, z * MM); uv.push(k / R, y / 157);
    }
  }
  for (let j = 0; j < ys.length - 1; j++) for (let k = 0; k < R; k++) { const a = j * (R + 1) + k, b = a + R + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let j = 0; j < ys.length; j++) { const a = j * (R + 1), b = a + R; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  // fecha o fundo com normal para baixo
  for (let k = 0; k <= R; k++) n.setXYZ(k, 0, -1, 0);
  return g;
}
// placa frontal (patch conformado à superfície frontal da empunhadura)
function panelGeometry(x0, x1, y0, y1) {
  const NX = 40, NY = 56, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const y = y0 + (y1 - y0) * j / NY, a = handleA(y), b = a * handleKb(y);
    for (let i = 0; i <= NX; i++) {
      const X = x0 + (x1 - x0) * i / NX, t = Math.min(0.999, Math.abs(X / a));
      const z = b * Math.pow(1 - Math.pow(t, SE), 1 / SE);
      pos.push(X * MM, y * MM, z * MM); uv.push(i / NX, j / NY);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) + n.getX(i) * 0.00012, p.getY(i) + n.getY(i) * 0.00012, p.getZ(i) + n.getZ(i) * 0.00012); }
  return g;
}

export function buildProbe(M) {
  const group = new THREE.Group(); group.name = 'sonda';
  const handle = mesh(handleGeometry(), M.rubber, 'sonda_empunhadura'); group.add(handle);
  const pt = TX.probePanelTextures();
  const panelMat = new THREE.MeshPhysicalMaterial({ map: pt.map, emissiveMap: pt.emissive, emissive: 0x000000, emissiveIntensity: 1, transparent: true, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const panel = mesh(panelGeometry(-15, 15, 86, 126), panelMat, 'sonda_painel'); panel.userData.noShadow = true; group.add(panel);
  // saída inferior (espigão para a linha de amostra)
  const outP = [[0, 1.2], [3.6, 1.2], [3.6, 0], [2.6, -0.5], [2.6, -2.5], [3.2, -3.0], [2.5, -6.0], [3.1, -6.4], [2.4, -9.0], [1.0, -9.2], [1.0, -6]];
  group.add(mesh(lathe(outP, 48, 0.3), M.black));
  const outlet = new THREE.Object3D(); outlet.position.set(0, -0.0092, 0); group.add(outlet);
  // conexão de latão recartilhada + filtro em linha transparente
  const brassKn = (y0, h, r) => { const g = new THREE.CylinderGeometry(r * MM, r * MM, h * MM, 64, 1, false); const m = mesh(g, M.brass); m.position.y = (y0 + h / 2) * MM; return m; };
  group.add(brassKn(155.5, 5, 4.9));
  const filt = [[3.0, 160.2], [10.2, 160.4], [10.9, 161.2], [10.9, 168.6], [10.0, 169.6], [8.9, 170.6], [8.8, 194.6], [8.1, 196.6], [5.6, 198.4], [3.0, 198.8]];
  const fg = lathe(filt, 96, 0.4);
  { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) / MM, z = p.getZ(i), r = Math.hypot(x, z) / MM; if (r > 10.5 && y > 161.3 && y < 168.4) { const a = Math.atan2(x, z), f = Math.pow(Math.abs(Math.cos(a * 9)), 6) * 0.55; const k = (r + f) / r; p.setX(i, x * k); p.setZ(i, z * k); } } fg.computeVertexNormals(); }
  const filter = mesh(fg, M.clearPC, 'sonda_filtro'); filter.userData.noShadow = true; group.add(filter);
  const el = mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.017, 48), M.filterEl); el.position.y = 0.1835; group.add(el);
  const tube = mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.036, 16), M.clearPC); tube.position.y = 0.179; group.add(tube);
  group.add(brassKn(198.6, 6.2, 4.7));
  // haste telescópica (3 segmentos) + ponta perfurada
  const segA = mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.148, 24), M.steel); segA.position.y = 0.2048 + 0.074; group.add(segA);
  const lipA = mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 24), M.chrome); lipA.position.y = 0.2048 + 0.147; group.add(lipA);
  const segB = new THREE.Group(); group.add(segB);
  const b1 = mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.150, 20), M.steel); b1.position.y = 0.2068 + 0.075; segB.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.0018, 20), M.chrome); b2.position.y = 0.2068 + 0.1491; segB.add(b2);
  const segC = new THREE.Group(); group.add(segC);
  const c1 = mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.150, 16), M.steel); c1.position.y = 0.2088 + 0.075; segC.add(c1);
  const tipP = [[1.3, 0], [1.9, 0.3], [1.9, 2.8], [2.5, 3.6], [3.4, 5.8], [4.1, 8.6], [4.25, 10.2], [4.0, 11.8], [3.2, 13.3], [2.9, 13.8]];
  for (let y = 13.8; y < 20.8; y += 1.4) tipP.push([2.55, y + 0.35], [2.55, y + 0.7], [2.95, y + 1.05], [2.95, y + 1.4]);
  tipP.push([2.6, 21.6], [1.6, 22.3], [0, 22.5]);
  const tg = lathe(tipP, 64, 0.25);
  const tip = mesh(tg, M.chrome, 'sonda_ponta'); tip.position.y = 0.2088 + 0.150; segC.add(tip);
  // furos da ponta (pequenos discos escuros sobre o bulbo)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; const h = mesh(new THREE.CircleGeometry(0.00062, 14), M.hole); const r = 0.00418; h.position.set(Math.sin(a) * r, 0.0098, Math.cos(a) * r); h.lookAt(new THREE.Vector3(Math.sin(a) * 2 * r, 0.0098, Math.cos(a) * 2 * r)); tip.add(h); }
  // LEDs (pontos de luz reais para o bloom)
  group.traverse((o) => { o.userData.action = 'probe'; }); group.userData.action = 'probe';
  const EXT = 0.13;
  function setExtension(e) { segB.position.y = e * EXT; segC.position.y = e * 2 * EXT; }
  const lenAt = (e) => 0.2088 + 0.150 + 0.0225 + e * 2 * EXT; // comprimento total (base da empunhadura → ponta)
  return { group, outlet, panelMat, setExtension, lenAt, setLeds(on) { panelMat.emissive.setRGB(0.25 * on, 1.6 * on, 0.45 * on); } };
}

// ---------------------------------------------------------------- adaptador/copo de calibração (opcional)
export function buildCalCup(M) {
  const group = new THREE.Group(); group.name = 'adaptador';
  const P = [[15.4, 2], [15.4, 0.4], [16.0, 0], [17.8, 0], [18.4, 0.8], [18.4, 14.0], [17.6, 16.6], [15.4, 18.0], [5.0, 18.6], [4.0, 18.8], [4.0, 20.5], [3.0, 21.0], [3.7, 24.0], [3.0, 24.4], [3.7, 27.4], [2.6, 28.2], [1.2, 28.2], [1.2, 24]];
  group.add(mesh(lathe(P, 96, 0.4), M.abs, 'adaptador_corpo'));
  const ring = mesh(new THREE.TorusGeometry(0.0165, 0.0011, 12, 96), M.knobPlain); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0015; group.add(ring);
  return { group };
}
