// Botão "Ver tela de perto": abre uma janela com o visor do aparelho ampliado e ao vivo
// (copia o canvas do LCD a cada quadro). Tecla V abre/fecha, Esc fecha. Dono: orquestrador.
export function createZoom(sim) {
  const src = sim.lcd.canvas;
  const css = document.createElement('style');
  css.textContent = `
  .zm-btn{position:fixed;right:16px;bottom:104px;z-index:50;display:flex;gap:8px;align-items:center;padding:10px 16px;
    border-radius:999px;border:1px solid #0002;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;color:#15181c;
    background:#fff;box-shadow:0 6px 24px #0002}
  .zm-btn:hover{background:#fff8d6}
  .zm-ov{position:fixed;inset:0;z-index:80;display:none;place-items:center;background:#0b0d10cc;backdrop-filter:blur(6px);padding:16px}
  .zm-ov[data-open="1"]{display:grid}
  .zm-box{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%}
  .zm-frame{background:linear-gradient(#f4c60a,#e3b300);border-radius:28px;padding:18px 18px 14px;box-shadow:0 20px 60px #0007}
  .zm-bezel{background:#141518;border-radius:16px;padding:14px 14px 10px}
  .zm-bezel canvas{display:block;border-radius:6px;width:min(86vw,calc((100vh - 230px) * 1.12),760px);aspect-ratio:1344/1200;height:auto}
  .zm-band{margin-top:8px;display:flex;justify-content:flex-end}
  .zm-band span{background:#f2c500;color:#15181c;font:italic 700 15px Inter,system-ui,sans-serif;padding:2px 12px;border-radius:4px}
  .zm-bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .zm-bar button{padding:9px 16px;border-radius:10px;border:0;cursor:pointer;font:600 14px Inter,system-ui,sans-serif}
  .zm-bar .zm-hold{background:#ffd21f;color:#15181c} .zm-bar .zm-3d{background:#2a2f36;color:#fff} .zm-bar .zm-x{background:#fff;color:#15181c}
  .zm-hint{color:#c9ced6;font:13px Inter,system-ui,sans-serif;text-align:center}
  @media (max-width:760px){.zm-btn{bottom:200px}}`;
  document.head.append(css);

  const btn = document.createElement('button');
  btn.className = 'zm-btn'; btn.innerHTML = '🔍 Ver tela de perto'; btn.title = 'Mostrar o visor ampliado (tecla V)';
  const ov = document.createElement('div'); ov.className = 'zm-ov';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Tela do aparelho ampliada');
  ov.innerHTML = `<div class="zm-box">
    <div class="zm-frame"><div class="zm-bezel"><canvas width="1344" height="1200"></canvas>
      <div class="zm-band"><span>Max XT II</span></div></div></div>
    <div class="zm-bar">
      <button class="zm-hold" title="Segure para manter o botão pressionado">Botão do aparelho (segure)</button>
      <button class="zm-3d">Ver no 3D</button>
      <button class="zm-x">Fechar (Esc)</button>
    </div>
    <div class="zm-hint">Visor ao vivo: tudo o que o aparelho mostra aparece aqui ampliado.</div>
  </div>`;
  document.body.append(btn, ov);
  const cv = ov.querySelector('canvas'); const g = cv.getContext('2d');

  let open = false;
  function frame() {
    if (!open) return;
    g.drawImage(src, 0, 0, cv.width, cv.height);
    requestAnimationFrame(frame);
  }
  function setOpen(v) { open = v; ov.dataset.open = v ? '1' : '0'; if (v) requestAnimationFrame(frame); }
  btn.onclick = () => setOpen(true);
  ov.querySelector('.zm-x').onclick = () => setOpen(false);
  ov.querySelector('.zm-3d').onclick = () => { setOpen(false); sim.cam('lcd'); };
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) setOpen(false); });
  const hold = ov.querySelector('.zm-hold');
  const down = (e) => { e.preventDefault(); sim.fw.input.button = true; sim.device.setButton(true); };
  const up = () => { sim.fw.input.button = false; sim.device.setButton(false); };
  hold.addEventListener('pointerdown', down);
  hold.addEventListener('pointerup', up); hold.addEventListener('pointerleave', up); hold.addEventListener('pointercancel', up);
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    if (e.code === 'KeyV' && !e.repeat) setOpen(!open);
    if (e.code === 'Escape' && open) setOpen(false);
  });
  return { open: () => setOpen(true), close: () => setOpen(false), get isOpen() { return open; } };
}
