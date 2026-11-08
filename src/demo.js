// Demonstração guiada narrada (voz "Francisca" quando disponível — Microsoft Edge: "Microsoft Francisca Online (Natural)").
// Dono: orquestrador. Uso: botão "Demonstração" ou ?demo=1 (pede um clique: navegadores exigem gesto para falar).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /francisca/i.test(v.name))
    || vs.find((v) => /pt[-_]BR/i.test(v.lang) && /natural|online|neural/i.test(v.name))
    || vs.find((v) => /pt[-_]BR/i.test(v.lang))
    || vs.find((v) => /^pt/i.test(v.lang)) || null;
}

export function createDemo(sim) {
  let running = false, token = 0;
  const hasTTS = 'speechSynthesis' in window;

  // ---------- legenda + botão ----------
  const css = document.createElement('style');
  css.textContent = `
  .dm-btn{position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:50;display:flex;gap:10px;align-items:center;
    padding:10px 18px;border-radius:999px;border:0;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;color:#15181c;
    background:#ffd21f;box-shadow:0 6px 24px #0003}
  .dm-btn:hover{filter:brightness(1.05)} .dm-btn[data-on="1"]{background:#15181c;color:#fff}
  .dm-cap{position:fixed;left:50%;transform:translateX(-50%);bottom:156px;z-index:50;max-width:min(760px,calc(100vw - 32px));
    padding:14px 18px 14px 16px;border-radius:14px;background:#111418e6;color:#fff;font:500 16px/1.45 Inter,system-ui,sans-serif;
    box-shadow:0 10px 30px #0004;display:none;gap:12px;align-items:flex-start;backdrop-filter:blur(8px)}
  .dm-cap b{color:#ffd21f;font-weight:700;white-space:nowrap} .dm-cap .dm-v{font-size:11px;color:#aab;display:block;margin-top:6px}
  @media (max-width:760px){.dm-cap{bottom:200px;font-size:14px}.dm-btn{bottom:150px}}`;
  document.head.append(css);
  const btn = document.createElement('button'); btn.className = 'dm-btn';
  btn.innerHTML = '▶ Demonstração narrada (voz Francisca)';
  const cap = document.createElement('div'); cap.className = 'dm-cap';
  document.body.append(btn, cap);

  async function say(text, minMs = 0) {
    const my = token;
    const voice = hasTTS ? pickVoice() : null;
    cap.style.display = 'none'; // legenda retirada a pedido do usuário (atrapalhava a visão do aparelho); só a voz narra
    cap.innerHTML = `<div><b>Francisca</b></div><div>${text}<span class="dm-v">${voice ? 'voz: ' + voice.name : 'sem voz no navegador — legenda apenas'}</span></div>`;
    const t0 = performance.now();
    if (voice) {
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
        u.voice = voice; u.lang = voice.lang || 'pt-BR'; u.rate = 1.02; u.pitch = 1;
        u.onend = res; u.onerror = res;
        speechSynthesis.speak(u);
        // segurança: alguns navegadores não disparam onend
        setTimeout(res, 2500 + text.length * 95);
      });
    } else await wait(1800 + text.length * 62);
    const left = minMs - (performance.now() - t0);
    if (left > 0) await wait(left);
    if (my !== token) throw new Error('stop');
  }
  const clean = () => sim.setGas({ H2S: 0, CO: 0, O2: 20.9, LEL: 0 });
  const kitOff = () => {
    if (sim.kit.state.hoseAttached) sim.kit.handleAction('hose');
    if (sim.kit.state.valveOpen) sim.kit.handleAction('valve');
  };

  const steps = [
    async () => { kitOff(); clean(); sim.cam('hero'); sim.jump('run');
      await say('Olá! Eu sou a Francisca e vou apresentar o gêmeo digital do detector multigás com bomba. Ele mede quatro gases ao mesmo tempo: sulfeto de hidrogênio, monóxido de carbono, oxigênio e gases inflamáveis, em porcentagem do limite inferior de explosividade.'); },
    async () => { sim.cam('ref1');
      await say('Na frente ficam o visor, o furo da sirene e o botão único de comando. No topo e nas laterais estão as barras de alarme luminosas. A bomba interna puxa o ar pela entrada na lateral, o que permite amostrar à distância, com mangueira ou sonda.'); },
    async () => { sim.cam('lcd'); sim.jump('selftest');
      await say('Ao ligar, segurando o botão por três segundos, o aparelho faz o autoteste: acende todos os segmentos do visor, os LEDs, a sirene e o vibrador. Confira sempre se tudo funcionou.', 4000); },
    async () => { sim.jump('pumptest'); sim.cam('hero');
      await say('Em seguida vem o teste da bomba. O aparelho pede que você tape a entrada com o dedo. Se ele perceber o vácuo, a bomba está boa.');
      sim.coverInlet(true); await wait(2200); sim.coverInlet(false); },
    async () => { sim.jump('run'); sim.cam('lcd');
      await say('Agora estamos em operação normal, em ar limpo: zero ppm de H₂S, zero ppm de CO, vinte vírgula nove por cento de oxigênio e zero por cento de LEL. O coração piscando e a luz verde confirmam que o aparelho está funcionando, e a ventoinha indica a bomba ligada.', 2000); },
    async () => { sim.cam('hero'); sim.setGas({ H2S: 30, CO: 0, O2: 20.9, LEL: 0 });
      await say('Atenção! Simulei um vazamento de H₂S a trinta ppm. Primeiro dispara o alarme baixo, a dez ppm, e logo depois o alarme alto, a quinze ppm, com sirene rápida, luz vermelha e vibração. Diante de um alarme alto, abandone a área imediatamente, contra o vento, e avise a equipe.', 7000); },
    async () => { clean(); sim.press(150);
      await say('Com a atmosfera limpa de novo, a leitura cai e o alarme cessa. O aparelho guarda o pico e calcula as exposições média de oito horas, o TWA, e de curta duração, o STEL. Basta dar dois toques no botão para consultá-los.', 4000); },
    async () => { sim.setGas({ H2S: 0, CO: 0, O2: 18.0, LEL: 0 });
      await say('Agora o oxigênio caiu para dezoito por cento. Abaixo de dezenove e meio por cento a atmosfera é deficiente em oxigênio e o detector alarma. Esse é um dos riscos mais traiçoeiros em espaços confinados.', 5000); },
    async () => { sim.setGas({ H2S: 0, CO: 0, O2: 20.9, LEL: 25 });
      await say('E aqui, gás inflamável a vinte e cinco por cento do limite inferior de explosividade, acima do alarme alto de vinte por cento. Nenhuma fonte de ignição, e saia da área. Acima de cem por cento o visor mostra O L: concentração explosiva.', 5000); },
    async () => { clean(); sim.jump('run'); sim.cam('ref2');
      await say('Este é o kit de calibração: o cilindro com mistura de quatro gases, com H₂S a vinte e cinco ppm, CO a cem ppm, metano a cinquenta por cento do LEL e oxigênio a dezoito por cento, o regulador de fluxo fixo e a sonda de amostragem.', 1000); },
    async () => { sim.cam('kit'); sim.jump('bump');
      await say('Antes de cada uso, faça o teste de resposta, o bump test: abra a válvula, conecte a mangueira e aplique o gás. Todos os sensores devem responder e os alarmes sonoro e visual devem disparar. Se não responder, o aparelho não pode ser usado.', 6000); },
    async () => { sim.cam('lcd'); sim.jump('cal-span');
      await say('Na calibração, o aparelho primeiro zera os sensores em ar limpo e depois ajusta o span com o gás do cilindro, a cerca de meio litro por minuto. Calibre ao menos a cada seis meses, ou sempre que o bump test falhar.', 4000); },
    async () => { kitOff(); clean(); sim.jump('run'); sim.cam('hero');
      await say('Pronto! Agora é a sua vez: use os cenários, os roteiros guiados e o botão do aparelho para praticar. Lembre-se: o detector é um equipamento de proteção pessoal, e a sua reação ao alarme é o que salva vidas.'); },
  ];

  async function start() {
    stop(); running = true; const my = ++token;
    btn.dataset.on = '1'; btn.innerHTML = '■ Parar demonstração';
    if (hasTTS) { speechSynthesis.cancel(); speechSynthesis.getVoices(); await wait(150); }
    try { for (const s of steps) { if (my !== token) break; await s(); } } catch { /* parada */ }
    if (my === token) stop();
  }
  function stop() {
    token++; running = false;
    if (hasTTS) speechSynthesis.cancel();
    sim.coverInlet(false);
    cap.style.display = 'none';
    btn.dataset.on = '0'; btn.innerHTML = '▶ Demonstração narrada (voz Francisca)';
  }
  btn.onclick = () => (running ? stop() : start());
  if (hasTTS) speechSynthesis.onvoiceschanged = () => {};
  return { start, stop, get running() { return running; }, steps };
}
