// Demonstração guiada narrada, minuciosa, com avaliação final.
// Voz "Francisca" quando disponível (Microsoft Edge: "Microsoft Francisca Online (Natural)"); senão a voz pt-BR do sistema.
// Sem caixa de legenda (pedido do usuário: não tapar o aparelho). O que está sendo explicado no painel recebe um contorno amarelo.
// Dono: orquestrador. Uso: botão "Demonstração" ou ?demo=1 (+ um clique: navegadores exigem gesto para falar).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /francisca/i.test(v.name))
    || vs.find((v) => /pt[-_]BR/i.test(v.lang) && /natural|online|neural/i.test(v.name))
    || vs.find((v) => /pt[-_]BR/i.test(v.lang))
    || vs.find((v) => /^pt/i.test(v.lang)) || null;
}

// ---------- avaliação ----------
const QUIZ = [
  { q: 'O detector entrou em ALARME ALTO de H₂S. Qual é a atitude correta?',
    o: ['Silenciar o alarme e continuar o serviço', 'Abandonar a área imediatamente, contra o vento, e avisar a equipe', 'Cheirar o ar para confirmar o vazamento', 'Desligar o aparelho e religar'],
    c: 1, e: 'Alarme alto exige abandono imediato, contra o vento, e comunicação à equipe. Nunca confie no olfato: o H₂S paralisa o nervo olfativo em concentrações altas.' },
  { q: 'Abaixo de qual concentração de oxigênio o aparelho indica atmosfera deficiente?',
    o: ['23,5 %', '20,9 %', '19,5 %', '16 %'], c: 2,
    e: 'O ar normal tem 20,9 % de oxigênio. Abaixo de 19,5 % a atmosfera é deficiente e o detector alarma. Acima de 23,5 % ele alarma por enriquecimento.' },
  { q: 'O que é o teste de resposta, o bump test?',
    o: ['Ajustar o zero dos sensores', 'Expor o aparelho a gás de concentração conhecida, acima dos alarmes, para confirmar que sensores e alarmes respondem', 'Trocar a bateria', 'Testar a bomba tapando a entrada'], c: 1,
    e: 'O bump test é uma verificação rápida antes do uso diário: o gás do cilindro deve disparar os alarmes. Ele não ajusta nada; quem ajusta é a calibração.' },
  { q: 'Qual a ordem correta da calibração?',
    o: ['Aplicar gás e depois zerar', 'Zerar em ar limpo e depois aplicar o gás de calibração (span)', 'Só aplicar o gás', 'Só zerar'], c: 1,
    e: 'Primeiro o aparelho faz o auto-zero em atmosfera limpa e ajusta o oxigênio em 20,9 %. Depois o span, com o gás do cilindro, a cerca de meio litro por minuto.' },
  { q: 'No cilindro de calibração deste kit, quanto há de metano?',
    o: ['2,5 % em volume, igual a 50 % do LEL', '25 % em volume', '100 ppm', '18 %'], c: 0,
    e: 'O cilindro tem H₂S 25 ppm, CO 100 ppm, metano 2,5 % em volume, que corresponde a 50 % do limite inferior de explosividade, e oxigênio 18 %, com balanço de nitrogênio.' },
  { q: 'O visor mostra “OL” no campo LEL. O que isso significa?',
    o: ['Leitura normal', 'Concentração acima da faixa: atmosfera potencialmente explosiva', 'Sensor desligado', 'Bateria fraca'], c: 1,
    e: 'OL significa acima da faixa, over limit. Acima de 100 % do LEL a mistura pode explodir. Saia da área e só retorne depois de ventilada e liberada.' },
  { q: 'Qual a diferença entre TWA e STEL?',
    o: ['Não há diferença', 'TWA é a média ponderada de 8 horas; STEL é a exposição de curta duração, de 15 minutos', 'TWA é o pico; STEL é a média', 'Os dois medem oxigênio'], c: 1,
    e: 'O TWA avalia a jornada de 8 horas; o STEL, picos de 15 minutos. Por isso H₂S e CO têm alarmes de TWA e STEL, e oxigênio e LEL não.' },
  { q: 'Na partida, o aparelho pede o teste da bomba. O que você deve fazer?',
    o: ['Apertar o botão 3 vezes', 'Tapar a entrada da bomba até ele confirmar', 'Conectar o cilindro', 'Nada, é automático'], c: 1,
    e: 'Tapando a entrada, a bomba cria vácuo e o aparelho confirma que ela aspira corretamente. Uma bomba com falha não traz a amostra até os sensores.' },
  { q: 'O coração piscando no visor e a luz verde piscando indicam…',
    o: ['Alarme baixo', 'Que o aparelho está ligado e funcionando corretamente', 'Bateria fraca', 'Calibração vencida'], c: 1,
    e: 'É o sinal de confiança: o coração e o pisca verde mostram, de longe, que o aparelho está operando normalmente.' },
  { q: 'Ao avaliar um espaço confinado com mangueira, como medir?',
    o: ['Só na boca de visita', 'De cima para baixo, em níveis, esperando em cada nível o tempo da mangueira mais o tempo de resposta dos sensores', 'Só no fundo', 'Rápido, descendo direto'], c: 1,
    e: 'Os gases se estratificam: metano sobe, H₂S e falta de oxigênio ficam no fundo. Teste em níveis, de cima para baixo, aguardando o atraso da mangueira e a resposta dos sensores.' },
];

export function createDemo(sim) {
  let running = false, token = 0, chapter = '';
  const hasTTS = 'speechSynthesis' in window;

  const css = document.createElement('style');
  css.textContent = `
  .dm-wrap{position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:50;display:flex;gap:8px;align-items:center}
  .dm-btn{display:flex;gap:10px;align-items:center;padding:10px 18px;border-radius:999px;border:0;cursor:pointer;
    font:600 14px Inter,system-ui,sans-serif;color:#15181c;background:#ffd21f;box-shadow:0 6px 24px #0003;white-space:nowrap}
  .dm-btn:hover{filter:brightness(1.05)} .dm-btn[data-on="1"]{background:#15181c;color:#fff}
  .dm-skip{display:none;padding:10px 14px;border-radius:999px;border:0;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;background:#fff;color:#15181c;box-shadow:0 6px 24px #0002}
  .dm-wrap[data-on="1"] .dm-skip{display:block}
  .dm-hl{position:fixed;z-index:60;pointer-events:none;border:3px solid #ffd21f;border-radius:14px;display:none;
    box-shadow:0 0 0 4px #ffd21f55,0 0 28px #ffd21faa;animation:dmPulse 1.2s ease-in-out infinite;transition:all .35s ease}
  @keyframes dmPulse{50%{box-shadow:0 0 0 8px #ffd21f33,0 0 40px #ffd21fcc}}
  .dm-q{position:fixed;right:16px;top:84px;z-index:70;width:min(400px,calc(100vw - 32px));background:#14171bf2;color:#fff;
    border-radius:16px;padding:18px;font:15px/1.45 Inter,system-ui,sans-serif;box-shadow:0 18px 50px #0006;display:none;backdrop-filter:blur(8px)}
  .dm-q h3{margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ffd21f}
  .dm-q p{margin:0 0 12px;font-weight:600;font-size:16px}
  .dm-q button.o{display:block;width:100%;text-align:left;margin:0 0 8px;padding:10px 12px;border-radius:10px;border:1px solid #3a4048;
    background:#1f242b;color:#fff;font:500 14px/1.35 Inter,system-ui,sans-serif;cursor:pointer}
  .dm-q button.o:hover:not(:disabled){border-color:#ffd21f}
  .dm-q button.ok{background:#14532d;border-color:#22c55e} .dm-q button.bad{background:#5c1d1d;border-color:#ef4444}
  .dm-q .ex{font-size:14px;color:#d6dbe1;margin-top:6px} .dm-q .sc{font-size:13px;color:#aab3bd;margin-top:10px}
  .dm-q .big{font-size:40px;font-weight:800;color:#ffd21f;margin:6px 0}
  @media (max-width:760px){.dm-wrap{bottom:150px}.dm-q{top:auto;bottom:200px;right:16px}}`;
  document.head.append(css);

  const wrap = document.createElement('div'); wrap.className = 'dm-wrap';
  const btn = document.createElement('button'); btn.className = 'dm-btn';
  const skip = document.createElement('button'); skip.className = 'dm-skip'; skip.textContent = 'Pular ⏭'; skip.title = 'Pular para o próximo capítulo';
  const btn2 = document.createElement('button'); btn2.className = 'dm-btn dm-b2';
  wrap.append(btn, btn2, skip);
  const hlBox = document.createElement('div'); hlBox.className = 'dm-hl';
  const qBox = document.createElement('div'); qBox.className = 'dm-q'; qBox.setAttribute('role', 'dialog'); qBox.setAttribute('aria-label', 'Avaliação');
  document.body.append(wrap, hlBox, qBox);
  const idleLabel = '▶ Explicação';
  const idleLabel2 = '▶ Demonstração';
  btn.textContent = idleLabel; btn2.textContent = idleLabel2;
  btn.title = 'Como funciona o equipamento (narrado pela Francisca)'; btn2.title = 'Como avaliar cada agente: H₂S, CO, O₂ e inflamáveis';
  const st2 = document.createElement('style'); st2.textContent = '.dm-b2{background:rgba(28,22,18,.55);color:#fff;border:1px solid rgba(255,255,255,.35);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)} .dm-wrap[data-on="1"] .dm-btn:not([data-on="1"]){display:none}'; document.head.append(st2);

  // ---------- destaque ----------
  let hlEl = null;
  function track() {
    if (!hlEl) return;
    const r = hlEl.getBoundingClientRect();
    if (r.width && r.height) Object.assign(hlBox.style, { display: 'block', left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
    else hlBox.style.display = 'none';
    requestAnimationFrame(track);
  }
  function hl(sel) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    hlEl = el || null;
    if (!el) { hlBox.style.display = 'none'; return; }
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* */ }
    requestAnimationFrame(track);
  }
  const hlOff = () => { hlEl = null; hlBox.style.display = 'none'; };
  const tab = (id) => { const t = $(`[data-tab="${id}"]`); if (t) t.click(); };

  // ---------- voz ----------
  async function speak(text) {
    const voice = pickVoice();
    const plain = text.replace(/<[^>]+>/g, '');
    if (!voice) { await wait(1500 + plain.length * 60); return; }
    // frases curtas: o Chrome corta falas longas
    const parts = plain.match(/[^.!?;:]+[.!?;:]*\s*/g) || [plain];
    for (const p of parts) {
      const s = p.trim(); if (!s) continue;
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(s);
        u.voice = voice; u.lang = voice.lang || 'pt-BR'; u.rate = 1.0; u.pitch = 1;
        let done = false; const fin = () => { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
        setTimeout(fin, 2500 + s.length * 110);
      });
    }
  }
  let skipFlag = false;
  async function say(text, minMs = 0) {
    const my = token;
    if (skipFlag) throw new Error('skip');
    const t0 = performance.now();
    await speak(text);
    const left = minMs - (performance.now() - t0);
    if (left > 0) await wait(left);
    if (my !== token) throw new Error('stop');
    if (skipFlag) throw new Error('skip');
  }
  const clean = () => sim.setGas({ H2S: 0, CO: 0, O2: 20.9, LEL: 0 });
  const kitOff = () => {
    if (sim.kit.state.hoseAttached) sim.kit.handleAction('hose');
    if (sim.kit.state.valveOpen) sim.kit.handleAction('valve');
  };
  const reset = () => { hlOff(); sim.zoom?.close(); sim.coverInlet(false); };

  // ---------- capítulos ----------
  const CH = [
    ['Apresentação', async () => {
      kitOff(); clean(); sim.cam('hero'); sim.jump('run');
      await say('Olá! Eu sou a Francisca. Nesta explicação vou mostrar, passo a passo, o detector multigás com bomba: as partes do aparelho, o visor, cada informação e cada botão do painel, os alarmes, o teste de resposta, a calibração completa, e no final faremos uma avaliação com dez perguntas.');
      await say('Este aparelho monitora quatro gases ao mesmo tempo. Sulfeto de hidrogênio, o H₂S, e monóxido de carbono, o CO, em partes por milhão. Oxigênio, em porcentagem do volume. E gases inflamáveis, em porcentagem do limite inferior de explosividade, o LEL. Ele é um equipamento de proteção pessoal: avisa quando a atmosfera fica perigosa, mas quem salva vidas é a reação correta do trabalhador.');
    }],
    ['O aparelho', async () => {
      sim.cam('ref1');
      await say('Vamos conhecer o aparelho por fora. A capa de borracha amarela protege contra quedas e choques. No topo fica a lente de alarme, e nas laterais as barras luminosas de grande ângulo: elas piscam em verde quando está tudo bem e em vermelho nos alarmes, e podem ser vistas de qualquer direção.');
      await say('Logo abaixo está o visor de cristal líquido, com as quatro leituras. Na faixa preta, o nome do modelo. Mais abaixo, à esquerda, o furo da sirene, que emite cerca de noventa e cinco decibéis. À direita, o único botão de comando, que liga, desliga, acende a luz do visor, mostra os picos e inicia a calibração.');
      sim.cam('back');
      await say('Atrás ficam o clipe jacaré, para prender no cinto ou no colete, a etiqueta e os contatos de carga. A metade inferior da frente guarda os sensores e o filtro. Na lateral fica a entrada da bomba: é por ela que o ar é aspirado, o que permite medir à distância, com mangueira ou sonda, antes de entrar em um local.');
    }],
    ['Ligar o aparelho', async () => {
      sim.cam('lcd'); sim.jump('selftest');
      await say('Para ligar, segure o botão por cerca de três segundos. Começa uma contagem regressiva e, em seguida, o autoteste: todos os segmentos do visor acendem, as luzes piscam, a sirene toca e o vibrador funciona. Observe e escute: se alguma coisa não funcionar, o aparelho não deve ser usado.', 3000);
      sim.jump('limits');
      await say('Depois o aparelho mostra os pontos de ajuste dos alarmes. Para H₂S, alarme baixo em 10 e alto em 15 partes por milhão. Para CO, baixo em 35 e alto em 200. Para oxigênio, baixo em 19 vírgula 5 e alto em 23 vírgula 5 por cento. E para inflamáveis, baixo em 10 e alto em 20 por cento do LEL. Também mostra os limites de TWA e STEL.', 2000);
      sim.jump('caldays');
      await say('Em seguida, quantos dias faltam para a próxima calibração. Se ela estiver vencida, providencie a calibração antes do uso.', 1500);
      sim.jump('pumptest'); sim.cam('hero');
      await say('Agora vem o teste da bomba. O visor pede que você tape a entrada. Vou tapar agora.');
      sim.coverInlet(true); await wait(2500); sim.coverInlet(false);
      await say('Pronto: a bomba criou vácuo e o aparelho aprovou. Se o teste falhar, verifique o filtro e a mangueira; com a bomba ruim, o ar não chega aos sensores.', 1000);
    }],
    ['O visor', async () => {
      sim.jump('run'); clean(); sim.zoom?.open();
      await say('Abri a tela de perto, que você também pode abrir pelo botão Ver tela de perto ou pela tecla V. No canto superior esquerdo está o H₂S, em ppm, agora zero. No superior direito, o CO, também em ppm, zero. Embaixo à esquerda, o oxigênio, vinte vírgula nove por cento, o valor normal do ar. Embaixo à direita, os inflamáveis, zero por cento do LEL.');
      await say('Na linha de baixo, o coração piscando indica que o aparelho está funcionando, junto com a luz verde. A ventoinha girando mostra que a bomba está aspirando. E a bateria mostra a carga em três barras. Em alarme aparecem ainda o sino, as palavras LOW ou HIGH e o campo do gás piscando. Ao apertar o botão uma vez, o visor acende a luz de fundo por cinco segundos.', 1000);
      sim.zoom?.close();
    }],
    ['O painel', async () => {
      sim.cam('hero'); tab('leituras');
      hl('.gx-top');
      await say('Agora o painel do simulador. Na barra superior, o título e o aviso de que é um simulador didático, sem ligação com o fabricante.');
      hl('.gx-clock');
      await say('Aqui fica o relógio do tempo simulado: ele conta o tempo de exposição usado nos cálculos de TWA e STEL.');
      hl('.gx-seg');
      await say('Estes botões aceleram o tempo em dez ou sessenta vezes, útil para ver a média de oito horas subir. Durante partida, calibração e testes, o tempo volta sozinho ao normal.');
      hl('[data-k="mute"]');
      await say('Este botão liga e desliga o som da sirene, e o do lado alterna o tema claro e escuro.');
      hl('.gx-views');
      await say('Estas são as câmeras: Principal, Foto, Frente, Trás, Visor, Kit e Kit foto. Clique para ver o aparelho de cada ângulo. Você também pode girar a cena arrastando com o mouse e aproximar com a rolagem.');
      hl('.gx-hud');
      await say('No painel da esquerda, o quadro O aparelho diz traduz, em português, tudo o que o detector está fazendo e o que você deve fazer. A etiqueta colorida mostra o estado: verde em operação normal, amarela em atenção, vermelha em alarme. Os ícones ao lado acendem quando a sirene, as luzes, o vibrador e a bomba estão ativos.');
      hl('.gx-gas[data-gas="H2S"]');
      await say('Cada cartão de leitura mostra o gás, o valor grande, a unidade e uma etiqueta: OK, LOW ou HIGH. A barra horizontal compara a leitura com os limites: o traço amarelo é o alarme baixo, o vermelho, o alarme alto. Abaixo aparecem o pico registrado e, para gases tóxicos, a média TWA.');
      hl('.gx-gases');
      await say('Os quatro cartões seguem a mesma ordem do visor: H₂S, CO, oxigênio e LEL. No oxigênio, a faixa verde marca a zona segura, entre 19 vírgula 5 e 23 vírgula 5 por cento.');
      hl('.gx-trend');
      await say('O gráfico de tendência mostra os últimos cinco minutos de cada gás, em porcentagem do alarme baixo: quando a linha passa da faixa tracejada, o alarme baixo foi atingido.');
      tab('cenarios'); hl('.gx-right');
      await say('No painel da direita há cinco abas. Em Cenários você escolhe a atmosfera que chega ao aparelho: ar limpo, espaço confinado com gases em camadas, vazamento de H₂S, CO de motor, deficiência de oxigênio, atmosfera explosiva, enriquecimento de oxigênio, ou o modo manual, com controles deslizantes para cada gás.');
      tab('roteiros');
      await say('Em Roteiros estão os exercícios guiados: ligar e testar a bomba, bump test diário, calibração completa, entrada em espaço confinado e resposta a alarme. Cada passo é conferido automaticamente pelo simulador.');
      tab('ajustes');
      await say('Em Ajustes você altera os limites de alarme, liga a trava de alarme, o bipe de confiança e o modo invisível, que deixa só a vibração.');
      tab('registro');
      await say('E em Registro ficam todos os eventos, com data e hora: ligar, alarmes, testes e calibrações. Dá para exportar para planilha, como no registro de manutenção exigido para o equipamento.');
      tab('leituras');
      hl('[data-act="button"]');
      await say('Na barra de baixo, o Botão do aparelho funciona como o botão real: toque rápido acende a luz, dois toques mostram pico, TWA e STEL, e segurar desliga. A tecla espaço faz o mesmo.');
      hl('[data-act="inlet"]');
      await say('Tapar entrada simula o dedo na entrada da bomba, usado no teste da bomba. A tecla B faz o mesmo. Se a entrada ficar tapada durante a operação, ocorre o alarme de falha da bomba.');
      hl('[data-act="valve"]');
      await say('Válvula abre e fecha o cilindro de gás de calibração, e mostra a pressão restante.');
      hl('[data-act="hose"]');
      await say('Mangueira conecta o cilindro à entrada do aparelho. Com a mangueira conectada e a válvula aberta, o aparelho recebe o gás do cilindro.');
      hl('.zm-btn');
      await say('Por fim, Ver tela de perto amplia o visor, e o botão amarelo inicia ou para esta demonstração.');
      hlOff();
    }],
    ['Alarmes', async () => {
      sim.cam('hero'); sim.jump('run'); sim.setGas({ H2S: 30, CO: 0, O2: 20.9, LEL: 0 });
      await say('Vamos aos alarmes. Simulei um vazamento de H₂S a trinta ppm. A leitura sobe com o tempo de resposta do sensor. Em dez ppm vem o alarme baixo: sirene lenta e luz piscando devagar. Em quinze ppm, o alarme alto: sirene rápida, luz vermelha rápida e vibração.', 6000);
      hl('.gx-hud');
      await say('Veja como o painel mudou para vermelho e dá a instrução: abandone a área imediatamente, contra o vento, e avise a equipe. Nunca tente confirmar pelo cheiro: o H₂S paralisa o olfato.');
      hlOff(); clean();
      await say('Com o ar limpo novamente, a leitura cai e o alarme cessa. Se a trava de alarme estiver ligada, é preciso apertar o botão para confirmar.', 4000);
      sim.press(150);
      sim.setGas({ H2S: 0, CO: 0, O2: 17.5, LEL: 0 });
      await say('Agora o oxigênio caiu para dezessete e meio por cento. Abaixo de dezenove e meio por cento, alarme de deficiência de oxigênio. É comum em espaços confinados, por consumo ou deslocamento do ar por outros gases.', 5000);
      sim.setGas({ H2S: 0, CO: 0, O2: 20.9, LEL: 25 });
      await say('E agora gás inflamável a vinte e cinco por cento do LEL, acima do alarme alto de vinte. Elimine fontes de ignição e saia. Se passar de cem por cento, o visor mostra O L: concentração explosiva, e o sensor fica travado até o aparelho ser reiniciado em ar limpo.', 5000);
      clean(); sim.jump('peak'); sim.cam('lcd');
      await say('Depois de uma exposição, dois toques rápidos no botão mostram o pico, depois o TWA, a média de oito horas, e o STEL, a média de quinze minutos. A opção limpar zera os picos.', 3000);
    }],
    ['Teste de resposta', async () => {
      clean(); sim.jump('run'); kitOff(); sim.cam('ref2');
      await say('Este é o kit de calibração. O cilindro contém a mistura de referência: H₂S a vinte e cinco ppm, CO a cem ppm, metano a dois e meio por cento em volume, que equivale a cinquenta por cento do LEL, e oxigênio a dezoito por cento, com balanço de nitrogênio. O regulador libera um fluxo fixo de meio litro por minuto, e o manômetro mostra quanto gás resta. Ao lado, a sonda de amostragem.');
      sim.cam('kit');
      await say('Antes de cada uso diário, faça o bump test. Primeiro abro a válvula do cilindro.');
      if (!sim.kit.state.valveOpen) sim.kit.handleAction('valve');
      await say('Depois conecto a mangueira na entrada da bomba.', 1500);
      if (!sim.kit.state.hoseAttached) sim.kit.handleAction('hose');
      sim.jump('bump');
      await say('O gás chega aos sensores e todos devem entrar em alarme: H₂S, CO, inflamáveis e a deficiência de oxigênio. Confirme que a sirene, as luzes e o vibrador funcionaram.', 7000);
      sim.jump('bump-ok');
      await say('Bump test aprovado. Se algum sensor não responder, o aparelho não pode ser usado e deve ser calibrado ou encaminhado à manutenção.', 2000);
      kitOff();
    }],
    ['Calibração', async () => {
      clean(); kitOff(); sim.jump('run'); sim.cam('lcd');
      await say('Agora a calibração completa, recomendada pelo menos a cada seis meses, ou sempre que o bump test falhar. Ela deve ser feita em local com ar limpo e sem correntes de vento.');
      sim.jump('calcount');
      await say('Para entrar na calibração, segure o botão: primeiro aparece a contagem para desligar. Continue segurando: o visor apaga por um instante e começa a contagem da calibração. Solte quando ela terminar.', 2500);
      sim.jump('cal-zero');
      await say('Primeira etapa: o auto-zero. Em ar limpo, o aparelho zera os sensores de H₂S, CO e inflamáveis e ajusta o oxigênio em vinte vírgula nove por cento. Se houver gás no ambiente, o zero falha e a calibração não continua.', 3000);
      sim.jump('cal-apply'); sim.cam('kit');
      await say('Segunda etapa: o visor pede para aplicar o gás. Abro a válvula do cilindro e conecto a mangueira na entrada, com fluxo de meio litro por minuto.', 2000);
      if (!sim.kit.state.valveOpen) sim.kit.handleAction('valve');
      if (!sim.kit.state.hoseAttached) sim.kit.handleAction('hose');
      sim.jump('cal-span'); sim.cam('lcd');
      await say('Terceira etapa: o span. O ícone do cilindro pisca enquanto o aparelho mede o gás por cerca de trinta segundos e ajusta a sensibilidade de cada sensor aos valores do cilindro: vinte e cinco ppm de H₂S, cem ppm de CO, cinquenta por cento do LEL e dezoito por cento de oxigênio.', 5000);
      sim.jump('cal-done');
      await say('Calibração concluída: o aparelho emite um bipe e mostra os dias até a próxima calibração, cento e oitenta. Se algum sensor não atingir o valor esperado, aparece falha e o sensor deve ser verificado ou substituído.', 3000);
      kitOff(); sim.cam('kit');
      await say('Agora fecho a válvula e desconecto a mangueira. A calibração fica gravada no registro de eventos, que serve de comprovação da manutenção do equipamento.', 1500);
      clean(); sim.jump('run'); sim.cam('hero');
    }],
    ['Avaliação', async () => {
      sim.cam('hero');
      await say('Chegou a hora da avaliação. São dez perguntas sobre o que vimos. Clique na alternativa que considerar correta. Depois de cada resposta, eu explico o porquê.');
      let ok = 0;
      for (let i = 0; i < QUIZ.length; i++) ok += await ask(QUIZ[i], i, ok);
      const pct = Math.round((ok / QUIZ.length) * 100);
      const pass = ok >= 7;
      showResult(ok, pct, pass);
      await say(`Você acertou ${ok} de ${QUIZ.length} perguntas, ${pct} por cento. ${pass ? 'Parabéns, você foi aprovado! Continue praticando com os cenários e roteiros.' : 'Ainda não atingiu os setenta por cento. Revise a demonstração e tente novamente; a prática com os roteiros ajuda bastante.'}`);
      await wait(4000);
      qBox.style.display = 'none';
      await say('Fim da explicação. Depois, veja também o módulo Demonstração, que mostra como avaliar cada agente. Lembre-se: confira o aparelho todos os dias, respeite os alarmes e nunca entre em um local sem antes medir a atmosfera. Até a próxima!');
    }],
  ];


  // ---------- módulo DEMONSTRAÇÃO: como avaliar cada agente ----------
  const R = () => sim.fw.out?.readings || {};
  const n0 = (v) => Math.round(v || 0), n1 = (v) => (v || 0).toFixed(1).replace('.', ' vírgula ');
  const scen = async (id) => { kitOff(); sim.world.setScenario(id); sim.jump('run'); sim.cam('hero'); await wait(1200); };
  const CH2 = [
    ['Procedimento geral', async () => {
      kitOff(); sim.jump('run'); sim.cam('hero');
      await say('Olá! Neste módulo vou demonstrar como se realiza a avaliação de cada agente: sulfeto de hidrogênio, monóxido de carbono, oxigênio e gases inflamáveis. Em cada ambiente o aparelho está no tripé, ligado e já aprovado no teste de resposta do dia.');
      await say('O procedimento é sempre o mesmo. Primeiro, confirmar o bump test e ligar o aparelho em ar limpo, para o auto-zero. Depois, levar o aparelho ou a sonda até o ponto de medição, considerando onde o gás se acumula. Em seguida, aguardar o tempo de resposta dos sensores, de quinze a vinte segundos, mais o atraso da mangueira. Então, ler e registrar o valor, comparar com os limites e tomar a decisão: liberar, restringir ou evacuar.');
    }],
    ['Sulfeto de hidrogênio', async () => {
      await scen('vazamento-h2s');
      await say('Primeiro agente: o sulfeto de hidrogênio, H₂S, numa casa de bombas de esgoto. Ele é mais pesado que o ar e se acumula junto ao piso, em canaletas e poços. Por isso o ponto de medição fica baixo, próximo da fonte, como esta válvula com vazamento.');
      await wait(6000);
      await say(`O aparelho está lendo ${n0(R().H2S)} ppm de H₂S. Compare com os limites: o alarme baixo é dez ppm, o alto quinze, e o limite de tolerância da NR-15 é oito ppm para a jornada. Acima do alarme alto, a decisão é evacuar e ventilar. Lembre-se: o H₂S paralisa o olfato, então o cheiro de ovo podre desaparece justamente quando a concentração fica perigosa.`, 2000);
      await say('Para a exposição ao longo do turno, o aparelho calcula o TWA, a média de oito horas, e o STEL, a média de quinze minutos. Dois toques no botão mostram esses valores e o pico registrado.');
    }],
    ['Monóxido de carbono', async () => {
      await scen('co-motor');
      await say('Segundo agente: o monóxido de carbono, CO, num galpão fechado com motor a combustão funcionando. O CO tem densidade parecida com a do ar e se mistura no ambiente; mede-se na zona respiratória do trabalhador, entre um e um metro e meio de altura, que é exatamente a altura deste tripé.');
      await wait(8000);
      await say(`Leitura atual: ${n0(R().CO)} ppm de CO. O alarme baixo é trinta e cinco ppm e o alto duzentos. O limite de tolerância da NR-15 é trinta e nove ppm. Como a concentração sobe com o tempo, a avaliação deve ser contínua: acompanhe o gráfico de tendência e o TWA. A medida de controle é desligar a fonte e ventilar.`, 2000);
    }],
    ['Deficiência de oxigênio', async () => {
      await scen('deficiencia-o2');
      await say('Terceiro agente: a falta de oxigênio, numa sala de nitrogênio. O nitrogênio vazando desloca o ar e não tem cheiro nem cor. O oxigênio deve ser sempre o primeiro valor a avaliar, porque sem oxigênio suficiente o sensor de inflamáveis também perde a precisão.');
      await wait(7000);
      await say(`O aparelho mostra ${n1(R().O2)} por cento de oxigênio. O ar normal tem vinte vírgula nove. Abaixo de dezenove e meio por cento a atmosfera é deficiente, conforme a NR-33, e o aparelho alarma. Decisão: não entrar, ventilar com ar e, se for indispensável entrar, usar equipamento de respiração autônoma com supervisão.`, 2000);
    }],
    ['Gases inflamáveis', async () => {
      await scen('explosiva');
      await say('Quarto agente: os gases e vapores inflamáveis, num depósito de solventes. O sensor catalítico mede em porcentagem do limite inferior de explosividade, o LIE ou LEL. Cem por cento do LIE significa que a mistura já pode explodir.');
      await wait(7000);
      await say(`Leitura: ${n0(R().LEL)} por cento do LIE. A NR-33 considera perigosa a atmosfera acima de dez por cento do LIE, que também é o alarme baixo do aparelho; o alarme alto é vinte por cento. Decisão: eliminar fontes de ignição, ventilar e não realizar trabalhos a quente. Se o visor mostrar O L, a concentração passou da escala: saia imediatamente.`, 2000);
    }],
    ['Excesso de oxigênio', async () => {
      await scen('enriquecimento-o2');
      await say('O oxigênio também é avaliado para cima: numa central de oxigênio, um vazamento enriquece a atmosfera. Acima de vinte e três por cento, segundo a NR-33, e de vinte e três e meio pelo alarme do aparelho, qualquer material queima com muito mais facilidade.');
      await wait(6000);
      await say(`O aparelho indica ${n1(R().O2)} por cento de oxigênio. Decisão: fechar a fonte, ventilar, proibir chamas e cigarros e manter óleo e graxa longe das conexões.`, 1500);
    }],
    ['Espaço confinado', async () => {
      await scen('confinado');
      await say('Por fim, o espaço confinado, onde os agentes aparecem juntos e em camadas: metano no topo, H₂S e falta de oxigênio no fundo. A avaliação segue a NR-33: antes de qualquer entrada, com a sonda e a mangueira, de cima para baixo, nível por nível.');
      await say('A ordem de leitura em cada nível é: primeiro o oxigênio, depois os inflamáveis e por último os tóxicos. Em cada nível, espere o atraso da mangueira, cerca de um segundo mais sete décimos por metro, somado a uma vez e meia o tempo de resposta do sensor mais lento. Registre a tabela de leituras: só com todos os níveis dentro dos limites a entrada pode ser liberada na permissão de entrada e trabalho.');
      await say('O roteiro guiado Entrada em espaço confinado, na aba Roteiros, permite praticar exatamente esse procedimento, com o controle de profundidade da sonda.');
    }],
    ['Registro e conclusão', async () => {
      sim.cam('hero'); tab('registro'); hl('.gx-right');
      await say('Toda avaliação precisa ser registrada: data, hora, local, leituras de cada agente, alarmes e a decisão tomada. Na aba Registro o simulador guarda os eventos, e você pode exportar a planilha.');
      hlOff(); tab('cenarios');
      await say('Resumindo a avaliação de cada agente: oxigênio entre dezenove e meio e vinte e três por cento; inflamáveis abaixo de dez por cento do LIE; H₂S e CO abaixo dos limites de tolerância e sem alarmes. Fora disso, não há liberação. Fim da demonstração!');
    }],
  ];
  const PROGRAMS = { explicacao: CH, demonstracao: CH2 };

  function ask(item, i, okSoFar) {
    const my = token;
    return new Promise((resolve, reject) => {
      qBox.style.display = 'block';
      qBox.innerHTML = `<h3>Avaliação · pergunta ${i + 1} de ${QUIZ.length}</h3><p>${item.q}</p>${item.o.map((t, k) => `<button class="o" data-k="${k}">${'ABCD'[k]}) ${t}</button>`).join('')}<div class="ex" hidden></div><div class="sc">Acertos até agora: ${okSoFar}</div>`;
      speak(`Pergunta ${i + 1}. ${item.q} ${item.o.map((t, k) => `Alternativa ${'ABCD'[k]}: ${t}.`).join(' ')}`).catch(() => {});
      qBox.querySelectorAll('button.o').forEach((b) => b.onclick = async () => {
        if (my !== token) return reject(new Error('stop'));
        if (hasTTS) speechSynthesis.cancel();
        const k = +b.dataset.k, right = k === item.c;
        qBox.querySelectorAll('button.o').forEach((x) => { x.disabled = true; if (+x.dataset.k === item.c) x.classList.add('ok'); });
        if (!right) b.classList.add('bad');
        const ex = qBox.querySelector('.ex'); ex.hidden = false; ex.textContent = (right ? '✔ Correto. ' : '✘ Incorreto. ') + item.e;
        await speak((right ? 'Correto! ' : 'Incorreto. ') + item.e);
        await wait(800);
        if (my !== token) return reject(new Error('stop'));
        resolve(right ? 1 : 0);
      });
    });
  }
  function showResult(ok, pct, pass) {
    qBox.style.display = 'block';
    qBox.innerHTML = `<h3>Resultado da avaliação</h3><div class="big">${ok}/${QUIZ.length}</div><p>${pct}% · ${pass ? 'Aprovado ✔' : 'Revise e tente de novo'}</p><div class="sc">Critério: 7 acertos (70 %).</div>`;
  }

  let activeBtn = btn;
  async function start(from = 0, prog = 'explicacao') {
    stop(); running = true; const my = ++token;
    const LIST = PROGRAMS[prog] || CH; activeBtn = prog === 'demonstracao' ? btn2 : btn;
    wrap.dataset.on = '1'; activeBtn.dataset.on = '1';
    if (hasTTS) { speechSynthesis.cancel(); speechSynthesis.getVoices(); await wait(200); }
    for (let i = Math.max(0, Math.min(LIST.length - 1, from | 0)); i < LIST.length; i++) {
      if (my !== token) break;
      chapter = LIST[i][0];
      activeBtn.textContent = `■ Parar · ${i + 1}/${LIST.length} ${chapter}`;
      skipFlag = false;
      try { await LIST[i][1](); }
      catch (e) { if (e.message !== 'skip') break; if (hasTTS) speechSynthesis.cancel(); }
      reset();
    }
    if (my === token) stop();
  }
  function stop() {
    token++; running = false; skipFlag = false;
    if (hasTTS) speechSynthesis.cancel();
    reset(); qBox.style.display = 'none';
    wrap.dataset.on = '0'; btn.dataset.on = '0'; btn2.dataset.on = '0'; btn.textContent = idleLabel; btn2.textContent = idleLabel2;
  }
  btn.onclick = () => (running ? stop() : start(0, 'explicacao'));
  btn2.onclick = () => (running ? stop() : start(0, 'demonstracao'));
  // ?demo=1&cap=<n> começa no capítulo n (1 = apresentação)
  skip.onclick = () => { skipFlag = true; if (hasTTS) speechSynthesis.cancel(); };
  return { start, stop, get running() { return running; }, get chapter() { return chapter; }, chapters: CH.map((c) => c[0]), chapters2: CH2.map((c) => c[0]), quiz: QUIZ };
}
