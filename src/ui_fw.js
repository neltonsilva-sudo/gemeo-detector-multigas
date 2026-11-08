// Adaptadores tolerantes entre a UI e o firmware (campos podem ainda não existir). Dono: agente UI.

export const GASES = ['H2S', 'CO', 'O2', 'LEL'];
export const GAS_LABEL = { H2S: 'H₂S', CO: 'CO', O2: 'O₂', LEL: 'LEL' };
export const GAS_UNIT = { H2S: 'ppm', CO: 'ppm', O2: '% vol', LEL: '% LEL' };
export const GAS_COLOR = { H2S: '#B48CF2', CO: '#4FA3F7', O2: '#2FC4A0', LEL: '#F2709E' };
export const DEFAULT_LIMITS = {
  H2S: { low: 10, high: 15, twa: 10, stel: 15 },
  CO: { low: 35, high: 200, twa: 35, stel: 200 },
  O2: { low: 19.5, high: 23.5 },
  LEL: { low: 10, high: 20 },
};
export const RANGE = { H2S: [0, 200], CO: [0, 1000], O2: [0, 30], LEL: [0, 100] };

const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);

// ---------- limites ----------
function limitsRoot(fw, create) {
  const s = fw?.settings;
  if (!s || typeof s !== 'object') return null;
  for (const k of ['limits', 'alarms', 'alarmLimits', 'alarm', 'thresholds']) {
    if (s[k] && typeof s[k] === 'object' && (s[k].H2S || s[k].h2s || s[k].CO)) return s[k];
  }
  if (s.H2S && typeof s.H2S === 'object') return s;
  if (!create) return null;
  s.limits = JSON.parse(JSON.stringify(DEFAULT_LIMITS));
  return s.limits;
}
function gasObj(root, gas) { return root?.[gas] ?? root?.[gas.toLowerCase()] ?? null; }
export function getLimit(fw, gas, kind) {
  const o = gasObj(limitsRoot(fw, false), gas);
  const v = num(o?.[kind] ?? o?.[kind.toUpperCase()] ?? o?.[kind[0].toUpperCase() + kind.slice(1)]);
  return v ?? DEFAULT_LIMITS[gas]?.[kind] ?? null;
}
export function setLimit(fw, gas, kind, value) {
  const root = limitsRoot(fw, true); if (!root) return false;
  let o = gasObj(root, gas); if (!o) { o = root[gas] = {}; }
  const key = kind in o ? kind : kind.toUpperCase() in o ? kind.toUpperCase() : kind;
  o[key] = +value;
  try { fw.applySettings?.(); fw.onSettings?.(); } catch {}
  return true;
}
export function resetLimits(fw) {
  for (const g of GASES) for (const k of Object.keys(DEFAULT_LIMITS[g])) setLimit(fw, g, k, DEFAULT_LIMITS[g][k]);
}

// ---------- opções booleanas ----------
const TOGGLE_KEYS = {
  latch: ['latch', 'latching', 'alarmLatch', 'latchAlarms', 'latched'],
  confidence: ['confidence', 'confidenceBeep', 'beepConfidence', 'confBeep'],
  stealth: ['stealth', 'invisible', 'stealthMode', 'silent', 'invisivel'],
};
export function getToggle(fw, name) {
  const s = fw?.settings; if (!s) return false;
  for (const k of TOGGLE_KEYS[name]) if (k in s) return !!s[k];
  return false;
}
export function setToggle(fw, name, v) {
  if (!fw) return;
  if (!fw.settings || typeof fw.settings !== 'object') fw.settings = {};
  const s = fw.settings; const k = TOGGLE_KEYS[name].find((x) => x in s) || TOGGLE_KEYS[name][0];
  s[k] = !!v;
  try { fw.applySettings?.(); fw.onSettings?.(); } catch {}
}

// ---------- estado / fase ----------
export function stateStr(out, fw) { return String(out?.state ?? fw?.state ?? '').toLowerCase(); }
const MODE_PHASE = {
  off: 'off', poweroff: 'shutdown', shutdown: 'shutdown', depleted: 'shutdown',
  boot: 'boot', version: 'boot', limits: 'boot', caldays: 'boot', bumpdue: 'boot', autozero: 'boot',
  selftest: 'selftest', pumptest: 'pumptest', pumpfail: 'pumpfault',
  callock: 'cal', calcount: 'cal',
};
export function phaseOf(out, fw) {
  const mode = String(out?.mode ?? fw?.mode ?? '').toLowerCase();
  const s = stateStr(out, fw);
  const hasAlarm = (out?.alarms || []).some((a) => normGas(a?.gas));
  if (mode) {
    if (MODE_PHASE[mode]) return MODE_PHASE[mode];
    if (mode.startsWith('cal')) return 'cal';
    if (mode === 'run') {
      if (s === 'pumpfault' || out?.pumpFault) return 'pumpfault';
      if (hasAlarm) return 'alarm';
      if (s === 'peak') return 'peak';
      if (s === 'bump') return 'bump';
      if (s === 'lowbat') return 'lowbat';
      return 'run';
    }
  }
  // sem out.mode: heurística pelo nome do estado
  if (out && out.lcd && out.lcd.on === false && !/boot|count|start/.test(s)) return 'off';
  if (/shut|desligando|poweroff|depleted/.test(s)) return 'shutdown';
  if (/^off|deslig/.test(s)) return 'off';
  if (/self|auto.?test/.test(s)) return 'selftest';
  if (/pump.?fault|pumpfail/.test(s) || out?.pump?.fault) return 'pumpfault';
  if (/pump.?test/.test(s)) return 'pumptest';
  if (/boot|start|count|version|limit/.test(s)) return 'boot';
  if (/bump/.test(s)) return 'bump';
  if (/cal|zero|span/.test(s)) return 'cal';
  if (/peak/.test(s)) return 'peak';
  if (/low.?bat/.test(s)) return 'lowbat';
  return hasAlarm ? 'alarm' : 'run';
}
export const PHASE_LABEL = {
  off: 'Desligado', boot: 'Partida', selftest: 'Autoteste', pumptest: 'Teste da bomba', run: 'Leitura normal',
  alarm: 'Em alarme', cal: 'Calibração', bump: 'Bump test', pumpfault: 'Falha da bomba', shutdown: 'Desligando',
  lowbat: 'Bateria fraca', peak: 'Picos / médias',
};
export function measuring(phase) { return ['run', 'alarm', 'cal', 'bump', 'pumpfault', 'lowbat', 'peak'].includes(phase); }

// ---------- alarmes ----------
const GAS_ALIASES = { h2s: 'H2S', co: 'CO', o2: 'O2', lel: 'LEL', ch4: 'LEL', ex: 'LEL' };
export function normGas(g) {
  if (typeof g === 'number') return GASES[g] ?? null;
  return GAS_ALIASES[String(g || '').toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}
export function alarmsByGas(out) {
  const m = {};
  for (const a of out?.alarms || []) {
    const g = normGas(a?.gas ?? a?.sensor ?? a?.id); if (!g) continue;
    const lv = String(a?.level ?? a?.type ?? 'low').toLowerCase();
    const rank = { low: 1, twa: 1, high: 2, stel: 2, ol: 3, over: 3 }[lv] ?? 1;
    if (!m[g] || rank > m[g].rank) m[g] = { level: lv, rank };
  }
  return m;
}

// ---------- leituras ----------
export function readingsOf(out) {
  const r = out?.readings || {};
  const f = out?.lcd?.fields || [];
  const res = {};
  GASES.forEach((g, i) => {
    const txt = String(f[i]?.text ?? '').trim().toUpperCase();
    res[g] = { v: num(r[g] ?? r[g.toLowerCase()]), ol: txt === 'OL' || txt === '0L', err: txt === 'ERR' };
  });
  return res;
}
export function fmtGas(g, v) {
  if (v == null) return '—';
  if (g === 'O2') return v.toFixed(1).replace('.', ',');
  return String(Math.max(0, Math.round(v)));
}
export function fmtNum(v, d = 1) { return v == null ? '—' : (+v).toFixed(d).replace('.', ','); }

// ---------- log ----------
export function normLogEntry(e) {
  if (e == null) return null;
  if (typeof e === 'string') return { t: null, text: e, level: '' };
  const t = num(e.t ?? e.time ?? e.ts ?? e.simTime);
  const text = e.msg ?? e.text ?? e.event ?? e.message ?? e.desc ?? JSON.stringify(e);
  const level = String(e.level ?? e.type ?? e.kind ?? '');
  return { t, text: String(text), level, detail: e.detail ?? e.value ?? '' };
}
export function fmtClock(sec) {
  if (sec == null || !isFinite(sec)) return '--:--:--';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
