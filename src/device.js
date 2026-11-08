// Agente CARCAÇA — detector multigás amarelo (tipo GasAlertMax XT II), 131 × 70 × 52 mm.
// Origem: centro da base; frente +z; cima +y. Toda a geometria orgânica vem de campos de distância (device_shapes.js)
// malhados por surface nets (device_sdf.js), com normais do gradiente e oclusão ambiente assada por vértice.
import * as THREE from 'three';
import { meshSDF, smoothstep } from './device_sdf.js';
import * as S from './device_shapes.js';
import { patchSurface, patchLedMask, makeModelLabel, makeBackLabel } from './device_tex.js';

const D = S.D;

function toGeometry(m, tint, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  if (tint) {
    const n = m.nv, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = m.ao[i];
      const c = tint(a, m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (extra) extra(g, m);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
const warmAO = (dark) => (a) => { const t = Math.pow(a, 1.15); return [dark[0] + (1 - dark[0]) * t, dark[1] + (1 - dark[1]) * t, dark[2] + (1 - dark[2]) * t]; };

function sdfMesh(f, min, max, h, mat, tint, opts, extra) {
  const m = meshSDF(f, min, max, h, opts);
  const mesh = new THREE.Mesh(toGeometry(m, tint, extra), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function buildDevice({ lcdTexture }) {
  const t0 = performance.now();
  const group = new THREE.Group(); group.name = 'device';
  const model = new THREE.Group(); model.scale.setScalar(0.001); group.add(model);

  // ---------------- materiais ----------------
  const rubber = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#F2C500'), roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 1.15,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffd23a'), vertexColors: true,
  }), { bump: 0.55, grain: 2000, tone: 0.07 });
  const hardYellow = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#F6CB00'), roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.15, vertexColors: true,
  }), { bump: 0.12, grain: 3600, tone: 0.04 });
  const bezelMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0c0d'), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, vertexColors: true,
  });
  // casca leitosa translúcida (transmissão + atenuação verde-azulada) sobre um guia de luz difusor com faixas
  const milky = (c) => patchLedMask(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(c), roughness: 0.3, transmission: 0.72, thickness: 1.4, ior: 1.49,
    attenuationColor: new THREE.Color('#cfeee2'), attenuationDistance: 4.0, clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 1, vertexColors: true,
  }));
  const guide = () => patchLedMask(new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'), roughness: 0.85, vertexColors: true, emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 1,
  }));
  const lensMat = milky('#f4f7ea'), winMat = milky('#f6f7f3');
  const lensGuideMat = guide(), winGuideMat = guide();
  const btnMat = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#7398e2'), roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.4, vertexColors: true,
  }), { bump: 0.2, grain: 2600, tone: 0.03 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ececee'), metalness: 1, roughness: 0.1, vertexColors: true });
  const anisoTex = new THREE.DataTexture(new Uint8Array([255, 128, 255, 255]), 1, 1); anisoTex.needsUpdate = true;
  const steel = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d9dbde'), metalness: 1, roughness: 0.25, anisotropy: 0.6, anisotropyMap: anisoTex, vertexColors: true,
  }), { bump: 0.22, grain: 2600, tone: 0.06, brush: 0.9 });
  const black = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#141414'), roughness: 0.4, clearcoat: 0.2 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const amber = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#4a3418'), roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.92 });
  const gold = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d9ae55'), metalness: 1, roughness: 0.22 });

  // ---------------- capa de borracha ----------------
  const bootMesh = sdfMesh(S.boot, [-36, 0, -21], [36, 131.5, 25], 0.45, rubber, warmAO([0.4, 0.2, 0.03]), { aoScale: 1.25 });
  bootMesh.name = 'boot'; model.add(bootMesh);

  // ---------------- lente superior e janelas laterais (leitosas, com LEDs) ----------------
  const ledAttr = (fn) => (g, m) => {
    const n = m.nv, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    g.setAttribute('ledMask', new THREE.BufferAttribute(a, 1));
  };
  const gauss = (v, w) => Math.exp(-((v / w) ** 2));
  const lensLED = [-11, 0, 11];
  const lensMask = (x, y, z) => { let b = 0.1; for (const xl of lensLED) b += 0.9 * gauss(x - xl, 5.5) * (0.55 + 0.45 * smoothstep(-10, 18, z));
    return Math.min(1.3, b) * (0.35 + 0.65 * smoothstep(D.lens.hx + 2.2, D.lens.hx - 3, Math.abs(x))); };
  // faixas claro/escuro do guia de luz (prismas internos)
  const stripes = (u) => 0.62 + 0.38 * (0.5 + 0.5 * Math.cos(u * 1.6)) ** 2;
  const lensMesh = sdfMesh(S.lens, [-29, 118, -13], [29, 131.5, 25], 0.32, lensMat,
    (a) => { const t = 0.8 + 0.2 * a; return [t, t, t]; }, { aoScale: 0.4 }, ledAttr(lensMask));
  lensMesh.name = 'topLens'; model.add(lensMesh);
  const lensGuide = sdfMesh(S.lensGuide, [-29, 116, -14], [29, 131, 25], 0.36, lensGuideMat,
    (a, x, y, z) => { const v = stripes(x) * (0.75 + 0.25 * a) * (0.92 - 0.12 * gauss(z + 4, 8)); return [v, v, v * 0.97]; },
    { aoScale: 0.8 }, ledAttr(lensMask));
  lensGuide.castShadow = false; model.add(lensGuide);
  const winLED = [90, 101.5, 113];
  const winMask = (x, y, z) => { let b = 0.08; for (const yl of winLED) b += 0.92 * gauss(y - yl, 4.5) * gauss(z - 5, 9);
    return Math.min(1.3, b); };
  const winMesh = sdfMesh(S.windowR, [-36, 78, -7], [36, 124, 18], 0.3, winMat,
    (a) => { const t = 0.8 + 0.2 * a; return [t, t, t]; }, { aoScale: 0.4 }, ledAttr(winMask));
  const winGuide = sdfMesh(S.windowGuide, [-36, 78, -8], [36, 124, 18], 0.34, winGuideMat,
    (a, x, y, z) => {
      // LEDs SMD (chips) + refletor: quadradinhos escuros com centro claro, sobre faixas do guia
      let chip = 0, core = 0;
      for (const yl of winLED) { const q = Math.max(Math.abs(y - yl), Math.abs(z - 5) * 0.9); chip = Math.max(chip, smoothstep(2.4, 1.8, q)); core = Math.max(core, smoothstep(1.0, 0.5, q)); }
      const v = stripes(z * 1.15) * (0.7 + 0.3 * a) * (1 - 0.55 * chip + 0.5 * core); return [v, v, v * 0.97];
    }, { aoScale: 0.8 }, ledAttr(winMask));
  winGuide.castShadow = false; model.add(winGuide);
  winMesh.name = 'sideWindows'; model.add(winMesh);

  // ---------------- moldura preta + vidro + LCD ----------------
  const bezelMesh = sdfMesh(S.bezel, [-25.5, 73, 20.5], [25.5, 123, 24.5], 0.26, bezelMat, warmAO([0.25, 0.25, 0.25]));
  bezelMesh.name = 'bezel'; model.add(bezelMesh);

  const lw = D.lcd.hx * 2, lh = D.lcd.y1 - D.lcd.y0, lyc = (D.lcd.y0 + D.lcd.y1) / 2;
  const lcdGeo = new THREE.PlaneGeometry(lw + 1.2, lh + 1.2);
  { const uv = lcdGeo.attributes.uv, p = lcdGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + p.getX(i) / lw, 0.5 + p.getY(i) / lh); }
  const lcdMat = new THREE.MeshStandardMaterial({
    map: lcdTexture, emissiveMap: lcdTexture, emissive: new THREE.Color('#c6ec7e'), emissiveIntensity: 0,
    roughness: 0.62, metalness: 0, envMapIntensity: 0.3,   // segmentos pretos: reflexo fica só no vidro
  });
  if (lcdTexture) { lcdTexture.anisotropy = 8; lcdTexture.wrapS = lcdTexture.wrapT = THREE.ClampToEdgeWrapping; }
  const lcdMesh = new THREE.Mesh(lcdGeo, lcdMat);
  lcdMesh.position.set(0, lyc, D.lcd.z); lcdMesh.receiveShadow = true; lcdMesh.name = 'lcd';
  model.add(lcdMesh);

  // vidro: camada só de reflexo (aditiva) — reflexo de softbox sem escurecer o LCD
  const gr = (D.bez.z - D.lcd.z) * 0.35;
  const glassShape = roundRectShape(D.lcd.hx + gr, (lh / 2) + gr, D.lcd.r + gr);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 12), new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.045, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5,
    transparent: true, opacity: 0.06, depthWrite: false, alphaMap: glassStreak(),
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  glass.position.set(0, lyc, D.bez.z + 0.01); glass.renderOrder = 2; glass.name = 'lcdGlass';
  model.add(glass);
  // véu interno: escurece levemente as bordas do LCD (sombra da parede do recesso)
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({
    map: edgeVignette(), transparent: true, depthWrite: false, toneMapped: false,
  }));
  veil.position.set(0, lyc, D.lcd.z + 0.05); veil.renderOrder = 1; model.add(veil);

  // etiqueta do modelo
  const lab = makeModelLabel();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(lab.w, lab.h), new THREE.MeshPhysicalMaterial({
    map: lab.texture, transparent: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  label.position.set(0, lab.cy, D.bez.z + 0.012); label.name = 'modelLabel'; model.add(label);

  // ---------------- sirene e botão ----------------
  const holeCap = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ map: holeTex(), transparent: true, depthWrite: false }));
  holeCap.position.set(D.siren.hole[0], D.siren.hole[1], D.ZF - 0.7 + 0.03); holeCap.renderOrder = 1; model.add(holeCap);
  const button = sdfMesh(S.button, [-5.5, -3, 20], [5.5, 3, 25], 0.12, btnMat, warmAO([0.35, 0.38, 0.45]), { aoScale: 0.5 });
  button.position.set(D.btn.x, D.btn.y, 0); button.userData.action = 'button'; button.name = 'button';
  model.add(button);

  // ---------------- tampa frontal + parafuso ----------------
  const coverMesh = sdfMesh(S.cover, [-29, 0.5, 20], [29, 56.5, 26.2], 0.24, hardYellow, warmAO([0.4, 0.22, 0.04]), { aoScale: 1.2 });
  coverMesh.name = 'frontCover'; model.add(coverMesh);
  const pocket = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 3.2, 40), amber);
  pocket.rotation.x = Math.PI / 2; pocket.position.set(D.screw[0], D.screw[1], 22.6); model.add(pocket);
  const screw = sdfMesh(S.screw, [-2.8, -2.8, -1.3], [2.8, 2.8, 0.8], 0.07, chrome, warmAO([0.2, 0.2, 0.22]), { aoScale: 0.7, ao: [[0.15, 1], [0.35, 0.6], [0.7, 0.3]] });
  screw.position.set(D.screw[0], D.screw[1], 24.6); screw.rotation.z = 0.35; screw.name = 'screw'; model.add(screw);

  // ---------------- traseira: clipe, etiqueta, contatos ----------------
  const clip = sdfMesh(S.clip, [-12.5, 30, -26.5], [12.5, 124, -17], 0.22, steel, warmAO([0.35, 0.35, 0.36]), { aoScale: 0.8 },
    (g, m) => { const uv = new Float32Array(m.nv * 2); for (let i = 0; i < m.nv; i++) { uv[i * 2] = m.positions[i * 3 + 1] / 30; uv[i * 2 + 1] = m.positions[i * 3] / 30; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); });
  clip.name = 'clip'; model.add(clip);
  const backLabel = new THREE.Mesh(new THREE.PlaneGeometry(48, 80), new THREE.MeshPhysicalMaterial({
    map: makeBackLabel(), roughness: 0.35, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.2,
  }));
  backLabel.rotation.y = Math.PI; backLabel.position.set(0, 50, D.ZB + 0.5 - 0.03); backLabel.receiveShadow = true;
  model.add(backLabel);
  const insert = new THREE.Mesh(roundedBoxGeo(16.4, 4.8, 0.8, 1.2), black);
  insert.position.set(0, 10.2, D.ZB + 0.6); model.add(insert);
  for (const px of [-4.6, 0, 4.6]) {
    const pad = new THREE.Mesh(roundedBoxGeo(2.6, 2.6, 0.5, 0.3), gold);
    pad.position.set(px, 10.2, D.ZB + 0.25); model.add(pad);
  }

  // ---------------- entrada da bomba (bico com filtro) ----------------
  const inlet = new THREE.Group(); inlet.name = 'inlet'; inlet.userData.action = 'inlet';
  const prof = [[0, 0], [3.7, 0], [3.8, 0.3], [3.8, 0.9], [3.4, 1.0]];
  const capProf = [[0, 4.4], [3.45, 4.4], [3.55, 4.6], [3.55, 5.3], [3.3, 5.5], [1.75, 5.9], [1.55, 6.1], [1.55, 7.0], [1.95, 7.1],
    [1.4, 8.6], [1.4, 8.8], [1.85, 8.9], [1.3, 10.2], [0.75, 10.3], [0.7, 9.0], [0, 9.0]];
  const lathe = (pts, mat, seg = 40) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat); m.castShadow = true; return m; };
  inlet.add(lathe(prof, black));
  inlet.add(lathe(capProf, black));
  const housing = lathe([[3.25, 0.9], [3.35, 1.1], [3.35, 4.3], [3.25, 4.45]], new THREE.MeshPhysicalMaterial({
    color: '#f4f6f0', roughness: 0.15, transmission: 0.0, transparent: true, opacity: 0.45, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
  }));
  inlet.add(housing);
  const filt = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 2.8, 32), patchSurface(new THREE.MeshStandardMaterial({ color: '#fbfbf6', roughness: 0.95 }), { bump: 0.6, grain: 5000, tone: 0.06 }));
  filt.position.y = 2.65; inlet.add(filt);
  inlet.rotation.z = -Math.PI / 2;            // eixo +y → +x
  inlet.position.set(D.hwLo + 1.75, D.inlet.y, D.inlet.z);
  model.add(inlet);
  const inletAnchor = new THREE.Object3D(); inletAnchor.name = 'inletAnchor';
  inletAnchor.position.set(D.hwLo + 1.75 + 10.3, D.inlet.y, D.inlet.z);
  model.add(inletAnchor);

  // ---------------- luz dos LEDs ----------------
  const ledLight = new THREE.PointLight(0x9cff40, 0, 0.12, 2);
  ledLight.position.set(0, 0.134, 0.008); group.add(ledLight);

  // ---------------- API ----------------
  const GREEN = new THREE.Color(0.62, 1.0, 0.14), RED = new THREE.Color('#ff1a0a');
  const tmp = new THREE.Color();
  const BASE_GLOW = new THREE.Color(0.03, 0.032, 0.03);   // luz ambiente que atravessa o difusor
  const setE = (m, g, r) => m.emissive.setRGB(GREEN.r * g + RED.r * r, GREEN.g * g + RED.g * r, GREEN.b * g + RED.b * r).add(BASE_GLOW);
  const RED_DIFF = new THREE.Color(1.0, 0.1, 0.06);
  const MILKY = [lensMat, winMat, lensGuideMat, winGuideMat].map((m) => [m, m.color.clone()]);
  let vib = 0;
  const btnZ0 = 0;
  const dev = {
    group, button, inletAnchor, lcdMesh, model,
    setButton(p) { button.position.z = btnZ0 - (p ? 1.0 : 0); },
    setLeds({ red = 0, green = 0 } = {}) {
      // lente superior: IntelliFlash verde forte (estrela no bloom); barras laterais: verde fraco (leitosas na foto), vermelho forte
      setE(lensMat, green * 3.0, red * 6.0); setE(lensGuideMat, green * 2.2, red * 4.5);
      setE(winMat, green * 0.3, red * 5.0); setE(winGuideMat, green * 0.25, red * 4.0);
      // luz vermelha filtrada pelo plástico leitoso: a cor difusa/transmitida também avermelha (evita "rosa-salmão")
      const rr = Math.min(1, red) * 0.6;
      for (const [m, c] of MILKY) m.color.copy(c).lerp(RED_DIFF, rr);
      const k = Math.max(red, green);
      tmp.setRGB(GREEN.r * green + RED.r * red, GREEN.g * green + RED.g * red, GREEN.b * green + RED.b * red);
      ledLight.color.copy(tmp).multiplyScalar(1 / Math.max(1e-3, Math.max(tmp.r, tmp.g, tmp.b)));
      ledLight.intensity = k * 0.05;
    },
    setBacklight(b) { lcdMat.emissiveIntensity = Math.max(0, Math.min(1, b)) * 0.47; },
    update(dt, { vibrate = false, time = 0 } = {}) {
      vib += ((vibrate ? 1 : 0) - vib) * Math.min(1, (dt || 0.016) * 30);
      if (vib > 0.01) {
        const t = time * 150 * Math.PI * 2;
        const a = 0.0004 * vib;
        model.position.set(Math.sin(t) * a, Math.sin(t * 1.37 + 1.1) * a * 0.35, Math.sin(t * 0.83 + 2.3) * a * 0.5);
        model.rotation.z = Math.sin(t * 1.13) * 0.004 * vib;
      } else { model.position.set(0, 0, 0); model.rotation.z = 0; }
    },
  };
  dev.setLeds({ red: 0, green: 0 });
  group.userData.buildMs = Math.round(performance.now() - t0);
  return dev;
}

function roundRectShape(hx, hy, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hy); s.lineTo(hx - r, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + r);
  s.lineTo(hx, hy - r); s.quadraticCurveTo(hx, hy, hx - r, hy); s.lineTo(-hx + r, hy);
  s.quadraticCurveTo(-hx, hy, -hx, hy - r); s.lineTo(-hx, -hy + r); s.quadraticCurveTo(-hx, -hy, -hx + r, -hy);
  return s;
}
function roundedBoxGeo(w, h, d, r) {
  const g = new THREE.ExtrudeGeometry(roundRectShape(w / 2 - r * 0.5, h / 2 - r * 0.5, r * 0.6), {
    depth: Math.max(0.01, d - r), bevelEnabled: true, bevelThickness: r * 0.5, bevelSize: r * 0.5, bevelSegments: 3, curveSegments: 6,
  });
  g.translate(0, 0, -(d - r) / 2);
  return g;
}
function glassStreak() {   // alphaMap: faixa diagonal sutil onde o reflexo fica mais forte
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const l = g.createLinearGradient(0, 128, 128, 0);
  l.addColorStop(0.0, '#bbbbbb'); l.addColorStop(0.52, '#bbbbbb'); l.addColorStop(0.6, '#ffffff'); l.addColorStop(0.72, '#ffffff'); l.addColorStop(0.8, '#bbbbbb'); l.addColorStop(1, '#bbbbbb');
  g.fillStyle = l; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function holeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(4,3,2,1)'); r.addColorStop(0.62, 'rgba(8,6,3,1)'); r.addColorStop(0.74, 'rgba(70,45,5,0.85)');
  r.addColorStop(0.86, 'rgba(150,100,0,0.35)'); r.addColorStop(1, 'rgba(150,100,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function edgeVignette() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const u = i / 255, v = j / 255;
    const e = Math.min(u, 1 - u) * 42, f = Math.min(v, 1 - v) * 37.5;
    const m = Math.min(e, f);
    const a = Math.max(0, 1 - m / 1.6) ** 1.6 * 0.55 + (v < 0.5 ? 0 : 0);
    const k = (j * 256 + i) * 4;
    img.data[k] = 40; img.data[k + 1] = 34; img.data[k + 2] = 22; img.data[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
