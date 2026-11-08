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
    color: new THREE.Color('#F8CF00'), roughness: 0.55, clearcoat: 0.28, clearcoatRoughness: 0.36,
    sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#fff2a8'), vertexColors: true,
  }), { bump: 0.32, grain: 2300, tone: 0.045 });
  const hardYellow = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#F9D100'), roughness: 0.44, clearcoat: 0.32, clearcoatRoughness: 0.32, vertexColors: true,
  }), { bump: 0.12, grain: 3600, tone: 0.03 });
  const bezelMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0c0d'), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, vertexColors: true,
  });
  const lensMat = patchLedMask(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f0f4e2'), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, vertexColors: true,
    emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 1, sheen: 0.4, sheenColor: new THREE.Color('#f6ffe0'), sheenRoughness: 0.4,
  }));
  const winMat = patchLedMask(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f1f3ee'), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, vertexColors: true,
    emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 1, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.35,
  }));
  const btnMat = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#7398e2'), roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.4, vertexColors: true,
  }), { bump: 0.2, grain: 2600, tone: 0.03 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ececee'), metalness: 1, roughness: 0.13, vertexColors: true });
  const steel = patchSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dfe1e4'), metalness: 1, roughness: 0.2, vertexColors: true,
  }), { bump: 0.18, grain: 3000, tone: 0.04, brush: 0.75 });
  const black = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#151516'), roughness: 0.5, clearcoat: 0.2 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const amber = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#4a3418'), roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.92 });
  const gold = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d9ae55'), metalness: 1, roughness: 0.22 });

  // ---------------- capa de borracha ----------------
  const bootMesh = sdfMesh(S.boot, [-36, 0, -21], [36, 131.5, 25], 0.45, rubber, warmAO([0.5, 0.33, 0.1]));
  bootMesh.name = 'boot'; model.add(bootMesh);

  // ---------------- lente superior e janelas laterais (leitosas, com LEDs) ----------------
  const ledAttr = (fn) => (g, m) => {
    const n = m.nv, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    g.setAttribute('ledMask', new THREE.BufferAttribute(a, 1));
  };
  const lensMesh = sdfMesh(S.lens, [-29, 118, -13], [29, 131.5, 25], 0.32, lensMat,
    (a, x, y, z) => { const t = 0.75 + 0.25 * a; const v = 0.97 - 0.08 * Math.exp(-((x / 9) ** 2)) * smoothstep(-6, 10, z); return [v * t, v * t, v * t * 0.97]; },
    { aoScale: 0.6 }, ledAttr((x, y, z) => 0.35 + 0.65 * Math.exp(-((x / 15) ** 2)) * (0.6 + 0.4 * smoothstep(-10, 20, z))));
  lensMesh.name = 'topLens'; model.add(lensMesh);
  const winLED = [90, 101.5, 113];
  const winMesh = sdfMesh(S.windowR, [-36, 78, -7], [36, 124, 17], 0.3, winMat,
    (a, x, y, z) => {
      let blob = 0; for (const yl of winLED) blob += Math.exp(-(((y - yl) / 4.2) ** 2) - (((z - 5) / 5.5) ** 2));
      const edge = smoothstep(0, 4, Math.min(y - 80.5, 122.7 - y, z + 5, 16 - z));
      const v = (0.9 - 0.13 * blob) * (0.86 + 0.14 * edge);
      const t = 0.6 + 0.4 * a; return [v * t, v * t, v * t];
    },
    { aoScale: 0.6 }, ledAttr((x, y, z) => { let b = 0.25; for (const yl of winLED) b += 0.75 * Math.exp(-(((y - yl) / 7) ** 2)); return Math.min(1.2, b); }));
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
    roughness: 0.62, metalness: 0,
  });
  if (lcdTexture) { lcdTexture.anisotropy = 8; lcdTexture.wrapS = lcdTexture.wrapT = THREE.ClampToEdgeWrapping; }
  const lcdMesh = new THREE.Mesh(lcdGeo, lcdMat);
  lcdMesh.position.set(0, lyc, D.lcd.z); lcdMesh.receiveShadow = true; lcdMesh.name = 'lcd';
  model.add(lcdMesh);

  // vidro: camada só de reflexo (aditiva) — reflexo de softbox sem escurecer o LCD
  const gr = (D.bez.z - D.lcd.z) * 0.35;
  const glassShape = roundRectShape(D.lcd.hx + gr, (lh / 2) + gr, D.lcd.r + gr);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 12), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 0, ior: 1.5, specularIntensity: 1,
    transparent: true, depthWrite: false,
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
  const coverMesh = sdfMesh(S.cover, [-29, 0.5, 20], [29, 56.5, 26.2], 0.24, hardYellow, warmAO([0.48, 0.32, 0.1]));
  coverMesh.name = 'frontCover'; model.add(coverMesh);
  const pocket = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 3.2, 40), amber);
  pocket.rotation.x = Math.PI / 2; pocket.position.set(D.screw[0], D.screw[1], 22.6); model.add(pocket);
  const screw = sdfMesh(S.screw, [-2.8, -2.8, -1.3], [2.8, 2.8, 0.8], 0.07, chrome, warmAO([0.2, 0.2, 0.22]), { aoScale: 0.7, ao: [[0.15, 1], [0.35, 0.6], [0.7, 0.3]] });
  screw.position.set(D.screw[0], D.screw[1], 24.6); screw.rotation.z = 0.35; screw.name = 'screw'; model.add(screw);

  // ---------------- traseira: clipe, etiqueta, contatos ----------------
  const clip = sdfMesh(S.clip, [-12.5, 30, -26.5], [12.5, 124, -17], 0.24, steel, warmAO([0.35, 0.35, 0.36]), { aoScale: 0.8 });
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
  const GREEN = new THREE.Color(0.62, 1.0, 0.14), RED = new THREE.Color(1.0, 0.018, 0.004);
  const tmp = new THREE.Color();
  const LENS_C = lensMat.color.clone(), WIN_C = winMat.color.clone(), RED_DIFF = new THREE.Color(0.95, 0.06, 0.04);
  const BASE_GLOW = new THREE.Color(0.075, 0.078, 0.07);   // 'subsuperfície' falsa do plástico leitoso
  let vib = 0;
  const btnZ0 = 0;
  const dev = {
    group, button, inletAnchor, lcdMesh, model,
    setButton(p) { button.position.z = btnZ0 - (p ? 1.0 : 0); },
    setLeds({ red = 0, green = 0 } = {}) {
      tmp.setRGB(GREEN.r * green + RED.r * red, GREEN.g * green + RED.g * red, GREEN.b * green + RED.b * red);
      lensMat.emissive.setRGB(GREEN.r * green * 3 + RED.r * red * 2.6, GREEN.g * green * 3 + RED.g * red * 2.6, GREEN.b * green * 3 + RED.b * red * 2.6).add(BASE_GLOW);
      // barras laterais: na foto ficam leitosas no IntelliFlash (verde fraco); vermelho forte em alarme
      winMat.emissive.setRGB(GREEN.r * green * 0.35 + RED.r * red * 2.2, GREEN.g * green * 0.35 + RED.g * red * 2.2,
        GREEN.b * green * 0.35 + RED.b * red * 2.2).add(BASE_GLOW);
      // luz vermelha espalhada dentro do plástico leitoso: a própria cor difusa avermelha
      lensMat.color.copy(LENS_C).lerp(RED_DIFF, Math.min(1, red) * 0.85);
      winMat.color.copy(WIN_C).lerp(RED_DIFF, Math.min(1, red) * 0.85);
      const k = Math.max(red, green);
      ledLight.color.copy(tmp).multiplyScalar(1 / Math.max(1e-3, k));
      ledLight.intensity = k * 0.05;
    },
    setBacklight(b) { lcdMat.emissiveIntensity = Math.max(0, Math.min(1, b)) * 0.95; },
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
