// Firmware do detector multigás com bomba (tipo GasAlertMax XT II). Dono: agente FIRMWARE.
// Puro JS, sem three/DOM → roda no navegador e no Node (tools/fw_test.mjs).
//
// ───────────────────────────── SAÍDAS (out) — semântica ─────────────────────────────
// out.state   : 'off' | 'boot' | 'selftest' | 'version' | 'limits' | 'caldays' | 'bumpdue' | 'pumptest' | 'pumpfail'
//               | 'autozero' | 'run' | 'low' | 'high' | 'twa' | 'stel' | 'multi' | 'ol' | 'peak' | 'bump' | 'pumpfault'
//               | 'lowbat' | 'shutdown' | 'poweroff' | 'calcount' | 'cal-zero' | 'cal-zerofail' | 'cal-apply'
//               | 'cal-span' | 'cal-fail' | 'cal-done' | 'callock' | 'depleted'
// out.leds    : { red, green } 0..1 (já com o padrão de piscar aplicado quadro a quadro).
//               red   = LEDs de alarme (barra superior + janelas laterais de grande ângulo) — alarmes, bateria, desligar.
//               green = IntelliFlash (barra superior): pulso curto ~1 Hz = "estou funcionando". Some em alarme.
// out.buzzer  : { on, freq, pattern, level }
//               on      = piezo ligado NESTE quadro (o firmware já aplica o ritmo; o áudio só segue `on` com envelope)
//               freq    = Hz da nota atual (≈2900; no multigás alterna 3150 = parte ALTA / 2750 = parte BAIXA)
//               pattern = null | 'slow' (BAIXO, TWA, O₂ deficiência: 0,30 s a cada 1,0 s)
//                              | 'fast' (ALTO, STEL, OL, falha da bomba: 0,16 s a cada 0,32 s)
//                              | 'multi' (multigás: 1 s de rápido alternado com 1 s de lento)
//                              | 'beep' (bipe isolado ~0,12–0,2 s: contagens, desligar, bateria, cal OK)
//                              | 'chirp' (bipe curtíssimo 0,07 s: bipe de confiança a cada 10 s)
//               level   = 0..1 intensidade sugerida (1 alarme, 0,6 bipes de interface)
// out.vibrate : motor de vibração ligado neste quadro (alarmes, autoteste, desligar, bateria esgotada).
// out.backlight / out.lcd.backlight : retroiluminação (toque = 5 s; sempre acesa em alarme; apagada no modo invisível).
// out.pump    : { running, fault, strain }  running = motor girando (ventoinha anima); strain = entrada obstruída (motor forçando).
// out.readings: leituras exibidas (números; OL → valor acima da escala). out.raw = leituras brutas do sensor.
// out.peaks {H2S,CO,O2,LEL,O2min,O2max}, out.twa {H2S,CO}, out.stel {H2S,CO}
// out.alarms  : [{gas:'H2S'|'CO'|'O2'|'LEL'|'PUMP'|'BAT', level:'low'|'high'|'twa'|'stel'|'ol'|'fault', value, latched}]
// out.hud     : { title, text, level:'info'|'ok'|'warn'|'alarm', step } — explicação didática em português.
// out.view    : tela de consulta ('peak'|'twa'|'stel'|'clear') quando state==='peak'.
// out.battery : 0..1 ; out.calDays {H2S..} ; out.bumpDue ; out.time (relógio do aparelho, s)
//
// Entradas: fw.input.button (bool, segurado). update(dt, inletGas, ctx={inletBlocked, hoseLen}).
// API extra: fw.startBump(), fw.cancelBump(), fw.setBattery(x), fw.clearPeaks(), fw.events (contador de eventos sonoros).

import { createSensors, Window, GASES, makeRng } from './fw_sensors.js';

const NAMES = { H2S: 'H₂S', CO: 'CO', O2: 'O₂', LEL: 'LEL' };
const UNITS = { H2S: 'ppm', CO: 'ppm', O2: '%', LEL: '% LIE' };
const PRI = { twa: 1, low: 2, stel: 3, high: 4, ol: 5 };
const LV_PT = { low: 'BAIXO', high: 'ALTO', twa: 'TWA', stel: 'STEL', ol: 'ACIMA DA ESCALA' };
const STEP_LIST = ['Ligar', 'Autoteste', 'Versão', 'Limites', 'Calibração', 'Teste da bomba', 'Auto-cal O₂', 'Monitorando'];

export const DEFAULT_SETTINGS = {
  limits: {
    H2S: { low: 10, high: 15, twa: 10, stel: 15 },
    CO: { low: 35, high: 200, twa: 35, stel: 200 },
    O2: { low: 19.5, high: 23.5 },
    LEL: { low: 10, high: 20 },
  },
  ranges: { H2S: 200, CO: 1000, O2: 30, LEL: 100 },
  calGas: { H2S: 25, CO: 100, O2: 18, LEL: 50 },
  latch: false,          // alarmes com trava (confirmar com o botão)
  confidence: false,     // bipe de confiança a cada 10 s
  stealth: false,        // modo invisível: só vibra
  intelliFlash: true,    // LED verde ~1 Hz
  safeDisplay: false,    // "SAFE" no display sem alarme
  lowAck: false,         // toque silencia a sirene do alarme BAIXO
  calInterval: 180,      // dias
  calLock: false,        // bloqueio por calibração vencida
  bumpDaily: true,       // aviso de bump vencido após bumpInterval horas
  bumpInterval: 24,      // h
  stelMinutes: 15,       // 5..15
  o2AutoCal: true,       // auto-cal O₂ na partida
  o2Nominal: 20.9,
  pumpTestOnBoot: true,
  pumpFailOff: true,     // teste da bomba reprovado → desliga (aparelho real); false → alarme até repetir
  backlightSec: 5,
  batteryHours: 13,      // autonomia nominal com bomba
  pumpFaultSec: 2,       // obstrução contínua que dispara a falha da bomba
  sensors: { H2S: true, CO: true, O2: true, LEL: true },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtN = (v, d = 0) => (d ? v.toFixed(d).replace('.', ',') : String(Math.round(v)));
const pad2 = (n) => String(n).padStart(2, '0');

export function createFirmware(opts = {}) {
  const rng = makeRng(opts.seed || ((Date.now() ^ 0x5bd1e995) >>> 0));
  const sensors = createSensors(rng);
  const settings = clone(DEFAULT_SETTINGS);
  if (opts.settings) Object.assign(settings, opts.settings);
  const startClock = opts.clock ?? Math.floor(Date.now() / 1000);

  // ---------------- estado interno ----------------
  const fw = {
    input: { button: false }, settings, log: [], out: null, state: 'off', mode: 'off', sensors, events: 0,
  };
  let T = 0;               // tempo simulado desde a criação (s)
  let clock = startClock;  // relógio do aparelho (s, epoch)
  let st = 0;              // tempo no modo atual
  let sub = 0;             // subetapa (limites etc.)
  let battery = 0.96;
  let lastCal = { H2S: clock - 33 * 86400, CO: clock - 33 * 86400, O2: clock - 33 * 86400, LEL: clock - 33 * 86400 };
  let lastBump = clock - 2 * 3600;
  // botão
  let btnPrev = false, pressT = 0, lastTapAt = -9, autoHold = false, offHold = false, tapsInWin = 0;
  // run
  let view = null, viewT = 0, blT = 0, blinkT = 0, heartT = 0, confT = 0, lowbatT = 0, fanPhase = 0, alarmT = 0;
  let pumpFault = false, blockedT = 0, lelLocked = false;
  let cond = {}, latched = {}, lastLevels = {}, lowAcked = false, prevKind = null;
  let display = { H2S: 0, CO: 0, O2: 20.9, LEL: 0 }, raw = { ...display };
  let peaks = { H2S: 0, CO: 0, LEL: 0, O2min: 20.9, O2max: 20.9 };
  const twaW = { H2S: new Window(60, 482), CO: new Window(60, 482) };
  const stelW = { H2S: new Window(5, 182), CO: new Window(5, 182) };
  let twa = { H2S: 0, CO: 0 }, stel = { H2S: 0, CO: 0 };
  // bump
  let bump = { guided: false, t: 0, hits: {}, firstHit: -1, allHit: false, result: null, resT: 0, failed: [] };
  // calibração
  let cal = { hist: [], zeroFail: [], spanRes: {}, gasT: 0, failMsg: '' };
  // pump test
  let ptBlockT = 0, ptPassed = false;
  // sons/luzes pontuais: {t0, dur, buzz, red, green, vib, kind}
  let fx = [];
  // gás injetado pelos jumps (some depois de `left` s ou se o mundo mudar)
  let override = null;
  let lastCtx = { inletBlocked: false, hoseLen: 0 };
  let prevMode = 'run';

  // ---------------- utilidades ----------------
  const days = (g) => Math.ceil(settings.calInterval - (clock - lastCal[g]) / 86400);
  const calDays = () => ({ H2S: days('H2S'), CO: days('CO'), O2: days('O2'), LEL: days('LEL') });
  const bumpDue = () => settings.bumpDaily && (clock - lastBump) > settings.bumpInterval * 3600;
  const enabled = (g) => settings.sensors[g] !== false;
  const timeStr = () => { const d = new Date(clock * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  function log(type, text) {
    fw.log.push({ t: +T.toFixed(2), time: timeStr(), type, text });
    if (fw.log.length > 500) fw.log.splice(0, fw.log.length - 500);
  }
  function go(m, s = 0) { if (m !== fw.mode) prevMode = fw.mode; fw.mode = m; st = 0; sub = s; }
  function sfx(delay, dur, o = {}) {
    fx.push({ t0: T + delay, dur, buzz: o.buzz !== false, red: !!o.red, green: !!o.green, vib: !!o.vib, kind: o.kind || 'beep', freq: o.freq || 2900 });
    fw.events++;
  }
  function beeps(n, on = 0.14, off = 0.12, o = {}) { for (let i = 0; i < n; i++) sfx(i * (on + off), on, o); }

  function resetSession() {
    peaks = { H2S: 0, CO: 0, LEL: 0, O2min: 20.9, O2max: 20.9 };
    for (const g of ['H2S', 'CO']) { twaW[g].reset(); stelW[g].reset(); }
    twa = { H2S: 0, CO: 0 }; stel = { H2S: 0, CO: 0 };
    cond = {}; latched = {}; lastLevels = {}; lelLocked = false; pumpFault = false; blockedT = 0; view = null;
    bump = { guided: false, t: 0, hits: {}, firstHit: -1, allHit: false, result: null, resT: 0, failed: [] };
  }

  // ---------------- leituras exibidas ----------------
  function computeDisplay() {
    raw = sensors.readAll();
    const d = {};
    d.H2S = Math.max(0, Math.round(raw.H2S));
    d.CO = Math.max(0, Math.round(raw.CO));
    d.O2 = Math.max(0, Math.round(raw.O2 * 10) / 10);
    d.LEL = Math.max(0, Math.round(raw.LEL));
    if (raw.LEL > settings.ranges.LEL) lelLocked = lelLocked || isRunLike();
    display = d;
  }
  const isRunLike = () => fw.mode === 'run';
  function calcExposure() {
    twa = { H2S: twaW.H2S.integral(28800) / 28800, CO: twaW.CO.integral(28800) / 28800 };
    const sw = settings.stelMinutes * 60;
    stel = { H2S: stelW.H2S.integral(sw) / sw, CO: stelW.CO.integral(sw) / sw };
  }
  function fieldText(g, v = display[g]) {
    if (!enabled(g)) return '';
    if (g === 'LEL' && lelLocked) return 'OL';
    if (v > settings.ranges[g]) return 'OL';
    return g === 'O2' ? v.toFixed(1) : String(Math.round(v));
  }

  // ---------------- alarmes ----------------
  // histerese de 1 contagem de resolução: um alarme ativo só some quando a leitura cai 1 dígito abaixo do ponto
  // de ajuste (evita liga-desliga com ruído exatamente no limite)
  const HYST = { H2S: 1, CO: 1, O2: 0.1, LEL: 1 };
  function evalCond() {
    const L = settings.limits, c = {};
    for (const g of GASES) {
      if (!enabled(g)) { c[g] = null; continue; }
      const v = display[g], prev = cond[g], hy = HYST[g]; let lv = null;
      const was = (lvl) => prev === lvl;
      if (g === 'O2') {
        if (v > settings.ranges.O2) lv = 'ol';
        else if (v >= L.O2.high - (was('high') ? hy : 0)) lv = 'high';
        else if (v <= L.O2.low + (was('low') ? hy + 1e-9 : 0)) lv = 'low';
      } else if (g === 'LEL') {
        if (lelLocked || v > settings.ranges.LEL) lv = 'ol';
        else if (v >= L.LEL.high - (was('high') ? hy : 0)) lv = 'high';
        else if (v >= L.LEL.low - (was('low') || was('high') ? hy : 0)) lv = 'low';
      } else {
        if (v > settings.ranges[g]) lv = 'ol';
        else if (v >= L[g].high - (was('high') ? hy : 0)) lv = 'high';
        else if (stel[g] >= L[g].stel) lv = 'stel';
        else if (v >= L[g].low - (was('low') || was('high') ? hy : 0)) lv = 'low';
        else if (twa[g] >= L[g].twa) lv = 'twa';
      }
      c[g] = lv;
    }
    return c;
  }
  function activeAlarms() {
    const a = {};
    for (const g of GASES) {
      const c = cond[g], l = settings.latch ? latched[g] : null;
      let lv = c; if (l && (!c || PRI[l] > PRI[c])) lv = l;
      if (lv) a[g] = { level: lv, latched: !c || (l && PRI[l] > PRI[c]) };
    }
    return a;
  }
  function alarmKind(a) {
    const ks = Object.keys(a); if (!ks.length) return null;
    if (ks.length >= 2) return 'multi';
    return a[ks[0]].level;
  }
  const patternOf = (k) => (k === 'multi' ? 'multi' : (k === 'high' || k === 'stel' || k === 'ol') ? 'fast' : 'slow');
  // ritmo dos padrões de alarme: {buzz, red, vib, freq}
  function patternAt(p, t) {
    if (p === 'slow') { const ph = t % 1.0; return { buzz: ph < 0.30, red: ph < 0.30, vib: ph < 0.5, freq: 2900 }; }
    if (p === 'fast') { const ph = t % 0.32; return { buzz: ph < 0.16, red: ph < 0.16, vib: (t % 1.2) < 0.9, freq: 2900 }; }
    if (p === 'multi') {
      const ph = t % 2.0;
      if (ph < 0.96) { const q = ph % 0.32; return { buzz: q < 0.16, red: q < 0.16, vib: true, freq: 3150 }; }
      const q = ph - 1.0; return { buzz: q >= 0 && q < 0.30, red: q >= 0 && q < 0.30, vib: q >= 0 && q < 0.5, freq: 2750 };
    }
    return { buzz: false, red: false, vib: false, freq: 2900 };
  }

  // ---------------- botão ----------------
  function buttonStep(h) {
    const b = !!fw.input.button || autoHold;
    const pressEdge = b && !btnPrev, relEdge = !b && btnPrev;
    btnPrev = b;
    if (pressEdge) { pressT = 0; onPress(); }
    if (b) { pressT += h; onHold(); }
    if (relEdge) {
      const wasTap = pressT < 0.8;
      onRelease();
      if (wasTap) {
        const dbl = (T - lastTapAt) < 0.55 && tapsInWin === 1;
        lastTapAt = T; tapsInWin = dbl ? 0 : 1;
        if (dbl) onDouble(); else onTap();
      }
    }
  }
  function onPress() { if (fw.mode !== 'off') blT = settings.backlightSec; }
  function onHold() {
    const m = fw.mode;
    if (m === 'off') {
      if (offHold) { if (pressT >= 7.0) { go('calcount'); beep1(); } }
      else if (battery > 0.005 || autoHold) { go('boot'); beep1(); log('energia', 'Botão pressionado: contagem para ligar'); }
      else if (pressT > 0.3 && st > 0.5) { go('depleted'); }
      return;
    }
    if (m === 'boot') return;
    if ((m === 'run' || m === 'callock' || m === 'cal-apply') && pressT >= 1.5) { go('shutdown'); beep1(); log('energia', 'Botão mantido: contagem DESLIGAR'); }
  }
  function onRelease() {
    autoHold = false;
    const m = fw.mode;
    if (m === 'boot') { go('off'); log('energia', 'Botão solto antes do fim da contagem — continua desligado'); }
    else if (m === 'shutdown') { go(prevMode === 'shutdown' ? 'run' : prevMode); log('energia', 'Desligamento cancelado'); }
    else if (m === 'calcount') { go('off'); offHold = false; log('cal', 'Contagem CAL interrompida'); }
    if (fw.mode === 'off') offHold = false;
  }
  function beep1(o = {}) { sfx(0, 0.12, { kind: 'beep', ...o }); }
  function onTap() {
    const m = fw.mode;
    if (m === 'run') {
      if (view === 'clear') { fw.clearPeaks(); beep1(); view = null; return; }
      if (pumpFault) {
        if (!lastCtx.inletBlocked) { pumpFault = false; blockedT = 0; log('bomba', 'Falha da bomba confirmada: fluxo restabelecido'); beep1(); }
        else log('bomba', 'Toque ignorado: entrada ainda obstruída');
        return;
      }
      if (bump.result) { bump.result = null; return; }
      let acked = false;
      if (settings.latch) for (const g of GASES) if (latched[g] && !cond[g]) { delete latched[g]; acked = true; }
      if (acked) { log('alarme', 'Alarme travado confirmado pelo usuário'); return; }
      const a = activeAlarms(); const k = alarmKind(a);
      if (settings.lowAck && k === 'low' && !lowAcked) { lowAcked = true; log('alarme', 'Alarme BAIXO reconhecido — sirene silenciada'); }
      return;
    }
    if (m === 'callock') { startCal(); return; }
    if (m === 'pumpfail' && !settings.pumpFailOff) { go('pumptest'); ptBlockT = 0; ptPassed = false; log('bomba', 'Repetindo teste da bomba'); }
    if (m === 'cal-done' || m === 'cal-fail' || m === 'cal-zerofail') { finishCal(); }
  }
  function onDouble() {
    if (fw.mode !== 'run' || pumpFault) return;
    if (!view) { view = 'peak'; viewT = 0; log('consulta', 'Dois toques: consulta PICO → TWA → STEL'); }
    else if (view === 'clear') { /* segundo toque do par já tratado como tap */ }
  }

  // ---------------- sequência de partida ----------------
  function powerOnSequenceStep() {
    const m = fw.mode;
    if (m === 'boot') {
      const dgt = 3 - Math.floor(pressT);
      if (dgt !== sub && dgt >= 1) { if (sub) beep1(); sub = dgt; }
      if (pressT >= 3) {
        autoHold = false; go('selftest'); resetSession(); log('energia', 'Ligado — autoteste');
        beeps(4, 0.18, 0.12, { red: true, vib: true }); sfx(0, 1.2, { buzz: false, vib: true, kind: 'vib' });
        for (let i = 0; i < 4; i++) sfx(0.15 + i * 0.3, 0.15, { buzz: false, green: true, kind: 'led' });
      }
      return;
    }
    if (m === 'selftest' && st >= 3.0) { go('version'); return; }
    if (m === 'version' && st >= 1.6) { go('limits', 0); return; }
    if (m === 'limits') { sub = Math.floor(st / 1.6); if (sub >= 4) go('caldays'); return; }
    if (m === 'caldays' && st >= 2.2) {
      const cd = calDays(); const overdue = GASES.some((g) => enabled(g) && cd[g] <= 0);
      if (overdue) log('cal', 'Calibração vencida');
      if (overdue && settings.calLock) { go('callock'); beeps(3); return; }
      if (bumpDue()) { go('bumpdue'); beeps(2); log('bump', 'Bump test vencido'); return; }
      afterInfo(); return;
    }
    if (m === 'bumpdue' && st >= 3.0) { afterInfo(); return; }
    if (m === 'pumptest') {
      if (!ptPassed) {
        if (lastCtx.inletBlocked) ptBlockT += _h; else ptBlockT = Math.max(0, ptBlockT - _h * 2);
        if (ptBlockT >= 1.0) { ptPassed = true; sub = 1; st = 0; beeps(2); log('bomba', 'Teste da bomba aprovado (vácuo detectado)'); }
        else if (st >= 30) {
          go('pumpfail'); log('bomba', 'Teste da bomba REPROVADO: entrada não foi bloqueada em 30 s');
        }
      } else if (st >= 2.0 && !lastCtx.inletBlocked) { afterPump(); }
      else if (st >= 6.0) { afterPump(); }
      return;
    }
    if (m === 'pumpfail') {
      if (settings.pumpFailOff && st >= 6) { powerOffNow('Teste da bomba reprovado — aparelho desligado'); }
      return;
    }
    if (m === 'autozero' && st >= 3.0) {
      const o2 = sensors.y.O2 * 1;
      if (o2 > 19.5 && o2 < 22.5) { sensors.spanO2(settings.o2Nominal); log('cal', `Auto-cal O₂ na partida: ajustado a ${fmtN(settings.o2Nominal, 1)} %`); }
      else log('cal', 'Auto-cal O₂ ignorada: ar ambiente fora de 20,9 %');
      enterRun(); return;
    }
  }
  function afterInfo() {
    if (settings.pumpTestOnBoot) { go('pumptest'); ptBlockT = 0; ptPassed = false; beep1(); log('bomba', 'Teste da bomba: aguardando bloqueio da entrada'); }
    else afterPump();
  }
  function afterPump() { if (settings.o2AutoCal) go('autozero'); else enterRun(); }
  function enterRun() { go('run'); view = null; heartT = 0; log('estado', 'Monitorando (leitura normal)'); }

  function powerOffNow(msg) {
    go('off'); offHold = false; autoHold = false; log('energia', msg || 'Desligado');
  }

  // ---------------- calibração ----------------
  function startCal() {
    go('cal-zero'); cal = { hist: [], zeroFail: [], spanRes: {}, gasT: 0, failMsg: '' };
    resetSession(); log('cal', 'Calibração: auto-zero em ar limpo'); beep1();
  }
  function calStep(h) {
    const m = fw.mode, CG = settings.calGas;
    if (m === 'calcount') {
      const dgt = 3 - Math.floor(st);
      if (dgt !== sub && dgt >= 1) { if (sub) beep1(); sub = dgt; }
      if (st >= 3) { offHold = false; autoHold = false; startCal(); }
      return;
    }
    if (m === 'cal-zero' && st >= 8) {
      const y = sensors.y, z = [];
      if (enabled('H2S') && y.H2S > 2) z.push('H2S');
      if (enabled('CO') && y.CO > 5) z.push('CO');
      if (enabled('LEL') && y.LEL > 3) z.push('LEL');
      if (enabled('O2') && Math.abs(y.O2 - settings.o2Nominal) > 0.8) z.push('O2');
      if (z.length) { cal.zeroFail = z; go('cal-zerofail'); beeps(3, 0.2, 0.15, { red: true }); log('cal', `Auto-zero FALHOU (gás presente: ${z.map((g) => NAMES[g]).join(', ')})`); return; }
      sensors.autoZero(); sensors.spanO2(settings.o2Nominal); beeps(1);
      log('cal', 'Auto-zero concluído e O₂ ajustado a 20,9 %'); go('cal-apply'); return;
    }
    if (m === 'cal-zerofail' && st >= 5) { finishCal(); return; }
    if (m === 'cal-apply') {
      const r = raw;
      if ((enabled('H2S') && r.H2S > 0.2 * CG.H2S) || (enabled('CO') && r.CO > 0.2 * CG.CO) || (enabled('LEL') && r.LEL > 0.2 * CG.LEL)) {
        go('cal-span'); cal.hist = []; cal.gasT = 0; log('cal', 'Gás de calibração detectado — span em andamento'); return;
      }
      if (st >= 120) { cal.failMsg = 'Gás de calibração não aplicado em 2 min'; go('cal-fail'); cal.spanRes = {}; for (const g of GASES) cal.spanRes[g] = false; beeps(3, 0.2, 0.15, { red: true }); log('cal', 'Calibração cancelada: gás não aplicado'); }
      return;
    }
    if (m === 'cal-span') {
      if (!lastCtx.inletBlocked) cal.gasT += h;
      const k = Math.floor(st);
      if (cal.hist.length <= k) cal.hist.push({ ...raw });
      const n = cal.hist.length;
      let stable = false;
      if (n > 6 && cal.gasT >= 20) {
        const a = cal.hist[n - 1], b = cal.hist[n - 6];
        stable = GASES.every((g) => !enabled(g) || Math.abs(a[g] - b[g]) <= (g === 'O2' ? 0.1 : 0.02 * CG[g]));
      }
      if (stable || st >= 90) {
        const res = {};
        for (const g of GASES) {
          if (!enabled(g)) { res[g] = true; continue; }
          const v = raw[g], tgt = CG[g];
          res[g] = g === 'O2' ? Math.abs(v - tgt) <= 1.0 : Math.abs(v - tgt) <= 0.2 * tgt;
          if (res[g]) { sensors.span(g, tgt); lastCal[g] = clock; }
        }
        cal.spanRes = res;
        const ok = GASES.every((g) => res[g]);
        if (ok) { go('cal-done'); lastBump = clock; beeps(2, 0.15, 0.1); log('cal', `Span aprovado: H₂S ${CG.H2S} ppm, CO ${CG.CO} ppm, O₂ ${CG.O2} %, LEL ${CG.LEL} % — próxima em ${settings.calInterval} dias`); }
        else { cal.failMsg = 'Leitura fora de ±20 % do valor do cilindro'; go('cal-fail'); beeps(3, 0.2, 0.15, { red: true }); log('cal', `Span REPROVADO: ${GASES.filter((g) => !res[g]).map((g) => NAMES[g]).join(', ')}`); }
      }
      return;
    }
    if ((m === 'cal-done' || m === 'cal-fail') && st >= 5) finishCal();
  }
  function finishCal() { resetSession(); enterRun(); }

  // ---------------- operação normal ----------------
  function runStep(h) {
    // falha da bomba
    if (!pumpFault) {
      if (lastCtx.inletBlocked) blockedT += h; else blockedT = 0;
      if (blockedT > settings.pumpFaultSec) { pumpFault = true; log('bomba', 'FALHA DA BOMBA: entrada obstruída — fluxo interrompido'); alarmT = 0; }
    }
    // TWA/STEL/picos
    for (const g of ['H2S', 'CO']) { twaW[g].add(display[g], h); stelW[g].add(display[g], h); }
    calcExposure();
    if (display.H2S > peaks.H2S) peaks.H2S = display.H2S;
    if (display.CO > peaks.CO) peaks.CO = display.CO;
    if (display.LEL > peaks.LEL) peaks.LEL = display.LEL;
    if (display.O2 < peaks.O2min) peaks.O2min = display.O2;
    if (display.O2 > peaks.O2max) peaks.O2max = display.O2;
    // alarmes
    cond = evalCond();
    for (const g of GASES) {
      const c = cond[g];
      if (c && settings.latch && (!latched[g] || PRI[c] > PRI[latched[g]])) latched[g] = c;
      if (c !== lastLevels[g]) {
        if (c) log('alarme', `ALARME ${LV_PT[c]} ${NAMES[g]} ${fieldText(g)} ${UNITS[g]}`);
        else log('alarme', `${NAMES[g]} voltou ao normal (${fieldText(g)} ${UNITS[g]})`);
        lastLevels[g] = c;
      }
    }
    const k = alarmKind(activeAlarms());
    if (k !== prevKind) { if (!prevKind || (k && PRI[k] > PRI[prevKind])) alarmT = 0; lowAcked = lowAcked && k === 'low'; prevKind = k; }
    alarmT += h;
    // bump automático/guiado
    // bump: cada sensor precisa entrar em alarme instantâneo (BAIXO ou acima; O₂ por deficiência). Obs.: o CO do
    // cilindro (100 ppm) fica abaixo do ALTO (200) — por isso o critério é "alarmou", não "passou do ALTO".
    for (const g of GASES) {
      const c = cond[g]; const hit = c && c !== 'twa' && (g !== 'O2' || c === 'low');
      if (enabled(g) && hit && !bump.hits[g]) { bump.hits[g] = T; if (bump.firstHit < 0) bump.firstHit = T; }
    }
    if (bump.firstHit >= 0 && !bump.allHit) {
      if (GASES.every((g) => !enabled(g) || bump.hits[g])) { bump.allHit = true; log('bump', 'Bump: todos os sensores atingiram o alarme'); }
      else if (T - bump.firstHit > 180 && !bump.guided) { bump.hits = {}; bump.firstHit = -1; }
    }
    if (bump.allHit && !k) {
      bump.result = 'pass'; bump.resT = 0; bump.allHit = false; bump.hits = {}; bump.firstHit = -1; bump.guided = false;
      lastBump = clock; beeps(2, 0.15, 0.1); log('bump', 'BUMP OK — alarmes sonoro, visual e vibratório confirmados');
    }
    if (bump.guided) {
      bump.t += h;
      if (bump.t > 150 && !bump.allHit) {
        bump.failed = GASES.filter((g) => enabled(g) && !bump.hits[g]);
        bump.result = 'fail'; bump.resT = 0; bump.guided = false; bump.hits = {}; bump.firstHit = -1;
        beeps(3, 0.2, 0.15, { red: true }); log('bump', `BUMP REPROVADO: ${bump.failed.map((g) => NAMES[g]).join(', ')} não alarmou`);
      }
    }
    if (bump.result) { bump.resT += h; if (bump.resT > 5) bump.result = null; }
    // consultas
    if (view) {
      viewT += h;
      const seq = ['peak', 'twa', 'stel', 'clear'], dur = { peak: 3, twa: 3, stel: 3, clear: 5 };
      if (viewT >= dur[view]) { const i = seq.indexOf(view); view = seq[i + 1] || null; viewT = 0; }
    }
    // bateria, confiança, IntelliFlash
    if (battery < 0.08 && battery > 0) {
      lowbatT += h; if (lowbatT >= 5) { lowbatT = 0; sfx(0, 0.14, { red: true, kind: 'beep' }); }
    }
    if (settings.confidence && !k && !pumpFault) {
      confT += h; if (confT >= 10) { confT = 0; sfx(0, 0.07, { kind: 'chirp', green: true, freq: 3000 }); }
    }
    if (battery <= 0) { go('depleted'); log('bateria', 'Bateria esgotada — desligamento automático'); }
  }

  // ---------------- passo de simulação ----------------
  let _h = 0;
  function step(h, gas, ctx) {
    _h = h; T += h; clock += h; st += h; blinkT += h; heartT += h;
    if (blT > 0) blT -= h;
    buttonStep(h);
    const m = fw.mode;
    const powered = m !== 'off';
    const pumpOn = powered && !['boot', 'selftest', 'poweroff', 'depleted'].includes(m) && !(m === 'run' && pumpFault) && m !== 'pumpfail';
    const flowing = pumpOn && !ctx.inletBlocked;
    if (powered) {
      sensors.step(h, gas, flowing, ctx.hoseLen);
      computeDisplay();
      const load = 1 + (blT > 0 || fw.out?.backlight ? 0.25 : 0) + (fw.out?.buzzer?.on ? 0.5 : 0);
      battery = Math.max(0, battery - (h * load) / (settings.batteryHours * 3600));
    }
    if (pumpOn) fanPhase = (fanPhase + h * (ctx.inletBlocked ? 0.6 : 2.2)) % 1;
    if (['boot', 'selftest', 'version', 'limits', 'caldays', 'bumpdue', 'pumptest', 'pumpfail', 'autozero'].includes(m)) powerOnSequenceStep();
    else if (m.startsWith('cal')) calStep(h);
    else if (m === 'run') runStep(h);
    else if (m === 'shutdown') {
      const dgt = 3 - Math.floor((pressT - 1.5) / 1.17);
      if (dgt !== sub && dgt >= 1) { if (sub) beep1(); sub = dgt; }
      if (pressT >= 5.0) {
        go('poweroff'); offHold = true; autoHold = false;
        for (let i = 0; i < 4; i++) sfx(i * 0.25, 0.14, { red: true, kind: 'beep' });
        sfx(0, 0.8, { buzz: false, vib: true, kind: 'vib' });
        log('energia', 'Desligando (4 bipes)');
      }
    } else if (m === 'poweroff' && st >= 1.1) {
      const still = !!fw.input.button || autoHold; go('off'); offHold = still; autoHold = false; log('energia', 'Desligado');
    } else if (m === 'depleted' && st >= 4.2) { powerOffNow('Desligado por bateria esgotada'); }
    fx = fx.filter((e) => T < e.t0 + e.dur + 0.01);
  }

  fw.update = (dt, inletGas = {}, ctx = {}) => {
    const c = { inletBlocked: !!ctx.inletBlocked, hoseLen: +ctx.hoseLen || 0 };
    let gas = { H2S: +inletGas.H2S || 0, CO: +inletGas.CO || 0, O2: inletGas.O2 == null ? 20.9 : +inletGas.O2, LEL: +inletGas.LEL || 0 };
    if (override) {
      if (!override.base) override.base = { ...gas };
      const moved = GASES.some((g) => Math.abs(gas[g] - override.base[g]) > (g === 'O2' ? 0.3 : 1));
      if (moved || override.left <= 0) override = null;
      else { gas = override.gas; override.left -= dt; }
    }
    lastCtx = c;
    dt = Math.max(0, Math.min(+dt || 0, 3600));
    if (dt > 0) {
      const n = Math.min(400, Math.max(1, Math.ceil(dt / 0.1))); const h = dt / n;
      for (let i = 0; i < n; i++) step(h, gas, c);
    } else buttonStep(0);
    compose();
    return fw.out;
  };

  // ---------------- composição da saída ----------------
  function baseIcons() {
    return { heart: false, fan: false, fanPhase, battery: battery > 0.6 ? 3 : battery > 0.3 ? 2 : battery > 0.08 ? 1 : 0,
      batteryBlink: battery < 0.08, bell: false, low: false, high: false, twa: false, stel: false, peak: false, cyl: false,
      clock: false, lock: false, check: false, warn: false, safe: false, pump: false, zero: false, cal: false, bump: false, off: false };
  }
  const F = (t, blink = false) => ({ text: t, blink });
  function compose() {
    calcExposure();
    const m = fw.mode; const blinkOn = (blinkT % 1) < 0.6;
    const icons = baseIcons();
    let fields = GASES.map((g) => F(fieldText(g)));
    let banner = null, all = false, on = m !== 'off', state = m;
    let leds = { red: 0, green: 0 }, buzz = { on: false, freq: 2900, pattern: null, level: 0.6 }, vib = false;
    let backlight = blT > 0, alarms = [], hud;
    let kind = null, act = {};
    const common = () => { icons.fan = true; icons.heart = false; };

    switch (m) {
      case 'off':
        on = false; hud = offHold
          ? { title: 'Desligado — continue segurando para calibrar', text: 'O display apagou. Se continuar segurando o botão, começa a contagem CAL (calibração).', level: 'info', step: null }
          : { title: 'Aparelho desligado', text: 'Segure o botão por ~3 s para ligar. A contagem 3-2-1 aparece com bipes; solte só quando o autoteste começar. Antes de entrar na área, o aparelho precisa passar no autoteste e no teste da bomba.', level: 'info', step: 'Ligar 1/8' };
        break;
      case 'boot':
        fields = [F(''), F(''), F(''), F('')]; banner = `On ${Math.max(1, 3 - Math.floor(pressT))}`; backlight = true;
        hud = { title: 'Ligando… mantenha o botão pressionado', text: `Contagem ${Math.max(1, 3 - Math.floor(pressT))}: continue segurando até o fim para o aparelho iniciar.`, level: 'info', step: 'Ligar 1/8' };
        break;
      case 'selftest': {
        all = true; fields = [F('888'), F('888'), F('88.8'), F('888')]; backlight = true;
        const ph = st % 0.6; leds = { red: ph < 0.3 ? 1 : 0, green: ph >= 0.3 ? 1 : 0 }; vib = st < 1.2;
        hud = { title: 'Autoteste', text: 'Todos os segmentos do display acendem, os LEDs vermelho e verde piscam, a sirene toca e o motor vibra. Confira se TUDO funcionou — se algum alarme não aparecer, não use o aparelho.', level: 'info', step: 'Autoteste 2/8' };
        break; }
      case 'version':
        fields = [F('1.0'), F('8'), F(''), F('')]; banner = 'UEr 1.08';
        hud = { title: 'Versão do firmware', text: 'O aparelho mostra a versão do software interno (útil para o registro de manutenção).', level: 'info', step: 'Versão 3/8' };
        break;
      case 'limits': {
        const L = settings.limits, s = Math.min(3, sub);
        const nm = ['low', 'high', 'twa', 'stel'][s]; icons[nm] = true; icons.bell = true;
        const v = (g) => (L[g][nm] != null ? (g === 'O2' ? L[g][nm].toFixed(1) : String(L[g][nm])) : '');
        fields = GASES.map((g) => F(enabled(g) ? v(g) : ''));
        const ex = { low: 'BAIXO (1º nível: atenção, prepare-se para sair)', high: 'ALTO (2º nível: abandone a área)', twa: 'TWA — média ponderada de 8 h (limite do turno)', stel: `STEL — média de ${settings.stelMinutes} min (exposição de curta duração)` }[nm];
        hud = { title: `Limites de alarme: ${nm.toUpperCase()}`, text: `Pontos de ajuste ${ex}: H₂S ${v('H2S') || '—'} ppm, CO ${v('CO') || '—'} ppm${v('O2') ? `, O₂ ${v('O2').replace('.', ',')} %` : ''}${v('LEL') ? `, LEL ${v('LEL')} %` : ''}.${nm === 'low' ? ' Para o O₂, o BAIXO é deficiência (≤ 19,5 %).' : nm === 'high' ? ' Para o O₂, o ALTO é enriquecimento (≥ 23,5 %).' : ' O₂ e LEL não têm TWA/STEL.'}`, level: 'info', step: 'Limites 4/8' };
        break; }
      case 'caldays': {
        const cd = calDays(); icons.cal = true; icons.clock = true; icons.cyl = true;
        fields = GASES.map((g) => F(enabled(g) ? String(Math.max(0, cd[g])) : '', cd[g] <= 0));
        const mn = Math.min(...GASES.filter(enabled).map((g) => cd[g]));
        hud = { title: 'Dias até a próxima calibração', text: mn > 0 ? `Faltam ${mn} dias para a calibração obrigatória (intervalo de ${settings.calInterval} dias).` : 'Calibração VENCIDA — calibre o aparelho antes de usá-lo.', level: mn > 0 ? 'info' : 'warn', step: 'Calibração 5/8' };
        break; }
      case 'bumpdue':
        icons.bump = blinkOn; icons.warn = true; icons.cyl = blinkOn; fields = [F(''), F(''), F(''), F('')]; banner = 'bUMP';
        hud = { title: 'Bump test vencido', text: `O último teste de resposta foi há mais de ${settings.bumpInterval} h. Faça o bump test (gás acima do alarme ALTO) antes de entrar na área.`, level: 'warn', step: 'Calibração 5/8' };
        break;
      case 'pumptest':
        icons.pump = true; icons.fan = true; fields = [F(''), F(''), F(''), F('')];
        if (!ptPassed) {
          banner = blinkOn ? 'PUMP' : 'tESt'; icons.warn = blinkOn;
          hud = { title: 'Teste da bomba: BLOQUEIE A ENTRADA', text: `Tape o bico de entrada da bomba com o dedo (ou feche a válvula com a mangueira conectada) por ~1 s. O aparelho precisa detectar o vácuo. Restam ${Math.max(0, Math.ceil(30 - st))} s.`, level: 'warn', step: 'Teste da bomba 6/8' };
        } else {
          banner = 'PASS'; icons.check = true;
          hud = { title: 'Teste da bomba aprovado', text: 'Vácuo detectado: bomba e vedação OK. Agora DESTAPE a entrada para a bomba voltar a aspirar.', level: 'ok', step: 'Teste da bomba 6/8' };
        }
        break;
      case 'pumpfail': {
        icons.pump = blinkOn; icons.warn = true; banner = blinkOn ? 'PUMP' : 'FAIL'; fields = [F(''), F(''), F(''), F('')];
        const p = patternAt('fast', st); buzz = { on: p.buzz, freq: 2900, pattern: 'fast', level: 1 }; leds.red = p.red ? 1 : 0; vib = p.vib; backlight = true;
        alarms.push({ gas: 'PUMP', level: 'fault', value: null, latched: false });
        hud = { title: 'Teste da bomba REPROVADO', text: settings.pumpFailOff ? 'A entrada não foi bloqueada (ou há vazamento na bomba/filtro/mangueira). O aparelho vai desligar — verifique o filtro e as conexões e religue.' : 'Vácuo não detectado. Verifique filtro/conexões; toque o botão para repetir o teste.', level: 'alarm', step: 'Teste da bomba 6/8' };
        break; }
      case 'autozero':
        icons.zero = true; icons.fan = true; icons.cal = blinkOn; banner = 'ZEro'; fields = [F('0'), F('0'), F(settings.o2Nominal.toFixed(1)), F('0')];
        hud = { title: 'Auto-calibração do O₂', text: 'Em ar limpo, o aparelho ajusta o sensor de O₂ para 20,9 %. Ligue-o sempre em ar fresco, fora da área a ser monitorada.', level: 'info', step: 'Auto-cal O₂ 7/8' };
        break;
      case 'shutdown': {
        const d = Math.max(1, 3 - Math.floor(Math.max(0, pressT - 1.5) / 1.17)); banner = `OFF ${d}`; icons.off = true; backlight = true;
        fields = [F(''), F(''), F(''), F('')];
        hud = { title: `Desligar: ${d}…`, text: 'Mantenha o botão pressionado até o fim da contagem para desligar. Se continuar segurando depois que o display apagar, entra a contagem CAL (calibração).', level: 'info', step: null };
        break; }
      case 'poweroff':
        banner = 'OFF'; icons.off = true; fields = [F(''), F(''), F(''), F('')];
        hud = { title: 'Desligando', text: '4 bipes, LEDs e vibração confirmam o desligamento.', level: 'info', step: null };
        break;
      case 'depleted': {
        banner = (st % 0.5) < 0.3 ? 'bAtt' : null; fields = [F(''), F(''), F(''), F('')]; icons.battery = 0; icons.batteryBlink = true;
        alarms.push({ gas: 'BAT', level: 'fault', value: 0, latched: false });
        hud = { title: 'Bateria ESGOTADA', text: 'Desligamento automático: 8 bipes, 8 flashes e vibração. Saia da área — você está sem monitoramento. Recarregue o aparelho.', level: 'alarm', step: null };
        break; }
      case 'callock':
        banner = 'CAL'; icons.lock = true; icons.cal = blinkOn; icons.warn = true; fields = [F(''), F(''), F(''), F('')];
        hud = { title: 'Bloqueado: calibração vencida', text: 'O aparelho não monitora até ser calibrado. Toque o botão para iniciar a calibração (em ar limpo) ou segure para desligar.', level: 'warn', step: null };
        break;
      case 'calcount':
        banner = `CAL ${Math.max(1, 3 - Math.floor(st))}`; icons.cal = true; icons.cyl = true; fields = [F(''), F(''), F(''), F('')]; backlight = true;
        hud = { title: `Entrar em calibração: ${Math.max(1, 3 - Math.floor(st))}…`, text: 'Continue segurando até a contagem CAL terminar. Esteja em ar limpo, com o cilindro, o regulador (0,5 L/min) e a mangueira/tampa de calibração à mão.', level: 'info', step: 'Calibração 1/4' };
        break;
      case 'cal-zero':
        common(); icons.zero = true; icons.cal = true; banner = 'ZEro'; backlight = true;
        fields = GASES.map((g) => F(fieldText(g), true));
        hud = { title: 'Calibração: auto-zero', text: `Ajustando o zero de todos os sensores e o O₂ em 20,9 %. NÃO aplique gás agora; mantenha o aparelho em ar limpo e sem correntes de vento. ${Math.max(0, Math.ceil(8 - st))} s.`, level: 'info', step: 'Calibração 2/4' };
        break;
      case 'cal-zerofail':
        icons.zero = true; icons.warn = true; banner = 'ZEro'; backlight = true;
        fields = GASES.map((g) => F(cal.zeroFail.includes(g) ? 'ERR' : fieldText(g), cal.zeroFail.includes(g)));
        hud = { title: 'Auto-zero FALHOU', text: `Há gás no ambiente (${cal.zeroFail.map((g) => NAMES[g]).join(', ')}): zerar agora mascararia leituras reais. Leve o aparelho para ar limpo e repita a calibração.`, level: 'alarm', step: 'Calibração 2/4' };
        break;
      case 'cal-apply':
        common(); icons.cyl = blinkOn; icons.cal = true; banner = 'APPLy'; backlight = true;
        if (lastCtx.inletBlocked) icons.pump = blinkOn;
        hud = { title: 'Calibração: APLIQUE O GÁS', text: lastCtx.inletBlocked
          ? 'A entrada está obstruída (mangueira conectada com a válvula fechada?). Abra a válvula do regulador para o gás fluir.'
          : `Conecte a mangueira do cilindro (H₂S ${settings.calGas.H2S} ppm, CO ${settings.calGas.CO} ppm, CH₄ 2,5 % = ${settings.calGas.LEL} % LIE, O₂ ${settings.calGas.O2} %) e abra a válvula — fluxo 250–500 mL/min. Restam ${Math.max(0, Math.ceil(120 - st))} s.`, level: 'warn', step: 'Calibração 3/4' };
        fields = GASES.map((g) => F(fieldText(g)));
        break;
      case 'cal-span': {
        common(); icons.cyl = blinkOn; icons.cal = true; backlight = true;
        fields = GASES.map((g) => F(fieldText(g)));
        if (lastCtx.inletBlocked) icons.pump = blinkOn;
        const pct = Math.min(99, Math.round(100 * Math.min(1, cal.gasT / 30)));
        hud = { title: 'Calibração: span em andamento', text: `Gás fluindo; o ícone do cilindro pisca enquanto as leituras estabilizam (~30 s). Não desconecte a mangueira. ${pct} %`, level: 'info', step: 'Calibração 3/4' };
        break; }
      case 'cal-fail':
        icons.warn = true; icons.cyl = true; backlight = true;
        fields = GASES.map((g) => F(cal.spanRes[g] ? fieldText(g) : 'ERR', !cal.spanRes[g]));
        hud = { title: 'Calibração REPROVADA', text: `${cal.failMsg}. Sensores com "ERR" mantêm a calibração antiga. Verifique a validade/concentração do cilindro, a vazão (0,5 L/min) e vazamentos na mangueira; repita. Se falhar de novo, troque o sensor.`, level: 'alarm', step: 'Calibração 4/4' };
        break;
      case 'cal-done':
        icons.check = true; icons.cal = true; icons.clock = true; backlight = true;
        fields = GASES.map((g) => F(enabled(g) ? String(settings.calInterval) : ''));
        hud = { title: 'Calibração concluída', text: `Todos os sensores aprovados. Próxima calibração em ${settings.calInterval} dias (mostrado acima de cada gás). Feche a válvula e retire a mangueira; o aparelho volta à leitura normal.`, level: 'ok', step: 'Calibração 4/4' };
        break;
      case 'run': {
        state = 'run';
        act = activeAlarms(); kind = alarmKind(act);
        for (const g of GASES) if (act[g]) alarms.push({ gas: g, level: act[g].level, value: display[g], latched: !!act[g].latched });
        icons.fan = true; icons.pump = false;
        if (view) {
          state = 'peak';
          if (view === 'peak') { icons.peak = true; const o2p = Math.abs(peaks.O2min - 20.9) >= Math.abs(peaks.O2max - 20.9) ? peaks.O2min : peaks.O2max;
            fields = [F(fieldText('H2S', peaks.H2S)), F(fieldText('CO', peaks.CO)), F(fieldText('O2', o2p)), F(fieldText('LEL', peaks.LEL))]; }
          else if (view === 'twa') { icons.twa = true; fields = [F(enabled('H2S') ? fmtTox(twa.H2S) : ''), F(enabled('CO') ? fmtTox(twa.CO) : ''), F(''), F('')]; }
          else if (view === 'stel') { icons.stel = true; fields = [F(enabled('H2S') ? fmtTox(stel.H2S) : ''), F(enabled('CO') ? fmtTox(stel.CO) : ''), F(''), F('')]; }
          else { banner = 'CLEAr'; icons.peak = true; icons.twa = true; icons.stel = true; fields = [F(''), F(''), F(''), F('')]; }
        } else {
          fields = GASES.map((g) => F(fieldText(g), !!act[g]));
        }
        if (kind) {
          state = kind; icons.bell = true; backlight = true;
          const lvls = Object.values(act).map((a) => a.level);
          if (kind === 'multi') { const half = (alarmT % 2) < 1; icons.high = lvls.some((l) => l === 'high' || l === 'stel' || l === 'ol') && half; icons.low = lvls.some((l) => l === 'low' || l === 'twa') && !half;
            if (!icons.high && !icons.low) { icons.high = lvls.includes('high'); icons.low = lvls.includes('low'); } }
          else { icons.low = kind === 'low'; icons.high = kind === 'high' || kind === 'ol'; }
          icons.twa = icons.twa || lvls.includes('twa'); icons.stel = icons.stel || lvls.includes('stel');
          if (Object.values(act).some((a) => a.latched)) icons.lock = true;
          const p = patternAt(patternOf(kind), alarmT);
          const silenced = settings.lowAck && lowAcked && kind === 'low';
          buzz = { on: p.buzz && !silenced, freq: p.freq, pattern: silenced ? null : patternOf(kind), level: 1 };
          leds.red = p.red ? 1 : 0; vib = p.vib;
        } else {
          if (settings.intelliFlash) { const ph = heartT % 1.0; leds.green = ph < 0.1 ? 1 : 0; }
          icons.heart = (heartT % 1.0) < 0.55;
          if (settings.safeDisplay) icons.safe = true;
        }
        if (pumpFault) {
          state = 'pumpfault'; icons.pump = blinkOn; icons.fan = true; icons.warn = true; banner = blinkOn ? 'PUMP' : null; backlight = true; icons.heart = false; leds.green = 0;
          if (!kind) { const p = patternAt('fast', alarmT); buzz = { on: p.buzz, freq: 2900, pattern: 'fast', level: 1 }; leds.red = p.red ? 1 : 0; vib = p.vib; }
          alarms.push({ gas: 'PUMP', level: 'fault', value: null, latched: false });
        }
        if (bump.guided || bump.result) {
          icons.bump = true; icons.cyl = bump.result ? true : blinkOn;
          if (bump.result === 'pass') { banner = 'PASS'; icons.check = true; }
          else if (bump.result === 'fail') { banner = 'FAIL'; icons.warn = true; }
          if (!pumpFault) state = 'bump';
        }
        if (!kind && !pumpFault && state === 'run' && battery < 0.08) state = 'lowbat';
        if (!kind && !pumpFault && !bump.guided && bumpDue()) icons.bump = blinkOn;
        hud = runHud(kind, act, state);
        break; }
      default:
        hud = { title: m, text: '', level: 'info', step: null };
    }
    // efeitos pontuais (bipes, flashes, vibração) se sobrepõem
    for (const e of fx) {
      if (T >= e.t0 && T < e.t0 + e.dur) {
        if (e.buzz && !buzz.on) buzz = { on: true, freq: e.freq, pattern: e.kind === 'chirp' ? 'chirp' : 'beep', level: e.kind === 'chirp' ? 0.45 : 0.7 };
        if (e.red) leds.red = 1; if (e.green) leds.green = 1; if (e.vib) vib = true;
      }
    }
    if (m === 'selftest' && st < 1.2) { buzz.on = buzz.on || (st % 0.3) < 0.18; buzz.pattern = buzz.pattern || 'beep'; vib = true; }
    if (m === 'depleted') { const k = Math.floor(st / 0.5), ph = st % 0.5; const o = k < 8 && ph < 0.25; buzz = { on: o, freq: 2900, pattern: o ? 'beep' : null, level: 1 }; leds.red = o ? 1 : 0; vib = st < 4; }
    // modo invisível: só vibração
    if (settings.stealth && on) { buzz = { ...buzz, on: false, pattern: null }; leds = { red: 0, green: 0 }; backlight = false; }
    if (!on) { leds = { red: 0, green: 0 }; buzz = { on: false, freq: 2900, pattern: null, level: 0 }; vib = vib && m !== 'off' ? vib : false; backlight = false; }
    const pumpRunning = on && !['boot', 'selftest', 'poweroff', 'depleted', 'pumpfail'].includes(m) && !(m === 'run' && pumpFault);
    if (!pumpRunning) icons.fan = icons.fan && on; // ventoinha parada (ícone estático)
    const lcd = { on, all, backlight, fields, labels: true, icons, banner };
    fw.state = state;
    fw.out = {
      lcd, leds, buzzer: buzz, vibrate: !!vib, backlight, pump: { running: pumpRunning, fault: (m === 'run' && pumpFault) || m === 'pumpfail', strain: pumpRunning && lastCtx.inletBlocked },
      readings: { ...display }, raw: { ...raw }, peaks: { H2S: peaks.H2S, CO: peaks.CO, O2: Math.abs(peaks.O2min - 20.9) >= Math.abs(peaks.O2max - 20.9) ? peaks.O2min : peaks.O2max, LEL: peaks.LEL, O2min: peaks.O2min, O2max: peaks.O2max },
      twa: { ...twa }, stel: { ...stel }, alarms, state, mode: m, view, hud, battery, calDays: calDays(), bumpDue: bumpDue(),
      time: clock, simTime: T, pumpFault, lelLocked,
    };
  }
  const fmtTox = (v) => (v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v)));

  function runHud(kind, act, state) {
    const rd = (g) => `${NAMES[g]} ${g === 'O2' ? fmtN(display.O2, 1) : fieldText(g)} ${UNITS[g]}`;
    if (pumpFault) return { title: 'FALHA DA BOMBA — entrada obstruída', text: lastCtx.inletBlocked
      ? 'A bomba parou porque a entrada/mangueira está bloqueada: o aparelho NÃO está amostrando o ar. Desobstrua a entrada (tire o dedo, abra a válvula, desdobre a mangueira) e toque o botão.'
      : 'Fluxo liberado. Toque o botão para confirmar e voltar a monitorar. Lembre: sem fluxo, as leituras não representam a atmosfera.', level: 'alarm', step: null };
    if (kind) {
      const gs = Object.keys(act);
      if (kind === 'multi') {
        const parts = gs.map((g) => `${rd(g)} (${LV_PT[act[g].level]})`).join(', ');
        return { title: `ALARME MULTIGÁS — ${gs.map((g) => NAMES[g]).join(' + ')}`, text: `${parts}. Mais de um gás em alarme: a sirene alterna os ritmos ALTO/BAIXO. Abandone a área imediatamente pelo caminho mais seguro, avise a equipe e não retorne sem avaliação e ventilação.`, level: 'alarm', step: null };
      }
      const g = gs[0], lv = act[g].level, lat = act[g].latched;
      let title = `ALARME ${LV_PT[lv]} ${rd(g)}`, text = '';
      if (g === 'O2' && lv === 'low') { title = `DEFICIÊNCIA DE O₂ — ${fmtN(display.O2, 1)} %`; text = 'Oxigênio ≤ 19,5 %: atmosfera deficiente (NR-33). Saia imediatamente — abaixo de ~16 % há perda de julgamento e coordenação, sem aviso. Não entre sem ventilação ou respirador de adução de ar.'; }
      else if (g === 'O2' && lv === 'high') { title = `ENRIQUECIMENTO DE O₂ — ${fmtN(display.O2, 1)} %`; text = 'Oxigênio ≥ 23,5 %: materiais queimam com muito mais facilidade. Elimine fontes de ignição, interrompa trabalhos a quente e saia; procure vazamento de O₂.'; }
      else if (lv === 'ol' && g === 'LEL') { title = 'LEL ACIMA DA ESCALA (OL) — atmosfera explosiva'; text = 'Concentração acima de 100 % do LIE: risco de explosão. Saia imediatamente sem acionar interruptores. O sensor LEL fica travado em OL até o aparelho ser desligado e religado em ar limpo.'; }
      else if (lv === 'ol') { text = `Leitura acima da faixa do sensor de ${NAMES[g]}. Concentração perigosíssima: abandone a área imediatamente.`; }
      else if (lv === 'high') { text = g === 'LEL' ? 'Atmosfera inflamável (≥ 20 % LIE): abandone a área imediatamente, elimine fontes de ignição e avise a equipe.' : `Abandone a área imediatamente, de preferência contra o vento/para local ventilado, e avise a equipe. Só retorne após ventilação e liberação${g === 'H2S' ? ' (H₂S paralisa o olfato — não confie no cheiro)' : ''}.`; }
      else if (lv === 'low') { text = g === 'LEL' ? 'Gás inflamável acima de 10 % do LIE (NR-33): pare trabalhos a quente, elimine fontes de ignição e saia; não entre no espaço confinado.' : 'Atenção: concentração acima do 1º nível. Afaste-se da fonte, avise o supervisor e prepare-se para sair; não entre em espaço confinado.'; }
      else if (lv === 'twa') { text = `Média ponderada de 8 h (TWA ${fmtN(twa[g], 1)} ppm) atingiu o limite do turno. Deixe a área: sua dose diária de exposição acabou.`; }
      else if (lv === 'stel') { text = `Média dos últimos ${settings.stelMinutes} min (STEL ${fmtN(stel[g], 1)} ppm) acima do limite de curta duração. Saia da área e só retorne quando a exposição cair.`; }
      if (lat && !cond[g]) { title = `Alarme TRAVADO — ${NAMES[g]}`; text = 'A concentração voltou ao normal, mas o alarme ficou travado para você saber que houve exposição. Toque o botão para confirmar.'; }
      if (bump.guided) text = `Bump test: alarme ${LV_PT[lv]} de ${NAMES[g]} confirmado. ${text}`;
      return { title, text, level: 'alarm', step: null };
    }
    if (state === 'bump' || bump.guided || bump.result) {
      if (bump.result === 'pass') return { title: 'BUMP OK', text: 'Todos os sensores responderam e os alarmes sonoro, visual e vibratório funcionaram. Aparelho liberado para uso hoje.', level: 'ok', step: 'Bump 3/3' };
      if (bump.result === 'fail') return { title: 'BUMP REPROVADO', text: `Não alarmou: ${bump.failed.map((g) => NAMES[g]).join(', ')}. Não use o aparelho — faça a calibração completa.`, level: 'alarm', step: 'Bump 3/3' };
      const got = GASES.filter((g) => bump.hits[g]).map((g) => NAMES[g]);
      if (bump.allHit) return { title: 'Bump test: retire o gás', text: 'Todos os sensores alarmaram. Feche a válvula e retire a mangueira; quando as leituras voltarem ao normal aparece BUMP OK.', level: 'info', step: 'Bump 2/3' };
      return { title: 'Bump test: aplique o gás', text: `Conecte a mangueira do cilindro e abra a válvula. Cada sensor deve entrar em alarme (H₂S/LEL acima do ALTO, CO acima do BAIXO, O₂ abaixo de 19,5 %). ${got.length ? `Já alarmaram: ${got.join(', ')}.` : ''}`, level: 'info', step: 'Bump 1/3' };
    }
    if (view) {
      const t = { peak: ['Consulta: PICO (MAX)', 'Maiores leituras desde que o aparelho foi ligado (O₂: a mais afastada de 20,9 %).'],
        twa: ['Consulta: TWA', 'Média ponderada de 8 h de H₂S e CO acumulada neste turno.'],
        stel: ['Consulta: STEL', `Média dos últimos ${settings.stelMinutes} min de H₂S e CO.`],
        clear: ['LIMPAR?', 'Toque o botão agora para zerar PICO, TWA e STEL; espere para manter.'] }[view];
      return { title: t[0], text: t[1], level: 'info', step: null };
    }
    if (lastCtx.inletBlocked) return { title: 'Entrada obstruída!', text: `Fluxo bloqueado há ${fmtN(blockedT, 1)} s — se continuar por mais de ${settings.pumpFaultSec} s, dispara a FALHA DA BOMBA.`, level: 'warn', step: null };
    if (battery < 0.08) return { title: 'Bateria fraca', text: `Restam cerca de ${Math.max(1, Math.round(battery * settings.batteryHours * 60))} min. Bipe e flash a cada 5 s. Termine a tarefa, saia da área e recarregue.`, level: 'warn', step: null };
    if (lelLocked) return { title: 'Sensor LEL travado (OL)', text: 'Houve leitura acima de 100 % LIE. Desligue e religue o aparelho em ar limpo para liberar o sensor.', level: 'warn', step: null };
    const cd = calDays(); const mn = Math.min(...GASES.filter(enabled).map((g) => cd[g]));
    const extra = [];
    if (bumpDue()) extra.push('Bump test vencido — faça o teste antes de entrar.');
    if (mn <= 0) extra.push('Calibração vencida.');
    return { title: 'Monitorando — atmosfera normal', text: `${rd('H2S')} · ${rd('CO')} · ${rd('O2')} · ${rd('LEL')}. O coração e o LED verde piscando (IntelliFlash) indicam que o aparelho está operando; a ventoinha girando mostra a bomba aspirando. ${extra.join(' ')}`.trim(), level: extra.length ? 'warn' : 'ok', step: 'Monitorando 8/8' };
  }

  // ---------------- API pública ----------------
  fw.power = (onFlag = true) => {
    if (onFlag) { if (fw.mode === 'off') { autoHold = true; btnPrev = false; pressT = 0; go('boot'); log('energia', 'Ligar (comando)'); } }
    else if (fw.mode !== 'off') { go('poweroff'); offHold = false; for (let i = 0; i < 4; i++) sfx(i * 0.25, 0.14, { red: true }); }
  };
  fw.clearPeaks = () => {
    peaks = { H2S: display.H2S, CO: display.CO, LEL: display.LEL, O2min: display.O2, O2max: display.O2 };
    for (const g of ['H2S', 'CO']) { twaW[g].reset(); stelW[g].reset(); }
    log('consulta', 'PICO, TWA e STEL zerados');
  };
  fw.startBump = () => { if (fw.mode !== 'run') return false; bump = { guided: true, t: 0, hits: {}, firstHit: -1, allHit: false, result: null, resT: 0, failed: [] }; log('bump', 'Bump test guiado iniciado'); return true; };
  fw.cancelBump = () => { bump.guided = false; bump.result = null; };
  fw.setBattery = (x) => { battery = Math.max(0, Math.min(1, +x)); };
  fw.charge = () => { battery = 1; log('bateria', 'Bateria recarregada'); };
  fw.calibrate = () => { if (fw.mode === 'run' || fw.mode === 'callock') { startCal(); return true; } return false; };
  fw.ackAlarms = () => { latched = {}; };
  Object.defineProperty(fw, 'battery', { get: () => battery, set: (v) => fw.setBattery(v) });
  Object.defineProperty(fw, 'time', { get: () => T });
  fw.setLastCal = (daysAgo) => { for (const g of GASES) lastCal[g] = clock - daysAgo * 86400; };
  fw.setLastBump = (hoursAgo) => { lastBump = clock - hoursAgo * 3600; };

  // ---------------- jump (estados de teste/captura) ----------------
  function inject(disp, left = 60) {
    const phys = sensors.prime(disp); override = { gas: phys, left, base: null };
    computeDisplay(); display = { ...disp }; raw = { ...disp };
  }
  const CLEAN = { H2S: 0, CO: 0, O2: 20.9, LEL: 0 };
  fw.jump = (name) => {
    fx = []; override = null; autoHold = false; offHold = false; btnPrev = !!fw.input.button; pressT = 0; blT = 0; view = null;
    resetSession(); lowAcked = false; prevKind = null; alarmT = 0.04; blinkT = 0.2; heartT = 0.03; battery = Math.max(battery, 0.9);
    sensors.zero.H2S = 0.15; sensors.zero.CO = 0.35; sensors.zero.LEL = 0.3;
    const runWith = (disp, left) => { inject(disp, left); enterRun(); calcExposure(); alarmT = 0.04; heartT = 0.03; cond = evalCond(); for (const g of GASES) lastLevels[g] = cond[g]; prevKind = alarmKind(activeAlarms()); };
    switch (name) {
      case 'off': go('off'); inject(CLEAN, 0); break;
      case 'boot': inject(CLEAN, 0); go('boot'); autoHold = true; btnPrev = true; pressT = 1.2; sub = 2; break;
      case 'selftest': inject(CLEAN, 0); go('selftest'); st = 0.1; break;
      case 'version': inject(CLEAN, 0); go('version'); break;
      case 'limits': inject(CLEAN, 0); go('limits'); break;
      case 'caldays': inject(CLEAN, 0); go('caldays'); break;
      case 'pumptest': inject(CLEAN, 0); go('pumptest'); st = 5; ptBlockT = 0; ptPassed = false; break;
      case 'autozero': inject(CLEAN, 0); go('autozero'); break;
      case 'run': runWith(CLEAN, 0); break;
      case 'low': runWith({ H2S: 12, CO: 0, O2: 20.9, LEL: 0 }, 60); break;
      case 'high': runWith({ H2S: 22, CO: 1, O2: 20.9, LEL: 0 }, 60); break;
      case 'twa':
        twaW.H2S.fill(10.6, 28800 * 0.985); runWith({ H2S: 8, CO: 0, O2: 20.9, LEL: 0 }, 60);
        peaks.H2S = 14; break;
      case 'stel':
        stelW.H2S.fill(15.8, settings.stelMinutes * 60); twaW.H2S.fill(2.1, 3600 * 3); runWith({ H2S: 9, CO: 0, O2: 20.9, LEL: 0 }, 60);
        peaks.H2S = 31; break;
      case 'multi': runWith({ H2S: 24, CO: 61, O2: 20.9, LEL: 12 }, 60); break;
      case 'ol': runWith({ H2S: 0, CO: 0, O2: 20.6, LEL: 100 }, 30); lelLocked = true; cond = evalCond(); break;
      case 'o2low': runWith({ H2S: 0, CO: 0, O2: 18.6, LEL: 0 }, 60); break;
      case 'o2high': runWith({ H2S: 0, CO: 0, O2: 24.1, LEL: 0 }, 60); break;
      case 'peak':
        runWith(CLEAN, 0); peaks = { H2S: 31, CO: 87, LEL: 7, O2min: 19.2, O2max: 21.0 };
        twaW.H2S.fill(2.4, 3600 * 4); twaW.CO.fill(9, 3600 * 4); stelW.H2S.fill(4.2, 900); stelW.CO.fill(18, 900);
        view = 'peak'; viewT = 0.5; break;
      case 'cal-zero': inject(CLEAN, 0); startCal(); st = 3; break;
      case 'cal-apply': inject(CLEAN, 0); startCal(); sensors.autoZero(); sensors.spanO2(settings.o2Nominal); go('cal-apply'); st = 4; break;
      case 'cal-span': {
        inject(CLEAN, 0); startCal(); sensors.autoZero(); sensors.spanO2(settings.o2Nominal); go('cal-span'); st = 12; cal.gasT = 12; cal.hist = [];
        const CG = settings.calGas;
        inject({ H2S: Math.round(CG.H2S * 0.86), CO: Math.round(CG.CO * 0.84), O2: 18.4, LEL: Math.round(CG.LEL * 0.74) }, 0);
        override = { gas: { H2S: CG.H2S, CO: CG.CO, O2: CG.O2, LEL: CG.LEL }, left: 120, base: null };
        for (let i = 0; i < 12; i++) cal.hist.push({ ...raw });
        break; }
      case 'cal-done': inject(CLEAN, 0); startCal(); sensors.autoZero(); for (const g of GASES) lastCal[g] = clock; cal.spanRes = { H2S: true, CO: true, O2: true, LEL: true }; go('cal-done'); st = 0.5; break;
      case 'cal-fail': inject(CLEAN, 0); startCal(); cal.spanRes = { H2S: true, CO: false, O2: true, LEL: true }; cal.failMsg = 'Leitura de CO fora de ±20 % do valor do cilindro'; go('cal-fail'); break;
      case 'cal-zerofail': inject({ H2S: 6, CO: 0, O2: 20.9, LEL: 0 }, 30); startCal(); cal.zeroFail = ['H2S']; go('cal-zerofail'); break;
      case 'calcount': inject(CLEAN, 0); go('calcount'); autoHold = true; btnPrev = true; pressT = 8; st = 1.2; sub = 2; break;
      case 'bump': {
        runWith({ H2S: 24, CO: 97, O2: 18.1, LEL: 48 }, 15);
        bump = { guided: true, t: 20, hits: { H2S: T, CO: T, O2: T, LEL: T }, firstHit: T, allHit: true, result: null, resT: 0, failed: [] };
        cond = evalCond(); prevKind = alarmKind(activeAlarms()); break; }
      case 'bump-ok': runWith(CLEAN, 0); bump.result = 'pass'; bump.resT = 0.5; break;
      case 'pumpfault': runWith(CLEAN, 0); pumpFault = true; blockedT = 3; alarmT = 0.04; break;
      case 'pumpfail': inject(CLEAN, 0); go('pumpfail'); st = 0.04; break;
      case 'lowbat': runWith(CLEAN, 0); battery = 0.05; lowbatT = 4.95; break;
      case 'depleted': inject(CLEAN, 0); battery = 0; go('depleted'); st = 0.1; break;
      case 'shutdown': runWith(CLEAN, 0); go('shutdown'); autoHold = true; btnPrev = true; pressT = 2.9; sub = 2; prevMode = 'run'; break;
      case 'callock': inject(CLEAN, 0); go('callock'); break;
      default: return false;
    }
    log('jump', `Estado de teste: ${name}`);
    compose();
    return true;
  };

  go('off'); compose();
  return fw;
}
