// Agente CARCAÇA — campos de distância (mm) de cada peça do detector. Origem: centro da base, frente +z, cima +y.
// Medidas tiradas da foto refs/ref1_maxxt2.png (escala ≈7,33 px/mm, guinada ≈23°).
import { sdRRect, extrude, sdRBox, sdRCylZ, smin, smax, mix, smoothstep, clamp } from './device_sdf.js';

export const D = {
  H: 131, ZB: -18, ZF: 24.5,               // corpo de borracha: costas / frente
  hwUp: 33.4, hwLo: 32.2,                     // meia-largura (parte de cima / de baixo)
  bez: { hx: 24.0, y0: 74.4, y1: 121.6, rT: 3.0, rB: 6.5, z: 24.0 },
  lcd: { hx: 21.0, y0: 83.0, y1: 120.5, r: 1.6, z: 22.35 },
  cover: { hx: 28.3, y0: 1.5, y1: 55.7, rT: 3.5, rB: 7.0, zf: 25.8 },
  arcC: [0, 30.6], arcR: 22.4,
  siren: { x: -14.2, y: 64.2, hx: 6.0, hy: 3.3, hole: [-15.6, 63.9] },
  btnR: { x: 15.0, y: 65.0, hx: 6.3, hy: 3.7 },
  btn: { x: 15.25, y: 65.0, hx: 4.85, hy: 2.45 },
  screw: [0, 3.7],
  win: { yc: 101.6, hy: 21.2, zc: 5.2, hz: 12.2, r: 5.5 },
  lens: { hx: 24.4, y0: 123.2, z0: -12.0 },
  inlet: { y: 13.0, z: -5.5 },
};

const hwAt = (y) => mix(D.hwLo, D.hwUp, smoothstep(55, 73, y));
// retângulo arredondado com raios distintos em cima/baixo
function rr2(x, y, hx, y0, y1, rT, rB) {
  const yc = (y0 + y1) / 2, hy = (y1 - y0) / 2;
  return sdRRect(x, y - yc, hx, hy, y > yc ? rT : rB);
}

export function bootOuter(x, y, z) {
  const hw = hwAt(y);
  const d2 = sdRRect(x, y - 65.5, hw, 65.5, y > 65.5 ? 10.5 : 10.0);
  return extrude(d2, z, D.ZB, D.ZF, 6.8, 5.6);
}
// região da lente superior (envolve a aresta superior frontal)
export function lensRegion(x, y, z) {
  const hx = D.lens.hx + 2.2 * smoothstep(22, 2, z);   // mais larga sobre o topo, estreita na frente (orelhas)
  return sdRBox(x, y - (D.lens.y0 + 10), z - (D.lens.z0 + 21), hx, 10, 21, 2.6);
}
export function winRegion(x, y, z) {
  const d2 = sdRRect(z - D.win.zc, y - D.win.yc, D.win.hz, D.win.hy, D.win.r);
  return Math.max(d2, 29 - Math.abs(x));
}
export const bez2D = (x, y) => rr2(x, y, D.bez.hx, D.bez.y0, D.bez.y1, D.bez.rT, D.bez.rB);
export const lcd2D = (x, y) => sdRRect(x, y - (D.lcd.y0 + D.lcd.y1) / 2, D.lcd.hx, (D.lcd.y1 - D.lcd.y0) / 2, D.lcd.r);
export const cover2D = (x, y) => rr2(x, y, D.cover.hx, D.cover.y0, D.cover.y1, D.cover.rT, D.cover.rB);

// ---------------- capa de borracha ----------------
export function boot(x, y, z) {
  const o = bootOuter(x, y, z);
  let d = o;
  const ax = Math.abs(x);
  // nervuras horizontais nas laterais inferiores (8)
  if (y < 52 && ax > 28 && z < 12) {
    let r = 1e9;
    for (let i = 0; i < 8; i++) {
      const yi = 13.6 + i * 4.75;
      if (Math.abs(y - yi) > 3) continue;
      r = Math.min(r, sdRBox(ax - D.hwLo + 0.2, y - yi, z + 3.6, 0.62, 0.6, 11.2, 0.58));
    }
    d = smin(d, r, 0.45);
  }
  // ressalto traseiro do clipe
  if (z < -14 && y > 92 && ax < 18) d = smin(d, sdRBox(x, y - 109, z - D.ZB, 12.5, 10, 2.6, 2.2), 1.2);
  // ressalto da entrada da bomba (lateral direita)
  if (x > 24 && y < 24 && z > -14 && z < 3) {
    const b = sdRCylZ(z - D.inlet.z, y - D.inlet.y, x - (D.hwLo - 0.6), 4.4, 2.4, 1.2);
    d = smin(d, b, 1.0);
  }
  // bolsão da lente superior (3 mm de casca)
  if (y > 118) {
    const S = Math.max(lensRegion(x, y, z), -o - 3.0);
    d = smax(d, -S, 0.5);
  }
  // bolsões das janelas laterais
  if (ax > 24 && y > 72 && y < 130) {
    const S = Math.max(winRegion(x, y, z), -o - 2.8);
    d = smax(d, -S, 0.6);
  }
  if (z > 15) {
    // recesso da moldura do LCD
    if (y > 68 && ax < 30) d = smax(d, -Math.max(bez2D(x, y) + 0.05, 20.8 - z), 0.7);
    // recesso da sirene e do botão
    if (y > 57 && y < 72) {
      const s = sdRRect(x - D.siren.x, y - D.siren.y, D.siren.hx, D.siren.hy, 2.4);
      d = smax(d, -Math.max(s, D.ZF - 0.7 - z), 0.75);
      const b = sdRRect(x - D.btnR.x, y - D.btnR.y, D.btnR.hx, D.btnR.hy, 2.2);
      d = smax(d, -Math.max(b, D.ZF - 1.6 - z), 0.6);
    }
    // bolsão da tampa frontal
    if (y < 60) d = smax(d, -Math.max(cover2D(x, y) - 0.55, 19.8 - z), 0.2);
  }
  // recesso traseiro raso da etiqueta
  if (z < -15 && y < 96 && y > 6) d = smax(d, -Math.max(sdRRect(x, y - 50, 25.2, 41.5, 4), z - (D.ZB + 0.5)), 0.4);
  // recesso dos contatos de carga
  if (z < -15 && y < 16) d = smax(d, -Math.max(sdRRect(x, y - 10.2, 8.4, 2.6, 1.6), z - (D.ZB + 1.2)), 0.3);
  return d;
}

// ---------------- lente superior / janelas ----------------
export function lens(x, y, z) {        // casca translúcida (~1,3 mm)
  if (y < 116) return 10;
  const o = bootOuter(x, y, z);
  return Math.max(o + 0.45, lensRegion(x, y, z) + 0.28, -o - 1.75);
}
export function lensGuide(x, y, z) {   // guia de luz interno (difusor branco) atrás da casca
  if (y < 116) return 10;
  const o = bootOuter(x, y, z);
  return Math.max(o + 1.95, lensRegion(x, y, z) + 0.95, -o - 3.0);
}
export function windowR(x, y, z) {  // janela lateral (|x|: espelhada) — casca translúcida
  if (Math.abs(x) < 24) return 10;
  const o = bootOuter(x, y, z);
  return Math.max(o + 0.75, winRegion(x, y, z) + 0.35, -o - 2.0);
}
export function windowGuide(x, y, z) {
  if (Math.abs(x) < 24) return 10;
  const o = bootOuter(x, y, z);
  return Math.max(o + 2.15, winRegion(x, y, z) + 0.95, -o - 2.8);
}

// ---------------- moldura do LCD (lente preta) ----------------
export function bezel(x, y, z) {
  const slab = extrude(bez2D(x, y) + 0.32, z, 21.0, D.bez.z, 0.5, 0.75);
  const win = lcd2D(x, y) - Math.max(0, z - D.lcd.z) * 0.35;
  return smax(slab, -Math.max(win, D.lcd.z - 0.4 - z), 0.25);
}

// ---------------- tampa frontal ----------------
export function cover(x, y, z) {
  let d = extrude(cover2D(x, y), z, 20.4, D.cover.zf, 1.0, 1.35);
  if (z > D.cover.zf - 3) {
    const cx = x - D.arcC[0], cy = y - D.arcC[1];
    const r = Math.hypot(cx, cy), a = Math.atan2(cy, cx);
    for (let q = 0; q < 4; q++) {
      const th = Math.PI / 4 + q * Math.PI / 2;
      let da = a - th; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 0.6) continue;
      const del = 0.2;
      let g;
      if (Math.abs(da) < del) g = Math.abs(r - D.arcR) - 0.33;
      else {
        const e = th + Math.sign(da) * del;
        g = Math.hypot(cx - Math.cos(e) * D.arcR, cy - Math.sin(e) * D.arcR) - 0.33;
      }
      d = smax(d, -Math.max(g, D.cover.zf - 0.45 - z), 0.12);
      // furinho de difusão (fora do arco)
      const ea = th + 0.09, rr = D.arcR + 2.4;
      const hole = Math.hypot(cx - Math.cos(ea) * rr, cy - Math.sin(ea) * rr) - 0.55;
      d = smax(d, -Math.max(hole, D.cover.zf - 2 - z), 0.1);
    }
  }
  // entalhe do parafuso
  const sc = Math.hypot(x - D.screw[0], y - D.screw[1]) - 3.35;
  d = smax(d, -sc, 0.35);
  return d;
}

// ---------------- botão ----------------
export function button(x, y, z) {
  const zt = D.ZF - 0.3;
  const dome = 0.1 * (1 - Math.min(1, (x * x) / 24 + (y * y) / 6.5));
  return extrude(sdRRect(x, y, D.btn.hx, D.btn.hy, 0.9), z, zt - 3, zt + dome, 0.3, 0.45);
}

// ---------------- parafuso Phillips (local: eixo z, cabeça para +z, centro da face em 0) ----------------
export function screw(x, y, z) {
  const r = Math.hypot(x, y);
  // cabeça panela abaulada
  let d = sdRCylZ(x, y, z + 0.55, 2.25, 0.55, 0.42);
  const dome = Math.sqrt(Math.max(0, 1 - (r / 2.6) ** 2)) * 0.55;
  d = smin(d, Math.max(r - 2.1, z - dome - 0.05), 0.25);
  // fenda Phillips (cruz com centro cônico)
  const w = 0.26, L = 1.45;
  const c1 = Math.max(Math.abs(x) - w, Math.abs(y) - L), c2 = Math.max(Math.abs(y) - w, Math.abs(x) - L);
  const cr = Math.min(c1, c2);
  const depth = 0.75 - r * 0.25;
  d = smax(d, -Math.max(cr, (dome - depth) - z), 0.08);
  d = smax(d, -Math.max(r - 0.55 + (z - dome) * 0.5, -10), 0.06);
  return d;
}

// ---------------- clipe jacaré (aço inox) ----------------
const clipZ = (y) => {
  let z = -24.0;
  if (y < 44) z -= ((44 - y) ** 2) * 0.0105;     // ponta levantada
  if (y > 104) z += (y - 104) * 0.36;             // dobra até a articulação
  return z;
};
export function clip(x, y, z) {
  // placa
  const yc = 78.5, hy = 46.5;
  let d2 = sdRRect(x, y - yc, 11.2 - smoothstep(60, 34, y) * 1.4, hy, 5.0);
  const zc = clipZ(y) - smoothstep(4.5, 1.5, Math.abs(x)) * 0.55 * smoothstep(42, 50, y) * smoothstep(100, 92, y);
  const rb = 0.35;                                   // bisel das arestas da chapa
  const dz = (Math.abs(z - zc) - 0.6 + rb) * 0.92, dx = d2 + rb;
  let d = Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) - rb;
  // articulação (barril + mola)
  const barrel = Math.max(Math.abs(x) - 9.8, Math.hypot(y - 116.5, z + 21.6) - 2.5);
  d = smin(d, barrel - 0.0, 0.6);
  // orelhas da base (fixadas no corpo)
  for (const s of [-1, 1]) {
    const ear = sdRBox(x - s * 10.9, y - 115.5, z + 20.0, 1.0, 3.6, 2.6, 0.6);
    d = Math.min(d, ear);
  }
  return d;
}
