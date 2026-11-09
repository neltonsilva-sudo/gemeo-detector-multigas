// Orquestrador: integra cena, aparelho, LCD, firmware, kit, mundo de gás e UI. Dono: orquestrador.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStage } from './scene.js';
import { buildDevice } from './device.js';
import { createLCD } from './lcd.js';
import { createFirmware } from './firmware.js';
import { createAudio } from './audio.js';
import { buildKit } from './accessories.js';
import { createGasWorld } from './gasworld.js';
import { createUI } from './ui.js';
import { createDemo } from './demo.js';
import { createZoom } from './zoom.js';
import { createVolume } from './volume.js';
import { buildHand } from './hand.js';
import { buildTripod, TRIPOD_H } from './tripod.js';

const Q = new URLSearchParams(location.search);
const qn = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const canvas = document.getElementById('c');
const showUI = Q.get('ui') !== '0';
const still = Q.get('still') === '1';
const timeScale = qn('ts', 1);

const stage = createStage({ canvas, quality: Q.get('q') || 'high' });
const { scene, camera, renderer } = stage;
if (Q.get('mode')) stage.setMode(Q.get('mode'));

const lcd = createLCD();
const device = buildDevice({ lcdTexture: lcd.texture });
scene.add(device.group);
// o visor não recebe sombra projetada (a moldura escurecia a parte de cima da tela)
device.group.traverse((o) => { if (o.isMesh && (o === device.lcdMesh || /lcd/i.test(o.name))) o.receiveShadow = false; });
const kit = buildKit();
scene.add(kit.group);
// tripé: aparece nos ambientes por cenário (o estúdio/manual mantém o aparelho apoiado na mesa); o kit desce ao piso
const hand = buildHand(); scene.add(hand.group);
const tripod = buildTripod(); tripod.visible = false; scene.add(tripod);
// ambientes já ajustados para o tripé (piso em -TRIPOD_H); os demais seguem com o aparelho apoiado até serem refeitos
const TRIPOD_READY = new Set(['limpo', 'confinado', 'vazamento-h2s', 'co-motor', 'deficiencia-o2', 'explosiva', 'enriquecimento-o2']);
function applyTripod(id) { const on = TRIPOD_READY.has(id); tripod.visible = on; kit.group.position.y = on ? -TRIPOD_H : 0; }
const fw = createFirmware();
const audio = createAudio();
const world = createGasWorld();
if (Q.get('scenario')) world.setScenario(Q.get('scenario'));

// ---------- câmeras ----------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.08; controls.maxDistance = 2.5;
controls.target.set(0, 0.07, 0);
const CAMS = {
  // vista da foto ref1: frente levemente de cima e da esquerda, aparelho ocupando o quadro
  ref1: { pos: [-0.132, 0.213, 0.34], tgt: [0.006, 0.068, 0], fov: 26 },
  hero: { pos: [-0.16, 0.16, 0.36], tgt: [0.03, 0.065, 0], fov: 32 },
  front: { pos: [0, 0.066, 0.42], tgt: [0, 0.066, 0], fov: 24 },
  back: { pos: [0.08, 0.1, -0.38], tgt: [0, 0.066, 0], fov: 26 },
  lcd: { pos: [0, 0.1, 0.17], tgt: [0, 0.094, 0.02], fov: 22 },
  top: { pos: [0.02, 0.32, 0.18], tgt: [0, 0.12, 0], fov: 28 },
  ref2: { pos: [0.025, 0.2, 0.85], tgt: [0.025, 0.172, 0], fov: 26 },
  kit: { pos: [0.1, 0.25, 0.8], tgt: [0.12, 0.1, -0.05], fov: 34 },
};
function setCam(name) {
  let c = CAMS[name];
  if (name === 'orbit') {
    const ang = qn('ang', 30) * Math.PI / 180, r = qn('r', 0.45), h = qn('h', 0.12);
    const t = [qn('tx', 0), qn('ty', 0.066), qn('tz', 0)];
    c = { pos: [t[0] + Math.sin(ang) * r, h, t[2] + Math.cos(ang) * r], tgt: t, fov: qn('fov', 28) };
  }
  if (!c) return;
  camera.position.set(...c.pos); controls.target.set(...c.tgt);
  camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update();
  if (name === 'ref2' && kit.refLayout) kit.refLayout(device);
}
setCam(Q.get('cam') || 'hero');

// ---------- interação ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let held = null; let downAt = 0; let downPos = null;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects([device.group, kit.group], true).find((x) => x.object.visible !== false);
  if (!h) return null;
  let o = h.object; while (o && !o.userData.action) o = o.parent;
  if (o) return o.userData.action;
  // clique no corpo do aparelho (sem ação própria) → centralizar nele
  for (let q = h.object; q; q = q.parent) if (q === device.group) return 'device';
  return null;
}
let inletCovered = false;
canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const a = pick(ev); downAt = performance.now(); downPos = [ev.clientX, ev.clientY];
  if (a === 'button') { held = 'button'; fw.input.button = true; device.setButton(true); audio.click(); controls.enabled = false; canvas.setPointerCapture(ev.pointerId); }
  else if (a === 'inlet') { held = 'inlet'; inletCovered = true; controls.enabled = false; canvas.setPointerCapture(ev.pointerId); }
  else if (a && a !== 'device') { kit.handleAction(a); }
  clickDevice = a === 'device';
});
let clickDevice = false;
canvas.addEventListener('pointerup', (ev) => {
  const moved = downPos ? Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]) : 99;
  if (clickDevice && moved < 6 && performance.now() - downAt < 450) goHome();
  clickDevice = false;
});
const release = () => {
  if (held === 'button') { fw.input.button = false; device.setButton(false); }
  if (held === 'inlet') inletCovered = false;
  held = null; controls.enabled = true;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointermove', (ev) => { canvas.style.cursor = pick(ev) ? 'pointer' : 'grab'; });
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  if (e.code === 'Space' && !e.repeat) { audio.unlock(); fw.input.button = true; device.setButton(true); audio.click(); e.preventDefault(); }
  if (e.code === 'KeyB' && !e.repeat) inletCovered = true;
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') { fw.input.button = false; device.setButton(false); }
  if (e.code === 'KeyB') inletCovered = false;
});

// ---------- API de teste/captura ----------
const sim = {
  stage, device, lcd, fw, kit, world, controls, THREE,
  press(ms = 150) { fw.input.button = true; device.setButton(true); audio.click(); setTimeout(() => { fw.input.button = false; device.setButton(false); }, ms); },
  jump(s) {
    // estados que, no aparelho real, só existem com o cilindro aplicado: abre a válvula e conecta a mangueira
    const withGas = ['cal-span', 'cal-apply', 'bump', 'bump-ok'];
    if (withGas.includes(s)) {
      if (!kit.state.valveOpen) kit.handleAction('valve');
      if (!kit.state.hoseAttached) kit.handleAction('hose');
    }
    fw.jump(s);
  },
  // muda só a atmosfera (gases manuais) sem trocar o ambiente 3D — a demonstração usa isto
  setGas(g) { world.setScenario('manual'); Object.assign(world.manual, g); lastScenery = 'manual'; },
  cam: setCam,
  coverInlet(on) { inletCovered = !!on; },
  capture() { stage.render(0); return renderer.domElement.toDataURL('image/png'); },
};
window.__sim = sim;
// ao conectar a mangueira (botão "Mangueira", clique no kit ou demonstração), a câmera vai até o bico de entrada
// e mostra o encaixe; ao soltar, volta para a vista anterior
const camAnim = { t: 1, dur: 1.2, p0: new THREE.Vector3(), p1: new THREE.Vector3(), t0: new THREE.Vector3(), t1: new THREE.Vector3() };
function flyTo(pos, tgt, dur = 1.2) {
  camAnim.p0.copy(camera.position); camAnim.t0.copy(controls.target);
  camAnim.p1.copy(pos); camAnim.t1.copy(tgt); camAnim.t = 0; camAnim.dur = dur;
}
let camBeforeHose = null;
const _kitAction = kit.handleAction.bind(kit);
kit.handleAction = (a) => {
  const was = kit.state.hoseAttached;
  const r = _kitAction(a);
  const wp = (o) => { const p = new THREE.Vector3(); if (o) o.getWorldPosition(p); return p; };
  if (a === 'hose') {
    const p = wp(device.inletAnchor);
    if (!was) {   // pedido de conectar (a animação do kit termina depois)
      camBeforeHose = { pos: camera.position.clone(), tgt: controls.target.clone() };
      flyTo(p.clone().add(new THREE.Vector3(0.16, 0.06, 0.2)), p.clone().add(new THREE.Vector3(0, -0.03, 0)));
    } else if (camBeforeHose) { flyTo(camBeforeHose.pos, camBeforeHose.tgt); camBeforeHose = null; }
  }
  // manômetro/regulador e cilindro: câmera vai até a peça (o kit mostra o painel de detalhes)
  const part = { gauge: kit.parts?.reg, valve: kit.parts?.reg, cylinder: kit.parts?.cyl }[a];
  if (part && (a !== 'valve' || kit.state.focus === 'gauge')) {
    const p = wp(part); const d = a === 'cylinder' ? 0.75 : 0.32;
    flyTo(p.clone().add(new THREE.Vector3(d * 0.35, d * 0.25, d)), p.clone().add(new THREE.Vector3(0, a === 'cylinder' ? 0.12 : 0.02, 0)));
  }
  return r;
};
// volta suave para a vista central do aparelho (câmera Principal)
function goHome() {
  const c = CAMS.hero; camBeforeHose = null; camBeforeCover = null;
  if (kit.state.focus) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));  // fecha o painel do kit
  flyTo(new THREE.Vector3(...c.pos), new THREE.Vector3(...c.tgt), 0.9);
  if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
}
sim.home = goHome;
addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !(e.target.closest && e.target.closest('input,select,textarea'))) goHome(); });
if (showUI) {
  const hb = document.createElement('button');
  hb.className = 'zm-btn gx-row-btn';
  hb.innerHTML = '⌖ Centralizar no aparelho'; hb.title = 'Voltar para a vista central do aparelho (tecla H)';
  hb.onclick = goHome; setTimeout(() => (document.querySelector('.dm-wrap') || document.body).append(hb), 0);
}
// PARAR AVALIAÇÃO: encerra a medição e deixa o aparelho pronto para uma nova avaliação
function stopEvaluation() {
  sim.demo?.running && sim.demo.stop();
  if (kit.state.focus) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
  if (kit.state.hoseAttached) kit.handleAction('hose');
  if (kit.state.probeAttached) kit.handleAction('probe');
  if (kit.state.valveOpen) kit.handleAction('valve');
  inletCovered = false; fw.input.button = false; device.setButton(false);
  world.setScenario('limpo'); lastScenery = null;                 // volta ao ar limpo (oficina)
  const wasOn = fw.out && fw.out.state && fw.out.state !== 'off';
  fw.ackAlarms?.();
  if (wasOn) fw.jump('run');                                      // leitura normal, pronto
  setTimeout(() => fw.clearPeaks?.(), 300);                       // zera pico/TWA/STEL já em ar limpo (registra no log)
  goHome();
}
sim.stopEvaluation = stopEvaluation;
if (showUI) {
  const sb = document.createElement('button');
  sb.className = 'zm-btn gx-row-btn gx-stop-eval';
  sb.innerHTML = '■ Parar avaliação'; sb.title = 'Encerra a medição: desconecta o kit, volta ao ar limpo, zera picos/TWA/STEL e deixa o aparelho pronto';
  sb.onclick = stopEvaluation; setTimeout(() => (document.querySelector('.dm-wrap') || document.body).prepend(sb), 0);
  const st = document.createElement('style');
  st.textContent = '.gx-row-btn{position:static!important;padding:10px 16px!important;border-radius:999px!important;white-space:nowrap} .dm-wrap{flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)} .gx-stop-eval{background:linear-gradient(160deg,rgba(255,120,100,.35),rgba(150,30,20,.45))!important;border-color:rgba(255,190,180,.5)!important}';
  document.head.append(st);
}
const ui = showUI ? createUI({ fw, world, kit, sim, audio }) : { update() {} };
sim.ui = ui;
// botões da demonstração e da tela de perto só com a UI (capturas ui=0 ficam limpas)
sim.zoom = showUI ? createZoom(sim) : null;
sim.demo = showUI ? createDemo(sim) : null;
sim.volume = showUI ? createVolume(audio) : null;
if (Q.get('demo') === '1') document.addEventListener('pointerdown', () => { audio.unlock(); if (sim.demo && !sim.demo.running) sim.demo.start(Math.max(0, qn('cap', 1) - 1)); }, { once: true });
if (Q.get('state')) sim.jump(Q.get('state'));
// tela inicial: aparelho DESLIGADO — o usuário segura o botão ~3 s para ligar e ver o autoteste (?on=1 liga direto)
else if (Q.get('on') === '1') fw.power(true);

// ---------- laço ----------
function resize() { stage.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
let last = performance.now(), simT = 0, frames = 0, fpsT = 0, first = true;
const inletWorld = new THREE.Vector3();
// a tela inicial já abre no ambiente do cenário selecionado (Ar limpo = oficina, com tripé);
// capturas de comparação (ui=0) e ?studio=1 mantêm o estúdio branco
let lastCovered = false, camBeforeCover = null;
let lastScenery = (showUI && Q.get('studio') !== '1') || Q.get('scenario') ? null : world.scenario;
// clicar num cenário (mesmo o já ativo, ex.: 'Ar limpo' na abertura) aplica o ambiente 3D correspondente
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.gx-scen')) setTimeout(() => { lastScenery = null; }, 0); });
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  frames++; fpsT += dt; if (fpsT > 1) { window.__fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const sdt = still ? 0 : dt * timeScale;
  simT += sdt;
  device.inletAnchor.getWorldPosition(inletWorld);
  hand.update(dt, inletCovered && !kit.state.hoseAttached, inletWorld);
  if (inletCovered !== lastCovered) {
    lastCovered = inletCovered;
    if (inletCovered && !kit.state.hoseAttached && held !== 'inlet') { camBeforeCover = { pos: camera.position.clone(), tgt: controls.target.clone() }; flyTo(inletWorld.clone().add(new THREE.Vector3(0.2, 0.08, 0.26)), inletWorld.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.8); }
    else if (!inletCovered && camBeforeCover) { flyTo(camBeforeCover.pos, camBeforeCover.tgt, 0.8); camBeforeCover = null; }
  }
  kit.update(sdt, { inletWorld, time: simT });
  // ambiente 3D acompanha o cenário escolhido (a carga inicial fica no estúdio, exceto com ?scenario=)
  if (world.scenario !== lastScenery) { lastScenery = world.scenario; stage.setScenery?.(lastScenery); applyTripod(lastScenery); }
  const gas = world.sample(simT, { kit });
  const blocked = inletCovered || (kit.state.hoseAttached && !kit.state.valveOpen) || !!world.blocked;
  const out = fw.update(sdt, gas, { inletBlocked: blocked, hoseLen: kit.state.hoseAttached ? (kit.state.hoseLen || 1) : (world.hoseLen || 0) });
  lcd.draw(out.lcd, simT);
  device.setLeds(out.leds);
  device.setBacklight(out.backlight ? 1 : 0);
  device.update(sdt, { vibrate: out.vibrate, time: simT });
  audio.update(out, sdt);
  ui.update(out, sdt);
  if (camAnim.t < 1) {
    camAnim.t = Math.min(1, camAnim.t + dt / camAnim.dur);
    const e = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e); controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
  }
  controls.update();
  stage.render(dt);
  if (first) { first = false; window.__ready = true; const b = document.getElementById('boot'); if (b) { b.style.opacity = 0; setTimeout(() => b.remove(), 700); } }
}
requestAnimationFrame(frame);
