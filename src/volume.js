// Controle de volume no botão de som da barra superior (dono: orquestrador).
// Clique no botão → painel em vidro com barra de volume (0–100 %), porcentagem e botão Mudo. Esc ou clique fora fecha.
const ICON = {
  on: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  low: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
};
const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

export function createVolume(audio) {
  const btn = document.querySelector('[data-k="mute"]');
  if (!btn || !audio) return null;
  let vol = load('gx.vol', 0.55), muted = load('gx.muted', false);
  audio.setVolume?.(vol); audio.setMuted?.(muted);

  const css = document.createElement('style');
  css.textContent = `
  .vol-pop{position:fixed;z-index:90;width:260px;padding:14px 16px 16px;border-radius:16px;display:none;color:#fff;
    background:linear-gradient(160deg,rgba(255,236,214,.12),rgba(28,22,18,.34));-webkit-backdrop-filter:blur(20px) saturate(1.9) brightness(.92);
    backdrop-filter:blur(20px) saturate(1.9) brightness(.92);border:1px solid rgba(255,255,255,.22);
    box-shadow:0 16px 44px -10px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.55);font:500 13px/1.4 Inter,system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.45)}
  .vol-pop[data-open="1"]{display:block}
  .vol-pop h4{margin:0 0 10px;font-size:13px;font-weight:700;color:#ffd23f;display:flex;justify-content:space-between}
  .vol-pop h4 b{color:#fff;font-variant-numeric:tabular-nums}
  .vol-row{display:flex;align-items:center;gap:10px}
  .vol-row button{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;cursor:pointer;color:#fff;
    background:rgba(8,6,4,.28);border:1px solid rgba(255,255,255,.22)}
  .vol-pop input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:3px;cursor:pointer;
    background:linear-gradient(90deg,#ffd23f var(--p),rgba(255,255,255,.22) var(--p))}
  .vol-pop input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
  .vol-pop input[type=range]::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#fff}
  .vol-mute{margin-top:12px;width:100%;height:36px;border-radius:10px;cursor:pointer;font:600 13px Inter,system-ui,sans-serif;color:#fff;
    background:linear-gradient(180deg,rgba(255,236,214,.30),rgba(120,80,50,.28));border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
  .vol-mute[aria-pressed="true"]{background:#ffd23f;color:#15181c;text-shadow:none}
  .vol-hint{margin-top:8px;font-size:11.5px;color:rgba(255,255,255,.75)}`;
  document.head.append(css);

  const pop = document.createElement('div'); pop.className = 'vol-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Volume do som');
  pop.innerHTML = `<h4>Volume <b data-v></b></h4>
    <div class="vol-row"><button data-down aria-label="Diminuir volume">−</button>
      <input type="range" min="0" max="100" step="1" aria-label="Volume">
      <button data-up aria-label="Aumentar volume">+</button></div>
    <button class="vol-mute" aria-pressed="false"></button>
    <div class="vol-hint">Sirene, bipes, bomba e vibração do aparelho.</div>`;
  document.body.append(pop);
  const range = pop.querySelector('input'), val = pop.querySelector('[data-v]'), mBtn = pop.querySelector('.vol-mute');

  function render() {
    const p = Math.round(vol * 100);
    range.value = p; range.style.setProperty('--p', p + '%');
    val.textContent = muted ? 'mudo' : p + ' %';
    mBtn.setAttribute('aria-pressed', String(muted)); mBtn.textContent = muted ? '🔇 Mudo ativado — clique para ligar o som' : '🔈 Deixar no mudo';
    btn.innerHTML = muted || vol === 0 ? ICON.off : vol < 0.5 ? ICON.low : ICON.on;
    btn.classList.toggle('on', muted);
    btn.setAttribute('aria-label', muted ? 'Som no mudo — abrir controle de volume' : `Volume ${p} % — abrir controle de volume`);
    btn.title = 'Volume e mudo';
  }
  function setVol(v) { vol = Math.max(0, Math.min(1, v)); if (vol > 0 && muted) setMuted(false); audio.setVolume?.(vol); save('gx.vol', vol); render(); }
  function setMuted(m) { muted = !!m; audio.setMuted?.(muted); save('gx.muted', muted); render(); }
  function place() {
    const r = btn.getBoundingClientRect();
    pop.style.top = r.bottom + 10 + 'px';
    pop.style.left = Math.max(16, Math.min(innerWidth - 276, r.right - 260)) + 'px';
  }
  const open = (v) => { pop.dataset.open = v ? '1' : '0'; if (v) { place(); audio.unlock?.(); } };

  // assume o clique do botão (fase de captura), no lugar do "liga/desliga" antigo da UI
  btn.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); open(pop.dataset.open !== '1'); }, true);
  range.addEventListener('input', () => setVol(range.value / 100));
  pop.querySelector('[data-down]').onclick = () => setVol(vol - 0.1);
  pop.querySelector('[data-up]').onclick = () => setVol(vol + 0.1);
  mBtn.onclick = () => setMuted(!muted);
  addEventListener('pointerdown', (e) => { if (pop.dataset.open === '1' && !pop.contains(e.target) && !btn.contains(e.target)) open(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); if (e.key === 'm' && !e.target.closest?.('input,textarea')) setMuted(!muted); });
  addEventListener('resize', () => pop.dataset.open === '1' && place());
  render();
  return { open: () => open(true), close: () => open(false), setVol, setMuted };
}
