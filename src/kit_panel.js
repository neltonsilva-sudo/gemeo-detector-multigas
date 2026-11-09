// Painéis de detalhe do kit (manômetro/regulador e cilindro) — HTML "liquid glass" escuro. Dono: agente KIT.
// createKitPanel(api) → { open(kind), close(), update(state, needleRad), el }
import { psiToDeg } from './kit_tex.js';

const CSS = `
.kp-wrap{position:fixed;right:18px;top:50%;transform:translateY(-50%) scale(.98);width:min(372px,calc(100vw - 32px));max-height:calc(100vh - 32px);
  overflow:auto;z-index:60;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;color:#fff;
  font:500 13px/1.35 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;border-radius:22px;
  background:rgba(28,22,18,.3);-webkit-backdrop-filter:blur(20px) saturate(1.9);backdrop-filter:blur(20px) saturate(1.9);
  border:1px solid rgba(255,255,255,.28);box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.22)}
.kp-wrap.on{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1)}
.kp-in{padding:16px 18px 18px}
.kp-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.kp-t{color:#ffd23f;font-weight:700;font-size:15px;letter-spacing:.02em}
.kp-x{all:unset;cursor:pointer;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:18px;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25)}
.kp-x:hover{background:rgba(255,255,255,.22)}
.kp-dial{display:block;margin:2px auto 10px;width:236px;height:236px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}
.kp-g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 12px}
.kp-c{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}
.kp-c small{display:block;opacity:.72;font-size:11px;letter-spacing:.03em;text-transform:uppercase}
.kp-c b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.kp-btn{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;text-align:center;padding:13px 14px;border-radius:14px;
  font-weight:700;font-size:15px;color:#1b1406;background:#ffd23f;box-shadow:0 6px 18px rgba(255,210,63,.25)}
.kp-btn:hover{filter:brightness(1.06)} .kp-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.kp-btn.alt{color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);box-shadow:none}
.kp-warn{display:none;margin:0 0 10px;padding:9px 11px;border-radius:12px;background:rgba(220,40,40,.32);border:1px solid rgba(255,120,120,.55);font-weight:700}
.kp-warn.on{display:block}
.kp-tab{width:100%;border-collapse:collapse;margin:4px 0 10px;font-variant-numeric:tabular-nums}
.kp-tab td{padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.12)} .kp-tab td:last-child{text-align:right;font-weight:700}
.kp-ghs{display:flex;gap:10px;align-items:center;margin:4px 0 12px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-size:12px}
.kp-note{opacity:.75;font-size:11.5px;margin-top:8px}
.kp-big{display:flex;align-items:baseline;justify-content:center;gap:10px;margin:-2px 0 6px;font-variant-numeric:tabular-nums}
.kp-big b{font-size:30px;font-weight:800;letter-spacing:-.01em} .kp-big span{opacity:.8}
.kp-tr{display:block;text-align:center;font-weight:700;font-size:13px;margin-bottom:8px;color:#ffd23f}
.kp-tr.ok{color:rgba(255,255,255,.75)}
.kp-spark{display:block;width:100%;height:74px;margin:2px 0 10px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
`;
const GHS = `<svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="7" width="26" height="26" transform="rotate(45 20 20)" fill="#fff" stroke="#d0151c" stroke-width="3.4"/>
<g transform="rotate(-22 20 21)"><rect x="9.5" y="17.6" width="19" height="6.8" rx="3.4" fill="#111"/><rect x="28" y="19" width="2.6" height="4" fill="#111"/><rect x="30.2" y="17.8" width="1.4" height="6.4" fill="#111"/></g></svg>`;
const f1 = (v, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createKitPanel(api) {
  if (typeof document === 'undefined') return { open() {}, close() {}, update() {} };
  if (!document.getElementById('kp-css')) { const st = document.createElement('style'); st.id = 'kp-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.className = 'kp-wrap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false');
  el.innerHTML = `<div class="kp-in">
    <div class="kp-h"><span class="kp-t" data-k="title"></span><button class="kp-x" aria-label="Fechar">×</button></div>
    <div data-sec="gauge">
      <canvas class="kp-dial" width="472" height="472"></canvas>
      <div class="kp-big"><b data-k="pb"></b><span data-k="pp"></span></div>
      <span class="kp-tr" data-k="tr"></span>
      <canvas class="kp-spark" width="672" height="148" aria-label="Pressão no manômetro nos últimos minutos"></canvas>
      <div class="kp-warn" data-k="warn">Cilindro quase vazio — troque</div>
      <div class="kp-g">
        <div class="kp-c"><small>Conteúdo</small><b data-k="p"></b></div>
        <div class="kp-c"><small>Fluxo</small><b data-k="f"></b></div>
        <div class="kp-c"><small>Gás restante</small><b data-k="g"></b></div>
        <div class="kp-c"><small>Válvula</small><b data-k="v"></b></div>
      </div>
      <button class="kp-btn" data-b="valve"></button>
      <div class="kp-note">Regulador de fluxo fixo 0,5 L/min. O manômetro fica depois da válvula on/off: aberta, mostra a pressão do cilindro (0–1500 psi / 0–103 bar); fechada, o regulador despressuriza e o ponteiro volta a 0.</div>
    </div>
    <div data-sec="cylinder">
      <table class="kp-tab"><tbody>
        <tr><td>Sulfeto de hidrogênio (H₂S)</td><td>25 ppm</td></tr>
        <tr><td>Monóxido de carbono (CO)</td><td>100 ppm</td></tr>
        <tr><td>Metano (CH₄)</td><td>2,5 % = 50 % LIE</td></tr>
        <tr><td>Oxigênio (O₂)</td><td>18 %</td></tr>
        <tr><td>Nitrogênio (N₂)</td><td>balanço</td></tr>
      </tbody></table>
      <div class="kp-g">
        <div class="kp-c"><small>Lote</small><b>2611-0734-A</b></div>
        <div class="kp-c"><small>Validade</small><b>07/11/2028</b></div>
        <div class="kp-c"><small>Volume</small><b>34 L</b></div>
        <div class="kp-c"><small>Pressão</small><b data-k="cp"></b></div>
        <div class="kp-c" style="grid-column:1/-1"><small>Gás restante</small><b data-k="cg"></b></div>
      </div>
      <div class="kp-warn" data-k="cwarn">Cilindro quase vazio — troque</div>
      <div class="kp-ghs">${GHS}<div><b>Atenção — gás sob pressão.</b> Pode explodir sob ação do calor. Gás comprimido, N.O.S. · ONU 1956. Cilindro descartável: não recarregar.</div></div>
      <button class="kp-btn alt" data-b="reg"></button>
    </div>
  </div>`;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s), K = (k) => el.querySelector(`[data-k="${k}"]`);
  const canvas = q('.kp-dial'), g = canvas.getContext('2d'), spark = q('.kp-spark'), gs = spark.getContext('2d');
  let kind = null;
  const close = () => { kind = null; el.classList.remove('on'); api.onClose && api.onClose(); };
  q('.kp-x').addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && kind) close(); });
  q('[data-b="valve"]').addEventListener('click', () => api.action('valve'));
  q('[data-b="reg"]').addEventListener('click', () => api.action('regulator'));
  for (const ev of ['pointerdown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());

  function drawDial(needleRad) {
    const N = canvas.width, C = N / 2, R = N * 0.47, RED = '#d4232b';
    const rad = (deg) => (deg - 90) * Math.PI / 180, pol = (deg, r) => [C + Math.cos(rad(deg)) * r * R, C + Math.sin(rad(deg)) * r * R];
    g.clearRect(0, 0, N, N);
    // aro cromado
    const bez = g.createLinearGradient(0, 0, N, N); bez.addColorStop(0, '#f6f7f8'); bez.addColorStop(0.45, '#8d9196'); bez.addColorStop(0.55, '#c9ccd0'); bez.addColorStop(1, '#5d6166');
    g.fillStyle = bez; g.beginPath(); g.arc(C, C, R * 1.06, 0, 7); g.fill();
    const face = g.createRadialGradient(C, C * 0.9, R * 0.1, C, C, R); face.addColorStop(0, '#fdfdfc'); face.addColorStop(0.85, '#f3f3f1'); face.addColorStop(1, '#d6d6d4');
    g.fillStyle = face; g.beginPath(); g.arc(C, C, R * 0.97, 0, 7); g.fill();
    const tick = (deg, r0, r1, w, col) => { const [x0, y0] = pol(deg, r0), [x1, y1] = pol(deg, r1); g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    for (let p = 0; p <= 1500; p += 20) tick(psiToDeg(p), p % 100 ? 0.88 : 0.85, 0.93, p % 100 ? 1.6 : 2.6, '#26272a');
    for (let p = 0; p <= 1500; p += 50) { const maj = p % 300 === 0; tick(psiToDeg(p), maj ? 0.57 : 0.62, maj ? 0.76 : 0.7, maj ? 6 : 3.5, RED); }
    const num = (t, deg, r, s, col) => { const [x, y] = pol(deg, r); g.font = `700 ${s}px "Arial Narrow",Inter,system-ui,sans-serif`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
    [0, 300, 600, 900, 1200, 1500].forEach((p) => num(String(p), psiToDeg(p), p === 1500 ? 0.74 : 0.79, 24, RED));
    [[21, 300], [41, 600], [62, 900], [83, 1200], [103, 1500]].forEach(([b, p]) => num(String(b), psiToDeg(p), 0.46, 21, RED));
    num('psi', 118, 0.74, 22, '#26272a'); num('bar', 128, 0.5, 20, RED);
    // ponteiro (mesma mola amortecida do 3D)
    g.save(); g.translate(C, C); g.rotate(needleRad);
    g.fillStyle = '#121214'; g.beginPath(); g.moveTo(-5, 22); g.lineTo(5, 22); g.lineTo(1.6, -R * 0.86); g.lineTo(0, -R * 0.9); g.lineTo(-1.6, -R * 0.86); g.closePath(); g.fill();
    g.restore();
    const hub = g.createRadialGradient(C - 4, C - 4, 1, C, C, 15); hub.addColorStop(0, '#f2f2f2'); hub.addColorStop(1, '#6f7377');
    g.fillStyle = hub; g.beginPath(); g.arc(C, C, 14, 0, 7); g.fill();
    // reflexo do vidro
    const gl = g.createLinearGradient(C - R, C - R, C + R * 0.2, C + R * 0.2); gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.ellipse(C - R * 0.18, C - R * 0.3, R * 0.75, R * 0.45, -0.6, 0, 7); g.fill();
  }

  function drawSpark(hist) {
    const W = spark.width, H = spark.height, padL = 54, padB = 26, padT = 14;
    gs.clearRect(0, 0, W, H);
    const max = 40;
    gs.font = '600 19px Inter,system-ui,sans-serif'; gs.fillStyle = 'rgba(255,255,255,.6)'; gs.textBaseline = 'middle'; gs.textAlign = 'right';
    for (const v of [0, 20, 40]) { const y = padT + (H - padT - padB) * (1 - v / max); gs.fillText(String(v), padL - 10, y); gs.strokeStyle = 'rgba(255,255,255,.12)'; gs.lineWidth = 1.5; gs.beginPath(); gs.moveTo(padL, y); gs.lineTo(W - 10, y); gs.stroke(); }
    gs.textAlign = 'left'; gs.fillText('−6 min', padL, H - 11); gs.textAlign = 'right'; gs.fillText('agora · bar', W - 10, H - 11);
    if (!hist || hist.length < 2) return;
    const n = 180, x = (i) => padL + (W - 10 - padL) * (i + (n - hist.length)) / (n - 1), y = (v) => padT + (H - padT - padB) * (1 - Math.min(max, v) / max);
    const grd = gs.createLinearGradient(0, padT, 0, H - padB); grd.addColorStop(0, 'rgba(255,210,63,.35)'); grd.addColorStop(1, 'rgba(255,210,63,0)');
    gs.beginPath(); gs.moveTo(x(0), y(0)); hist.forEach((v, i) => gs.lineTo(x(i), y(v))); gs.lineTo(x(hist.length - 1), y(0)); gs.closePath(); gs.fillStyle = grd; gs.fill();
    gs.beginPath(); hist.forEach((v, i) => (i ? gs.lineTo(x(i), y(v)) : gs.moveTo(x(i), y(v)))); gs.strokeStyle = '#ffd23f'; gs.lineWidth = 3.5; gs.lineJoin = 'round'; gs.stroke();
    const lv = hist[hist.length - 1]; gs.fillStyle = '#ffd23f'; gs.beginPath(); gs.arc(x(hist.length - 1), y(lv), 6, 0, 7); gs.fill();
  }

  return {
    el,
    get kind() { return kind; },
    open(k) {
      kind = k; el.classList.add('on');
      K('title').textContent = k === 'gauge' ? 'Regulador · manômetro' : 'Cilindro de calibração · 34 L';
      el.querySelectorAll('[data-sec]').forEach((s) => { s.style.display = s.dataset.sec === k ? '' : 'none'; });
    },
    close,
    update(s, needleRad, hist) {
      if (!kind) return;
      const psi = s.pressureBar * 14.5038, low = s.pressureBar < 3;
      const minLeft = s.flowLpm > 0.01 ? s.gasLeftL / s.flowLpm : s.gasLeftL / 0.5;
      const gasTxt = `${f1(s.gasLeftL)} L · ≈ ${Math.floor(minLeft)} min`;
      if (kind === 'gauge') {
        drawDial(needleRad);
        const shown = s.gaugeShownBar ?? s.pressureBar;
        K('pb').textContent = `${f1(shown)} bar`; K('pp').textContent = `${Math.round(shown * 14.5038)} psi`;
        const tr = K('tr');
        if (s.flowLpm > 0.01) { tr.textContent = `↓ −${f1(s.dropBarMin, 2)} bar/min (gás fluindo${s.simScale > 1 ? ` · ${s.simScale}×` : ''})`; tr.classList.remove('ok'); }
        else if (!s.valveOpen && (s.gaugeBar || 0) > 0.05) { tr.textContent = '↓ despressurizando (válvula fechada)'; tr.classList.remove('ok'); }
        else { tr.textContent = s.valveOpen ? 'estável' : 'válvula fechada · manômetro sem pressão'; tr.classList.add('ok'); }
        drawSpark(hist);
        K('p').textContent = s.regulatorMounted ? `${f1(s.pressureBar)} bar no cilindro` : '— (regulador solto)';
        K('f').textContent = `${f1(s.flowLpm, 2)} L/min`;
        K('g').textContent = gasTxt;
        K('v').textContent = s.valveOpen ? 'aberta' : 'fechada';
        K('warn').classList.toggle('on', low);
        const b = q('[data-b="valve"]'); b.textContent = s.valveOpen ? 'Fechar válvula' : 'Abrir válvula';
      } else {
        K('cp').textContent = `${f1(s.pressureBar)} bar`;
        K('cg').textContent = gasTxt;
        K('cwarn').classList.toggle('on', low);
        q('[data-b="reg"]').textContent = s.regulatorMounted ? 'Retirar regulador' : 'Rosquear regulador';
      }
    },
  };
}
