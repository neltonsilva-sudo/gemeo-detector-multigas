# Brief — agentes de AMBIENTE (aprimorar cenários realistas)

Projeto /Users/nelton/gasalert-twin (Three.js r169, servidor http://localhost:8801). Ao clicar num cenário na aba Cenários,
`stage.setScenery(id)` monta o ambiente 3D em volta do aparelho (src/scene.js → src/scene_env_sets.js → builders).
Cada builder devolve `{ group, look, bake, particles, extras }` — veja o cabeçalho de src/scene_env_a.js e os builders existentes.

## Regras
- Edite SOMENTE o seu arquivo (scene_env_a.js, _b.js ou _c.js). Pode criar `src/scene_env_<letra>_*.js` auxiliares.
  NÃO edite scene_env_kit.js, scene_env_common.js, scene_env_sets.js, scene.js, device*.js, main.js, ui*.js, demo.js.
  Se precisar de uma peça nova reutilizável, crie no seu arquivo auxiliar.
- Procedural, sem assets externos. Escala real (m). Aparelho na origem, apoiado em y=0, frente +z.
- A câmera `hero` (~0,4 m do aparelho) e a UI (1440×900, painéis nas laterais) enquadram ~0,2–0,5 m acima do apoio
  a 1–5 m de distância: o que conta é o fundo LOGO ATRÁS do aparelho e a superfície onde ele está. Elementos-chave
  (válvula vazando, pluma, escapamento com fumaça, placas) devem aparecer DENTRO do quadro hero, sem ficar colados atrás do aparelho.
- ≥ 50 fps em 1280×720 (meça com a captura sozinha; partículas instanciadas, poucas luzes, texturas ≤ 1024).
- Placas NR-26 em PT-BR legíveis. Sem marcas reais.
- Sem commit/push. Usuário com pouco crédito: no máximo 3 iterações por ambiente, 1–2 capturas por iteração.

## Captura
`EVAL="__sim.world.setScenario('<id>')" EWAIT=3500 node tools/shot.mjs shots/env<letra>_<id>.png "cam=hero&ui=0" 1280 720 8`
Também com UI: mesmo comando sem `&ui=0`, 1440 900. Nunca mais de uma captura sua ao mesmo tempo.

## Meta (nota própria ≥ 9 contra uma foto real do local)
Realismo fotográfico: materiais com desgaste (sujeira, ferrugem, manchas de óleo, pintura descascada), escala correta,
profundidade (objetos em 3 planos), iluminação coerente com o local, partículas/fumaça/névoa animadas e críveis,
sinalização correta para o risco. Devolva relatório de 5 linhas + melhor captura de cada ambiente.
