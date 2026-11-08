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
const kit = buildKit();
scene.add(kit.group);
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
  for (const h of ray.intersectObjects([device.group, kit.group], true)) {
    let o = h.object; while (o && !o.userData.action) o = o.parent;
    if (o) return o.userData.action;
  }
  return null;
}
let inletCovered = false;
canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const a = pick(ev); downAt = performance.now(); downPos = [ev.clientX, ev.clientY];
  if (a === 'button') { held = 'button'; fw.input.button = true; device.setButton(true); audio.click(); controls.enabled = false; canvas.setPointerCapture(ev.pointerId); }
  else if (a === 'inlet') { held = 'inlet'; inletCovered = true; controls.enabled = false; canvas.setPointerCapture(ev.pointerId); }
  else if (a) { kit.handleAction(a); }
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
  setGas(g) { world.setScenario('manual'); Object.assign(world.manual, g); },
  cam: setCam,
  coverInlet(on) { inletCovered = !!on; },
  capture() { stage.render(0); return renderer.domElement.toDataURL('image/png'); },
};
window.__sim = sim;
const ui = showUI ? createUI({ fw, world, kit, sim, audio }) : { update() {} };
sim.ui = ui;
// botões da demonstração e da tela de perto só com a UI (capturas ui=0 ficam limpas)
sim.zoom = showUI ? createZoom(sim) : null;
sim.demo = showUI ? createDemo(sim) : null;
if (Q.get('demo') === '1') document.addEventListener('pointerdown', () => { audio.unlock(); if (sim.demo && !sim.demo.running) sim.demo.start(Math.max(0, qn('cap', 1) - 1)); }, { once: true });
if (Q.get('state')) sim.jump(Q.get('state'));
else fw.power(true);

// ---------- laço ----------
function resize() { stage.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
let last = performance.now(), simT = 0, frames = 0, fpsT = 0, first = true;
const inletWorld = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  frames++; fpsT += dt; if (fpsT > 1) { window.__fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const sdt = still ? 0 : dt * timeScale;
  simT += sdt;
  device.inletAnchor.getWorldPosition(inletWorld);
  kit.update(sdt, { inletWorld, time: simT });
  const gas = world.sample(simT, { kit });
  const blocked = inletCovered || (kit.state.hoseAttached && !kit.state.valveOpen) || !!world.blocked;
  const out = fw.update(sdt, gas, { inletBlocked: blocked, hoseLen: kit.state.hoseAttached ? (kit.state.hoseLen || 1) : (world.hoseLen || 0) });
  lcd.draw(out.lcd, simT);
  device.setLeds(out.leds);
  device.setBacklight(out.backlight ? 1 : 0);
  device.update(sdt, { vibrate: out.vibrate, time: simT });
  audio.update(out, sdt);
  ui.update(out, sdt);
  controls.update();
  stage.render(dt);
  if (first) { first = false; window.__ready = true; const b = document.getElementById('boot'); if (b) { b.style.opacity = 0; setTimeout(() => b.remove(), 700); } }
}
requestAnimationFrame(frame);
