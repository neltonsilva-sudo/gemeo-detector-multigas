// Mundo de gás: concentração na ENTRADA da bomba do detector. Dono: agente UI.
// sample(t, {kit}) → {H2S ppm, CO ppm, O2 %vol, LEL %LEL}. Ruído/rajadas determinísticos (seed fixa).

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// ruído de valor 1D suave (−1..1), tabela periódica de 256 pontos
function makeNoise(seed) {
  const r = mulberry32(seed); const tab = new Float32Array(256);
  for (let i = 0; i < 256; i++) tab[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f);
    const a = tab[i & 255], b = tab[(i + 1) & 255];
    return a + (b - a) * u;
  };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sig = (x) => 1 / (1 + Math.exp(-x));

export const SCENARIOS = [
  { id: 'limpo', name: 'Ar limpo', icon: 'air',
    desc: 'Atmosfera normal: O₂ 20,9 %, sem gases tóxicos ou inflamáveis. Use para ligar o aparelho, fazer o auto-zero e conferir as leituras de referência.' },
  { id: 'confinado', name: 'Espaço confinado estratificado', icon: 'tank',
    desc: 'Tanque de 6 m sem ventilação. Os gases se separam por densidade: metano (CH₄, mais leve que o ar) acumula no topo; H₂S e CO₂ (mais pesados) deslocam o O₂ no fundo. Baixe a sonda e avalie todos os níveis, de cima para baixo, antes de qualquer entrada (NR-33).' },
  { id: 'vazamento-h2s', name: 'Vazamento de H₂S', icon: 'plume',
    desc: 'Pluma de sulfeto de hidrogênio carregada pelo vento: a concentração oscila com as rajadas. Observe como o pico (MAX) e a média ponderada (TWA) se comportam com leituras instáveis.' },
  { id: 'co-motor', name: 'CO de motor a combustão', icon: 'engine',
    desc: 'Motor funcionando em ambiente fechado (galpão, garagem). O monóxido de carbono sobe continuamente: primeiro o alarme LOW (35 ppm), depois o HIGH (200 ppm).' },
  { id: 'deficiencia-o2', name: 'Deficiência de oxigênio', icon: 'o2down',
    desc: 'Gás inerte (N₂, argônio) desloca o ar e o O₂ cai para 16 %. Abaixo de 19,5 % o aparelho alarma — a pessoa não sente cheiro nem aviso nenhum.' },
  { id: 'explosiva', name: 'Atmosfera explosiva', icon: 'flame',
    desc: 'Vazamento de metano. A leitura em % LIE (LEL) — porcentagem do limite inferior de explosividade — sobe até passar de 100 % LEL: o aparelho mostra "OL" e trava o sensor até ser reiniciado em ar limpo.' },
  { id: 'enriquecimento-o2', name: 'Enriquecimento de O₂', icon: 'o2up',
    desc: 'Vazamento de oxigênio de cilindro (oxicorte). A NR-33 considera a atmosfera enriquecida acima de 23 % de O₂; o alarme HIGH padrão do aparelho é 23,5 % (ajustável em Ajustes). Com mais O₂, materiais queimam com muita facilidade. O alarme de O₂ é nos dois sentidos.' },
  { id: 'manual', name: 'Manual (controles deslizantes)', icon: 'sliders',
    desc: 'Você define cada concentração com os controles deslizantes. Útil para testar limites de alarme e a resposta dos sensores.' },
];

export function createGasWorld() {
  const nA = makeNoise(20260), nB = makeNoise(9173), nC = makeNoise(4421), nD = makeNoise(777);
  const w = {
    scenarios: SCENARIOS,
    scenario: 'limpo',
    manual: { H2S: 0, CO: 0, O2: 20.9, LEL: 0 },
    depth: 0,            // profundidade da sonda no cenário confinado (m)
    hoseLen: 0,          // comprimento de mangueira de amostragem (m), lido pelo orquestrador
    blocked: false,      // entrada bloqueada por condição do mundo
    time: 0,             // tempo simulado (s), avança com a escala de tempo
    timeScale: 1,        // fator extra aplicado pela UI (quando o orquestrador não escala)
    scenarioStart: 0,
    cylMix: 0,           // 0..1 — fração de gás do cilindro na entrada (rampa suave)
    ambient: { H2S: 0, CO: 0, O2: 20.9, LEL: 0 },
    last: { H2S: 0, CO: 0, O2: 20.9, LEL: 0 },
    _lastT: null,
    setScenario(id) {
      if (!SCENARIOS.some((s) => s.id === id)) return;
      w.scenario = id; w.scenarioStart = w.time;
      w.hoseLen = id === 'confinado' ? w.depth + 1 : 0;
    },
    setDepth(d) { w.depth = clamp(+d || 0, 0, 6); if (w.scenario === 'confinado') w.hoseLen = w.depth + 1; },
    scenarioTime() { return w.time - w.scenarioStart; },
    // perfil do tanque estratificado em função da profundidade (sem ruído) — usado também no gráfico da UI
    profile(d) {
      return {
        LEL: 0.4 + 17 * Math.exp(-d / 0.9),                      // CH₄ no topo
        H2S: 62 * sig((d - 4.1) / 0.42),                         // H₂S no fundo
        CO: 1 + 9 * sig((d - 4.8) / 0.5),
        O2: 20.9 - 0.25 * Math.exp(-d / 0.9) - 4.6 * sig((d - 4.4) / 0.5), // CO₂/H₂S deslocam O₂
      };
    },
    ambientAt(st, T) {
      const g = { H2S: 0, CO: 0, O2: 20.9, LEL: 0 };
      const fine = 0.5 * nD(T * 1.7) + 0.5 * nD(T * 4.3 + 50); // tremor fino
      switch (w.scenario) {
        case 'limpo': g.O2 = 20.9 + 0.02 * fine; break;
        case 'confinado': {
          const p = w.profile(w.depth); const turb = 1 + 0.06 * nA(T * 0.35) + 0.03 * fine;
          g.LEL = p.LEL * turb; g.H2S = p.H2S * turb; g.CO = p.CO * turb; g.O2 = p.O2 + 0.04 * fine; break;
        }
        case 'vazamento-h2s': {
          const wind = 0.5 + 0.5 * Math.sin(T * 0.19) * Math.sin(T * 0.071 + 1.3);
          const gust = Math.max(0, nA(T * 0.55)) * 1.6 + Math.max(0, nB(T * 1.9)) * 0.5;
          g.H2S = Math.max(0, 4 + 20 * wind + 26 * gust * (0.4 + wind) + 1.2 * fine);
          g.O2 = 20.9 - g.H2S * 0.0004; break;
        }
        case 'co-motor': {
          g.CO = Math.max(0, 320 * (1 - Math.exp(-st / 230)) * (1 + 0.05 * nA(T * 0.4)) + 1.5 * fine);
          g.O2 = 20.9 - 0.35 * (1 - Math.exp(-st / 300)); break;
        }
        case 'deficiencia-o2': g.O2 = 16 + 4.9 * Math.exp(-st / 80) + 0.03 * fine; break;
        case 'explosiva': {
          const lel = Math.min(135, 2 + 0.85 * st + 0.0012 * st * st) * (1 + 0.03 * nA(T * 0.6));
          g.LEL = Math.max(0, lel); g.O2 = 20.9 * (1 - g.LEL * 0.05 / 100); break;
        }
        case 'enriquecimento-o2': g.O2 = 20.9 + 4.3 * (1 - Math.exp(-st / 55)) + 0.04 * fine; break;
        case 'manual': {
          const m = w.manual;
          g.H2S = clamp(+m.H2S || 0, 0, 200); g.CO = clamp(+m.CO || 0, 0, 1000);
          g.O2 = clamp(m.O2 == null ? 20.9 : +m.O2, 0, 30); g.LEL = clamp(+m.LEL || 0, 0, 130);
          if (g.H2S > 0) g.H2S += 0.15 * fine; if (g.CO > 0) g.CO += 0.4 * nC(T * 2.1);
          break;
        }
      }
      return g;
    },
    sample(t, ctx = {}) {
      const dtRaw = w._lastT == null ? 0 : Math.max(0, t - w._lastT); w._lastT = t;
      const dt = dtRaw * (w.timeScale || 1);
      w.time += dt;
      const T = w.time, st = w.scenarioTime();
      const amb = w.ambientAt(st, T); w.ambient = amb;
      const ks = ctx.kit?.state;
      const flowing = !!(ks && ks.hoseAttached && ks.valveOpen && (ks.flowLpm ?? 0.5) > 0);
      // rampa suave: enche a mangueira/tampa em ~1,5 s, purga em ~4 s
      const tau = flowing ? 1.4 : 4;
      if (dt > 0) w.cylMix += ((flowing ? 1 : 0) - w.cylMix) * (1 - Math.exp(-dt / tau));
      if (!ks?.hoseAttached && !flowing) w.cylMix *= Math.exp(-dt / 0.6);
      // mangueira conectada com cilindro fechado/vazio → bomba puxa vácuo
      w.blocked = !!(ks && ks.hoseAttached && (!ks.valveOpen || (ks.flowLpm != null && ks.flowLpm <= 0)));
      const mix = ctx.kit?.mix || { H2S: 25, CO: 100, LEL: 50, O2: 18 };
      const k = clamp(w.cylMix, 0, 1);
      const out = {};
      for (const g of ['H2S', 'CO', 'O2', 'LEL']) out[g] = amb[g] + ((mix[g] ?? amb[g]) - amb[g]) * k;
      w.last = out;
      return out;
    },
  };
  return w;
}
