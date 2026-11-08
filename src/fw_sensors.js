// Modelo físico dos sensores + acumuladores de exposição. Dono: agente FIRMWARE. Sem dependências (roda no Node).
//
// Cadeia por canal:  entrada da bomba → linha de atraso (transporte: 1 s interno + 0,7 s/m de mangueira; só "anda"
// enquanto a bomba aspira) → sensibilidade cruzada (H₂S→CO +5 %) → célula de 1ª ordem (T90) → leitura =
// ganho·(célula − zero) + ruído OU (passa-baixas) + deriva desprezível.
// O ganho/zero mudam na calibração (auto-zero, span). Antes da calibração o aparelho sai com ganhos ligeiramente
// envelhecidos (≈33 dias desde a última calibração), como um aparelho real em campo.

export const GASES = ['H2S', 'CO', 'O2', 'LEL'];
export const T90 = { H2S: 15, CO: 15, O2: 10, LEL: 20 };
const LN10 = Math.log(10);
// desvio-padrão do ruído (unidades do gás) e constante de tempo do ruído (s)
const NOISE = { H2S: 0.10, CO: 0.30, O2: 0.012, LEL: 0.22 };
const NOISE_TAU = 1.8;

export function makeRng(seed = 0x9e3779b9) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  let spare = null;
  rnd.gauss = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd();
    const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v);
  };
  return rnd;
}

export function createSensors(rng) {
  const S = {
    y: { H2S: 0, CO: 0, O2: 20.9, LEL: 0 },          // valor "físico" dentro da célula
    gain: { H2S: 0.965, CO: 0.978, O2: 1.0, LEL: 0.955 },
    zero: { H2S: 0.15, CO: 0.35, O2: 0, LEL: 0.3 },   // deriva de zero acumulada desde a última cal
    noise: { H2S: 0, CO: 0, O2: 0, LEL: 0 },
    tt: 0,            // "tempo de transporte": só avança com a bomba aspirando
    line: [],         // [{tt, g}] linha de atraso
    last: { H2S: 0, CO: 0, O2: 20.9, LEL: 0 },
    delay: 1,
  };
  S.delayFor = (hoseLen) => 1 + 0.7 * Math.max(0, hoseLen || 0);

  // gás que chega à célula agora (interpolado na linha de atraso)
  function delivered() {
    const L = S.line; const tq = S.tt - S.delay;
    if (!L.length) return S.last;
    if (tq <= L[0].tt) return L[0].g;
    for (let i = L.length - 1; i >= 0; i--) {
      if (L[i].tt <= tq) {
        const a = L[i], b = L[i + 1]; if (!b) return a.g;
        const k = (tq - a.tt) / Math.max(1e-6, b.tt - a.tt); const o = {};
        for (const g of GASES) o[g] = a.g[g] + (b.g[g] - a.g[g]) * k;
        return o;
      }
    }
    return L[0].g;
  }

  S.step = (h, gasIn, flowing, hoseLen) => {
    S.delay = S.delayFor(hoseLen);
    if (flowing) {
      S.tt += h;
      S.line.push({ tt: S.tt, g: { H2S: +gasIn.H2S || 0, CO: +gasIn.CO || 0, O2: gasIn.O2 == null ? 20.9 : +gasIn.O2, LEL: +gasIn.LEL || 0 } });
      const keep = S.tt - S.delay - 2;
      while (S.line.length > 2 && S.line[1].tt < keep) S.line.shift();
    }
    const d = delivered(); S.last = d;
    const target = { H2S: d.H2S, CO: d.CO + 0.05 * d.H2S, O2: d.O2, LEL: d.LEL };
    for (const g of GASES) {
      const tau = T90[g] / LN10;
      S.y[g] += (target[g] - S.y[g]) * (1 - Math.exp(-h / tau));
      // ruído Ornstein-Uhlenbeck (passa-baixas, realista para célula eletroquímica)
      const a = Math.exp(-h / NOISE_TAU);
      S.noise[g] = S.noise[g] * a + NOISE[g] * Math.sqrt(1 - a * a) * rng.gauss();
    }
    // deriva desprezível (≈0,02 ppm/dia no zero)
    S.zero.H2S += 2.3e-7 * h; S.zero.CO += 4.6e-7 * h;
  };

  // leitura bruta do sensor (antes de arredondamento/limites)
  S.read = (g) => {
    if (g === 'O2') return S.gain.O2 * S.y.O2 + S.noise.O2;
    return S.gain[g] * (S.y[g] - S.zero[g]) + S.noise[g];
  };
  S.readAll = () => ({ H2S: S.read('H2S'), CO: S.read('CO'), O2: S.read('O2'), LEL: S.read('LEL') });

  // coloca a célula/linha diretamente num estado (para jump): valores = leitura desejada
  S.prime = (disp) => {
    const phys = S.physFor(disp);
    for (const g of GASES) { S.y[g] = g === 'CO' ? phys.CO + 0.05 * phys.H2S : phys[g]; S.noise[g] = 0; }
    S.line = [{ tt: S.tt - 30, g: { ...phys } }, { tt: S.tt, g: { ...phys } }]; S.last = { ...phys };
    return phys;
  };
  // gás de entrada que produz, em regime, a leitura `disp`
  S.physFor = (disp) => {
    const p = {};
    p.H2S = Math.max(0, disp.H2S / S.gain.H2S + S.zero.H2S);
    p.CO = Math.max(0, (disp.CO / S.gain.CO + S.zero.CO) - 0.05 * p.H2S);
    p.O2 = disp.O2 / S.gain.O2;
    p.LEL = Math.max(0, disp.LEL / S.gain.LEL + S.zero.LEL);
    return p;
  };

  // calibração
  S.autoZero = () => { for (const g of ['H2S', 'CO', 'LEL']) S.zero[g] = S.y[g]; };
  S.spanO2 = (nominal) => { S.gain.O2 = nominal / Math.max(1, S.y.O2); };
  S.span = (g, target) => {
    if (g === 'O2') { S.gain.O2 = target / Math.max(1, S.y.O2); return; }
    S.gain[g] = target / Math.max(1e-3, S.y[g] - S.zero[g]);
  };
  return S;
}

// Janela deslizante por baldes (integral de concentração × tempo). Usada para TWA (8 h) e STEL (5–15 min).
export class Window {
  constructor(bucketSec, n) { this.bs = bucketSec; this.n = n; this.b = new Float64Array(n); this.i = 0; this.tIn = 0; }
  reset() { this.b.fill(0); this.i = 0; this.tIn = 0; }
  add(v, h) {
    while (h > 1e-12) {
      const d = Math.min(this.bs - this.tIn, h);
      this.b[this.i] += v * d; this.tIn += d; h -= d;
      if (this.tIn >= this.bs - 1e-9) { this.i = (this.i + 1) % this.n; this.b[this.i] = 0; this.tIn = 0; }
    }
  }
  // integral dos últimos `sec` segundos (balde corrente parcial + baldes completos anteriores)
  integral(sec) {
    let s = this.b[this.i]; let cover = this.tIn; let j = this.i;
    for (let k = 1; k < this.n && cover < sec - 1e-9; k++) {
      j = (j - 1 + this.n) % this.n; const need = sec - cover;
      if (need >= this.bs) { s += this.b[j]; cover += this.bs; } else { s += this.b[j] * (need / this.bs); cover += need; }
    }
    return s;
  }
  // preenche uniformemente `sec` segundos de histórico com concentração `v`
  fill(v, sec) {
    this.reset(); const nb = Math.min(this.n - 1, Math.floor(sec / this.bs));
    for (let k = 0; k < nb; k++) { this.b[this.i] = v * this.bs; this.i = (this.i + 1) % this.n; }
    this.b[this.i] = 0; this.tIn = 0;
  }
}
