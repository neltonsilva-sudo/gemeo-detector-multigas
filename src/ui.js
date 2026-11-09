// Interface didática do gêmeo digital (painéis HTML sobre o canvas). Dono: agente UI.
import { icon } from './ui_icons.js';
import {
  GASES, GAS_LABEL, GAS_UNIT, GAS_COLOR, DEFAULT_LIMITS, getLimit, setLimit, resetLimits, getToggle, setToggle,
  phaseOf, PHASE_LABEL, measuring, alarmsByGas, readingsOf, fmtGas, fmtNum, normLogEntry, fmtClock,
} from './ui_fw.js';
import { ROUTINES, createRoutineEngine, LEVEL_DWELL, TRANSPORT } from './ui_routines.js';

const CAMS = [
  ['hero', 'Herói'], ['ref1', 'Foto'], ['front', 'Frente'], ['back', 'Trás'], ['lcd', 'Visor'], ['kit', 'Kit'], ['ref2', 'Kit · foto'],
];
const SCEN_TAGS = {
  limpo: ['O₂ 20,9 %'], confinado: ['CH₄ topo', 'H₂S fundo', 'O₂ ↓'], 'vazamento-h2s': ['H₂S', 'rajadas'],
  'co-motor': ['CO ↑'], 'deficiencia-o2': ['O₂ → 16 %'], explosiva: ['LEL → OL'], 'enriquecimento-o2': ['O₂ ↑'], manual: ['4 gases'],
};
const MANUAL = [
  { g: 'H2S', min: 0, max: 200, step: 1 }, { g: 'CO', min: 0, max: 1000, step: 5 },
  { g: 'O2', min: 0, max: 30, step: 0.1 }, { g: 'LEL', min: 0, max: 120, step: 1 },
];
const LEVEL_TXT = { low: 'LOW', high: 'HIGH', twa: 'TWA', stel: 'STEL', ol: 'OL', over: 'OL' };
const HUD_FALLBACK = {
  off: ['Aparelho desligado', 'Segure o botão do aparelho por ~3 s para ligar (ou mantenha a barra de Espaço pressionada).'],
  boot: ['Partida', 'O aparelho mostra a versão, os limites de alarme e os dias até a calibração.'],
  selftest: ['Autoteste', 'Todos os segmentos, LEDs, sirene e vibração são testados.'],
  pumptest: ['Teste da bomba', 'Bloqueie a entrada da bomba até o aparelho detectar o vácuo.'],
  run: ['Leitura normal', 'O aparelho está amostrando o ar continuamente pela bomba.'],
  alarm: ['Alarme de gás', 'Concentração acima do limite. Abandone a área.'],
  cal: ['Calibração', 'Siga as instruções do visor.'],
  bump: ['Bump test', 'Aplicando gás de teste.'],
  pumpfault: ['Falha da bomba', 'Entrada bloqueada ou mangueira estrangulada. Verifique a linha de amostragem.'],
  shutdown: ['Desligando', 'Contagem regressiva para desligar.'], lowbat: ['Bateria fraca', 'Recarregue o aparelho.'],
  peak: ['Picos e médias', 'O visor mostra MAX, TWA e STEL.'],
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

export function createUI(ctx) {
  const { fw, world, kit, sim } = ctx;
  const audio = ctx.audio || sim?.audio;
  const host = document.getElementById('ui') || document.body;
  const mq = matchMedia('(max-width: 760px)');
  const S = {
    out: null, phase: 'off', readings: null, alarms: {}, covered: false, coverToggle: false, keyB: false,
    btnHeld: false, scale: 1, effScale: 1, muted: false, theme: 'auto', tab: 'cenarios', sheetOpen: false,
    collapsed: { left: false, right: false }, cam: new URLSearchParams(location.search).get('cam') || 'hero',
    uiLog: [], logSig: '', trend: [], lastSample: -1, trendDirty: true, lastWorldT: 0, dtSim: 0, accText: 1,
    view: { x: 0, y: 0, tx: 0, ty: 0, z: 1, tz: 1, dirty: true },
  };

  // ---------------- API para roteiros ----------------
  const api = {
    fw, world, kit, sim,
    get out() { return S.out; }, get phase() { return S.phase; }, get readings() { return S.readings || readingsOf(null); },
    get alarms() { return S.alarms; }, get covered() { return S.covered; }, get dtSim() { return S.dtSim; },
    lim: (g, k) => getLimit(fw, g, k),
    setScenario: (id) => selectScenario(id),
    log: (t) => uiLog(t),
  };
  const eng = createRoutineEngine(api, (why) => { if (why !== 'done') renderRoutines(); else markStepDone(); });

  // ---------------- DOM ----------------
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const top = el(`
    <header class="gx gx-top gx-glass" role="banner">
      <div class="gx-brand">
        <span class="gx-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5l8.5 4.9v9.2L12 21.5 3.5 16.6V7.4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z" fill="currentColor"/></svg></span>
        <div class="gx-brand-t">
          <h1><span class="gx-h1-a">Detector Multigás com bomba</span></h1>
          <span class="gx-badge">${icon('info')}simulador didático, sem afiliação com o fabricante</span>
        </div>
      </div>
      <span class="gx-badge gx-badge-m">simulador didático, sem afiliação com o fabricante</span>
      <div class="gx-top-r">
        <div class="gx-clock" title="Tempo simulado desde o início">${icon('clock')}<div><b class="gx-num" data-k="clock">00:00:00</b><small>tempo simulado</small></div></div>
        <div class="gx-seg" role="radiogroup" aria-label="Escala de tempo" data-k="scale">
          ${[1, 10, 60].map((s) => `<button role="radio" data-scale="${s}" aria-checked="${s === 1}">${s}×</button>`).join('')}
        </div>
        <button class="gx-ibtn" data-k="mute" aria-label="Som ligado — clique para silenciar" title="Som (silenciar)">${icon('volume')}</button>
        <button class="gx-ibtn" data-k="theme" aria-label="Tema automático" title="Tema: automático">${icon('auto')}</button>
      </div>
    </header>`);
  const views = el(`
    <nav class="gx gx-views gx-glass" aria-label="Câmeras">
      <span class="gx-views-l">${icon('camera')}</span>
      ${CAMS.map(([id, n]) => `<button data-cam="${id}" aria-pressed="${id === S.cam}">${n}</button>`).join('')}
    </nav>`);
  const left = el(`
    <aside class="gx gx-panel gx-left gx-glass" aria-label="Aparelho e leituras">
      <div class="gx-ph"><span class="gx-ph-t">${icon('gauge')}Aparelho</span>
        <button class="gx-ibtn sm" data-k="collapse-left" aria-label="Recolher painel" title="Recolher">${icon('left')}</button></div>
      <div class="gx-scroll" data-k="left-body"></div>
    </aside>`);
  const readSec = el(`
    <section class="gx-read" data-k="read">
      <div class="gx-hud" data-level="info" aria-live="polite">
        <div class="gx-hud-top">
          <span class="gx-state" data-k="state"><i></i><span>Desligado</span></span>
          <span class="gx-outs" aria-label="Saídas do aparelho">
            <span data-o="buzzer" title="Sirene">${icon('bell')}</span><span data-o="led" title="LED de alarme">${icon('led')}</span>
            <span data-o="vibrate" title="Vibração">${icon('vibrate')}</span><span data-o="pump" title="Bomba">${icon('fan')}</span>
          </span>
        </div>
        <div class="gx-hud-k"><span>O aparelho diz</span><span class="gx-step" data-k="step" hidden></span></div>
        <h2 class="gx-hud-title" data-k="hud-title">Aparelho desligado</h2>
        <p class="gx-hud-text" data-k="hud-text"></p>
      </div>
      <div class="gx-sec-h"><span>Leituras</span><span class="gx-sec-s" data-k="pumpst">bomba parada</span></div>
      <div class="gx-gases">
        ${GASES.map((g) => `
        <div class="gx-gas" data-gas="${g}" data-st="off" style="--gc:${GAS_COLOR[g]}"${g === 'LEL' ? ' title="LEL: % do limite inferior de explosividade (LIE) do metano"' : ''}>
          <div class="gx-gas-h"><span class="gx-gas-n">${GAS_LABEL[g]}</span><span class="gx-gas-u">${g === 'LEL' ? '% LIE' : GAS_UNIT[g]}</span><span class="gx-chip" data-f="chip">—</span></div>
          <div class="gx-gas-vr"><span class="gx-gas-v gx-num" data-f="v">—</span><span class="gx-gas-pk gx-num" data-f="pk"></span></div>
          <div class="gx-bar" aria-hidden="true">${g === 'O2' ? '<span class="gx-band"></span>' : ''}<i data-f="fill"></i><b class="lo" data-f="lo"></b><b class="hi" data-f="hi"></b></div>
          <div class="gx-gas-f gx-num" data-f="lim"></div>
        </div>`).join('')}
      </div>
      <div class="gx-sec-h"><span>Tendência · últimos 5 min</span><span class="gx-sec-s">% do alarme LOW</span></div>
      <div class="gx-trend"><canvas data-k="trend" aria-label="Gráfico de tendência dos quatro gases"></canvas></div>
      <div class="gx-legend">${GASES.map((g) => `<span style="--gc:${GAS_COLOR[g]}"><i></i>${GAS_LABEL[g]}${g === 'O2' ? ' <em>(desvio)</em>' : ''}</span>`).join('')}</div>
    </section>`);
  const TABS = [['leituras', 'Leituras', 'gauge'], ['cenarios', 'Cenários', 'layers'], ['roteiros', 'Roteiros', 'route'], ['ajustes', 'Ajustes', 'sliders'], ['registro', 'Registro', 'list']];
  const right = el(`
    <aside class="gx gx-panel gx-right gx-glass" aria-label="Cenários, roteiros, ajustes e registro">
      <button class="gx-handle" data-k="handle" aria-label="Expandir painel"><i></i></button>
      <div class="gx-mini" data-k="mini">
        <div class="gx-mini-hud"><i data-k="mini-dot"></i><span data-k="mini-title">—</span></div>
        <div class="gx-mini-g">${GASES.map((g) => `<span data-mg="${g}"><small>${GAS_LABEL[g]}</small><b class="gx-num">—</b></span>`).join('')}</div>
      </div>
      <div class="gx-ph gx-tabs-wrap">
        <div class="gx-tabs" role="tablist">${TABS.map(([id, n, ic]) => `<button role="tab" data-tab="${id}" aria-selected="${id === S.tab}">${icon(ic)}<span>${n}</span><em class="gx-count" data-count="${id}"></em></button>`).join('')}</div>
        <button class="gx-ibtn sm gx-col-r" data-k="collapse-right" aria-label="Recolher painel" title="Recolher">${icon('right')}</button>
      </div>
      <div class="gx-scroll gx-panes">
        <div class="gx-pane" data-pane="leituras"></div>
        <div class="gx-pane" data-pane="cenarios"></div>
        <div class="gx-pane" data-pane="roteiros"></div>
        <div class="gx-pane" data-pane="ajustes"></div>
        <div class="gx-pane" data-pane="registro"></div>
      </div>
    </aside>`);
  const revL = el(`<button class="gx gx-reveal gx-reveal-l gx-glass" data-k="reveal-left" aria-label="Mostrar painel do aparelho">${icon('right')}<span>Aparelho</span></button>`);
  const revR = el(`<button class="gx gx-reveal gx-reveal-r gx-glass" data-k="reveal-right" aria-label="Mostrar painel de controle">${icon('left')}<span>Controle</span></button>`);
  const dock = el(`
    <nav class="gx gx-dock gx-glass" aria-label="Ações">
      <button class="gx-act primary" data-act="button" aria-label="Botão do aparelho: segure para ligar ou desligar">
        <span class="gx-act-i">${icon('power')}</span><span class="gx-act-t"><b>Botão do aparelho</b><small>segure · Espaço</small></span></button>
      <button class="gx-act" data-act="inlet" aria-pressed="false"><span class="gx-act-i">${icon('inlet')}</span><span class="gx-act-t"><b>Tapar entrada</b><small data-f="s">livre · tecla B</small></span></button>
      <button class="gx-act" data-act="valve" aria-pressed="false"><span class="gx-act-i">${icon('valve')}</span><span class="gx-act-t"><b>Válvula</b><small data-f="s">fechada</small></span></button>
      <button class="gx-act" data-act="hose" aria-pressed="false"><span class="gx-act-i">${icon('hose')}</span><span class="gx-act-t"><b>Mangueira</b><small data-f="s">desconectada</small></span></button>
    </nav>`);
  const toast = el(`<div class="gx gx-toast" role="status" aria-live="polite"></div>`);
  for (const n of [top, views, left, right, revL, revR, dock, toast]) host.appendChild(n);
  document.documentElement.classList.add('gx-root');
  $(left, '[data-k="left-body"]').appendChild(readSec);

  const K = (root, k) => $(root, `[data-k="${k}"]`);
  const R = {
    clock: K(top, 'clock'), state: K(readSec, 'state'), step: K(readSec, 'step'), hud: $(readSec, '.gx-hud'),
    hudTitle: K(readSec, 'hud-title'), hudText: K(readSec, 'hud-text'), pumpst: K(readSec, 'pumpst'),
    trend: K(readSec, 'trend'), mini: K(right, 'mini'), miniTitle: K(right, 'mini-title'), miniDot: K(right, 'mini-dot'),
    gas: Object.fromEntries(GASES.map((g) => { const n = $(readSec, `.gx-gas[data-gas="${g}"]`); return [g, { n, ...Object.fromEntries($$(n, '[data-f]').map((x) => [x.dataset.f, x])) }]; })),
    mg: Object.fromEntries(GASES.map((g) => [g, $(right, `[data-mg="${g}"]`)])),
    outs: Object.fromEntries($$(readSec, '[data-o]').map((x) => [x.dataset.o, x])),
    panes: Object.fromEntries($$(right, '[data-pane]').map((x) => [x.dataset.pane, x])),
  };
  R.hudText.addEventListener('click', () => R.hud.classList.toggle('expanded'));
  R.hudText.title = 'Clique para ler tudo';
  const setText = (node, txt) => { if (node && node.__t !== txt) { node.__t = txt; node.textContent = txt; } };
  const setAttr = (node, a, v) => { if (node && node.getAttribute(a) !== String(v)) node.setAttribute(a, v); };

  // ---------------- toast / log da UI ----------------
  let toastT = 0;
  function say(msg, kind = 'info') { toast.textContent = msg; toast.dataset.kind = kind; toast.classList.add('on'); toastT = 2.6; }
  function uiLog(text) { S.uiLog.push({ t: world.time ?? 0, src: 'simulador', text }); if (S.uiLog.length > 500) S.uiLog.shift(); }

  // ---------------- topo: escala, mudo, tema ----------------
  K(top, 'scale').addEventListener('click', (e) => { const b = e.target.closest('[data-scale]'); if (b) setScale(+b.dataset.scale); });
  K(top, 'mute').addEventListener('click', () => {
    S.muted = !S.muted; try { audio?.setMuted?.(S.muted); } catch {}
    const b = K(top, 'mute'); b.innerHTML = icon(S.muted ? 'mute' : 'volume'); b.classList.toggle('on', S.muted);
    b.setAttribute('aria-label', S.muted ? 'Som desligado — clique para ativar' : 'Som ligado — clique para silenciar');
    say(S.muted ? 'Som silenciado (alarmes continuam visíveis)' : 'Som ativado');
  });
  const THEMES = { auto: ['auto', 'automático'], light: ['sun', 'claro'], dark: ['moon', 'escuro'] };
  function applyTheme() {
    const root = document.documentElement;
    if (S.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = S.theme;
    const b = K(top, 'theme'); b.innerHTML = icon(THEMES[S.theme][0]); b.title = `Tema: ${THEMES[S.theme][1]}`; b.setAttribute('aria-label', `Tema ${THEMES[S.theme][1]}`);
    try { localStorage.setItem('gx-theme', S.theme); } catch {}
  }
  try { const t = localStorage.getItem('gx-theme'); if (THEMES[t]) S.theme = t; } catch {}
  applyTheme();
  K(top, 'theme').addEventListener('click', () => { S.theme = { auto: 'light', light: 'dark', dark: 'auto' }[S.theme]; applyTheme(); say(`Tema ${THEMES[S.theme][1]}`); });

  // ---------------- escala de tempo ----------------
  // Preferência: sim.setTimeScale (orquestrador). Sem ele: subpassos no fw.update + relógio do mundo.
  let patched = false;
  function patchFw() {
    if (patched || sim?.setTimeScale || typeof fw?.update !== 'function') return;
    const orig = fw.update.bind(fw); patched = true;
    fw.update = (dt, gas, c) => {
      const s = S.effScale; if (s <= 1 || !(dt > 0)) return orig(dt, gas, c);
      let rem = dt * s; const n = Math.min(40, Math.ceil(rem / 0.2)); let o;
      for (let i = 0; i < n; i++) o = orig(rem / n, gas, c);
      return o;
    };
  }
  function setScale(s) {
    S.scale = s;
    $$(top, '[data-scale]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.scale === s)));
    patchFw(); say(s === 1 ? 'Tempo real (1×)' : `Tempo acelerado ${s}× — interações com o botão voltam a 1× automaticamente`);
    uiLog(`Escala de tempo: ${s}×`);
  }
  function updateEffScale() {
    const interactive = S.btnHeld || ['boot', 'selftest', 'pumptest', 'cal', 'bump', 'shutdown', 'peak'].includes(S.phase) || eng.doneAt != null;
    const eff = interactive ? 1 : S.scale;
    if (eff !== S.effScale) {
      S.effScale = eff;
      if (sim?.setTimeScale) sim.setTimeScale(eff); else world.timeScale = eff;
    }
    K(top, 'scale').classList.toggle('auto1', S.scale > 1 && eff === 1);
  }

  // ---------------- câmeras ----------------
  views.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]'); if (!b) return;
    S.cam = b.dataset.cam; try { sim?.cam?.(S.cam); } catch {} S.view.dirty = true; setTimeout(() => { S.view.dirty = true; }, 350);
    $$(views, '[data-cam]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  // ---------------- dock ----------------
  const btnDev = $(dock, '[data-act="button"]');
  function press(on) {
    if (S.btnHeld === on) return; S.btnHeld = on;
    if (fw?.input) fw.input.button = on;
    try { sim?.device?.setButton?.(on); } catch {}
    if (on) { try { audio?.unlock?.(); audio?.click?.(); } catch {} }
    btnDev.classList.toggle('held', on);
    updateEffScale();
  }
  btnDev.addEventListener('pointerdown', (e) => { e.preventDefault(); try { btnDev.setPointerCapture(e.pointerId); } catch {} press(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btnDev.addEventListener(ev, () => press(false));
  btnDev.addEventListener('contextmenu', (e) => e.preventDefault());
  btnDev.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) press(true); });
  btnDev.addEventListener('keyup', (e) => { if (e.key === 'Enter') press(false); });
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    try { audio?.unlock?.(); } catch {}
    if (a === 'inlet') { S.coverToggle = !S.coverToggle; sim?.coverInlet?.(S.coverToggle || S.keyB); say(S.coverToggle ? 'Entrada da bomba tapada' : 'Entrada da bomba liberada'); }
    if (a === 'valve') { kit?.handleAction?.('valve'); uiLog(`Válvula do cilindro ${kit?.state?.valveOpen ? 'aberta' : 'fechada'}`); }
    if (a === 'hose') { kit?.handleAction?.('hose'); uiLog(`Mangueira ${kit?.state?.hoseAttached ? 'conectada' : 'desconectada'}`); }
    if (a !== 'button') b.blur();
  });
  // Espaço/B já são tratados pelo orquestrador; aqui só espelhamos o estado e evitamos que Espaço "clique" botões focados.
  const isTypeTarget = (t) => t?.closest?.('input,select,textarea');
  addEventListener('keydown', (e) => {
    if (isTypeTarget(e.target)) return;
    if (e.code === 'Space') { if (e.target?.closest?.('button')) e.preventDefault(); if (!e.repeat) { S.btnHeld = true; btnDev.classList.add('held'); updateEffScale(); } }
    if (e.code === 'KeyB' && !e.repeat) S.keyB = true;
  }, true);
  addEventListener('keyup', (e) => {
    if (e.code === 'Space') { if (e.target?.closest?.('button')) e.preventDefault(); if (S.btnHeld && !btnDev.matches(':active')) { S.btnHeld = false; btnDev.classList.remove('held'); updateEffScale(); } }
    if (e.code === 'KeyB') { S.keyB = false; if (S.coverToggle) setTimeout(() => sim?.coverInlet?.(true), 0); }
  }, true);
  addEventListener('blur', () => { if (S.btnHeld) press(false); S.keyB = false; });

  // ---------------- painéis: recolher / gaveta ----------------
  function setCollapsed(side, v) {
    S.collapsed[side] = v; (side === 'left' ? left : right).classList.toggle('collapsed', v);
    (side === 'left' ? revL : revR).classList.toggle('on', v); S.view.dirty = true;
  }
  K(left, 'collapse-left').addEventListener('click', () => setCollapsed('left', true));
  K(right, 'collapse-right').addEventListener('click', () => setCollapsed('right', true));
  revL.addEventListener('click', () => setCollapsed('left', false));
  revR.addEventListener('click', () => setCollapsed('right', false));
  function setSheet(open) { S.sheetOpen = open; setTimeout(() => { S.view.dirty = true; }, 420); right.classList.toggle('open', open); K(right, 'handle').setAttribute('aria-label', open ? 'Recolher painel' : 'Expandir painel'); S.view.dirty = true; }
  K(right, 'handle').addEventListener('click', () => setSheet(!S.sheetOpen));
  R.mini.addEventListener('click', () => { setTab('leituras'); setSheet(true); });
  // arrastar a gaveta (celular)
  (() => {
    let y0 = null, moved = false; const h = K(right, 'handle');
    h.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; });
    addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; if (Math.abs(dy) > 24) { setSheet(dy < 0); moved = true; } y0 = null; });
    h.addEventListener('click', (e) => { if (moved) { e.stopImmediatePropagation(); moved = false; } }, true);
  })();

  function setTab(id) {
    if (id === 'leituras' && !mq.matches) id = 'cenarios';
    S.tab = id;
    $$(right, '[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    for (const [k, p] of Object.entries(R.panes)) p.hidden = k !== id;
    if (id === 'registro') renderLog(true);
    if (id === 'ajustes') renderSettings();
    if (id === 'leituras') S.trendDirty = true;
  }
  right.addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) { setTab(b.dataset.tab); if (mq.matches) setSheet(true); } });

  function layout() {
    const mobile = mq.matches;
    document.documentElement.classList.toggle('gx-mobile', mobile);
    if (mobile) { R.panes.leituras.appendChild(readSec); setCollapsed('left', false); setCollapsed('right', false); if (S.tab === 'cenarios' && !S._mobInit) S.tab = 'leituras'; S._mobInit = true; }
    else { $(left, '[data-k="left-body"]').appendChild(readSec); setSheet(false); }
    setTab(S.tab); S.trendDirty = true; S.view.dirty = true;
  }
  mq.addEventListener?.('change', layout);

  // ---------------- cenários ----------------
  const scenPane = R.panes.cenarios;
  scenPane.innerHTML = `
    <p class="gx-lead">Escolha a atmosfera que chega à entrada da bomba. Com a mangueira do kit conectada e a válvula aberta, o aparelho passa a receber o gás do cilindro.</p>
    <div class="gx-scens" role="radiogroup" aria-label="Cenários">
      ${world.scenarios.map((s) => `
      <div class="gx-scen" data-id="${s.id}">
        <button class="gx-scen-h" role="radio" aria-checked="false" data-scen="${s.id}">
          <span class="gx-radio"></span><span class="gx-scen-n">${esc(s.name)}</span>
          <span class="gx-tags">${(SCEN_TAGS[s.id] || []).map((t) => `<em>${t}</em>`).join('')}</span></button>
        <div class="gx-scen-b"><p>${esc(s.desc || '')}</p><div class="gx-scen-c" data-ctl="${s.id}"></div></div>
      </div>`).join('')}
    </div>`;
  // controles específicos
  const ctlConf = $(scenPane, '[data-ctl="confinado"]');
  if (ctlConf) {
    ctlConf.innerHTML = `
      <div class="gx-conf">
        <svg class="gx-tank" viewBox="0 0 120 200" aria-label="Corte do tanque com a sonda">
          <defs>
            <linearGradient id="gxTankG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${GAS_COLOR.LEL}" stop-opacity=".55"/><stop offset=".22" stop-color="${GAS_COLOR.LEL}" stop-opacity=".08"/>
              <stop offset=".55" stop-color="#7f8a96" stop-opacity=".05"/><stop offset=".72" stop-color="${GAS_COLOR.H2S}" stop-opacity=".18"/>
              <stop offset="1" stop-color="${GAS_COLOR.H2S}" stop-opacity=".6"/></linearGradient>
          </defs>
          <rect x="30" y="22" width="76" height="168" rx="6" fill="url(#gxTankG)" class="gx-tank-w"/>
          <rect x="54" y="12" width="28" height="12" rx="2" class="gx-tank-m"/>
          ${[0, 1, 2, 3, 4, 5, 6].map((d) => `<g class="gx-tick"><line x1="22" x2="29" y1="${30 + d * 26}" y2="${30 + d * 26}"/><text x="18" y="${33 + d * 26}" text-anchor="end">${d}</text></g>`).join('')}
          <text x="68" y="40" text-anchor="middle" class="gx-tank-l">CH₄</text>
          <text x="68" y="182" text-anchor="middle" class="gx-tank-l">H₂S · CO₂</text>
          <line x1="68" y1="6" x2="68" y2="30" class="gx-probe" data-k="probe-line"/>
          <circle cx="68" cy="30" r="5" class="gx-probe-dot" data-k="probe-dot"/>
          <text x="18" y="12" text-anchor="end" class="gx-tank-u">m</text>
        </svg>
        <div class="gx-conf-r">
          <label class="gx-field"><span>Profundidade <b class="gx-num" data-k="depth-v">0,0 m</b></span>
            <input type="range" min="0" max="6" step="0.5" value="${world.depth ?? 0}" data-k="depth" aria-label="Profundidade da sonda em metros"></label>
          <dl class="gx-kv">
            <div><dt>Mangueira</dt><dd class="gx-num" data-k="hose-v">1,0 m</dd></div>
            <div><dt>Atraso de transporte</dt><dd class="gx-num" data-k="delay-v">≈ 2 s</dd></div>
            <div><dt>Espera recomendada</dt><dd class="gx-num" data-k="wait-v">14 s</dd></div>
          </dl>
        </div>
      </div>
      <p class="gx-note">${icon('info')}<span>A NR-33 exige avaliar a atmosfera antes da entrada. Boa prática de procedimento: descer a sonda <b>de cima para baixo, 1 m por vez</b>, esperando em cada nível o transporte pela mangueira (≈ 1 s + 0,7 s por metro) e 1,5 × o tempo de resposta do sensor mais lento (LEL, T90 ≈ 20 s).</span></p>`;
    const inp = K(ctlConf, 'depth');
    inp.addEventListener('input', () => { world.setDepth ? world.setDepth(+inp.value) : (world.depth = +inp.value); updateConf(); });
  }
  function updateConf() {
    if (!ctlConf) return;
    const d = world.depth ?? 0; const y = 30 + d * 26;
    setText(K(ctlConf, 'depth-v'), `${fmtNum(d)} m`); setText(K(ctlConf, 'hose-v'), `${fmtNum(d + 1)} m`);
    setText(K(ctlConf, 'delay-v'), `≈ ${fmtNum(TRANSPORT(d + 1))} s`); setText(K(ctlConf, 'wait-v'), `${Math.round(LEVEL_DWELL(Math.round(d)))} s`);
    K(ctlConf, 'probe-line').setAttribute('y2', y); K(ctlConf, 'probe-dot').setAttribute('cy', y);
    const inp = K(ctlConf, 'depth'); if (+inp.value !== d && document.activeElement !== inp) inp.value = d;
    const rp = R.panes.roteiros; const ri = K(rp, 'rdepth'); if (ri) { if (+ri.value !== d && document.activeElement !== ri) ri.value = d; setText(K(rp, 'rdepth-v'), `${fmtNum(d)} m`); }
  }
  const ctlMan = $(scenPane, '[data-ctl="manual"]');
  if (ctlMan) {
    ctlMan.innerHTML = MANUAL.map(({ g, min, max, step }) => `
      <label class="gx-field gx-slider" style="--gc:${GAS_COLOR[g]}"><span>${GAS_LABEL[g]} <small>${GAS_UNIT[g]}</small><b class="gx-num" data-mv="${g}"></b></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${world.manual?.[g] ?? (g === 'O2' ? 20.9 : 0)}" data-man="${g}" aria-label="${GAS_LABEL[g]} em ${GAS_UNIT[g]}"></label>`).join('') +
      `<div class="gx-row"><button class="gx-btn sm" data-k="man-reset">${icon('restart')}Ar limpo</button></div>`;
    const sync = () => { for (const { g } of MANUAL) setText($(ctlMan, `[data-mv="${g}"]`), fmtGas(g, +(world.manual?.[g] ?? 0))); };
    ctlMan.addEventListener('input', (e) => { const i = e.target.closest('[data-man]'); if (!i) return; world.manual[i.dataset.man] = +i.value; sync(); });
    K(ctlMan, 'man-reset').addEventListener('click', () => { Object.assign(world.manual, { H2S: 0, CO: 0, O2: 20.9, LEL: 0 }); for (const i of $$(ctlMan, '[data-man]')) i.value = world.manual[i.dataset.man]; sync(); });
    sync();
  }
  for (const s of world.scenarios) {
    if (s.id === 'confinado' || s.id === 'manual') continue;
    const c = $(scenPane, `[data-ctl="${s.id}"]`); if (!c) continue;
    c.innerHTML = `<div class="gx-row"><span class="gx-muted">No cenário há <b class="gx-num" data-st="${s.id}">00:00</b></span><button class="gx-btn sm" data-restart="${s.id}">${icon('restart')}Reiniciar</button></div>`;
  }
  scenPane.addEventListener('click', (e) => {
    const h = e.target.closest('[data-scen]'); if (h) { selectScenario(h.dataset.scen); return; }
    const r = e.target.closest('[data-restart]'); if (r) { selectScenario(r.dataset.restart, true); }
  });
  function selectScenario(id, restart) {
    if (!world.scenarios.some((s) => s.id === id)) return;
    if (world.scenario !== id || restart) { world.setScenario(id); uiLog(`Cenário: ${world.scenarios.find((s) => s.id === id).name}`); }
    $$(scenPane, '.gx-scen').forEach((n) => { const on = n.dataset.id === id; n.classList.toggle('on', on); $(n, '[role="radio"]').setAttribute('aria-checked', String(on)); });
    updateConf();
  }
  selectScenario(world.scenario || 'limpo');

  // ---------------- roteiros ----------------
  const rotPane = R.panes.roteiros;
  function renderRoutines() {
    const r = eng.active;
    if (!r) {
      rotPane.innerHTML = `<p class="gx-lead">Procedimentos passo a passo. O simulador confere cada passo automaticamente, pelo estado do aparelho e do kit.</p>
        <div class="gx-rlist">${ROUTINES.map((x, i) => `
          <article class="gx-rcard">
            <div class="gx-rcard-h"><span class="gx-rnum">${i + 1}</span><div><h3>${esc(x.name)} ${x.tag ? `<em class="gx-tag">${x.tag}</em>` : ''}</h3><small>${x.steps.length} passos · ${x.time}</small></div></div>
            <p>${esc(x.desc)}</p>
            <button class="gx-btn" data-start="${x.id}">${icon('play')}Iniciar roteiro</button>
          </article>`).join('')}</div>`;
      setCount('roteiros', '');
      return;
    }
    const n = r.steps.length; const done = eng.finished ? n : eng.idx;
    rotPane.innerHTML = `
      <div class="gx-rhead">
        <div><small>Roteiro ${r.tag ? `· ${r.tag}` : ''}</small><h3>${esc(r.name)}</h3></div>
        <span class="gx-num gx-rprog">${eng.finished ? 'Concluído' : `Passo ${eng.idx + 1} de ${n}`}</span>
      </div>
      <div class="gx-pbar"><i style="width:${(done / n) * 100}%"></i></div>
      ${eng.finished ? `<div class="gx-done">${icon('check')}<div><b>Roteiro concluído</b><span>Tempo simulado: ${fmtClock((world.time ?? 0) - eng.startedAt)}</span></div></div>` : ''}
      <ol class="gx-steps">${r.steps.map((s, i) => {
        const st = i < eng.idx || eng.finished ? 'done' : i === eng.idx ? 'cur' : 'todo';
        return `<li class="gx-st ${st}"><span class="gx-st-n">${st === 'done' ? icon('check') : i + 1}</span>
          <div class="gx-st-b"><b>${esc(s.title)}</b>${st === 'cur' ? `<p>${esc(s.hint || '')}</p>
            ${s.depth ? `<label class="gx-field gx-rdepth"><span>Profundidade da sonda <b class="gx-num" data-k="rdepth-v">${fmtNum(world.depth ?? 0)} m</b></span>
              <input type="range" min="0" max="6" step="0.5" value="${world.depth ?? 0}" data-k="rdepth" aria-label="Profundidade da sonda em metros"></label>` : ''}
            ${s.levels ? '<div class="gx-levels" data-k="levels"></div>' : ''}
            <div class="gx-st-info" data-k="info"></div>
            ${s.choices ? `<div class="gx-choices">${s.choices.map((c) => `<button class="gx-btn sm" data-choice="${c.value}">${c.label}</button>`).join('')}</div>` : ''}
            ${s.action || s.ack ? `<div class="gx-row">${s.action ? `<button class="gx-btn sm accent" data-k="sact">${esc(s.action.label)}</button>` : ''}${s.ack ? `<button class="gx-btn sm accent" data-k="sack">${icon('check')}${esc(s.ack)}</button>` : ''}</div>` : ''}` : ''}
          </div></li>`;
      }).join('')}</ol>
      <div class="gx-row gx-rfoot">
        ${eng.finished ? '' : `<button class="gx-btn ghost sm" data-k="rskip" title="Usar se o aparelho não reagir como esperado">${icon('skip')}Pular passo</button>`}
        <button class="gx-btn ghost sm" data-k="rrestart">${icon('restart')}Reiniciar</button>
        <button class="gx-btn ghost sm" data-k="rstop">${icon('close')}Sair</button>
      </div>`;
    setCount('roteiros', eng.finished ? '✓' : `${eng.idx + 1}/${n}`);
    renderLevels();
  }
  function markStepDone() { const li = $(rotPane, '.gx-st.cur'); if (li) li.classList.add('ok'); }
  function renderLevels() {
    const box = K(rotPane, 'levels'); if (!box) return; const st = eng.st; const lv = eng.profile?.levels;
    box.innerHTML = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const L = lv?.[d]; const req = LEVEL_DWELL(d);
      const pct = L ? Math.min(1, L.dwell / req) : 0;
      const cls = L?.done ? (L.alarm ? 'done bad' : 'done') : st.cur === d ? 'cur' : '';
      const val = L?.done && L.r ? `<small>${L.alarm ? 'alarme' : 'ok'}</small>` : `<small>${Math.round(req)} s</small>`;
      return `<span class="gx-lv ${cls}" style="--p:${pct}"><b class="gx-num">${d} m</b>${val}<i></i></span>`;
    }).join('');
    const done = (lv || []).filter((x) => x.done);
    if (done.length) {
      box.insertAdjacentHTML('beforeend', `<table class="gx-prof"><thead><tr><th>m</th><th>H₂S</th><th>CO</th><th>O₂</th><th>LEL</th></tr></thead><tbody>${
        (lv || []).map((x, d) => (x.done && x.r ? `<tr${x.alarm ? ' class="bad"' : ''}><td>${d}</td><td>${fmtGas('H2S', x.r.H2S)}</td><td>${fmtGas('CO', x.r.CO)}</td><td>${fmtGas('O2', x.r.O2)}</td><td>${x.r.ol ? 'OL' : fmtGas('LEL', x.r.LEL)}</td></tr>` : '')).join('')}</tbody></table>`);
    }
  }
  rotPane.addEventListener('input', (e) => {
    const i = e.target.closest('[data-k="rdepth"]'); if (!i) return;
    if (world.scenario !== 'confinado') selectScenario('confinado');
    world.setDepth ? world.setDepth(+i.value) : (world.depth = +i.value); updateConf();
  });
  rotPane.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.start) { eng.start(b.dataset.start); if (b.dataset.start === 'confinado') say('Dica: use a escala 10× para acelerar as esperas'); return; }
    const k = b.dataset.k; const s = eng.step();
    if (k === 'rstop') eng.stop();
    else if (k === 'rrestart') eng.start(eng.active.id);
    else if (k === 'rskip') eng.skip();
    else if (k === 'sact' && s?.action) s.action.run(api, eng.st);
    else if (k === 'sack') eng.st.acked = true;
    else if (b.dataset.choice && s?.choices) {
      const ans = s.answer(api);
      if (b.dataset.choice === ans) { eng.st.correct = true; b.classList.add('right'); }
      else { b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); say('Ainda não — veja qual campo pisca no visor e o painel de leituras', 'warn'); }
    }
  });
  renderRoutines();

  // ---------------- ajustes ----------------
  const setPane = R.panes.ajustes;
  function renderSettings() {
    const kinds = ['low', 'high', 'twa', 'stel'];
    setPane.innerHTML = `
      <div class="gx-sec-h"><span>Limites de alarme</span><span class="gx-sec-s">aplicados ao firmware</span></div>
      <table class="gx-lim">
        <thead><tr><th></th>${kinds.map((k) => `<th>${k.toUpperCase()}</th>`).join('')}</tr></thead>
        <tbody>${GASES.map((g) => `<tr><th style="--gc:${GAS_COLOR[g]}"><i></i>${GAS_LABEL[g]}<small>${GAS_UNIT[g]}</small></th>${kinds.map((k) => (DEFAULT_LIMITS[g][k] == null ? '<td class="na">—</td>' :
          `<td><input type="number" inputmode="decimal" step="${g === 'O2' ? 0.1 : 1}" value="${getLimit(fw, g, k)}" data-lim="${g}:${k}" aria-label="${GAS_LABEL[g]} ${k.toUpperCase()}"></td>`)).join('')}</tr>`).join('')}</tbody>
      </table>
      <p class="gx-note">${icon('info')}<span>LOW = 1º nível (sirene lenta) · HIGH = 2º nível (sirene rápida) · TWA = média ponderada de 8 h · STEL = exposição de curta duração (15 min). O₂ alarma abaixo do LOW e acima do HIGH. LEL = % do limite inferior de explosividade (% LIE). A NR-33 considera deficiente &lt; 19,5 % e enriquecida &gt; 23 % de O₂; o padrão do aparelho é 23,5 % — em espaço confinado, ajuste o HIGH do O₂ para 23,0.</span></p>
      <div class="gx-row"><button class="gx-btn ghost sm" data-k="lim-reset">${icon('restart')}Restaurar padrões</button></div>
      <div class="gx-sec-h"><span>Opções do aparelho</span></div>
      ${[['latch', 'Trava de alarme', 'O alarme continua até ser reconhecido com o botão, mesmo depois que o gás sumir.'],
         ['confidence', 'Bipe de confiança', 'Um bipe curto a cada 10 s confirma que o aparelho está ligado e funcionando.'],
         ['stealth', 'Modo invisível', 'Sem som e sem LEDs: o alarme é só por vibração (uso tático/discreto).']].map(([k, n, d]) => `
        <label class="gx-toggle"><span><b>${n}</b><small>${d}</small></span><input type="checkbox" data-tog="${k}" ${getToggle(fw, k) ? 'checked' : ''}><i></i></label>`).join('')}
      ${fw?.settings ? '' : `<p class="gx-note warn">${icon('alert')}O firmware ainda não expõe as configurações; os valores ficam guardados localmente.</p>`}`;
  }
  setPane.addEventListener('change', (e) => {
    const i = e.target;
    if (i.dataset.lim) {
      const [g, k] = i.dataset.lim.split(':'); const v = +i.value;
      if (!isFinite(v)) return;
      setLimit(fw, g, k, v); uiLog(`Limite ${GAS_LABEL[g]} ${k.toUpperCase()} = ${fmtNum(v, g === 'O2' ? 1 : 0)}`); say(`${GAS_LABEL[g]} ${k.toUpperCase()} = ${fmtNum(v, g === 'O2' ? 1 : 0)} ${GAS_UNIT[g]}`);
    }
    if (i.dataset.tog) { setToggle(fw, i.dataset.tog, i.checked); uiLog(`${i.closest('label').querySelector('b').textContent}: ${i.checked ? 'ligado' : 'desligado'}`); }
  });
  setPane.addEventListener('click', (e) => { if (e.target.closest('[data-k="lim-reset"]')) { resetLimits(fw); renderSettings(); uiLog('Limites restaurados aos padrões'); say('Limites restaurados'); } });

  // ---------------- registro ----------------
  const logPane = R.panes.registro;
  logPane.innerHTML = `
    <div class="gx-row gx-loghead"><span class="gx-muted" data-k="log-n">0 eventos</span>
      <button class="gx-btn sm" data-k="csv">${icon('download')}Exportar CSV</button></div>
    <ol class="gx-log" data-k="log"></ol>`;
  function allLog() {
    const a = (Array.isArray(fw?.log) ? fw.log : []).map(normLogEntry).filter(Boolean).map((e) => ({ ...e, src: 'aparelho' }));
    return a.concat(S.uiLog.map((e) => ({ ...e, level: '' }))).sort((x, y) => (x.t ?? 0) - (y.t ?? 0));
  }
  function renderLog(force) {
    const n = (fw?.log?.length || 0) + S.uiLog.length; const sig = `${n}`;
    setCount('registro', n ? String(Math.min(n, 999)) : '');
    if (!force && (sig === S.logSig || S.tab !== 'registro')) return;
    S.logSig = sig;
    const rows = allLog().slice(-250).reverse();
    setText(K(logPane, 'log-n'), `${n} evento${n === 1 ? '' : 's'}`);
    K(logPane, 'log').innerHTML = rows.length ? rows.map((e) => {
      const lv = /alarm|high|ol|fault|falha|err/i.test(e.level + ' ' + e.text) ? 'alarm' : /low|warn|twa|stel|aviso/i.test(e.level) ? 'warn' : '';
      return `<li class="${lv}"><time class="gx-num">${e.t == null ? '—' : fmtClock(e.t)}</time><span class="gx-src ${e.src}">${e.src === 'aparelho' ? 'aparelho' : 'sim.'}</span><span>${esc(e.text)}</span></li>`;
    }).join('') : `<li class="empty">Nenhum evento ainda. Ligue o aparelho, troque de cenário ou inicie um roteiro.</li>`;
  }
  K(logPane, 'csv').addEventListener('click', () => {
    const rows = allLog();
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + ['tempo_s;hora_simulada;origem;nivel;evento'].concat(rows.map((e) =>
      [e.t == null ? '' : (+e.t).toFixed(1).replace('.', ','), fmtClock(e.t), e.src, e.level || '', q(e.text)].join(';'))).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `registro-detector-${fmtClock(world.time ?? 0).replace(/:/g, '')}.csv`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    say(`CSV exportado (${rows.length} eventos)`);
  });
  function setCount(tab, txt) { const n = $(right, `[data-count="${tab}"]`); setText(n, txt); }

  // ---------------- tendência ----------------
  const tctx = R.trend.getContext('2d');
  function pctOf(g, v) {
    if (v == null) return null;
    if (g === 'O2') { const lo = getLimit(fw, 'O2', 'low'), hi = getLimit(fw, 'O2', 'high'); const n = 20.9; return v < n ? ((n - v) / Math.max(0.1, n - lo)) * 100 : ((v - n) / Math.max(0.1, hi - n)) * 100; }
    return (v / Math.max(0.1, getLimit(fw, g, 'low'))) * 100;
  }
  function sampleTrend() {
    const t = world.time ?? 0;
    if (t < S.lastSample) { S.trend.length = 0; S.lastSample = -1; }
    if (S.lastSample >= 0 && t - S.lastSample < 1) return;
    S.lastSample = t;
    const on = measuring(S.phase); const r = S.readings;
    S.trend.push({ t, v: Object.fromEntries(GASES.map((g) => [g, on && r ? (r[g].ol ? 220 : pctOf(g, r[g].v)) : null])) });
    while (S.trend.length && S.trend[0].t < t - 300) S.trend.shift();
    S.trendDirty = true;
  }
  function drawTrend() {
    const c = R.trend; const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = tctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(c);
    const grid = cs.getPropertyValue('--gx-grid').trim() || 'rgba(128,128,128,.15)';
    const sub = cs.getPropertyValue('--gx-text-3').trim() || '#888';
    const warn = cs.getPropertyValue('--gx-warn').trim() || '#f5a524';
    const padL = 30, padR = 8, padT = 8, padB = 18; const W = w - padL - padR, H = h - padT - padB;
    let max = 150; for (const p of S.trend) for (const g2 of GASES) if (p.v[g2] != null) max = Math.max(max, p.v[g2]);
    max = Math.min(250, Math.ceil(max / 50) * 50);
    const now = world.time ?? 0; const X = (t) => padL + W * (1 - (now - t) / 300); const Y = (v) => padT + H * (1 - Math.min(v, max) / max);
    g.font = '500 9.5px ui-sans-serif, system-ui, -apple-system, sans-serif'; g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += 50) {
      g.strokeStyle = grid; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, Math.round(Y(v)) + 0.5); g.lineTo(w - padR, Math.round(Y(v)) + 0.5); g.stroke();
      g.fillStyle = sub; g.textAlign = 'right'; g.fillText(`${v}`, padL - 6, Y(v));
    }
    g.save(); g.setLineDash([4, 3]); g.strokeStyle = warn; g.lineWidth = 1.2; g.beginPath(); g.moveTo(padL, Math.round(Y(100)) + 0.5); g.lineTo(w - padR, Math.round(Y(100)) + 0.5); g.stroke(); g.restore();
    g.fillStyle = warn; g.textAlign = 'left'; g.font = '600 9px ui-sans-serif, system-ui, sans-serif'; g.fillText('LOW', padL + 4, Y(100) - 7);
    g.fillStyle = sub; g.font = '500 9.5px ui-sans-serif, system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.fillText('−5 min', padL, h - 4); g.textAlign = 'center'; g.fillText('−2,5', padL + W / 2, h - 4); g.textAlign = 'right'; g.fillText('agora', w - padR, h - 4);
    g.save(); g.beginPath(); g.rect(padL, padT - 2, W + 2, H + 4); g.clip();
    for (const gas of GASES) {
      g.strokeStyle = GAS_COLOR[gas]; g.lineWidth = 1.7; g.lineJoin = 'round'; g.beginPath(); let pen = false, lx = 0, ly = 0;
      for (const p of S.trend) { const v = p.v[gas]; if (v == null) { pen = false; continue; } const x = X(p.t), y = Y(v); if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y); lx = x; ly = y; }
      g.stroke();
      if (pen) { g.fillStyle = GAS_COLOR[gas]; g.beginPath(); g.arc(lx, ly, 2.4, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
    if (!S.trend.some((p) => GASES.some((x) => p.v[x] != null))) {
      g.fillStyle = sub; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      g.fillText('sem leituras — aparelho desligado ou em partida', padL + W / 2, padT + H / 2);
    }
  }
  new ResizeObserver(() => { S.trendDirty = true; S.view.dirty = true; }).observe(R.trend);

  // ---------------- enquadramento: centraliza o aparelho na área livre ----------------
  function computeView() {
    const W = innerWidth, H = innerHeight; let l = 0, r = W, t = 0, b = H;
    const tb = top.getBoundingClientRect(); t = tb.bottom;
    const vb = views.getBoundingClientRect(); if (vb.height) t = Math.max(t, vb.bottom);
    if (mq.matches) {
      const rb = right.getBoundingClientRect(); const db = dock.getBoundingClientRect(); b = S.sheetOpen ? rb.top : Math.min(rb.top, db.top);
    } else {
      if (!S.collapsed.left) l = left.getBoundingClientRect().right;
      if (!S.collapsed.right) r = right.getBoundingClientRect().left;
      b = dock.getBoundingClientRect().top;
    }
    // botões fixos do orquestrador (demonstração / tela de perto) também limitam a área livre
    for (const n of document.querySelectorAll('.dm-wrap, .dm-btn, .zm-btn')) {
      const rb = n.getBoundingClientRect(); if (!rb.height || rb.top < H * 0.5) continue;
      if (rb.left < r && rb.right > l) b = Math.min(b, rb.top);
    }
    const fw_ = r - l, fh_ = b - t;
    // projeção do aparelho (sem deslocamento, zoom 1) → centraliza e dimensiona na área livre
    const box = deviceBoxPx(W, H);
    const fit = ['hero', 'ref1', 'front', 'back'].includes(S.cam) && box;
    const aspectRule = Math.max(0.42, Math.min(1, Math.max(0.2, fw_ / Math.max(1, fh_)) / 0.95, (fh_ / H) * 1.18));
    if (fit) {
      const zH = (0.84 * fh_) / Math.max(1, box.h), zW = (0.8 * fw_) / Math.max(1, box.w);
      S.view.tz = Math.max(0.42, Math.min(1.9, zH, zW));
      S.view.tx = Math.round((l + r) / 2 - W / 2 - box.cx * S.view.tz); S.view.ty = Math.round((t + b) / 2 - H / 2 - box.cy * S.view.tz);
    } else {
      S.view.tz = aspectRule;
      S.view.tx = Math.round((l + r) / 2 - W / 2); S.view.ty = Math.round((t + b) / 2 - H / 2);
    }
    S.view.tx = Math.max(-W * 0.4, Math.min(W * 0.4, S.view.tx)); S.view.ty = Math.max(-H * 0.35, Math.min(H * 0.35, S.view.ty));
    S.view.dirty = false;
  }
  let _box = null, _v = null;
  function deviceBoxPx(W, H) {
    const T = sim?.THREE, cam = sim?.stage?.camera, grp = sim?.device?.group; if (!T || !cam || !grp) return null;
    try {
      _box = _box || new T.Box3(); _v = _v || new T.Vector3();
      grp.updateWorldMatrix(true, true); cam.updateMatrixWorld();
      _box.setFromObject(grp);
      const sz = _box.getSize(_v); if (!isFinite(sz.x) || sz.y > 0.4 || sz.y < 0.02) { _box.setFromCenterAndSize(grp.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.0655, 0)), new T.Vector3(0.07, 0.131, 0.052)); }
      const inv = cam.matrixWorld.clone().invert(); const f = 1 / Math.tan((cam.fov * Math.PI) / 360); const asp = W / H;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).applyMatrix4(inv);
        if (_v.z > -1e-3) return null;
        const px = ((_v.x / -_v.z) * f / asp) * W / 2, py = -((_v.y / -_v.z) * f) * H / 2;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    } catch { return null; }
  }
  function applyView(dt) {
    const cam = sim?.stage?.camera; if (!cam?.setViewOffset) return;
    if (S.view.dirty) computeView();
    const k = 1 - Math.exp(-dt * 8); S.view.x += (S.view.tx - S.view.x) * k; S.view.y += (S.view.ty - S.view.y) * k;
    if (Math.abs(S.view.tx - S.view.x) < 0.5) S.view.x = S.view.tx; if (Math.abs(S.view.ty - S.view.y) < 0.5) S.view.y = S.view.ty;
    S.view.z += (S.view.tz - S.view.z) * k; if (Math.abs(S.view.tz - S.view.z) < 0.002) S.view.z = S.view.tz;
    if (Math.abs(cam.zoom - S.view.z) > 0.0005) { cam.zoom = S.view.z; cam.updateProjectionMatrix(); }
    const W = innerWidth, H = innerHeight; const v = cam.view;
    const ox = -S.view.x, oy = -S.view.y;
    if (!v || !v.enabled || v.fullWidth !== W || v.fullHeight !== H || Math.abs(v.offsetX - ox) > 0.01 || Math.abs(v.offsetY - oy) > 0.01) {
      cam.setViewOffset(W, H, ox, oy, W, H);
    }
  }
  addEventListener('resize', () => { S.view.dirty = true; S.trendDirty = true; });
  for (const n of [left, right]) n.addEventListener('transitionend', () => { S.view.dirty = true; });

  // ---------------- atualização por quadro ----------------
  function updateHUD(out) {
    const ph = S.phase; const hud = out?.hud || {};
    const fb = HUD_FALLBACK[ph] || HUD_FALLBACK.run;
    const level = hud.level || (ph === 'alarm' || ph === 'pumpfault' ? 'alarm' : ph === 'off' ? 'off' : 'info');
    setAttr(R.hud, 'data-level', level);
    setText($(R.state, 'span'), PHASE_LABEL[ph] || ph);
    setAttr(R.state, 'data-ph', ph);
    setText(R.hudTitle, hud.title || fb[0]); setText(R.hudText, hud.text || fb[1]);
    const step = hud.step; const hasStep = step != null && step !== '' && step !== false;
    R.step.hidden = !hasStep; if (hasStep) setText(R.step, typeof step === 'number' ? `Etapa ${step}` : String(step));
    setText(R.miniTitle, hud.title || fb[0]); setAttr(R.miniDot, 'data-level', level);
    const o = out || {};
    R.outs.buzzer.classList.toggle('on', !!o.buzzer?.on);
    R.outs.led.classList.toggle('on', (o.leds?.red || 0) > 0.3); R.outs.led.classList.toggle('green', (o.leds?.green || 0) > 0.3 && !((o.leds?.red || 0) > 0.3));
    R.outs.vibrate.classList.toggle('on', !!o.vibrate);
    R.outs.pump.classList.toggle('on', !!o.pump?.running); R.outs.pump.classList.toggle('bad', !!o.pump?.fault);
    setText(R.pumpst, o.pump?.fault ? 'falha da bomba' : o.pump?.running ? (S.covered ? 'bomba · entrada tapada' : kit?.state?.hoseAttached ? `bomba · gás do cilindro${kit.state.valveOpen ? '' : ' (válvula fechada)'}` : 'bomba amostrando') : 'bomba parada');
  }
  function updateReadings(out) {
    const on = measuring(S.phase) && out?.lcd?.on !== false;
    const r = S.readings; const al = S.alarms;
    for (const g of GASES) {
      const x = R.gas[g]; const a = al[g]; const rv = r[g];
      const calLike = S.phase === 'cal' || S.phase === 'bump';
      const st = !on ? 'off' : rv.ol ? 'ol' : a ? (a.rank >= 2 ? 'high' : 'low') : calLike ? 'cal' : 'ok';
      setAttr(x.n, 'data-st', st);
      setText(x.v, !on ? '—' : rv.ol ? 'OL' : rv.err ? 'ERR' : fmtGas(g, rv.v));
      setText(x.chip, !on ? '—' : rv.ol ? 'OL' : a ? LEVEL_TXT[a.level] || a.level.toUpperCase() : calLike ? (S.phase === 'cal' ? 'CAL' : 'BUMP') : 'OK');
      const lo = getLimit(fw, g, 'low'), hi = getLimit(fw, g, 'high');
      const [b0, b1] = g === 'O2' ? [14, 27] : g === 'LEL' ? [0, 100] : [0, Math.max(hi * 2, lo * 2)];
      const P = (v) => Math.max(0, Math.min(1, (v - b0) / (b1 - b0)));
      const fill = !on ? 0 : rv.ol ? 1 : P(rv.v ?? 0);
      if (x.fill.__f !== fill.toFixed(3)) { x.fill.__f = fill.toFixed(3); x.fill.style.transform = `scaleX(${fill})`; }
      x.lo.style.left = `${P(lo) * 100}%`; x.hi.style.left = `${P(hi) * 100}%`;
      if (g === 'O2') { const band = $(x.n, '.gx-band'); band.style.left = `${P(lo) * 100}%`; band.style.width = `${(P(hi) - P(lo)) * 100}%`; }
      setText(x.lim, g === 'O2' ? `${fmtNum(lo)} – ${fmtNum(hi)} %` : `LOW ${fmtNum(lo, 0)} · HIGH ${fmtNum(hi, 0)}`);
      const pk = out?.peaks?.[g]; const twa = out?.twa?.[g]; const stel = out?.stel?.[g];
      let ft = '';
      if (on && pk != null && isFinite(+pk)) ft = `pico ${fmtGas(g, +pk)}`;
      if (on && (g === 'H2S' || g === 'CO') && twa != null && isFinite(+twa)) ft += `\nTWA ${fmtNum(+twa, 1)}`;
      setText(x.pk, ft);
      const m = R.mg[g]; setAttr(m, 'data-st', st); setText($(m, 'b'), !on ? '—' : rv.ol ? 'OL' : fmtGas(g, rv.v));
    }
  }
  function updateDock() {
    const ks = kit?.state || {};
    const set = (act, pressed, sub) => { const b = $(dock, `[data-act="${act}"]`); setAttr(b, 'aria-pressed', String(!!pressed)); b.classList.toggle('on', !!pressed); const s = $(b, '[data-f="s"]'); if (s) setText(s, sub); };
    set('inlet', S.covered, S.covered ? 'tapada · tecla B' : 'livre · tecla B');
    set('valve', ks.valveOpen, ks.valveOpen ? `aberta · ${fmtNum((ks.flowLpm ?? 0.5), 1)} L/min` : `fechada${ks.pressureBar != null ? ` · ${Math.round(ks.pressureBar)} bar` : ''}`);
    set('hose', ks.hoseAttached, ks.hoseAttached ? 'conectada' : 'desconectada');
  }
  function updateRoutine(dt) {
    const res = eng.update(dt);
    if (!res || !eng.active) return;
    const info = K(rotPane, 'info');
    if (info) {
      const v = res.info; const warn = v && typeof v === 'object' ? v.warn : null; const txt = warn || (typeof v === 'string' ? v : '');
      setText(info, txt); info.classList.toggle('warn', !!warn); info.hidden = !txt;
    }
    if (eng.step()?.levels && (S.accText <= 0)) renderLevels();
  }

  let firstFrame = true;
  return {
    update(out, dt = 0.016) {
      if (firstFrame) { firstFrame = false; layout(); }
      S.out = out; S.phase = phaseOf(out, fw); S.readings = readingsOf(out); S.alarms = alarmsByGas(out);
      S.covered = S.coverToggle || S.keyB;
      const wt = world.time ?? 0; S.dtSim = Math.max(0, wt - S.lastWorldT); S.lastWorldT = wt;
      updateEffScale();
      S.accText -= dt;
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('on'); }
      updateRoutine(dt);
      sampleTrend();
      if (S.accText <= 0) {
        S.accText = 1 / 12;
        setText(R.clock, fmtClock(wt));
        updateHUD(out); updateReadings(out); updateDock();
        for (const s of world.scenarios) { const n = $(scenPane, `[data-st="${s.id}"]`); if (n && world.scenario === s.id) setText(n, fmtClock(world.scenarioTime ? world.scenarioTime() : 0).slice(3)); }
        updateConf();
        renderLog(false);
        document.documentElement.classList.toggle('gx-alarm', S.phase === 'alarm' || Object.keys(S.alarms).length > 0);
      }
      if (S.trendDirty && (S.tab === 'leituras' || !mq.matches)) { S.trendDirty = false; drawTrend(); }
      applyView(dt);
    },
    setTab, setSheet, selectScenario, startRoutine: (id) => eng.start(id), engine: eng, state: S, setScale,
  };
}
