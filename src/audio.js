// Áudio do detector (WebAudio, 100 % procedural). Dono: agente FIRMWARE.
//
// Contrato com o firmware (out):
//   out.buzzer = { on, freq, pattern, level }
//     on      → o firmware JÁ aplica o ritmo quadro a quadro; aqui só seguimos `on` com envelope (ataque 3 ms,
//               liberação 12 ms) e duração mínima de 45 ms por pulso (um quadro lento não "engole" um bipe).
//     freq    → ≈2900 Hz (multigás alterna 3150/2750); pattern: 'slow'|'fast'|'multi'|'beep'|'chirp'|null (informativo)
//     level   → 0..1 (alarme 1; bipes de interface ~0,7; chirp de confiança ~0,45)
//   out.vibrate          → motor de vibração (ERM ~165 Hz com partida/parada inerciais e chiado na carcaça)
//   out.pump.running     → zumbido suave da bomba de diafragma (~48 Hz + sopro de ar); pump.strain = entrada obstruída
//                          (motor força: tom cai, sopro some)
//
// Voz do piezo: onda quadrada + 2º harmônico (assimetria do disco piezo) → ressonância (pico a 2,9 kHz, Q alto) →
// saturação suave da caixa → envelope; ruído de banda estreita junto (chiado do furo da sirene) e micro-vibrato.
// Ambiência curta (resposta ao impulso sintética ~0,3 s) para não soar "seco de sintetizador".
// API: unlock() (no 1º gesto), update(out, dt), click(kind='down'|'up'), setMuted(b), setVolume(0..1), muted, volume.

export function createAudio() {
  let ctx = null, master = null, built = false;
  let muted = false, volume = 0.55;
  let pz = null, vib = null, pump = null;
  let gateOn = false, onAt = 0, vibOn = false, pumpOn = false, pumpStrain = false, lastFreq = 2900;

  function noiseBuffer(sec = 2) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(); s.loop = true; s.start(); return s; }
  function roomIR() {
    const len = Math.floor(ctx.sampleRate * 0.32), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.07) * (i < 40 ? i / 40 : 1); }
    }
    return b;
  }
  function softClip(k = 2.2) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    const ws = ctx.createWaveShaper(); ws.curve = c; ws.oversample = '2x'; return ws;
  }

  function build() {
    if (built) return; built = true;
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
    master.connect(comp); comp.connect(ctx.destination);
    // ambiência
    const conv = ctx.createConvolver(); conv.buffer = roomIR();
    const wet = ctx.createGain(); wet.gain.value = 0.16; conv.connect(wet); wet.connect(master);
    const bus = ctx.createGain(); bus.connect(master); bus.connect(conv);

    // ---------- piezo ----------
    const env = ctx.createGain(); env.gain.value = 0;
    const lvl = ctx.createGain(); lvl.gain.value = 0.22;
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 2900;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 5800;
    const g2 = ctx.createGain(); g2.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6.3;
    const lfoG = ctx.createGain(); lfoG.gain.value = 7; lfo.connect(lfoG); lfoG.connect(o1.frequency);
    const lfoG2 = ctx.createGain(); lfoG2.gain.value = 14; lfo.connect(lfoG2); lfoG2.connect(o2.frequency);
    const res = ctx.createBiquadFilter(); res.type = 'peaking'; res.frequency.value = 2900; res.Q.value = 5; res.gain.value = 10;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8500; lp.Q.value = 0.5;
    const pre = ctx.createGain(); pre.gain.value = 0.35;
    const clip = softClip(1.8);
    o1.connect(pre); o2.connect(g2); g2.connect(pre);
    pre.connect(res); res.connect(hp); hp.connect(lp); lp.connect(clip); clip.connect(env);
    const nz = noiseSrc(); const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 2900; nbp.Q.value = 2.5;
    const ng = ctx.createGain(); ng.gain.value = 0.05; nz.connect(nbp); nbp.connect(ng); ng.connect(env);
    env.connect(lvl); lvl.connect(bus);
    o1.start(); o2.start(); lfo.start();
    pz = { env, lvl, o1, o2, res, nbp };

    // ---------- motor de vibração ----------
    const venv = ctx.createGain(); venv.gain.value = 0;
    const vo = ctx.createOscillator(); vo.type = 'sawtooth'; vo.frequency.value = 70;
    const vo2 = ctx.createOscillator(); vo2.type = 'square'; vo2.frequency.value = 140;
    const vg2 = ctx.createGain(); vg2.gain.value = 0.25;
    const vlp = ctx.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 520; vlp.Q.value = 1.4;
    const vr = noiseSrc(); const vrb = ctx.createBiquadFilter(); vrb.type = 'bandpass'; vrb.frequency.value = 330; vrb.Q.value = 3;
    const vrg = ctx.createGain(); vrg.gain.value = 0.35;   // chiado da carcaça na mesa/mão
    const am = ctx.createGain(); am.gain.value = 0;        // modulação do chiado pela rotação
    const amOsc = ctx.createOscillator(); amOsc.frequency.value = 165; const amG = ctx.createGain(); amG.gain.value = 0.5;
    amOsc.connect(amG); amG.connect(am.gain);
    vo.connect(vlp); vo2.connect(vg2); vg2.connect(vlp); vlp.connect(venv);
    vr.connect(vrb); vrb.connect(am); am.connect(vrg); vrg.connect(venv);
    const vlvl = ctx.createGain(); vlvl.gain.value = 0.07; venv.connect(vlvl); vlvl.connect(bus);
    vo.start(); vo2.start(); amOsc.start();
    vib = { env: venv, vo, vo2, amOsc };

    // ---------- bomba ----------
    const penv = ctx.createGain(); penv.gain.value = 0;
    const po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = 48;
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 360; plp.Q.value = 0.9;
    const pog = ctx.createGain(); pog.gain.value = 1;
    const pn = noiseSrc(); const pnb = ctx.createBiquadFilter(); pnb.type = 'bandpass'; pnb.frequency.value = 1100; pnb.Q.value = 0.8;
    const png = ctx.createGain(); png.gain.value = 0.35;
    const pam = ctx.createGain(); pam.gain.value = 0.6;    // sopro pulsado no ritmo do diafragma
    const pamO = ctx.createOscillator(); pamO.frequency.value = 48; const pamG = ctx.createGain(); pamG.gain.value = 0.4;
    pamO.connect(pamG); pamG.connect(pam.gain);
    po.connect(plp); plp.connect(pog); pog.connect(penv);
    pn.connect(pnb); pnb.connect(pam); pam.connect(png); png.connect(penv);
    const plvl = ctx.createGain(); plvl.gain.value = 0.028; penv.connect(plvl); plvl.connect(bus);
    po.start(); pamO.start();
    pump = { env: penv, po, plp, png, pamO };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
    }
  }

  function gate(on, level, freq) {
    const t = ctx.currentTime;
    if (freq && Math.abs(freq - lastFreq) > 1) {
      lastFreq = freq;
      pz.o1.frequency.setTargetAtTime(freq, t, 0.002); pz.o2.frequency.setTargetAtTime(freq * 2, t, 0.002);
      pz.nbp.frequency.setTargetAtTime(freq, t, 0.004);
    }
    if (on && !gateOn) {
      gateOn = true; onAt = t;
      pz.lvl.gain.setValueAtTime(0.22 * Math.max(0.2, level ?? 1), t);
      pz.env.gain.cancelScheduledValues(t); pz.env.gain.setValueAtTime(pz.env.gain.value, t);
      pz.env.gain.setTargetAtTime(1, t, 0.003);
    } else if (!on && gateOn) {
      gateOn = false; const at = Math.max(t, onAt + 0.045);
      pz.env.gain.setTargetAtTime(0, at, 0.012);
    }
  }
  function motor(on) {
    if (on === vibOn) return; vibOn = on; const t = ctx.currentTime;
    for (const [o, f0, f1] of [[vib.vo, 70, 165], [vib.vo2, 140, 330], [vib.amOsc, 70, 165]]) {
      o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(o.frequency.value, t);
      if (on) o.frequency.setTargetAtTime(f1 * (0.97 + Math.random() * 0.06), t, 0.05);
      else o.frequency.setTargetAtTime(f0 * 0.6, t, 0.09);
    }
    vib.env.gain.cancelScheduledValues(t); vib.env.gain.setValueAtTime(vib.env.gain.value, t);
    vib.env.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.035 : 0.07);
  }
  function pumpSet(on, strain) {
    const t = ctx.currentTime;
    if (on !== pumpOn) { pumpOn = on; pump.env.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.25 : 0.15); }
    if (strain !== pumpStrain) {
      pumpStrain = strain;
      const f = strain ? 39 : 48;
      pump.po.frequency.setTargetAtTime(f, t, 0.3); pump.pamO.frequency.setTargetAtTime(f, t, 0.3);
      pump.plp.frequency.setTargetAtTime(strain ? 260 : 360, t, 0.3);
      pump.png.gain.setTargetAtTime(strain ? 0.05 : 0.35, t, 0.2);
    }
  }

  const A = {
    unlock() {
      try {
        if (!ctx) {
          const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return;
          ctx = new AC({ latencyHint: 'interactive' }); build();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* sem áudio */ }
    },
    update(out, dt) {
      if (!ctx || !built || !out) return;
      const b = out.buzzer || {};
      gate(!!b.on, b.level, b.freq || 2900);
      motor(!!out.vibrate);
      pumpSet(!!(out.pump && out.pump.running), !!(out.pump && out.pump.strain));
    },
    // clique mecânico da chave tátil sob a capa de borracha (abafado) — 'down' mais seco, 'up' mais leve
    click(kind = 'down') {
      if (!ctx || !built) return;
      const t = ctx.currentTime, up = kind === 'up';
      const n = ctx.createBufferSource(); const len = Math.floor(ctx.sampleRate * 0.03); const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * (up ? 0.0018 : 0.0026)));
      n.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = up ? 3800 : 2600; bp.Q.value = 1.6;
      const g = ctx.createGain(); g.gain.value = up ? 0.12 : 0.22;
      n.connect(bp); bp.connect(g); g.connect(master);
      const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(up ? 320 : 210, t); th.frequency.exponentialRampToValueAtTime(90, t + 0.03);
      const tg = ctx.createGain(); tg.gain.setValueAtTime(up ? 0.08 : 0.18, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      th.connect(tg); tg.connect(master);
      n.start(t); th.start(t); th.stop(t + 0.05);
    },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02); },
    setVolume(v) { volume = Math.max(0, Math.min(1, +v)); if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02); },
    get muted() { return muted; },
    get volume() { return volume; },
    get ctx() { return ctx; },
  };
  return A;
}
