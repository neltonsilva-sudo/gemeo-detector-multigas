// Roteiros guiados com checagem automática pelo estado do firmware/kit. Dono: agente UI.
// Cada passo: { title, hint, check(api, st) → boolean | {done, info, warn}, action?:{label, run}, choices?, ack? }

const hoseOff = (api) => {
  const k = api.kit;
  if (k?.state?.hoseAttached) k.handleAction?.('hose');
  if (k?.state?.valveOpen) k.handleAction?.('valve');
};
const ensureOn = (api) => { if (api.phase === 'off' || api.phase === 'shutdown') api.fw?.jump?.('run'); };
const hudHas = (api, re) => re.test(`${api.out?.hud?.title || ''} ${api.out?.hud?.text || ''}`);
const stateHas = (api, re) => re.test(String(api.out?.state ?? ''));
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
const fmtS = (s) => `${Math.max(0, Math.ceil(s))} s`;

// Atraso de transporte do firmware: 1 s + 0,7 s por metro de mangueira (≈ 2 s a cada 3 m, como na SPEC).
export const TRANSPORT = (hoseM) => 1 + 0.7 * Math.max(0, hoseM);
export const T90_MAX = 20; // LEL é o sensor mais lento (T90 ≈ 20 s)
// Espera por nível = transporte pela mangueira (profundidade + 1 m) + 1,5 × T90 do sensor mais lento
export const LEVEL_DWELL = (d) => TRANSPORT(d + 1) + 1.5 * T90_MAX;
// leitura fora dos limites LOW (ou O₂ fora da faixa) — usada para marcar o nível como perigoso
export function overLimit(api, r) {
  if (!r) return false;
  if (r.ol) return true;
  return (r.H2S ?? 0) >= api.lim('H2S', 'low') || (r.CO ?? 0) >= api.lim('CO', 'low') || (r.LEL ?? 0) >= api.lim('LEL', 'low')
    || (r.O2 != null && (r.O2 <= api.lim('O2', 'low') || r.O2 >= api.lim('O2', 'high')));
}

export const ROUTINES = [
  {
    id: 'ligar', name: 'Ligar e testar a bomba', time: '≈ 1 min',
    desc: 'Partida completa do aparelho: autoteste, limites de alarme e teste de vácuo da bomba.',
    setup(api) { hoseOff(api); api.setScenario('limpo'); api.fw?.jump?.('off'); },
    steps: [
      { title: 'Ligue o aparelho', hint: 'Segure o botão do aparelho (ou a barra de Espaço) por ~3 s, até a contagem 3-2-1 com bipes.',
        check: (api) => !['off', 'shutdown'].includes(api.phase) },
      { title: 'Acompanhe o autoteste', hint: 'Todos os segmentos acendem, os LEDs piscam, a sirene toca e o aparelho vibra. Se algum falhar, o aparelho não pode ser usado.',
        check: (api) => ['pumptest', 'run', 'alarm', 'pumpfault'].includes(api.phase) || hudHas(api, /bloque|tape|bomba/i) },
      { title: 'Teste da bomba: tape a entrada', hint: 'Quando o visor pedir, bloqueie a entrada da bomba (botão “Tapar entrada” ou tecla B). O aparelho precisa detectar o vácuo — prova de que a mangueira e a bomba não vazam.',
        check: (api, st) => { if (api.covered) st.coveredOnce = true; return st.coveredOnce && (api.phase !== 'pumptest' || hudHas(api, /ok|aprov|passou/i)); },
        info: (api, st) => (api.covered ? 'Entrada tapada — aguardando o vácuo…' : st.coveredOnce ? 'Vácuo detectado?' : 'Aguardando você tapar a entrada…') },
      { title: 'Libere a entrada e aguarde a leitura normal', hint: 'Solte a entrada. Em ar limpo o visor deve mostrar 0 · 0 · 20,9 · 0, com o coração piscando (IntelliFlash).',
        check: (api) => !api.covered && (api.phase === 'run' || api.phase === 'alarm') },
    ],
  },
  {
    id: 'bump', name: 'Bump test diário', time: '≈ 2 min',
    desc: 'Teste funcional antes do uso: expor a gás conhecido e confirmar que todos os alarmes funcionam.',
    setup(api) { hoseOff(api); api.setScenario('limpo'); ensureOn(api); },
    steps: [
      { title: 'Confirme as leituras em ar limpo', hint: 'Em ar limpo: H₂S 0, CO 0, O₂ 20,9 %, LEL 0. Leituras diferentes indicam necessidade de zerar/calibrar.',
        check: (api, st) => { const r = api.readings; const ok = api.phase === 'run' && near(r.H2S.v, 0, 1.5) && near(r.CO.v, 0, 3) && near(r.O2.v, 20.9, 0.4) && near(r.LEL.v, 0, 1.5);
          st.okT = ok ? (st.okT || 0) + api.dtSim : 0; return st.okT > 2.5; },
        info: (api) => (api.phase === 'run' ? 'Conferindo estabilidade…' : 'Aguardando a leitura normal…') },
      { title: 'Abra a válvula do cilindro', hint: 'Abra o regulador ANTES de conectar: com a bomba aspirando, a mangueira ligada a uma válvula fechada bloqueia a entrada e dispara a FALHA DA BOMBA. Fluxo fixo 0,5 L/min; mistura H₂S 25 ppm, CO 100 ppm, CH₄ 50 % LEL, O₂ 18 %.',
        action: { label: 'Abrir válvula', run: (api) => { if (!api.kit?.state?.valveOpen) api.kit?.handleAction?.('valve'); } },
        check: (api) => !!api.kit?.state?.valveOpen },
      { title: 'Conecte a mangueira ao aparelho', hint: 'Encaixe a mangueira do regulador na entrada da bomba. O gás chega ao sensor depois de ~2 s.',
        action: { label: 'Conectar mangueira', run: (api) => { if (!api.kit?.state?.hoseAttached) api.kit?.handleAction?.('hose'); } },
        check: (api) => !!api.kit?.state?.hoseAttached && !!api.kit?.state?.valveOpen },
      { title: 'Confirme os alarmes dos 4 sensores', hint: 'Os quatro gases devem passar do limite de alarme: sirene, LEDs vermelhos e vibração. Um sensor que não alarma reprova o aparelho.',
        check: (api, st) => { st.seen = st.seen || new Set(); for (const g of Object.keys(api.alarms)) st.seen.add(g);
          return st.seen.size >= 4 || (hudHas(api, /bump/i) && hudHas(api, /ok|aprov|passou/i)); },
        info: (api, st) => `Sensores em alarme: ${['H2S', 'CO', 'O2', 'LEL'].map((g) => (st.seen?.has(g) ? '✓ ' : '· ') + ({ H2S: 'H₂S', O2: 'O₂' }[g] || g)).join('  ')}` },
      { title: 'Desconecte e feche a válvula', hint: 'Retire primeiro a mangueira (evita bloquear a bomba) e depois feche a válvula para economizar gás.',
        action: { label: 'Desconectar e fechar', run: hoseOff },
        check: (api) => !api.kit?.state?.valveOpen && !api.kit?.state?.hoseAttached },
      { title: 'Volte ao ar limpo e confirme o alarme', hint: 'Aguarde as leituras voltarem. Se o alarme estiver travado, dê 1 toque no botão para reconhecer.',
        check: (api) => api.phase === 'run' && Object.keys(api.alarms).length === 0 },
    ],
  },
  {
    id: 'cal', name: 'Calibração completa', time: '≈ 3 min',
    desc: 'Auto-zero em ar limpo, span de O₂ e span com o gás do cilindro. Recomendada a cada 180 dias ou quando o bump falha.',
    setup(api) { hoseOff(api); api.setScenario('limpo'); ensureOn(api); },
    steps: [
      { title: 'Entre no modo de calibração', hint: 'Em ar limpo, segure o botão: passe pela contagem DESLIGAR, continue segurando depois que o visor apagar, até a contagem CAL.',
        check: (api) => api.phase === 'cal' || stateHas(api, /cal/i) },
      { title: 'Auto-zero e span de O₂', hint: 'O aparelho zera H₂S, CO e LEL e ajusta o O₂ em 20,9 %. Não sopre nem aproxime fontes de gás.',
        check: (api) => stateHas(api, /span|apply|gas/i) || hudHas(api, /aplique|aplicar|gás de cal/i) },
      { title: 'Abra a válvula do cilindro', hint: 'Regulador de fluxo fixo 0,5 L/min (faixa aceita: 250–500 mL/min). Abra antes de conectar para não bloquear a bomba.',
        action: { label: 'Abrir válvula', run: (api) => { if (!api.kit?.state?.valveOpen) api.kit?.handleAction?.('valve'); } },
        check: (api) => !!api.kit?.state?.valveOpen },
      { title: 'Conecte a mangueira (aplicar gás)', hint: 'Use a tampa de calibração: a mangueira só fica conectada durante a calibração. Correntes de ar causam calibração ruim.',
        action: { label: 'Conectar mangueira', run: (api) => { if (!api.kit?.state?.hoseAttached) api.kit?.handleAction?.('hose'); } },
        check: (api) => !!api.kit?.state?.hoseAttached && !!api.kit?.state?.valveOpen },
      { title: 'Aguarde o span (~30 s)', hint: 'O ícone do cilindro pisca enquanto o aparelho ajusta cada sensor. Ao final, ele bipa e mostra os dias até a próxima calibração.',
        check: (api, st) => { st.t = (st.t || 0) + api.dtSim; return stateHas(api, /done|ok|fim/i) || hudHas(api, /conclu|dias|sucesso/i) || (api.phase === 'run' && st.t > 5); },
        info: (api, st) => `Tempo com gás: ${Math.floor(st.t || 0)} s` },
      { title: 'Desconecte e feche a válvula', hint: 'Retire a tampa de calibração para o aparelho voltar a amostrar o ambiente; depois feche o cilindro.',
        action: { label: 'Desconectar e fechar', run: hoseOff },
        check: (api) => !api.kit?.state?.valveOpen && !api.kit?.state?.hoseAttached },
      { title: 'Retorno à leitura normal', hint: 'Confira 0 · 0 · 20,9 · 0. Registre a calibração (aba Registro → Exportar CSV).',
        check: (api) => api.phase === 'run' },
    ],
  },
  {
    id: 'confinado', name: 'Entrada em espaço confinado', tag: 'NR-33', time: '≈ 4 min (use 10×)',
    desc: 'Avaliação da atmosfera antes da entrada (NR-33): testar todos os níveis, de cima para baixo, respeitando o atraso da mangueira e o tempo de resposta dos sensores.',
    setup(api) { hoseOff(api); api.world.setDepth?.(0); api.setScenario('confinado'); ensureOn(api); },
    steps: [
      { title: 'Aparelho ligado e testado', hint: 'Antes de avaliar: bump test do dia feito e aparelho em leitura normal, fora do espaço confinado.',
        check: (api) => api.phase === 'run' || api.phase === 'alarm' },
      { title: 'Teste de cima para baixo, 1 m por vez', levels: true, depth: true,
        hint: 'Boa prática de procedimento (fabricante/empresa): baixe a sonda 1 m por vez, de cima para baixo. Em cada nível espere o gás percorrer a mangueira (≈ 0,7 s por metro, mais 1 s da bomba) e 1,5 × o tempo de resposta do sensor mais lento (LEL, T90 ≈ 20 s) antes de anotar e descer.',
        check: (api, st, eng) => {
          const P = eng.profile || (eng.profile = { levels: Array.from({ length: 7 }, () => ({ dwell: 0, done: false, r: null, alarm: false })), last: -1 });
          const L0 = P.levels;
          const d = api.world.depth ?? 0; const L = Math.round(d);
          st.warn = null; st.cur = null;
          if (Math.abs(d - L) <= 0.2) {
            if (L > P.last + 1) st.warn = `Desceu rápido demais: teste o nível ${P.last + 1} m antes de chegar a ${L} m.`;
            else if (!L0[L].done) {
              L0[L].dwell += api.dtSim; st.cur = L;
              if (L0[L].dwell >= LEVEL_DWELL(L)) {
                const r = { H2S: api.readings.H2S.v, CO: api.readings.CO.v, O2: api.readings.O2.v, LEL: api.readings.LEL.v, ol: api.readings.LEL.ol };
                L0[L].done = true; L0[L].r = r;
                // alarme só se ainda houver alarme ao fim da espera OU leitura acima do limite (ignora alarme residual do nível anterior)
                L0[L].alarm = overLimit(api, r);
                P.last = Math.max(P.last, L);
              }
            }
          }
          return L0.every((x) => x.done);
        },
        info: (api, st, eng) => {
          if (st.warn) return { warn: st.warn };
          const P = eng.profile;
          if (st.cur != null && P) { const lv = P.levels[st.cur]; return `Nível ${st.cur} m · mangueira ${st.cur + 1} m — aguarde ${fmtS(LEVEL_DWELL(st.cur) - lv.dwell)}`; }
          const nxt = (P?.last ?? -1) + 1; return nxt <= 6 ? `Posicione a sonda em ${nxt} m.` : 'Perfil completo.';
        } },
      { title: 'Interprete o perfil', ack: 'Concluir avaliação', levels: true,
        hint: 'Topo: metano acumulado (LEL acima de 10 %). Fundo: H₂S acima do limite e O₂ abaixo de 19,5 % (deficiência pela NR-33). Conclusão: entrada PROIBIDA — ventilar, reavaliar todos os níveis e só então emitir a PET (Permissão de Entrada e Trabalho), mantendo o monitoramento contínuo.',
        check: (api, st) => !!st.acked },
    ],
  },
  {
    id: 'alarme', name: 'Resposta a alarme', time: '≈ 2 min',
    desc: 'O que fazer quando o detector alarma: identificar, abandonar a área, reconhecer e registrar.',
    setup(api) { hoseOff(api); api.setScenario('limpo'); ensureOn(api); setTimeout(() => api.setScenario('vazamento-h2s'), 400); },
    steps: [
      { title: 'Trabalho próximo a uma elevatória de esgoto', hint: 'Uma pluma de H₂S está chegando com o vento. Observe as leituras e espere o aparelho reagir.',
        check: (api) => Object.keys(api.alarms).length > 0 || api.phase === 'alarm', info: () => 'Aguardando o alarme…' },
      { title: 'Qual gás está alarmando?', hint: 'Leia o campo que pisca no visor e o ícone LOW (1º nível) ou HIGH (2º nível).',
        choices: [{ label: 'H₂S', value: 'H2S' }, { label: 'CO', value: 'CO' }, { label: 'O₂', value: 'O2' }, { label: 'LEL', value: 'LEL' }],
        answer: (api) => Object.keys(api.alarms)[0] || 'H2S',
        check: (api, st) => !!st.correct },
      { title: 'Abandone a área', hint: 'Saia imediatamente, em direção contrária ao vento e para local mais alto (H₂S é mais pesado que o ar). Não tente “ver o que é”.',
        action: { label: 'Sair para o ar limpo', run: (api) => api.setScenario('limpo') },
        check: (api) => api.world.scenario === 'limpo' },
      { title: 'Aguarde as leituras caírem', hint: 'Em ar limpo o H₂S volta abaixo do limite LOW. O olfato não serve de alerta: o H₂S paralisa o nervo olfativo.',
        check: (api) => api.readings.H2S.v != null && api.readings.H2S.v < api.lim('H2S', 'low') },
      { title: 'Reconheça o alarme', hint: 'Com trava de alarme ligada, a sirene só para com 1 toque no botão — depois que o gás saiu.',
        check: (api) => Object.keys(api.alarms).length === 0 && api.phase !== 'alarm' },
      { title: 'Consulte o pico (MAX)', hint: 'Dê 2 toques rápidos no botão: o visor mostra o PICO, depois TWA e STEL. Anote o valor de pico.',
        check: (api) => !!api.out?.lcd?.icons?.peak || stateHas(api, /peak|max|twa|stel/i) || api.phase === 'peak' },
      { title: 'Comunique e registre', ack: 'Ocorrência registrada', hint: 'Avise o supervisor, isole a área e registre a ocorrência. O log de eventos pode ser exportado em CSV.',
        check: (api, st) => !!st.acked },
    ],
  },
];

export function createRoutineEngine(api, onChange) {
  const eng = {
    active: null, idx: 0, st: {}, profile: null, doneAt: null, finished: false, startedAt: 0,
    start(id) {
      const r = ROUTINES.find((x) => x.id === id); if (!r) return;
      eng.active = r; eng.idx = 0; eng.st = {}; eng.profile = null; eng.doneAt = null; eng.finished = false; eng.startedAt = api.world.time;
      try { r.setup?.(api); } catch (e) { console.warn('roteiro setup', e); }
      api.log?.(`Roteiro iniciado: ${r.name}`);
      onChange?.();
    },
    stop() { if (eng.active) api.log?.(`Roteiro encerrado: ${eng.active.name}`); eng.active = null; onChange?.(); },
    skip() { if (!eng.active) return; eng.advance(true); },
    advance(skipped) {
      const r = eng.active; const s = r.steps[eng.idx];
      api.log?.(`${skipped ? 'Passo pulado' : 'Passo concluído'}: ${s.title}`);
      eng.idx++; eng.st = {}; eng.doneAt = null;
      if (eng.idx >= r.steps.length) { eng.finished = true; api.log?.(`Roteiro concluído: ${r.name}`); }
      onChange?.();
    },
    step() { return eng.active && !eng.finished ? eng.active.steps[eng.idx] : null; },
    update(realDt) {
      const s = eng.step(); if (!s) return null;
      if (eng.doneAt != null) { eng.doneAt += realDt; if (eng.doneAt > 0.7) eng.advance(false); return { done: true }; }
      let ok = false; try { ok = !!s.check(api, eng.st, eng); } catch (e) { ok = false; }
      let info = null; try { info = s.info ? s.info(api, eng.st, eng) : null; } catch {}
      if (ok) { eng.doneAt = 0; onChange?.('done'); }
      return { done: ok, info };
    },
  };
  return eng;
}
