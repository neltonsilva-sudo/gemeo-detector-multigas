# Especificação técnica — detector multigás com bomba (tipo GasAlertMax XT II)

Fontes: foto `refs/ref1_maxxt2.png` (aparelho real, vista frontal ¾), foto `refs/ref2_kit.webp` (kit de calibração:
cilindro de alumínio 34 L, regulador de fluxo fixo com manômetro, sonda de amostragem com haste metálica), manual
`docs/manual_microclip_xl.md` (mesma família de firmware: alarmes, calibração, opções) e as especificações públicas do Max XT II.

Simulador didático independente — sem afiliação com o fabricante. No aparelho pode aparecer o nome do modelo
("GasAlertMax XT II") na faixa preta, mas NÃO desenhar o logotipo "BW" (use um losango/escudo genérico no lugar).
Rótulo do cilindro: genérico ("MISTURA DE CALIBRAÇÃO 4 GASES"), nada de "AccuSpan".

## Hardware (escala real, metros no Three.js)
- Dimensões 131 × 70 × 52 mm (A × L × P), 328 g. Origem do grupo = centro da base; frente = +z; cima = +y.
- Capa sobremoldada de borracha amarela (#F2C500 → #E8B800, acetinada, levemente texturizada), cantos muito arredondados,
  nervuras horizontais nas laterais inferiores (≈7 nervuras), "orelhas" superiores que abraçam a lente de LED.
- Lente de alarme superior (barra larga translúcida, aparece verde-amarelada na foto quando pisca — IntelliFlash verde;
  vermelha em alarme), e janelas translúcidas laterais altas (barras de alarme de grande ângulo, leitosas).
- Moldura preta/grafite do LCD, vidro com reflexo, LCD reflexivo cinza-esverdeado claro (#C9CEC4) com segmentos pretos.
- Faixa preta com o nome do modelo em amarelo/branco itálico logo abaixo do LCD.
- Abaixo: furo da sirene (piezo, à esquerda) e botão único azul-acinzentado retangular (à direita).
- Metade inferior: tampa frontal em relevo (cobre sensores/filtro) com 4 marcas de canto em arco e frestas, parafuso
  Phillips cromado embaixo no centro. Atrás: clipe jacaré de aço inox, etiqueta, contatos de carga, entrada da bomba
  (bico com filtro) na lateral inferior direita.

## Display (LCD segmentado — igual à foto)
Quatro campos de 7 segmentos: H₂S (sup. esq.), CO (sup. dir.), O₂ (inf. esq., com decimal "20.9"), LEL (inf. dir.).
Legendas fixas: "H2S ppm", "CO ppm", "O2 %", "LEL%". Linha de ícones inferior: coração (IntelliFlash/confiança),
ventoinha (bomba), bateria (3 barras). Ícones extras que só aparecem quando ativos: sino/alarme, LOW/HIGH, TWA, STEL,
PEAK/MAX, cilindro de gás (calibração/bump), relógio, cadeado, ✓, ⚠, "SAFE". Segmentos apagados levemente visíveis
("fantasmas"). Retroiluminação verde-amarelada/âmbar ao apertar o botão (5 s) e sempre em alarme.

## Firmware (comportamento)
- Ligar: segurar o botão ~3 s → contagem 3-2-1 com bipes → autoteste (todos os segmentos, LEDs, sirene, vibra) →
  versão → limites de alarme por gás (LOW, HIGH, TWA, STEL) → dias até calibração → bump vencido? →
  TESTE DA BOMBA: "bloqueie a entrada" (usuário tapa a entrada; vacuum detectado → OK; sem bloqueio em 30 s → falha) →
  auto-zero opcional / auto-cal O₂ (20,9 %) → leitura normal.
- Normal: coração pisca + LED verde IntelliFlash a cada ~1 s, ventoinha gira, bipe de confiança opcional a cada 10 s.
- Botão: 1 toque = luz de fundo 5 s; 2 toques rápidos = MAX/PEAK → TWA → STEL (e "LIMPAR?" para zerar picos);
  segurar 5 s = contagem DESLIGAR 3-2-1 → desliga (4 bipes); continuar segurando após desligar → contagem CAL → calibração.
- Alarmes (padrão): H₂S LOW 10 / HIGH 15 / TWA 10 / STEL 15 ppm; CO LOW 35 / HIGH 200 / TWA 35 / STEL 200 ppm;
  O₂ LOW 19,5 % / HIGH 23,5 %; LEL LOW 10 % / HIGH 20 %. Faixas: H₂S 0–200, CO 0–1000, O₂ 0–30,0, LEL 0–100 (OL acima).
  LOW: sirene lenta, LED pisca devagar, "LOW" + campo pisca, vibra. HIGH/STEL/OL: sirene rápida, piscar rápido.
  TWA: lenta. Multigás: alterna. Alarmes com trava (opção) → confirmar com o botão após a condição sumir.
  O₂ alarma tanto por deficiência (≤19,5) quanto por enriquecimento (≥23,5). LEL > 100 % → "OL", sensor travado até reinício.
- Bateria fraca: bipe + pisca a cada 5 s; esgotada: 8 bipes/flashes, desliga.
- Falha da bomba (entrada bloqueada / mangueira estrangulada): alarme, ventoinha parada, "PUMP" piscando.
- Resposta dos sensores: 1ª ordem, T90 ≈ H₂S 15 s, CO 15 s, O₂ 10 s, LEL 20 s; ruído pequeno; atraso de transporte da
  mangueira ≈ 2 s por 3 m; sensibilidade cruzada leve (H₂S→CO ~+5 %).
- Calibração: atmosfera limpa → auto-zero (todos) + span O₂ (20,9) → "APLICAR GÁS" com cilindro (H₂S 25 ppm, CO 100 ppm,
  CH₄ 2,5 %vol = 50 % LEL, O₂ 18 %, N₂ balanço), 250–500 mL/min, ~30 s → bipe, cilindro pisca, span → dias até a próxima
  (180) → normal. Bump test: aplicar gás > HIGH, verificar alarmes sonoros/visuais, "BUMP OK".
- Modos: invisível (só vibra), confiança, trava de alarme, SAFE no display, bloqueio por calibração vencida.
