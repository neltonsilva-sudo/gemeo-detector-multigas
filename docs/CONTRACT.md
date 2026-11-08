# Contrato entre módulos (cada arquivo tem UM dono — não edite arquivos de outro dono)

Three.js r169 via importmap (`three`, `three/addons/`). ES modules em `src/`. Sem build. Servidor: http://localhost:8801
Unidades em metros. Aparelho na origem (centro da base em y=0), frente +z. Kit à direita (x>0) e atrás.

| arquivo | dono | exporta |
|---|---|---|
| index.html, src/main.js, compare.html | orquestrador | integração, câmeras, interação, `window.__sim` |
| src/scene.js | agente RENDER | `createStage({canvas, quality})` |
| src/device.js | agente CARCAÇA | `buildDevice({lcdTexture})` |
| src/lcd.js | agente DISPLAY | `createLCD()` |
| src/firmware.js, src/audio.js | agente FIRMWARE | `createFirmware()`, `createAudio()` |
| src/accessories.js | agente KIT | `buildKit()` |
| src/gasworld.js, src/ui.js, src/ui.css | agente UI | `createGasWorld()`, `createUI(ctx)` |

## createStage({canvas, quality:'high'|'med'}) → stage
`{ renderer, scene, camera, render(dt), resize(w,h), setMode('estudio'|'campo'), floorY:0 }`
Dona do renderer (ACES/AgX, sRGB, sombras PCF suaves), ambiente PMREM (softboxes de estúdio), piso/fundo, pós-processo
(bloom para LEDs/LCD retroiluminado, AA). `render()` desenha via composer. Câmera é PerspectiveCamera criada aqui;
o orquestrador a posiciona.

## buildDevice({lcdTexture}) → device
`{ group, button, inletAnchor, lcdMesh, setButton(pressed), setLeds({red, green}) /*0..1*/, setBacklight(0..1),
   update(dt, {vibrate:boolean, time}) }`
- `button` = Mesh clicável com `userData.action='button'`; `inletAnchor` = Object3D na ponta do bico de entrada da bomba
  (o kit conecta a mangueira lá); objetos clicáveis extras podem ter `userData.action='inlet'` (tapar a entrada).
- LCD: plano/forma no recesso da moldura usando `lcdTexture` como `map` e `emissiveMap` (intensidade ∝ backlight).

## createLCD() → lcd
`{ texture /*THREE.CanvasTexture, proporção ~ 1.05:1 (L:A) do vidro*/, canvas, draw(lcdState, timeSec) }`
lcdState (vem do firmware, `out.lcd`):
```js
{ on:true, all:false /*autoteste: todos segmentos*/, backlight:false,
  fields:[ // sempre 4, ordem H2S, CO, O2, LEL
    { text:'0', blink:false }, { text:'0', blink:false }, { text:'20.9', blink:false }, { text:'0', blink:false } ],
  labels:true,            // mostra "H2S ppm" etc.
  icons:{ heart:true, fan:true, fanPhase:0..1, battery:3 /*0..3*/, batteryBlink:false, bell:false, low:false, high:false,
          twa:false, stel:false, peak:false, cyl:false, clock:false, lock:false, check:false, warn:false, safe:false,
          pump:false, zero:false, cal:false, bump:false, off:false },
  banner:null }           // texto curto opcional (≤ 8 caract.) desenhado com os próprios segmentos (ex.: 'OFF','CAL','PUMP')
```
`fields[i].text` aceita dígitos, '.', '-', espaço e letras que um 7-seg consegue (A b C d E F H L n o P r S t U y, 'OL', 'ERR').

## createFirmware() → fw
`{ input:{button:false}, update(dt, inletGas, ctx) → out, out, state, jump(name), settings, log, power(on) }`
- `inletGas = {H2S, CO, O2, LEL}` (ppm, ppm, %vol, %LEL) na ENTRADA da bomba; `ctx = {inletBlocked, hoseLen /*m*/}`.
- `out = { lcd, leds:{red, green}, buzzer:{on, freq}, vibrate, backlight, pump:{running, fault},
          readings:{H2S,CO,O2,LEL}, peaks, twa, stel, alarms:[{gas, level}], state,
          hud:{ title, text, level:'info'|'ok'|'warn'|'alarm', step } }`
  `hud` explica em português o que o aparelho está fazendo/pedindo (para o painel didático).
- `jump(name)` pula direto para estados de teste (captura): 'off','boot','selftest','pumptest','run','low','high',
  'twa','stel','multi','peak','cal-zero','cal-span','cal-done','bump','pumpfault','lowbat','shutdown'.
- `createAudio() → { unlock(), update(out, dt), click() }` (WebAudio: piezo ~2,9 kHz pulsado, clique de botão, vibração grave).

## buildKit() → kit
`{ group, update(dt, {inletWorld:THREE.Vector3, time}), state:{valveOpen, hoseAttached, probeAttached, flowLpm, pressureBar},
   handleAction(name), mix:{H2S:25, CO:100, LEL:50, O2:18} }`
Cilindro 34 L, regulador de fluxo fixo 0,5 L/min com manômetro, mangueira (curva física até `inletWorld` quando conectada),
tampa/adaptador de calibração, sonda com haste telescópica. Clicáveis com `userData.action` = 'valve' | 'hose' | 'probe'.
`placement`: kit posiciona-se sozinho à direita do aparelho; exporta também `kit.refLayout()` que arruma a composição da
foto ref2 (sonda à esquerda, cilindro atrás-centro, regulador à direita, aparelho à frente-centro) — o orquestrador chama em `cam=ref2`.

## createGasWorld() → world
`{ sample(t, ctx) → {H2S,CO,O2,LEL}, scenarios:[{id,name,desc}], setScenario(id), manual:{...}, time }`
ctx = `{ kit }`. Se mangueira conectada e válvula aberta → mistura do cilindro; mangueira conectada e válvula fechada →
`inletBlocked=true` (o orquestrador repassa). Cenários: ar limpo, espaço confinado estratificado (profundidade da sonda),
vazamento de H₂S, CO de motor, deficiência de O₂, atmosfera explosiva, enriquecimento de O₂, manual (sliders).

## createUI(ctx) → ui
ctx = `{ fw, world, kit, sim }`. `ui.update(out, dt)`. Painéis HTML sobre o canvas (#ui): leitura grande espelhada, HUD do
firmware, cenários, sliders, roteiros guiados (Ligar e testar bomba, Bump test, Calibração, Espaço confinado), log de eventos,
configurações (limites, trava, confiança, invisível). Some com `?ui=0`.

## Orquestrador (main.js)
Query: `cam=hero|ref1|ref2|front|back|lcd|top|orbit` (orbit: ang,h,r,tx,ty,tz,fov), `ui=0`, `state=<jump>`, `mode=estudio|campo`,
`scenario=<id>`, `q=high|med`, `ts=<escala de tempo>`, `still=1` (congela tempo para captura).
`window.__sim = { stage, device, lcd, fw, kit, world, ui, press(ms), jump(s), setGas({...}), cam(name), capture() }`,
`window.__fps`, `window.__ready=true` quando o 1º frame sai.
