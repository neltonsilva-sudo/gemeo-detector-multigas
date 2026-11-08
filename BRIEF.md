# Gêmeo digital do detector multigás (tipo GasAlertMax XT II) — brief dos CONSTRUTORES

Projeto: /Users/nelton/gasalert-twin — Three.js r169 (importmap), ES modules em `src/`, sem build.
Leia antes: `docs/SPEC.md` (comportamento/visual do aparelho real), `docs/CONTRACT.md` (API exata do seu módulo — siga à
risca, o orquestrador `src/main.js` já chama essas funções), `docs/manual_microclip_xl.md`.
Referências: `refs/ref1_maxxt2.png` (aparelho real), `refs/ref1_lcd.png` (recorte do LCD), `refs/ref2_kit.png` (kit de calibração).

Pedido do usuário: "absolutamente perfeito, visualmente deslumbrante, qualidade AAA em cada detalhe — texturas, física,
tudo". Ele vai comparar lado a lado, às cegas, com a foto real. Inspetores independentes vão reprovar qualquer coisa que
pareça CG barato. Fidelidade de proporção/cor/forma vem antes de enfeite.

## Regras
- Edite SOMENTE os arquivos que são seus (tabela em CONTRACT.md). Pode criar arquivos auxiliares novos com seu prefixo
  (ex.: `src/device_*.js`). Nada de assets binários externos: gere texturas proceduralmente (canvas/DataTexture/shaders).
  CDN permitido só jsdelivr three@0.169.0 já mapeado.
- Não abra o painel do navegador. Servidor já roda em http://localhost:8801 (se cair: `node tools/serve.mjs 8801 &`).
- Captura headless (≈8–14 s; NUNCA mais de uma captura sua ao mesmo tempo; outros 5 agentes também capturam):
  `node tools/shot.mjs shots/<seuitem>_<vista>.png "cam=ref1&ui=0&state=run" 1280 720 8`
  Parâmetros: `cam=hero|ref1|ref2|front|back|lcd|top|kit|orbit` (orbit: ang,h,r,tx,ty,tz,fov), `ui=0`, `state=<jump>`,
  `still=1`, `mode=estudio|campo`, `scenario=<id>`. Também `EVAL="__sim.setGas({H2S:30})" EWAIT=4000 node tools/shot.mjs ...`
  roda JS antes da captura. A saída imprime erros de console (EXC/ERR) — zero erros é obrigatório.
- Comparação lado a lado: `node tools/blind.mjs shots/<sua>.png refs/<ref>.png` gera `shots/blind_<n>.png`.
- Sintaxe: `node --check src/<arquivo>.js`.
- Desempenho: ≥ 50 fps em 1280×720 num Mac. Geometria do aparelho pode ser densa (é o herói), mas sem exageros.

## Seu laço (/loop por item)
Repita até VOCÊ mesmo, como diretor de arte implacável, dar ≥ 9/10 contra a referência (mínimo 4 iterações):
1. construir/melhorar → 2. capturar (vista principal + 1 vista de detalhe) → 3. olhar a captura (Read do PNG) ao lado da
referência → 4. listar os 5 piores defeitos → 5. corrigir. Registre cada iteração em `shots/<seuitem>_log.md`
(nota, defeitos, o que mudou). Depois disso um inspetor cego independente vai julgar e você pode ser chamado de novo.

Devolva (≤ 200 palavras): o que construiu, API conforme contrato (sim/não + desvios), nota final própria, melhores
capturas, pendências conhecidas.
