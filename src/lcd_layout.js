// Geometria vetorial dos segmentos/ícones do LCD (coordenadas em px do canvas W×H). Dono: agente DISPLAY.
// Medidas tiradas de refs/ref1_lcd.png e refs/ref1_maxxt2.png (área cinza visível do vidro = canvas inteiro).
export const W = 1344, H = 1200;           // 1,12 : 1
export const FAN_ID = 'fan';

const FONT = '"PT Sans", "Trebuchet MS", "Helvetica Neue", Arial, sans-serif';
// legendas: negrito condensado alto (Arial Narrow / Avenir Next Condensed / Roboto Condensed); sem condensada → escala 0,85
const LFONT = '"Arial Narrow", "Avenir Next Condensed", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
let LCOND = null;
function labelCondense() {
  if (LCOND !== null) return LCOND;
  const c = document.createElement('canvas').getContext('2d');
  c.font = `700 60px ${LFONT}`; const a = c.measureText('H2S ppm CO LEL').width;
  c.font = '700 60px Arial, sans-serif'; const b = c.measureText('H2S ppm CO LEL').width;
  return (LCOND = a / b > 0.92 ? 0.85 : 1);
}

// ---------- dígito ----------
const DH = 214;            // altura do dígito
const DW = 132;            // largura sem inclinação
const SK = Math.tan(4.2 * Math.PI / 180); // inclinação itálica
const PITCH = 172;         // passo entre dígitos
const TV = 16, TH = 17.5;  // espessura vertical / horizontal
const GAP = 4.2, CG = 6;   // folga entre segmentos / corte central das horizontais
const BUMP_W = 22, BUMP_D = 7.5; // "dentes" característicos das horizontais externas
const DIGIT_BOX = DW + DH * SK;

// polígono com cantos arredondados → Path2D
function roundPoly(path, pts, r) {
  const n = pts.length;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  path.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], mq = mid(p, q);
    const prev = pts[(i - 1 + n) % n];
    const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]), l2 = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const rr = Math.min(p[2] ?? r, l1 * 0.45, l2 * 0.45);
    path.arcTo(p[0], p[1], mq[0], mq[1], rr);
  }
  path.closePath();
}

function digitPaths(x0, y0) {
  const w = DW, h = DH, hm = h / 2;
  const T = (pts) => pts.map(([x, y, r]) => [x0 + x + (h - y) * SK, y0 + y, r]);
  const P = (pts, r = 4) => { const p = new Path2D(); roundPoly(p, T(pts), r); return p; };
  const g = GAP;
  const c = w / 2;
  // a1 (metade esquerda superior) com dente no meio da metade
  const bx = (TV + c) / 2 + 2;
  const a1 = [[g * 0.7, 0, 3], [c - CG / 2, 0, 2.5], [c - CG / 2, TH, 2.5], [bx + BUMP_W / 2 + 2, TH, 4], [bx + BUMP_W / 2 - 3, TH + BUMP_D, 7],
    [bx - BUMP_W / 2 + 3, TH + BUMP_D, 7], [bx - BUMP_W / 2 - 2, TH, 4], [TV + g * 0.7, TH, 3]];
  const mx = (pts) => pts.map(([x, y, r]) => [w - x, y, r]).reverse();
  const my = (pts) => pts.map(([x, y, r]) => [x, h - y, r]).reverse();
  const a2 = mx(a1), d1 = my(a1), d2 = my(a2);
  // verticais: trapézio externo + ponta no meio
  const fy0 = TH + g * 0.7, fy1 = hm - g / 2 - TV / 2;
  const f = [[-0.6, g * 0.7, 3], [TV, fy0, 3], [TV + 2.4, (fy0 + fy1) / 2, 60], [TV, fy1, 3], [TV / 2, hm - g / 2, 3.5],
    [-1.2, fy1, 3], [-1.8, (fy0 + fy1) / 2, 60]];
  const b = mx(f), e = my(f), cc = my(b);
  // meio: dois losangos alongados (lente)
  const tg = TH * 1.18;
  const g1 = [[TV / 2 + g * 1.25, hm], [TV / 2 + g * 1.25 + tg / 2, hm - tg / 2], [c - CG / 2 - tg / 2.6, hm - tg / 2],
    [c - CG / 2, hm], [c - CG / 2 - tg / 2.6, hm + tg / 2], [TV / 2 + g * 1.25 + tg / 2, hm + tg / 2]];
  const g2 = mx(g1);
  // ponto decimal (entre este dígito e o próximo, na linha de base)
  const dpx = w + (PITCH - DIGIT_BOX) / 2 - 1, dps = TH + 3;
  const dp = [[dpx - dps / 2, h - dps], [dpx + dps / 2, h - dps], [dpx + dps / 2, h], [dpx - dps / 2, h]];
  return { a1: P(a1), a2: P(a2), d1: P(d1), d2: P(d2), f: P(f), b: P(b), e: P(e), c: P(cc), g1: P(g1, 6), g2: P(g2, 6), dp: P(dp, 3) };
}

const fillEl = (path, rule) => ({ draw: (ctx) => ctx.fill(path, rule || 'nonzero') });

// texto fixo (legenda) — largura ajustada à medida da foto
function textEl(parts, right, base, size) {
  // parts: [{s, scale, dy, kern}] — negrito condensado, alinhado à direita (posições medidas na foto)
  const mctx = document.createElement('canvas').getContext('2d');
  const ms = []; let w = 0;
  for (const p of parts) { mctx.font = `700 ${Math.round(size * (p.scale || 1))}px ${LFONT}`; const mw = mctx.measureText(p.s).width; ms.push(mw); w += mw + (p.kern || 0); }
  return {
    draw(ctx) {
      const sx = labelCondense();
      ctx.save(); ctx.translate(right - w * sx, base); ctx.scale(sx, 1); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      let x = 0;
      parts.forEach((p, i) => { ctx.font = `700 ${Math.round(size * (p.scale || 1))}px ${LFONT}`; ctx.fillText(p.s, x, p.dy || 0); ctx.strokeText(p.s, x, p.dy || 0); x += ms[i] + (p.kern || 0); });
      ctx.restore();
    },
  };
}
function iconText(s, cx, cy, size, ls = 0) {
  const mctx = document.createElement('canvas').getContext('2d'); mctx.font = `700 ${size}px ${FONT}`;
  const mw = mctx.measureText(s).width + ls * (s.length - 1);
  return {
    draw(ctx) {
      ctx.save(); ctx.font = `700 ${size}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let x = cx - mw / 2;
      for (const ch of s) { ctx.fillText(ch, x, cy); x += ctx.measureText(ch).width + ls; }
      ctx.restore();
    },
  };
}
const M = (a, b, c, d, e, f) => new DOMMatrix([a, b, c, d, e, f]);
const at = (path, x, y, s = 1, rot = 0) => { const p = new Path2D(); const co = Math.cos(rot) * s, si = Math.sin(rot) * s; p.addPath(path, M(co, si, -si, co, x, y)); return p; };

// ---------- ícones ----------
function heartPath() { // ~92×86, centro (0,0)
  const p = new Path2D();
  p.moveTo(0, 40);
  p.bezierCurveTo(-10, 30, -46, 6, -46, -16);
  p.bezierCurveTo(-46, -34, -32, -43, -21, -43);
  p.bezierCurveTo(-10, -43, -3, -36, 0, -28);
  p.bezierCurveTo(3, -36, 10, -43, 21, -43);
  p.bezierCurveTo(32, -43, 46, -34, 46, -16);
  p.bezierCurveTo(46, 6, 10, 30, 0, 40);
  p.closePath(); return p;
}
function fanPath() { // 5 pás curvas tipo cata-vento + cubo, raio ~44
  const R = 44, r0 = 7;
  const pol = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  const blade = new Path2D();
  let q = pol(r0, -0.2); blade.moveTo(q[0], q[1]);
  let c1 = pol(R * 0.62, -0.42), e1 = pol(R, 0.22); blade.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
  blade.arc(0, 0, R, 0.22, 0.78);
  c1 = pol(R * 0.95, 1.02); e1 = pol(R * 0.62, 0.80); blade.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
  c1 = pol(R * 0.36, 0.55); e1 = pol(r0, 0.95); blade.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
  blade.closePath();
  const p = new Path2D();
  for (let i = 0; i < 5; i++) p.addPath(blade, M(Math.cos(i * 1.2566), Math.sin(i * 1.2566), -Math.sin(i * 1.2566), Math.cos(i * 1.2566), 0, 0));
  p.moveTo(r0 + 4, 0); p.arc(0, 0, r0 + 4, 0, Math.PI * 2);
  return p;
}
function bellPath() {
  const p = new Path2D();
  p.moveTo(-32, 22); p.lineTo(32, 22); p.lineTo(32, 16);
  p.bezierCurveTo(22, 10, 24, 2, 23, -8); p.bezierCurveTo(22, -24, 12, -30, 0, -30);
  p.bezierCurveTo(-12, -30, -22, -24, -23, -8); p.bezierCurveTo(-24, 2, -22, 10, -32, 16); p.closePath();
  p.moveTo(9, 28); p.arc(0, 28, 9, 0, Math.PI); p.closePath();
  p.moveTo(5, -33); p.arc(0, -33, 5, 0, Math.PI * 2);
  return p;
}
function cylPath() {
  const p = new Path2D();
  roundPoly(p, [[-17, -18], [17, -18], [17, 40], [-17, 40]], 6);
  p.moveTo(-17, -10); p.bezierCurveTo(-17, -24, 17, -24, 17, -10); p.closePath();
  p.rect(-6, -32, 12, 12); p.rect(-15, -38, 30, 7);
  return p;
}
function clockPath() {
  const p = new Path2D();
  p.arc(0, 0, 33, 0, Math.PI * 2); p.moveTo(26, 0); p.arc(0, 0, 26, 0, Math.PI * 2, true);
  p.rect(-3.5, -21, 7, 24); p.addPath((() => { const q = new Path2D(); q.rect(-3.5, -3.5, 20, 7); return q; })(), M(Math.cos(0.5), Math.sin(0.5), -Math.sin(0.5), Math.cos(0.5), 0, 0));
  return p;
}
function lockEl(cx, cy) {
  const body = new Path2D(); roundPoly(body, [[-25, -4], [25, -4], [25, 34], [-25, 34]].map(([x, y]) => [x + cx, y + cy]), 5);
  body.moveTo(cx + 5, cy + 14); body.arc(cx, cy + 14, 5, 0, Math.PI * 2, true);
  return { draw(ctx) { ctx.fill(body, 'evenodd'); ctx.save(); ctx.lineWidth = 8; ctx.lineCap = 'butt'; ctx.beginPath();
    ctx.moveTo(cx - 15, cy - 4); ctx.lineTo(cx - 15, cy - 16); ctx.arc(cx, cy - 16, 15, Math.PI, 0); ctx.lineTo(cx + 15, cy - 4); ctx.stroke(); ctx.restore(); } };
}
function checkEl(cx, cy) {
  return { draw(ctx) { ctx.save(); ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 2); ctx.lineTo(cx - 8, cy + 20); ctx.lineTo(cx + 26, cy - 22); ctx.stroke(); ctx.restore(); } };
}
function warnPath() {
  const p = new Path2D();
  roundPoly(p, [[0, -34], [38, 30], [-38, 30]], 5);
  roundPoly(p, [[0, -19], [-26, 23], [26, 23]], 2);
  roundPoly(p, [[-4.5, -9], [4.5, -9], [3, 10], [-3, 10]], 1.5);
  p.moveTo(4.5, 16.5); p.arc(0, 16.5, 4.5, 0, Math.PI * 2);
  return p;
}

// ---------- montagem ----------
// campos: borda direita da caixa do dígito (inclinação incluída) e topo
const FIELDS = [
  { right: 590, top: 416 },   // H2S
  { right: 1232, top: 416 },  // CO
  { right: 590, top: 752 },   // O2
  { right: 1232, top: 752 },  // LEL
];

export function buildElements() {
  const els = new Map();
  const slotCache = new Map();
  function slot(fi, si) {
    const k = fi * 10 + si;
    if (!slotCache.has(k)) {
      const F = FIELDS[fi];
      const x0 = F.right - DIGIT_BOX - si * PITCH;
      const ps = digitPaths(x0, F.top);
      const id = `f${fi}s${si}`;
      for (const [sg, p] of Object.entries(ps)) els.set(id + sg, { ...fillEl(p), ghost: si < 3 && (sg !== 'dp' || si === 1) });
      slotCache.set(k, id);
    }
    return slotCache.get(k);
  }
  for (let fi = 0; fi < 4; fi++) for (let si = 0; si < 3; si++) slot(fi, si);

  // legendas (medidas na foto)
  const LS = 70;
  els.set('lbl0', textEl([{ s: 'H' }, { s: '2', scale: 0.64, dy: 14, kern: 1 }, { s: 'S ppm' }], 562, 710, LS));
  els.set('lbl1', textEl([{ s: 'CO ppm' }], 1222, 710, LS));
  els.set('lbl2', textEl([{ s: 'O' }, { s: '2', scale: 0.64, dy: 14, kern: 7 }, { s: '%' }], 574, 1037, LS));
  els.set('lbl3', textEl([{ s: 'LEL%' }], 1238, 1037, LS));

  // linha inferior
  els.set('heart', fillEl(at(heartPath(), 154, 1104, 1.0)));
  const batt = new Path2D();
  const bx = 740, by = 1068, bw = 128, bh = 50, wt = 7;
  roundPoly(batt, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], 3);
  roundPoly(batt, [[bx + wt, by + wt], [bx + wt, by + bh - wt], [bx + bw - wt, by + bh - wt], [bx + bw - wt, by + wt]], 1.5);
  roundPoly(batt, [[bx + bw + 2, by + 14], [bx + bw + 15, by + 14], [bx + bw + 15, by + bh - 14], [bx + bw + 2, by + bh - 14]], 2);
  els.set('batt', fillEl(batt));
  const iw = bw - 2 * wt - 8, barW = (iw - 2 * 6) / 3;
  for (let i = 0; i < 3; i++) {
    const p = new Path2D(); const x = bx + wt + 4 + i * (barW + 6);
    roundPoly(p, [[x, by + wt + 4], [x + barW, by + wt + 4], [x + barW, by + bh - wt - 4], [x, by + bh - wt - 4]], 1.5);
    els.set('batt' + (i + 1), fillEl(p));
  }
  els.set('check', checkEl(1020, 1100));
  els.set('warn', fillEl(at(warnPath(), 1130, 1098), 'evenodd'));

  // faixa superior (ícones que só aparecem quando ativos)
  const R1 = 150, R2 = 282;
  els.set('bell', fillEl(at(bellPath(), 112, R1)));
  els.set('low', iconText('LOW', 236, R1, 50, 1));
  els.set('high', iconText('HIGH', 386, R1, 50, 1));
  els.set('twa', iconText('TWA', 534, R1, 50, 1));
  els.set('stel', iconText('STEL', 682, R1, 50, 1));
  els.set('peak', iconText('PEAK', 840, R1, 50, 1));
  els.set('cyl', fillEl(at(cylPath(), 990, R1 - 4)));
  els.set('clock', fillEl(at(clockPath(), 1100, R1), 'evenodd'));
  els.set('lock', lockEl(1222, R1 - 6));
  els.set('safe', iconText('SAFE', 168, R2, 58, 2));
  els.set('zero', iconText('ZERO', 420, R2, 46, 1));
  els.set('cal', iconText('CAL', 580, R2, 46, 1));
  els.set('bump', iconText('BUMP', 738, R2, 46, 1));
  els.set('pump', iconText('PUMP', 920, R2, 46, 1));
  els.set('off', iconText('OFF', 1096, R2, 46, 1));

  // ventoinha (desenhada com rotação na composição)
  const fp = fanPath(); const FX = 642, FY = 1102;
  const fan = { draw(ctx, a = 0) { ctx.fill(at(fp, FX, FY, 1, a)); }, rect: [FX - 70, FY - 70, 140, 140] };
  els.set(FAN_ID, { draw: (ctx) => fan.draw(ctx, 0), ghost: false });
  // banner: n células contíguas centradas na linha de cima (sem fantasma próprio)
  const bannerCache = new Map();
  function bannerSlot(n, i) {
    const k = n + ':' + i;
    if (!bannerCache.has(k)) {
      const pitch = Math.min(PITCH, (W - 90) / n);
      const total = (n - 1) * pitch + DIGIT_BOX;
      const x0 = (W - total) / 2 + i * pitch;
      const id = `bn${n}_${i}`;
      for (const [sg, p] of Object.entries(digitPaths(x0, FIELDS[0].top))) els.set(id + sg, { ...fillEl(p), ghost: false });
      bannerCache.set(k, id);
    }
    return bannerCache.get(k);
  }
  return { els, slot, bannerSlot, fan };
}
