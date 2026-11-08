// LCD segmentado reflexivo (tipo GasAlertMax XT II) desenhado em canvas 2D → THREE.CanvasTexture. Dono: agente DISPLAY.
// O canvas representa EXATAMENTE a abertura visível do vidro (UV 0..1 = área cinza dentro da moldura).
// Proporção L:A = 1,12:1 (medida em refs/ref1_maxxt2.png e refs/ref1_lcd.png: ≈306×270 px de área cinza visível).
import * as THREE from 'three';
import { W, H, buildElements, FAN_ID } from './lcd_layout.js';

// ---------- fundo (cinza-esverdeado reflexivo / retroiluminado) ----------
function makeBackground(kind) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const P = kind === 'backlight'
    ? { base: [200, 212, 150], center: [196, 208, 146], edge: [160, 172, 116], grain: 3.2 }
    : kind === 'off'
      ? { base: [189, 194, 188], center: [195, 200, 194], edge: [172, 177, 171], grain: 2.6 }
      : { base: [191, 196, 193], center: [197, 202, 199], edge: [174, 179, 176], grain: 2.6 };
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  g.fillStyle = rgb(P.base); g.fillRect(0, 0, W, H);
  // gradiente radial suave (refletor/guia de luz não uniforme)
  const rg = g.createRadialGradient(W * 0.48, H * 0.44, W * 0.08, W * 0.5, H * 0.5, W * 0.78);
  rg.addColorStop(0, rgb(P.center)); rg.addColorStop(0.55, rgb(P.base)); rg.addColorStop(1, rgb(P.edge));
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  if (kind === 'backlight') {
    // LEDs laterais no guia de luz: mais claro junto às bordas esq./dir. (hot spots), cai rumo ao centro;
    // topo e base (longe dos LEDs) escurecem mais
    const hx = g.createLinearGradient(0, 0, W, 0);
    hx.addColorStop(0, 'rgba(232,240,186,0.55)'); hx.addColorStop(0.16, 'rgba(232,240,186,0.16)');
    hx.addColorStop(0.5, 'rgba(232,240,186,0)'); hx.addColorStop(0.84, 'rgba(232,240,186,0.16)'); hx.addColorStop(1, 'rgba(232,240,186,0.5)');
    g.fillStyle = hx; g.fillRect(0, 0, W, H);
    for (const yy of [0.36, 0.72]) for (const xx of [0, W]) { // hot spots dos LEDs
      const r = g.createRadialGradient(xx, H * yy, 0, xx, H * yy, W * 0.2);
      r.addColorStop(0, 'rgba(240,246,196,0.45)'); r.addColorStop(1, 'rgba(240,246,196,0)');
      g.fillStyle = r; g.fillRect(0, 0, W, H);
    }
    const vy = g.createLinearGradient(0, 0, 0, H);
    vy.addColorStop(0, 'rgba(70,80,40,0.30)'); vy.addColorStop(0.2, 'rgba(70,80,40,0.06)'); vy.addColorStop(0.5, 'rgba(70,80,40,0)');
    vy.addColorStop(0.82, 'rgba(70,80,40,0.06)'); vy.addColorStop(1, 'rgba(70,80,40,0.26)');
    g.fillStyle = vy; g.fillRect(0, 0, W, H);
  }
  // sombra interna da moldura (lábio do bezel projeta sombra no refletor) — bem sutil
  const edge = (x0, y0, x1, y1, a) => { const l = g.createLinearGradient(x0, y0, x1, y1);
    l.addColorStop(0, `rgba(40,48,40,${a})`); l.addColorStop(1, 'rgba(40,48,40,0)'); return l; };
  g.fillStyle = edge(0, 0, 0, 46, 0.16); g.fillRect(0, 0, W, 46);
  g.fillStyle = edge(0, 0, 30, 0, 0.10); g.fillRect(0, 0, 30, H);
  g.fillStyle = edge(W, 0, W - 30, 0, 0.08); g.fillRect(W - 30, 0, 30, H);
  g.fillStyle = edge(0, H, 0, H - 22, 0.07); g.fillRect(0, H - 22, W, 22);
  // manchas de baixa frequência (polarizador / difusor)
  const m = document.createElement('canvas'); m.width = 24; m.height = 22; const mg = m.getContext('2d');
  const md = mg.createImageData(24, 22); let seed = kind.length * 7919 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < md.data.length; i += 4) { const v = rnd() * 255; md.data[i] = md.data[i + 1] = md.data[i + 2] = v; md.data[i + 3] = 255; }
  mg.putImageData(md, 0, 0);
  g.save(); g.globalAlpha = 0.035; g.globalCompositeOperation = 'overlay'; g.imageSmoothingQuality = 'high';
  g.filter = 'blur(18px)'; g.drawImage(m, -40, -40, W + 80, H + 80); g.restore();
  // granulado fino
  const id = g.getImageData(0, 0, W, H); const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() + rnd() - 1) * P.grain;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(id, 0, 0);
  return c;
}

// ---------- caracteres 7 segmentos (horizontais divididos: a1 a2 / g1 g2 / d1 d2) ----------
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc',
  '8': 'abcdefg', '9': 'abcdfg', '-': 'g', '_': 'd', ' ': '', '=': 'dg', "'": 'f',
  A: 'abcefg', b: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', E: 'adefg', F: 'aefg', G: 'acdef', H: 'bcefg', h: 'cefg',
  I: 'ef', i: 'e', J: 'bcde', L: 'def', l: 'ef', n: 'ceg', N: 'abcef', M: 'abcef', '\u0001': 'abc', '\u0002': 'bcd', o: 'cdeg', O: 'abcdef', P: 'abefg',
  q: 'abcfg', r: 'eg', R: 'eg', S: 'acdfg', s: 'acdfg', t: 'defg', T: 'defg', U: 'bcdef', u: 'cde', V: 'bcdef', v: 'cde',
  y: 'bcdfg', Y: 'bcdfg', Z: 'abdeg', z: 'abdeg', B: 'cdefg', D: 'bcdeg', K: 'bcefg', k: 'cefg', X: 'bcefg', W: 'bcdef', w: 'cdef',
};
const segsOf = (ch) => {
  let s = SEG[ch]; if (s === undefined) s = SEG[ch.toUpperCase()]; if (s === undefined) s = SEG[ch.toLowerCase()];
  if (s === undefined) s = '';
  const out = [];
  for (const k of s) { if (k === 'a' || k === 'd' || k === 'g') out.push(k + '1', k + '2'); else out.push(k); }
  return out;
};
function parseText(t) {
  const out = [];
  for (const ch of String(t ?? '')) {
    if (ch === '.' || ch === ',') { if (out.length && !out[out.length - 1].dp) out[out.length - 1].dp = true; else out.push({ ch: ' ', dp: true }); }
    else if (ch === 'M' || ch === 'm') out.push({ ch: 'M', dp: false }, { ch: '\u0001', dp: false, join: true });   // M = ∩ + ┐ colados (3 pernas)
    else if (ch === 'W' || ch === 'w') out.push({ ch: 'W', dp: false }, { ch: '\u0002', dp: false, join: true });   // W = U + ┘ colados
    else out.push({ ch, dp: false });
  }
  return out;
}

const GHOST = 0.005;   // contraste dos segmentos inativos (após luz/tone map fica ~1–1,5 %)

export function createLCD() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas'); base.width = W; base.height = H; const bctx = base.getContext('2d');
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lctx = layer.getContext('2d');
  const L = buildElements();               // { els: Map id→{draw(ctx), ghost}, slot(field, i), fan }
  const bgs = {};
  const bg = (k) => bgs[k] || (bgs[k] = makeBackground(k));

  // fantasmas: todos os segmentos fixos, ~4 % de contraste
  const ghost = document.createElement('canvas'); ghost.width = W; ghost.height = H;
  {
    lctx.clearRect(0, 0, W, H); lctx.fillStyle = '#000'; lctx.strokeStyle = '#000';
    for (const [id, el] of L.els) if (el.ghost !== false && id !== FAN_ID) el.draw(lctx);
    const g = ghost.getContext('2d'); g.filter = 'blur(0.8px)'; g.globalAlpha = GHOST; g.drawImage(layer, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // camada de segmentos ativos: sombra deslocada no refletor + segmento quase preto de bordas suaves
  // rect opcional [x,y,w,h] limita o trabalho (ventoinha).
  function inkLayer(target, drawFn, rect) {
    const [rx, ry, rw, rh] = rect || [0, 0, W, H];
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(rx, ry, rw, rh);
    lctx.fillStyle = INK; lctx.strokeStyle = INK;
    drawFn(lctx);
    // leve variação de densidade do cristal (mais denso embaixo/esq.)
    lctx.save(); lctx.globalCompositeOperation = 'source-atop'; lctx.fillStyle = inkGrad; lctx.fillRect(rx, ry, rw, rh); lctx.restore();
    target.save();
    target.beginPath(); target.rect(rx, ry, rw, rh); target.clip();
    target.filter = 'blur(2.5px)'; target.globalAlpha = SHADOW_A;                   // sombra no refletor (paralaxe do vidro traseiro)
    target.drawImage(layer, rx, ry, rw, rh, rx + 8, ry + 10, rw, rh);
    target.filter = 'blur(0.4px)'; target.globalAlpha = 0.94;                        // segmento
    target.drawImage(layer, rx, ry, rw, rh, rx, ry, rw, rh);
    target.restore();
  }
  const INK = 'rgb(14,17,15)';
  const SHADOW_A = 0.27;
  const inkGrad = lctx.createLinearGradient(0, 0, W * 0.4, H);
  inkGrad.addColorStop(0, 'rgba(70,82,74,0.10)'); inkGrad.addColorStop(1, 'rgba(0,0,0,0)');

  let baseKey = '', fanKey = '', fanT = -1;
  function activeIds(s, blinkVis) {
    const ids = [];
    if (s.all) { for (const id of L.els.keys()) if (id !== FAN_ID) ids.push(id); return ids; }
    const ic = s.icons || {};
    // campos / banner
    const fieldChars = [[], [], [], []];
    const out = (chars, slotOf) => chars.forEach((c, j) => {
      const sl = slotOf(j);
      for (const sg of segsOf(c.ch)) ids.push(sl + sg);
      if (c.dp) ids.push(sl + 'dp');
    });
    if (s.banner) {
      // banner: células contíguas centradas na linha superior (palavra inteira legível: PUMP, BUMP, SPAN…)
      const b = parseText(String(s.banner).slice(0, 8));
      if (b.length) { const sl = L.bannerSlots(b.map((c) => !!c.join)); out(b, (j) => sl[j]); }
    } else {
      (s.fields || []).slice(0, 4).forEach((f, fi) => {
        if (!f || !blinkVis(f.blink)) return;
        const chars = parseText(f.text); const n = chars.length;
        out(chars, (j) => L.slot(fi, n - 1 - j));   // alinhado à direita (slot 0 = mais à direita)
      });
    }
    if (s.labels !== false) ids.push('lbl0', 'lbl1', 'lbl2', 'lbl3');
    const on = (k) => !!ic[k];
    if (on('heart')) ids.push('heart');
    if (on('bell')) ids.push('bell');
    for (const k of ['low', 'high', 'twa', 'stel', 'peak', 'cyl', 'clock', 'lock', 'check', 'warn', 'safe', 'pump', 'zero', 'cal', 'bump', 'off'])
      if (on(k)) ids.push(k);
    const bat = ic.battery;
    if (bat !== undefined && bat !== null && bat !== false && blinkVis(ic.batteryBlink)) {
      ids.push('batt'); const n = Math.max(0, Math.min(3, Math.round(+bat)));
      for (let i = 1; i <= n; i++) ids.push('batt' + i);
    }
    return ids;
  }

  function draw(state, timeSec = 0) {
    const s = state || { on: true, fields: [{ text: '0' }, { text: '0' }, { text: '20.9' }, { text: '0' }], icons: { heart: true, fan: true, battery: 3 } };
    const t = +timeSec || 0;
    // piscar: true = 2 Hz, 'slow' ≈ 1 Hz, 'fast' ≈ 2,75 Hz (ciclo 50 %)
    const blinkVis = (b) => !b || Math.floor(t * 2 * (b === 'slow' ? 1 : b === 'fast' ? 2.75 : 2)) % 2 === 0;
    const isOn = s.on !== false;
    const bgKind = !isOn ? 'off' : s.backlight ? 'backlight' : 'normal';
    const ids = isOn ? activeIds(s, blinkVis) : [];
    const key = bgKind + '|' + ids.join(',');
    let dirty = false;
    if (key !== baseKey) {
      baseKey = key; dirty = true;
      bctx.globalAlpha = 1; bctx.filter = 'none';
      bctx.drawImage(bg(bgKind), 0, 0);
      if (isOn) bctx.drawImage(ghost, 0, 0);            // desligado: nenhum fantasma
      if (ids.length) inkLayer(bctx, (g) => { for (const id of ids) { const el = L.els.get(id); if (el) el.draw(g); } });
    }
    // ventoinha: composta à parte (gira sem redesenhar o resto; no máx. ~30 atualizações/s)
    const ic = (s.icons || {});
    const fanOn = isOn && (s.all || !!ic.fan);
    const steps = 18; // passos por 72° (simetria de 5 pás) → 4°/passo
    const ang = fanOn ? Math.round(((((+ic.fanPhase || 0) % 1) + 1) % 1) * 5 * steps) % steps : 0;
    const fk = (fanOn ? 1 : 0) + ':' + ang;
    if (!dirty && (fk === fanKey || Math.abs(t - fanT) < 1 / 30)) return;
    const [rx, ry, rw, rh] = L.fan.rect;
    if (dirty) ctx.drawImage(base, 0, 0); else ctx.drawImage(base, rx, ry, rw, rh, rx, ry, rw, rh);
    fanKey = fk; fanT = t;
    const a = (ang / steps) * (Math.PI * 2 / 5);
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(rx, ry, rw, rh); lctx.fillStyle = '#000';
    L.fan.draw(lctx, a);                                   // fantasma da ventoinha
    if (isOn) { ctx.save(); ctx.filter = 'blur(0.8px)'; ctx.globalAlpha = GHOST; ctx.drawImage(layer, rx, ry, rw, rh, rx, ry, rw, rh); ctx.restore(); }
    if (fanOn) inkLayer(ctx, (g) => L.fan.draw(g, a), L.fan.rect);
    texture.needsUpdate = true;
  }

  draw(null, 0);
  return { canvas, texture, draw, size: { width: W, height: H, aspect: W / H } };
}
