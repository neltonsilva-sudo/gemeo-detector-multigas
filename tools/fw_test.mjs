// Teste headless do firmware (Node, sem navegador): node tools/fw_test.mjs
import { createFirmware } from '../src/firmware.js';

const CLEAN = { H2S: 0, CO: 0, O2: 20.9, LEL: 0 };
const MIX = { H2S: 25, CO: 100, O2: 18, LEL: 50 };
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// roda o firmware por `sec` segundos a 60 Hz; cb(t) devolve {gas, blocked, button, hose}
function run(fw, sec, cb = () => ({}), dt = 1 / 60, onFrame) {
  const n = Math.round(sec / dt); let t = 0;
  for (let i = 0; i < n; i++) {
    const c = cb(t) || {};
    if (c.button !== undefined) fw.input.button = c.button;
    const out = fw.update(dt, c.gas || CLEAN, { inletBlocked: !!c.blocked, hoseLen: c.hose || 0 });
    t += dt; if (onFrame) onFrame(out, t);
  }
  return fw.out;
}
// espera até pred(out) ou timeout; devolve o tempo (s) ou -1
function until(fw, pred, max, cb = () => ({}), dt = 1 / 60) {
  let t = 0;
  while (t < max) {
    const c = cb(t) || {}; if (c.button !== undefined) fw.input.button = c.button;
    const out = fw.update(dt, c.gas || CLEAN, { inletBlocked: !!c.blocked, hoseLen: c.hose || 0 });
    t += dt; if (pred(out)) return t;
  }
  return -1;
}
const tap = (fw, c = {}) => { run(fw, 0.15, () => ({ ...c, button: true })); run(fw, 0.1, () => ({ ...c, button: false })); };
function bootToRun(fw) {
  run(fw, 3.3, () => ({ button: true })); run(fw, 0.1, () => ({ button: false }));
  const tp = until(fw, (o) => o.state === 'pumptest', 30);
  run(fw, 2); run(fw, 1.3, () => ({ blocked: true }));
  return [tp, until(fw, (o) => o.state === 'run', 20)];
}

console.log('\n1) Ligar segurando 3 s + sequência de partida');
{
  const fw = createFirmware({ seed: 1 });
  const states = []; let last = '';
  run(fw, 1.5, () => ({ button: true }), 1 / 60, (o, t) => { if (o.state !== last) { states.push([o.state, +t.toFixed(2)]); last = o.state; } });
  ok(fw.out.state === 'boot' && fw.out.lcd.banner === 'On 2', `contagem 'On 2' aos 1,5 s (banner=${fw.out.lcd.banner})`);
  run(fw, 0.2, () => ({ button: false }));
  ok(fw.out.state === 'off', 'soltar antes de 3 s → continua desligado');
  const fw2 = createFirmware({ seed: 2 }); last = ''; states.length = 0; let t0 = 0;
  const rec = (o, t) => { if (o.state !== last) { states.push([o.state, +(t0 + t).toFixed(2)]); last = o.state; } };
  run(fw2, 3.2, () => ({ button: true }), 1 / 60, rec); t0 += 3.2;
  ok(fw2.out.state === 'selftest' && fw2.out.lcd.all === true, 'autoteste: lcd.all=true aos 3 s');
  let sawBuzz = false, sawRed = false, sawGreen = false, sawVib = false;
  run(fw2, 0.1, () => ({ button: false }), 1 / 60, rec); t0 += 0.1;
  run(fw2, 2.5, () => ({}), 1 / 60, (o, t) => { rec(o, t); sawBuzz ||= o.buzzer.on; sawRed ||= o.leds.red > 0; sawGreen ||= o.leds.green > 0; sawVib ||= o.vibrate; }); t0 += 2.5;
  ok(sawBuzz && sawRed && sawGreen && sawVib, 'autoteste aciona sirene, LED vermelho, LED verde e vibração');
  let limitIcons = new Set();
  const tp = until(fw2, (o) => { if (o.state === 'limits') ['low', 'high', 'twa', 'stel'].forEach((k) => o.lcd.icons[k] && limitIcons.add(k + ':' + o.lcd.fields[0].text + '/' + o.lcd.fields[1].text)); rec(o, 0); return o.state === 'pumptest'; }, 30);
  ok([...limitIcons].join(',') === 'low:10/35,high:15/200,twa:10/35,stel:15/200', `limites exibidos com ícones: ${[...limitIcons].join(', ')}`);
  ok(tp > 8 && tp < 14, `teste da bomba começa ${tp.toFixed(1)} s após o autoteste`);
  ok(/BLOQUEIE/.test(fw2.out.hud.title), `HUD pede bloqueio: "${fw2.out.hud.title}"`);
  run(fw2, 3); run(fw2, 1.2, () => ({ blocked: true }));
  ok(fw2.out.lcd.banner === 'PASS', 'bloqueio ~1 s → PASS');
  const tr = until(fw2, (o) => o.state === 'run', 15);
  ok(tr > 0, `leitura normal ${tr.toFixed(1)} s após destapar (auto-cal O₂)`);
  console.log('    estados:', states.map((s) => s.join('@')).join(' → '));
  const f = fw2.out.lcd.fields.map((x) => x.text).join(' ');
  ok(f === '0 0 20.9 0', `leitura em ar limpo: ${f}`);
  // IntelliFlash ~1 Hz e ventoinha girando
  let pulses = 0, prevG = 0, ph0 = fw2.out.lcd.icons.fanPhase, fanMoves = 0;
  run(fw2, 10, () => ({}), 1 / 60, (o) => { if (o.leds.green && !prevG) pulses++; prevG = o.leds.green; if (o.lcd.icons.fanPhase !== ph0) fanMoves++; ph0 = o.lcd.icons.fanPhase; });
  ok(pulses >= 9 && pulses <= 11, `IntelliFlash: ${pulses} pulsos verdes em 10 s`);
  ok(fanMoves > 500 && fw2.out.pump.running, 'ventoinha girando (fanPhase avança) e bomba ligada');
}

console.log('\n2) Teste da bomba sem bloqueio → falha e desliga');
{
  const fw = createFirmware({ seed: 3 }); fw.power(true);
  until(fw, (o) => o.state === 'pumptest', 30);
  const tf = until(fw, (o) => o.state === 'pumpfail', 40);
  ok(near(tf, 30, 0.2), `falha após ${tf.toFixed(1)} s sem bloqueio`);
  ok(fw.out.buzzer.pattern === 'fast' && fw.out.pump.fault, 'alarme rápido + pump.fault');
  const toff = until(fw, (o) => o.state === 'off', 10);
  ok(toff > 0, `desliga ${toff.toFixed(1)} s depois`);
}

console.log('\n3) H₂S 30 ppm (sem mangueira): tempos BAIXO/ALTO, padrões, retorno');
{
  const fw = createFirmware({ seed: 4 }); bootToRun(fw); run(fw, 5);
  const gas = { ...CLEAN, H2S: 30 };
  const tl = until(fw, (o) => o.alarms.some((a) => a.gas === 'H2S'), 20, () => ({ gas }));
  ok(tl > 3.0 && tl < 4.3, `BAIXO (10 ppm) em ${tl.toFixed(2)} s (esperado ≈1 s atraso + 2,6 s T90/1ª ordem)`);
  ok(fw.out.state === 'low' && fw.out.buzzer.pattern === 'slow', `estado low, padrão slow`);
  const th = until(fw, (o) => o.state === 'high', 10, () => ({ gas }));
  ok(tl + th > 5.0 && tl + th < 6.3, `ALTO (15 ppm) em ${(tl + th).toFixed(2)} s`);
  ok(/abandone/i.test(fw.out.hud.text) && fw.out.hud.level === 'alarm', `HUD: "${fw.out.hud.title}"`);
  let on = 0, edges = 0, prev = false, vib = 0, red = 0;
  run(fw, 3.2, () => ({ gas }), 1 / 120, (o) => { if (o.buzzer.on) on++; if (o.buzzer.on && !prev) edges++; prev = o.buzzer.on; if (o.vibrate) vib++; if (o.leds.red) red++; });
  ok(edges >= 10 && edges <= 11 && fw.out.buzzer.pattern === 'fast', `sirene rápida: ${edges} pulsos em 3,2 s (≈3,1 Hz)`);
  ok(vib > 0 && red > 0 && fw.out.backlight && fw.out.lcd.icons.high && fw.out.lcd.fields[0].blink, 'vibra, LED vermelho, luz de fundo, ícone HIGH e campo piscando');
  const t90 = until(fw, (o) => o.readings.H2S >= 27, 30, () => ({ gas }));
  const peakNow = fw.out.readings.H2S;
  ok(peakNow >= 27 && peakNow <= 31, `estabiliza ≈ 29 ppm (ganho envelhecido 0,965): ${peakNow}`);
  const tc = until(fw, (o) => o.state === 'run', 60);
  ok(tc > 0, `alarme some sozinho ${tc.toFixed(1)} s depois de remover o gás (sem trava)`);
  ok(fw.out.peaks.H2S >= 27, `PICO guardado: ${fw.out.peaks.H2S}`);
}

console.log('\n3b) Trava de alarme + transporte da mangueira 3 m');
{
  const fw = createFirmware({ seed: 5 }); bootToRun(fw); fw.settings.latch = true; run(fw, 5);
  const gas = { ...CLEAN, H2S: 30 };
  const tl = until(fw, (o) => o.alarms.length > 0, 20, () => ({ gas, hose: 3 }));
  ok(tl > 5.1 && tl < 6.5, `com 3 m de mangueira, BAIXO em ${tl.toFixed(2)} s (+2,1 s de transporte)`);
  run(fw, 10, () => ({ gas, hose: 3 })); run(fw, 60, () => ({ hose: 3 }));
  ok(fw.out.state === 'high' && fw.out.alarms[0].latched && fw.out.readings.H2S === 0, 'gás sumiu mas alarme ALTO continua travado');
  ok(/TRAVADO/.test(fw.out.hud.title), `HUD: "${fw.out.hud.title}"`);
  tap(fw); run(fw, 0.6, () => ({ hose: 3 }));
  ok(fw.out.state === 'run', 'toque confirma e limpa o alarme travado');
}

console.log('\n4) Calibração completa (segurar → DESLIGAR → CAL)');
{
  const fw = createFirmware({ seed: 6 }); bootToRun(fw); run(fw, 5);
  const before = fw.out.calDays.H2S;
  let seq = [], last = '';
  const t = until(fw, (o) => { if (o.state !== last) { seq.push(o.state + (o.lcd.banner ? `[${o.lcd.banner}]` : '')); last = o.state; } return o.state === 'cal-zero'; }, 15, () => ({ button: true }));
  ok(t > 9.5 && t < 10.6, `entra em calibração após ${t.toFixed(1)} s segurando: ${seq.join(' → ')}`);
  run(fw, 0.2, () => ({ button: false }));
  ok(fw.out.lcd.icons.zero && fw.out.state === 'cal-zero', 'auto-zero (ícone zero)');
  const ta = until(fw, (o) => o.state === 'cal-apply', 12);
  ok(ta > 6 && ta < 9, `pede gás (APPLy) após ${ta.toFixed(1)} s de zero`);
  run(fw, 3);
  ok(fw.out.lcd.icons.cyl !== undefined && /APLIQUE/.test(fw.out.hud.title), `HUD: ${fw.out.hud.title}`);
  let cylBlink = new Set();
  const ts = until(fw, (o) => { cylBlink.add(o.lcd.icons.cyl); return o.state === 'cal-done' || o.state === 'cal-fail'; }, 120, () => ({ gas: MIX, hose: 1 }));
  ok(fw.out.state === 'cal-done', `span aprovado em ${ts.toFixed(1)} s (${fw.out.state})`);
  ok(cylBlink.has(true) && cylBlink.has(false), 'ícone do cilindro pisca durante o span');
  ok(fw.out.lcd.fields.every((f) => f.text === '180') && fw.out.lcd.icons.check, 'mostra 180 dias em cada gás + ✓');
  ok(before === 147, `dias antes da cal: ${before}`);
  const g = fw.sensors.gain;
  ok(near(g.H2S * (fw.sensors.y.H2S - fw.sensors.zero.H2S), 25, 0.3), `ganho H₂S ajustado (${g.H2S.toFixed(3)})`);
  run(fw, 6, () => ({ gas: MIX, hose: 1 }));
  ok(['multi', 'bump'].includes(fw.out.state), `de volta à leitura com o gás ainda aplicado → ${fw.out.state}`);
  const tb = until(fw, (o) => o.state === 'bump' && o.lcd.banner === 'PASS', 90);
  ok(tb > 0, `retirado o gás → BUMP OK automático (${tb.toFixed(1)} s)`);
  ok(fw.out.calDays.H2S === 180, 'calDays = 180');
}

console.log('\n4b) Falha de zero (gás presente) e span reprovado (gás diluído)');
{
  const fw = createFirmware({ seed: 7 }); bootToRun(fw); run(fw, 3);
  fw.calibrate(); run(fw, 9, () => ({ gas: { ...CLEAN, H2S: 8 } }));
  ok(fw.out.state === 'cal-zerofail' && fw.out.lcd.fields[0].text === 'ERR', `zero com H₂S → ${fw.out.state}, campo ${fw.out.lcd.fields[0].text}`);
  until(fw, (o) => o.state === 'run', 10, () => ({ gas: { ...CLEAN, H2S: 8 } }));
  run(fw, 60);
  fw.calibrate(); until(fw, (o) => o.state === 'cal-apply', 12);
  const half = { H2S: 12.5, CO: 50, O2: 18, LEL: 25 };
  until(fw, (o) => o.state === 'cal-done' || o.state === 'cal-fail', 120, () => ({ gas: half }));
  ok(fw.out.state === 'cal-fail' && fw.out.lcd.fields[0].text === 'ERR' && fw.out.lcd.fields[2].text !== 'ERR', `gás pela metade → cal-fail (campos ${fw.out.lcd.fields.map((f) => f.text).join(' ')})`);
  ok(fw.out.calDays.H2S < 180, 'dias não renovados após falha');
}

console.log('\n5) Bump guiado');
{
  const fw = createFirmware({ seed: 8 }); bootToRun(fw); run(fw, 3);
  fw.startBump(); run(fw, 0.5);
  ok(fw.out.state === 'bump' && fw.out.lcd.icons.bump, 'estado bump com ícone');
  run(fw, 25, () => ({ gas: MIX, hose: 1 }));
  const st = fw.out.state;
  ok(fw.out.alarms.length === 4 && fw.out.buzzer.pattern === 'multi', `4 gases em alarme, padrão multi (estado ${st})`);
  const tp = until(fw, (o) => o.lcd.banner === 'PASS', 90);
  ok(tp > 0 && /BUMP OK/.test(fw.out.hud.title), `BUMP OK ${tp.toFixed(1)} s após retirar o gás`);
}

console.log('\n6) Falha da bomba em operação');
{
  const fw = createFirmware({ seed: 9 }); bootToRun(fw); run(fw, 3);
  const tf = until(fw, (o) => o.state === 'pumpfault', 6, () => ({ blocked: true }));
  ok(tf > 2.0 && tf < 2.3, `falha da bomba após ${tf.toFixed(2)} s bloqueada`);
  const ph = fw.out.lcd.icons.fanPhase; run(fw, 1, () => ({ blocked: true }));
  ok(!fw.out.pump.running && fw.out.pump.fault && fw.out.lcd.icons.fanPhase === ph, 'ventoinha parada, pump.fault');
  ok(fw.out.buzzer.pattern === 'fast', 'sirene rápida');
  tap(fw, { blocked: true }); run(fw, 0.3, () => ({ blocked: true }));
  ok(fw.out.state === 'pumpfault', 'toque com entrada ainda bloqueada → continua em falha');
  run(fw, 0.5); tap(fw); run(fw, 0.6);
  ok(fw.out.state === 'run' && fw.out.pump.running, 'desbloqueia + toque → volta a monitorar');
}

console.log('\n7) Botão: luz de fundo, consulta PICO→TWA→STEL→LIMPAR');
{
  const fw = createFirmware({ seed: 10 }); bootToRun(fw); run(fw, 8);
  tap(fw); ok(fw.out.backlight, 'toque → luz de fundo');
  run(fw, 5.2); ok(!fw.out.backlight, 'apaga após 5 s');
  run(fw, 20, () => ({ gas: { ...CLEAN, CO: 50 } })); run(fw, 40);
  tap(fw); tap(fw);
  ok(fw.out.state === 'peak' && fw.out.view === 'peak' && fw.out.lcd.icons.peak, `2 toques → PICO (CO ${fw.out.lcd.fields[1].text})`);
  run(fw, 3); ok(fw.out.view === 'twa' && fw.out.lcd.icons.twa, `→ TWA (CO ${fw.out.lcd.fields[1].text})`);
  run(fw, 3); ok(fw.out.view === 'stel' && fw.out.lcd.icons.stel, `→ STEL (CO ${fw.out.lcd.fields[1].text})`);
  run(fw, 3); ok(fw.out.view === 'clear' && fw.out.lcd.banner === 'CLEAr', '→ LIMPAR?');
  tap(fw); ok(fw.out.peaks.CO === 0 && fw.out.state === 'run', 'toque em LIMPAR zera os picos');
}

console.log('\n8) LEL > 100 → OL travado; O₂ deficiência/enriquecimento');
{
  const fw = createFirmware({ seed: 11 }); bootToRun(fw); run(fw, 3);
  run(fw, 60, () => ({ gas: { ...CLEAN, LEL: 130 } }));
  ok(fw.out.state === 'ol' && fw.out.lcd.fields[3].text === 'OL', 'LEL 130 % → OL');
  run(fw, 90);
  ok(fw.out.lcd.fields[3].text === 'OL' && fw.out.state === 'ol', 'OL continua travado em ar limpo');
  const fw2 = createFirmware({ seed: 12 }); bootToRun(fw2); run(fw2, 3);
  run(fw2, 30, () => ({ gas: { ...CLEAN, O2: 18 } }));
  ok(fw2.out.alarms[0]?.gas === 'O2' && fw2.out.alarms[0].level === 'low' && fw2.out.buzzer.pattern === 'slow', `O₂ 18 % → deficiência (${fw2.out.hud.title})`);
  run(fw2, 40, () => ({ gas: { ...CLEAN, O2: 25 } }));
  ok(fw2.out.alarms[0]?.level === 'high' && fw2.out.buzzer.pattern === 'fast', `O₂ 25 % → enriquecimento (${fw2.out.hud.title})`);
}

console.log('\n9) TWA (8 h) e STEL (15 min) com passos grandes');
{
  const fw = createFirmware({ seed: 13 }); bootToRun(fw); run(fw, 3);
  run(fw, 8 * 3600, () => ({ gas: { ...CLEAN, H2S: 10.3 } }), 2.0);
  ok(near(fw.out.twa.H2S, fw.out.readings.H2S, 0.6), `TWA após 8 h a ~${fw.out.readings.H2S} ppm: ${fw.out.twa.H2S.toFixed(2)}`);
  const fw2 = createFirmware({ seed: 14 }); bootToRun(fw2); run(fw2, 3);
  run(fw2, 15 * 60, () => ({ gas: { ...CLEAN, CO: 120 } }), 0.5);
  ok(near(fw2.out.stel.CO, fw2.out.readings.CO, 4), `STEL após 15 min a ~${fw2.out.readings.CO} ppm: ${fw2.out.stel.CO.toFixed(1)}`);
  ok(near(fw2.out.twa.CO, fw2.out.readings.CO * 900 / 28800, 1), `TWA proporcional (15 min/8 h): ${fw2.out.twa.CO.toFixed(2)}`);
  const fw3 = createFirmware({ seed: 15 }); bootToRun(fw3); run(fw3, 3);
  run(fw3, 15 * 60, () => ({ gas: { ...CLEAN, H2S: 20 } }), 0.25);
  ok(fw3.out.state === 'high', `H₂S 20 ppm por 15 min → ALTO (STEL ${fw3.out.stel.H2S.toFixed(1)})`);
  run(fw3, 60, () => ({ gas: { ...CLEAN, H2S: 12 } }), 0.25);
  ok(fw3.out.state === 'stel' && fw3.out.buzzer.pattern === 'fast', `cai para ${fw3.out.readings.H2S} ppm: alarme STEL (média ${fw3.out.stel.H2S.toFixed(1)}) em vez de BAIXO`);
  const t = until(fw3, (o) => o.state === 'low', 900, () => ({ gas: { ...CLEAN, H2S: 12 } }), 0.25);
  ok(t > 60 && t < 600, `STEL cai abaixo de 15 após ${(t / 60).toFixed(1)} min → volta a BAIXO`);
}

console.log('\n10) Bateria: 13 h → fraca → esgotada → desliga');
{
  const fw = createFirmware({ seed: 16 }); bootToRun(fw); fw.setBattery(1);
  let tLow = -1, tOff = -1, t = 0, beepsLow = 0, prev = false, eight = 0;
  for (let i = 0; i < 15 * 3600 * 60; i++) {
    const dt = fw.battery > 0.001 ? 1 : 1 / 60;
    const o = fw.update(dt, CLEAN, {}); t += dt;
    if (tLow < 0 && o.state === 'lowbat') tLow = t;
    if (o.state === 'depleted') { break; }
    if (o.state === 'off') { tOff = t; break; }
  }
  ok(tLow > 11 * 3600 && tLow < 12.5 * 3600, `bateria fraca após ${(tLow / 3600).toFixed(2)} h`);
  ok(fw.out.state === 'depleted', `esgotada após ${(t / 3600).toFixed(2)} h (nominal 13 h)`);
  run(fw, 5, () => ({}), 1 / 60, (o) => { if (o.buzzer.on && !prev) eight++; prev = o.buzzer.on; });
  ok(eight === 8 && fw.out.state === 'off', `8 bipes e desliga (${eight})`);
  const fw2 = createFirmware({ seed: 17 }); bootToRun(fw2); fw2.setBattery(0.05); run(fw2, 11, () => ({}), 1 / 60, (o) => { if (o.buzzer.on && !prev) beepsLow++; prev = o.buzzer.on; });
  ok(beepsLow === 2 && fw2.out.lcd.icons.batteryBlink, `bateria fraca: bipe a cada 5 s (${beepsLow} em 11 s)`);
}

console.log('\n11) Modo invisível e bipe de confiança');
{
  const fw = createFirmware({ seed: 18 }); bootToRun(fw); fw.settings.stealth = true; run(fw, 3);
  let buzz = 0, led = 0, vib = 0;
  run(fw, 15, () => ({ gas: { ...CLEAN, H2S: 30 } }), 1 / 60, (o) => { buzz += o.buzzer.on; led += o.leds.red + o.leds.green; vib += o.vibrate; });
  ok(buzz === 0 && led === 0 && vib > 100 && fw.out.alarms.length, 'invisível: alarme só vibra');
  const fw2 = createFirmware({ seed: 19 }); bootToRun(fw2); fw2.settings.confidence = true; run(fw2, 1);
  let chirps = 0, prev = false;
  run(fw2, 30.5, () => ({}), 1 / 60, (o) => { if (o.buzzer.on && !prev && o.buzzer.pattern === 'chirp') chirps++; prev = o.buzzer.on; });
  ok(chirps === 3, `bipe de confiança a cada 10 s (${chirps} em 30 s)`);
}

console.log('\n12) Desligar: 4 bipes; jump() de todos os estados');
{
  const fw = createFirmware({ seed: 20 }); bootToRun(fw); run(fw, 2);
  let b = 0, prev = false;
  run(fw, 5.3, () => ({ button: true }), 1 / 60, (o) => { if (o.state === 'poweroff' && o.buzzer.on && !prev) b++; prev = o.buzzer.on; });
  run(fw, 1.5, () => ({ button: false }), 1 / 60, (o) => { if (o.buzzer.on && !prev) b++; prev = o.buzzer.on; });
  ok(fw.out.state === 'off' && b === 4, `desligado com ${b} bipes`);
  const names = ['off', 'boot', 'selftest', 'pumptest', 'run', 'low', 'high', 'twa', 'stel', 'multi', 'peak', 'cal-zero', 'cal-span', 'cal-done', 'bump', 'pumpfault', 'lowbat', 'shutdown'];
  const expectState = { 'cal-zero': 'cal-zero', 'cal-span': 'cal-span', 'cal-done': 'cal-done' };
  for (const n of names) {
    const f = createFirmware({ seed: 21 }); f.jump(n);
    const o0 = f.out; const o = f.update(0, CLEAN, {});
    const good = o.state === (expectState[n] || n) && o.lcd.fields.length === 4 && o.hud.title;
    ok(good && JSON.stringify(o0.lcd) === JSON.stringify(o.lcd), `jump('${n}') → ${o.state} | ${o.lcd.fields.map((x) => x.text || '·').join(' ')}${o.lcd.banner ? ' [' + o.lcd.banner + ']' : ''} | buzz=${o.buzzer.on ? o.buzzer.pattern : '-'} red=${o.leds.red} grn=${o.leds.green} | ${o.hud.title}`);
    run(f, 4); // evolui sem exceções
  }
  const f = createFirmware({ seed: 22 }); f.jump('high'); ok(f.out.readings.H2S === 22 && f.out.leds.red === 1 && f.out.buzzer.on, "jump('high'): H₂S 22, LED vermelho e sirene ligados no quadro");
  const f2 = createFirmware({ seed: 23 }); f2.jump('cal-span'); const tt = until(f2, (o) => o.state === 'cal-done', 90);
  ok(tt > 5, `jump('cal-span') conclui sozinho em ${tt.toFixed(1)} s`);
  const f3 = createFirmware({ seed: 24 }); f3.jump('bump'); const tb = until(f3, (o) => o.lcd.banner === 'PASS', 120);
  ok(tb > 0, `jump('bump') → BUMP OK em ${tb.toFixed(1)} s`);
  ok(f3.log.length > 3 && f3.log.every((e) => e.time && typeof e.t === 'number'), `log com timestamp (${f3.log.length} eventos, ex.: ${f3.log.at(-1).time} ${f3.log.at(-1).text})`);
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
