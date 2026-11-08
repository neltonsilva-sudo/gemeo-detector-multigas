// Kit de calibração/amostragem — dono: agente KIT.
// buildKit() → { group, update(dt,{inletWorld,time}), state, handleAction(name), mix, refLayout(device), defaultLayout() }
// Cilindro de alumínio 34 L (mistura 4 gases), regulador de fluxo fixo 0,5 L/min com manômetro, mangueira Tygon física
// (Verlet), sonda telescópica com filtro em linha, tampa do cilindro e adaptador de calibração.
import * as THREE from 'three';
import { makeMaterials, buildCylinder, buildCap, buildRegulator, buildProbe, buildCalCup } from './kit_parts.js';
import { Hose } from './kit_hose.js';
import { psiToDeg, kitEnvironment } from './kit_tex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const PSI = 14.5038;

export function buildKit() {
  const group = new THREE.Group(); group.name = 'kit';
  const M = makeMaterials();
  const cyl = buildCylinder(M); group.add(cyl.group);
  const cap = buildCap(M); group.add(cap);
  const reg = buildRegulator(M); group.add(reg.group);
  const probe = buildProbe(M); group.add(probe.group);
  const cup = buildCalCup(M); group.add(cup.group);

  const HOSE_LEN = 0.9, LINE_LEN = 0.5;
  const hose = new Hose({ length: HOSE_LEN, nodes: 64, radius: 0.00395, inner: 0.0024, material: M.tygon });
  hose.mesh.name = 'mangueira'; hose.mesh.userData.action = 'hose'; hose.mesh.userData.noShadow = false; group.add(hose.mesh);
  const line = new Hose({ length: LINE_LEN, nodes: 38, radius: 0.0033, inner: 0.0018, material: M.tygon });
  line.mesh.name = 'linha_sonda'; line.mesh.userData.action = 'probe'; group.add(line.mesh);

  const state = { valveOpen: false, hoseAttached: false, probeAttached: false, flowLpm: 0, pressureBar: 34.5, hoseLen: HOSE_LEN,
    probeLineLen: LINE_LEN, regulatorMounted: true, gasLeftL: 34, layout: 'default' };
  const mix = { H2S: 25, CO: 100, LEL: 50, O2: 18 };

  // animações
  let knobAng = 0, needleAng = psiToDeg(0) * Math.PI / 180, needleVel = 0, ext = 0, extTarget = 0, ledI = 0;
  let hoseAnim = null, lineAnim = null; // { mode, t, dur, from, dirFrom }
  let deviceRef = null, deviceSaved = null, lastInlet = V(0.035, 0.013, 0.0105), haveInlet = false;
  const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), qTmp = new THREE.Quaternion();

  // ---------------------------------------------------------------- layouts
  const L = {
    default: {
      // fora do quadro da câmera hero (o aparelho é o herói); a mangueira entra pela direita até a bomba
      cyl: { p: [0.52, 0, -0.06], ry: -0.75 },
      reg: { mounted: true, ry: -1.05 },
      cap: { p: [0.62, 0.0154, -0.03], rx: Math.PI },
      cup: { p: [0.70, 0, 0.0] },
      probe: { base: [0.33, 0.13], dir: -0.12 /* aponta para +x */, roll: 0 },
    },
  };
  let probePose = null;
  function placeProbeLying(e) {
    // apoiada no chão: encosta na cabeça da empunhadura (dorso) e na ponta; recalcula a inclinação conforme o telescópio
    const P = L.default.probe, len = probe.lenAt(e), hHead = 0.0168, hTip = 0.0042, sHead = 0.117, sTip = len - 0.012;
    const slope = (hHead - hTip) / (sTip - sHead), pitch = Math.atan(slope);
    const yBase = hHead + sHead * slope;
    const d = V(Math.cos(P.dir), 0, Math.sin(P.dir));
    const axis = V(d.x * Math.cos(pitch), -Math.sin(pitch), d.z * Math.cos(pitch)).normalize();
    const up = V(0, 1, 0), Z = up.clone().addScaledVector(axis, -up.dot(axis)).normalize(), X = new THREE.Vector3().crossVectors(axis, Z);
    probe.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, axis, Z));
    probe.group.position.set(P.base[0], yBase, P.base[1]);
  }
  function setVisibleAll(v) { [hose.mesh, line.mesh, cup.group].forEach((o) => { o.visible = v; }); }

  function applyDefault() {
    const D = L.default;
    if (deviceRef && deviceSaved) { deviceRef.group.position.copy(deviceSaved.p); deviceRef.group.quaternion.copy(deviceSaved.q); }
    cyl.group.position.set(...D.cyl.p); cyl.group.rotation.set(0, D.cyl.ry, 0);
    reg.group.position.set(D.cyl.p[0], cyl.height + 0.0003, D.cyl.p[2]); reg.group.rotation.set(0, D.reg.ry, 0);
    cap.position.set(...D.cap.p); cap.rotation.set(D.cap.rx, 0.4, 0);
    cup.group.position.set(...D.cup.p); cup.group.rotation.set(0, 0, 0);
    probePose = 'lying'; placeProbeLying(ext);
    state.regulatorMounted = true; state.layout = 'default';
    setVisibleAll(true);
    group.updateMatrixWorld(true);
    rebuildColliders();
    // mangueira: sai do espigão, desce em arco e fica enrolada no chão ao lado do cilindro
    if (!state.hoseAttached) initHoseCoil(); else hose.settle(2.5);
    if (!state.probeAttached) initLineLying(); else line.settle(2);
  }

  function refLayout(device) {
    if (device) { deviceRef = device; if (!deviceSaved) deviceSaved = { p: device.group.position.clone(), q: device.group.quaternion.clone() }; }
    state.valveOpen = false; state.hoseAttached = false; state.probeAttached = false; state.flowLpm = 0; state.regulatorMounted = false;
    hose.end = null; line.end = null; hoseAnim = lineAnim = null; knobAng = 0; ext = extTarget = 0; probe.setExtension(0); ledI = 0; probe.setLeds(0);
    if (device) { device.group.position.set(-0.004, 0, 0.018); device.group.rotation.set(0, -0.1, 0); }
    // composição da foto ref2: sonda inclinada à esquerda (atrás do aparelho), cilindro atrás centro-direita,
    // regulador com manômetro à frente-direita
    cyl.group.position.set(0.064, 0, -0.07); cyl.group.rotation.set(0, 0.02, 0);
    cap.position.set(0.064, cyl.height - 0.0053, -0.07); cap.rotation.set(0, 0, 0);
    reg.group.position.set(0.108, reg.gaugeR - reg.gaugeCenterY + 0.0004, 0.07); reg.group.rotation.set(0, -0.32, 0);
    needleAng = psiToDeg(0) * Math.PI / 180; needleVel = 0;
    probePose = 'ref';
    probe.group.position.set(-0.036, 0.002, -0.052);
    probe.group.rotation.set(0, 0, 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, 0, 0.29, 'XYZ'));
    const roll = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.35);
    probe.group.quaternion.copy(q).multiply(roll);
    setVisibleAll(false);
    state.layout = 'ref';
    group.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- colisores (mundo)
  function rebuildColliders() {
    group.updateMatrixWorld(true);
    const C = [];
    const cp = cyl.group.position;
    C.push({ type: 'capsule', a: V(cp.x, -0.05, cp.z), b: V(cp.x, 0.236, cp.z), r: 0.038 });
    if (state.regulatorMounted || true) {
      const w = (x, y, z) => V(x, y, z).applyMatrix4(reg.group.matrixWorld);
      C.push({ type: 'capsule', a: w(0, 0.0, 0), b: w(0, 0.093, 0), r: 0.0205, skipStart: 3 });
      C.push({ type: 'capsule', a: w(0, 0.012, 0.03), b: w(0, 0.012, 0.039), r: 0.026, skipStart: 3 });
      C.push({ type: 'capsule', a: w(0.025, 0.028, 0), b: w(0.047, 0.028, 0), r: 0.0145, skipStart: 3 });
    }
    const pw = (y) => V(0, y, 0).applyMatrix4(probe.group.matrixWorld);
    C.push({ type: 'capsule', a: pw(0.03), b: pw(0.118), r: 0.017, skipStart: 4, probe: true });
    C.push({ type: 'capsule', a: pw(0.16), b: pw(0.2), r: 0.011, probe: true });
    C.push({ type: 'capsule', a: pw(0.2), b: pw(probe.lenAt(ext)), r: 0.004, probe: true });
    const up = cup.group.position; C.push({ type: 'capsule', a: V(up.x, 0, up.z), b: V(up.x, 0.012, up.z), r: 0.018 });
    const kp = cap.position; C.push({ type: 'capsule', a: V(kp.x, 0, kp.z), b: V(kp.x, 0.006, kp.z), r: 0.019 });
    // aparelho (caixa 70×131×52 mm)
    const mat = deviceRef ? deviceRef.group.matrixWorld.clone() : new THREE.Matrix4();
    C.push({ type: 'box', mat, inv: mat.clone().invert(), center: V(0, 0.0655, 0), half: V(0.035, 0.0655, 0.026), skipEnd: 4 });
    hose.colliders = C;
    line.colliders = C.map((c) => (c.probe && c.skipStart ? { ...c, skipStart: 6 } : c));
  }

  // ---------------------------------------------------------------- formas iniciais
  function hoseStart() {
    reg.barb.getWorldPosition(hose.start.pos);
    hose.start.dir.set(0, 1, 0).applyQuaternion(reg.group.getWorldQuaternion(qTmp)).normalize();
    hose.start.depth = 0.0075;
  }
  function lineStart() {
    probe.outlet.getWorldPosition(line.start.pos);
    line.start.dir.set(0, -1, 0).applyQuaternion(probe.group.getWorldQuaternion(qTmp)).normalize();
    line.start.depth = 0.006;
  }
  function initHoseCoil() {
    hoseStart(); hose.end = null;
    const s = hose.start.pos, cp = cyl.group.position;
    // sobe, faz a curva e desce pelo lado direito/frente do cilindro até um laço no chão
    const out = V(0.9, 0, -0.45).normalize(); // atrás-direita, lado oposto ao manômetro e ao aparelho
    const pts = [s.clone(), s.clone().add(V(0, 0.05, 0)), s.clone().add(V(out.x * 0.05, 0.06, out.z * 0.05)), s.clone().add(V(out.x * 0.09, 0.0, out.z * 0.09)),
      V(cp.x + out.x * 0.08, 0.15, cp.z + out.z * 0.08), V(cp.x + out.x * 0.09, 0.02, cp.z + out.z * 0.09)];
    const c = V(cp.x + out.x * 0.24, 0.004, cp.z + out.z * 0.24), R = 0.05;
    for (let k = 0; k <= 26; k++) { const a = Math.PI * 1.1 + k / 26 * Math.PI * 2.2; pts.push(V(c.x + Math.cos(a) * R * (1 - k * 0.005), 0.004 + k * 0.0003, c.z + Math.sin(a) * R * (1 - k * 0.005))); }
    hose.initAlong(pts); hose.settle(3.5);
  }
  function initLineLying() {
    lineStart(); line.end = null;
    const s = line.start.pos, d = line.start.dir.clone().setY(0).normalize();
    const side = V(d.z, 0, -d.x); // curva para a frente (+z), longe do quadro hero
    // a linha sai da base da empunhadura, faz uma curva para a frente e volta para a direita (longe do aparelho)
    const pts = [s.clone(), s.clone().addScaledVector(d, 0.03).setY(0.012)];
    for (let k = 1; k <= 24; k++) { const a = k / 24 * Math.PI * 1.15; pts.push(s.clone().addScaledVector(d, 0.03 + Math.sin(a) * 0.06).addScaledVector(side, (1 - Math.cos(a)) * 0.06).setY(0.004)); }
    pts.push(pts[pts.length - 1].clone().addScaledVector(d, -0.25));
    line.initAlong(pts); line.settle(2.5);
  }

  // ---------------------------------------------------------------- entrada do aparelho
  function inletDir(out) {
    if (deviceRef) return out.set(1, 0, 0).applyQuaternion(deviceRef.group.getWorldQuaternion(qTmp));
    return out.set(1, 0, 0);
  }
  function startAttach(h, which) {
    const n = h.n, from = h.p[n - 1].clone(), dirFrom = tmp.subVectors(h.p[n - 2], h.p[n - 1]).normalize().clone();
    return { mode: 'attach', t: 0, dur: 1.25, from, dirFrom, which };
  }
  function startDetach(which) { return { mode: 'detach', t: 0, dur: 0.35, which }; }
  const inD = V(1, 0, 0);
  function driveEnd(h, anim, dt, inlet) {
    inletDir(inD);
    const target = inlet, pre = tmp2.copy(inlet).addScaledVector(inD, 0.035);
    if (!anim) return null;
    anim.t += dt;
    const k = Math.min(1, anim.t / anim.dur);
    if (!h.end) h.end = { pos: V(0, 0, 0), dir: V(1, 0, 0), depth: 0 };
    if (anim.mode === 'attach') {
      if (k < 0.78) {
        const t = ease(k / 0.78), a = anim.from, b = pre;
        const c1 = V(a.x, Math.max(a.y, b.y) + 0.1, a.z), c2 = V(b.x + inD.x * 0.06, b.y + 0.05, b.z + inD.z * 0.06);
        const u = 1 - t;
        h.end.pos.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(b, t * t * t);
        h.end.dir.copy(anim.dirFrom).lerp(inD, t).normalize(); h.end.depth = 0;
      } else {
        const t = ease((k - 0.78) / 0.22);
        h.end.pos.copy(pre).lerp(target, t); h.end.dir.copy(inD); h.end.depth = 0.0045 * t;
      }
      if (k >= 1) return 'done';
    } else {
      const t = ease(k);
      h.end.pos.copy(target).lerp(pre, t); h.end.dir.copy(inD); h.end.depth = 0.0045 * (1 - t);
      if (k >= 1) { h.end = null; return 'done'; }
    }
    return null;
  }

  // ---------------------------------------------------------------- ações
  function handleAction(name) {
    if (state.layout !== 'default') applyDefault();
    if (name === 'valve') {
      state.valveOpen = !state.valveOpen;
    } else if (name === 'hose') {
      if (!state.hoseAttached && !(hoseAnim && hoseAnim.mode === 'attach')) {
        if (state.probeAttached) { state.probeAttached = false; lineAnim = startDetach('line'); extTarget = 0; }
        hoseAnim = startAttach(hose, 'hose');
      } else { state.hoseAttached = false; hoseAnim = startDetach('hose'); }
    } else if (name === 'probe') {
      if (!state.probeAttached && !(lineAnim && lineAnim.mode === 'attach')) {
        if (state.hoseAttached || (hoseAnim && hoseAnim.mode === 'attach')) { state.hoseAttached = false; hoseAnim = startDetach('hose'); }
        lineAnim = startAttach(line, 'line'); extTarget = 1;
      } else { state.probeAttached = false; lineAnim = startDetach('line'); extTarget = 0; }
    }
  }

  // ---------------------------------------------------------------- laço
  // metais/vidros do kit usam um ambiente de estúdio de produto próprio (gerado 1x com o renderer do palco)
  let envDone = false;
  function ensureEnv() {
    envDone = true;
    const r = globalThis.__sim && globalThis.__sim.stage && globalThis.__sim.stage.renderer; if (!r) { envDone = false; return; }
    const env = kitEnvironment(r);
    group.traverse((o) => { if (o.isMesh && o.material && !o.material.userData.stageEnv && (o.material.metalness > 0.4 || o.material.transparent || o.material.clearcoat > 0.2)) { o.material.envMap = env; o.material.envMapIntensity = o.material.envMapIntensity ?? 1; o.material.needsUpdate = true; } });
  }
  function update(dt, ctx = {}) {
    if (!envDone) ensureEnv();
    if (ctx.inletWorld) { lastInlet.copy(ctx.inletWorld); haveInlet = true; }
    const inlet = lastInlet;
    // manopla: 1¼ volta para abrir
    const kTarget = state.valveOpen ? -2.5 * Math.PI : 0;
    knobAng += (kTarget - knobAng) * (1 - Math.exp(-dt * 4.5));
    reg.knob.rotation.x = knobAng;
    const openFrac = Math.min(1, Math.abs(knobAng) / (2.5 * Math.PI));
    // vazão fixa 0,5 L/min (cai quando o cilindro está quase vazio)
    const P = state.pressureBar;
    const fTarget = state.regulatorMounted && state.valveOpen ? 0.5 * ease((openFrac - 0.25) / 0.6) * Math.min(1, P / 1.5) : 0;
    state.flowLpm += (fTarget - state.flowLpm) * (1 - Math.exp(-dt / 0.45));
    if (state.flowLpm < 1e-4 && fTarget === 0) state.flowLpm = 0;
    // consumo: 34 L a 34,5 bar → pressão proporcional ao gás restante
    state.gasLeftL = Math.max(0, state.gasLeftL - state.flowLpm * dt / 60);
    state.pressureBar = 34.5 * state.gasLeftL / 34;
    // manômetro (massa-mola com leve tremor quando há fluxo)
    const psi = state.regulatorMounted ? state.pressureBar * PSI * (1 - 0.012 * state.flowLpm / 0.5) + (state.flowLpm > 0.01 ? Math.sin((ctx.time || 0) * 23) * 1.2 : 0) : 0;
    const aT = psiToDeg(psi) * Math.PI / 180;
    if (dt > 0) { const acc = 140 * (aT - needleAng) - 16 * needleVel; needleVel += acc * dt; needleAng += needleVel * dt; }
    else { needleAng = aT; }
    reg.needle.rotation.z = -needleAng;
    // sonda: telescópio + LEDs
    ext += (extTarget - ext) * (1 - Math.exp(-dt * 3));
    if (Math.abs(extTarget - ext) < 1e-4) ext = extTarget;
    probe.setExtension(ext);
    ledI += ((state.probeAttached ? 1 : 0) - ledI) * (1 - Math.exp(-dt * 6));
    probe.setLeds(ledI);
    if (state.layout === 'default') {
      if (probePose === 'lying') placeProbeLying(ext);
      group.updateMatrixWorld(true);
      if (Math.abs(extTarget - ext) > 0) rebuildColliders();
      // mangueira do cilindro
      hoseStart();
      if (driveEnd(hose, hoseAnim, dt, inlet) === 'done') { if (hoseAnim.mode === 'attach') { state.hoseAttached = true; } hoseAnim = null; }
      if (state.hoseAttached && !hoseAnim) { inletDir(inD); hose.end = { pos: inlet.clone(), dir: inD.clone(), depth: 0.0045 }; }
      hose.step(dt);
      // linha da sonda
      lineStart();
      if (driveEnd(line, lineAnim, dt, inlet) === 'done') { if (lineAnim.mode === 'attach') { state.probeAttached = true; } lineAnim = null; }
      if (state.probeAttached && !lineAnim) { inletDir(inD); line.end = { pos: inlet.clone(), dir: inD.clone(), depth: 0.0045 }; }
      line.step(dt);
      if (dt === 0 && (state.hoseAttached || state.probeAttached) && !settledFor) { hose.settle(2); line.settle(2); settledFor = true; }
      hose.updateMesh(); line.updateMesh();
    }
  }
  let settledFor = false;

  // transparentes não entram em passadas com material de substituição (G-buffer do GTAO, profundidade de contato):
  // senão o AO "suja" a mangueira/vidros de cinza granulado
  group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.userData.noShadowCast) return;
    o.onBeforeRender = (r, sc, cam, geo, mat) => { if (mat !== o.material) { o.userData._dr = geo.drawRange.count; geo.setDrawRange(0, 0); } };
    o.onAfterRender = (r, sc, cam, geo) => { if (o.userData._dr !== undefined) { geo.setDrawRange(0, o.userData._dr); o.userData._dr = undefined; } };
  });

  applyDefault();

  return {
    group, state, mix, update, handleAction, refLayout, defaultLayout: applyDefault,
    parts: { cyl, cap, reg, probe, cup, hose, line, M },
  };
}
