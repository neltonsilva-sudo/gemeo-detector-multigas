// Palco / renderização — dono: agente RENDER.
// createStage({canvas, quality}) → { renderer, scene, camera, render(dt), resize(w,h), setMode(m), floorY:0, ... }
//
// Estúdio ("estudio", padrão): fundo infinito (ciclorama sem horizonte — o piso é só um "shadow catcher" sobre um
// fundo em espaço de tela calibrado para sair ~#F4F4F4 após o tone mapping), PMREM próprio com softboxes
// (key acima-esquerda, fill, 2 strips de contorno, overhead, rebatedor) + bandeiras pretas, luz-chave direcional
// com sombra VSM suave, sombra de contato (render-to-texture de profundidade vista de baixo + blur), GTAO sutil,
// bloom de limiar alto (só LEDs/LCD retroiluminado), filtro estrela (Kawase) p/ o LED, MSAA 4x, tom Khronos Neutral.
// Campo ("campo"): galpão escuro com piso de concreto, fluorescentes frias, névoa, tubulação desfocada ao fundo.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { StarPass, GradePass, invertToneGray } from './scene_post.js';
import { buildEnvScene, concreteTextures, plantBackdropTexture } from './scene_env.js';

const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

// parâmetros por modo (tudo interpolado na transição)
const MODES = {
  estudio: {
    w: 0, bgCenter: 0xf8, bgEdge: 0xf0,                 // sRGB 8 bits APÓS tone mapping (fundo infinito)
    keyDir: [-0.55, 0.9, 0.62], keyColor: [1.0, 0.975, 0.94], keyI: 1.3,
    exposure: 1.0, envI: 0.9, shadowOpacity: 0.16, contactOpacity: 0.62, fog: 0.0, shadowR: 14,
    fogColor: [0.05, 0.058, 0.066], vignette: 0.0, floor: 0, bloom: 0.26,
  },
  campo: {
    w: 1, bgCenter: 0x30, bgEdge: 0x22,
    keyDir: [0.25, 1.0, -0.05], keyColor: [0.84, 0.92, 1.0], keyI: 1.7,
    exposure: 1.3, envI: 1.0, shadowOpacity: 0.0, contactOpacity: 0.8, fog: 0.2, shadowR: 26,
    fogColor: [0.10, 0.115, 0.13], vignette: 0.3, floor: 1, bloom: 0.42,
  },
};

// ------------------------------------------------------------ modelo de luz de estúdio
// A luz-chave do estúdio é uma softbox grande: o reflexo especular dela JÁ está no PMREM. A DirectionalLight serve para
// a componente difusa + sombra; o especular direto dela é atenuado e alargado (aprox. de luz de área, Karis) para não
// virar um ponto "sol" estourado no cromado/vidro. Só afeta DirectionalLights (os LEDs pontuais dos outros ficam intactos).
const STAGE_DSPEC = '0.28', STAGE_DROUGH = '0.42';
(function patchChunks() {
  const C = THREE.ShaderChunk;
  if (C.__stagePatched) return; C.__stagePatched = true;
  C.lights_pars_begin = 'float stageDirK = 1.0;\n' + C.lights_pars_begin;
  const a = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', b = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
  if (C.lights_fragment_begin.includes(a) && C.lights_fragment_begin.includes(b)) {
    C.lights_fragment_begin = C.lights_fragment_begin.replace(a, `stageDirK = ${STAGE_DSPEC};\n` + a).replace(b, 'stageDirK = 1.0;\n' + b);
  }
  let f = C.lights_physical_pars_fragment;
  const head = 'vec3 irradiance = dotNL * directLight.color;';
  const i0 = f.indexOf('void RE_Direct_Physical(');
  const i1 = f.indexOf(head, i0);
  if (i0 >= 0 && i1 > i0) {
    f = f.slice(0, i1) + head + `
	PhysicalMaterial sm = material;
	if ( stageDirK < 0.999 ) {
		sm.roughness = max( sm.roughness, ${STAGE_DROUGH} );
		#ifdef USE_CLEARCOAT
		sm.clearcoatRoughness = max( sm.clearcoatRoughness, ${STAGE_DROUGH} );
		#endif
	}` + f.slice(i1 + head.length);
    f = f.replace('BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material )', 'BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, sm ) * stageDirK')
         .replace('BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material )', 'BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, sm ) * stageDirK');
    C.lights_physical_pars_fragment = f;
  }
  // máscara de emissão no alfa (materiais opacos iluminados): alfa = 1 + luminância emissiva.
  // O bloom usa essa máscara → o LCD retroiluminado e LEDs "brilham" mesmo abaixo do limiar de luminância,
  // enquanto o fundo branco e os reflexos de softbox (não emissivos) nunca florescem.
  const o = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
  if (C.opaque_fragment.includes(o)) C.opaque_fragment = C.opaque_fragment.replace(o, o + `
#if defined( OPAQUE ) && ( defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON ) )
	gl_FragColor.a = 1.0 + dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) );
#endif`);
})();

export function createStage({ canvas, quality = 'high' } = {}) {
  const high = quality !== 'med';
  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const TM = { neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping };
  renderer.toneMapping = TM[Q.get('tm')] ?? THREE.NeutralToneMapping; // Khronos PBR Neutral: cor-base fiel (fotografia de produto)
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = high ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // atualizado 1x por quadro (evita re-render a cada renderer.render auxiliar)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 30);
  const stageGroup = new THREE.Group(); stageGroup.name = 'stage'; scene.add(stageGroup);

  // ------------------------------------------------------------ ambiente PMREM
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = buildEnvScene();
  let envRT = null, envBlend = -1;
  function bakeEnv(t) {
    if (Math.abs(t - envBlend) < 1e-4 && envRT) return;
    env.setBlend(t);
    const old = envRT;
    envRT = pmrem.fromScene(env.scene, 0.015, 0.1, 60);
    scene.environment = envRT.texture;
    if (old) old.dispose();
    envBlend = t;
  }

  // ------------------------------------------------------------ fundo infinito (cena própria, espaço de tela)
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgUniforms = {
    cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, aspect: { value: 1 },
  };
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: bgUniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 cA, cB; uniform float aspect; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(aspect, 1.0);
        float r = length(p) / length(vec2(aspect, 1.0) * 0.5);
        gl_FragColor = vec4(mix(cA, cB, smoothstep(0.15, 1.0, r)), 1.0);
      }`,
  }));
  bgMesh.frustumCulled = false; bgScene.add(bgMesh);

  // ------------------------------------------------------------ luz-chave + sombra
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.castShadow = true;
  const smap = high ? 2048 : 1024;
  key.shadow.mapSize.set(smap, smap);
  key.shadow.bias = high ? -0.00008 : -0.0002;
  key.shadow.normalBias = high ? 0.0004 : 0.0006;
  key.shadow.radius = high ? 14 : 3;
  key.shadow.blurSamples = high ? 16 : 8;
  const sc = key.shadow.camera; sc.near = 0.05; sc.far = 4;
  stageGroup.add(key, key.target);

  // ------------------------------------------------------------ piso: shadow catcher (estúdio) + concreto (campo)
  const catcherMat = new THREE.ShadowMaterial({ opacity: 0.16, color: 0x1a1612, depthWrite: false });
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), catcherMat);
  catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.renderOrder = -2; catcher.userData.stage = true;
  stageGroup.add(catcher);

  const conc = concreteTextures();
  for (const t of [conc.map, conc.rough]) t.repeat.set(10, 10);
  const floorMat = new THREE.MeshStandardMaterial({ map: conc.map, roughnessMap: conc.rough, roughness: 1.0, metalness: 0, envMapIntensity: 1.0, transparent: true, opacity: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.0002; floor.receiveShadow = true; floor.visible = false; floor.renderOrder = -3;
  stageGroup.add(floor);

  const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 6, 72, 1, true),
    new THREE.MeshBasicMaterial({ map: plantBackdropTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false }));
  backdrop.material.map.repeat.set(2, 1);
  backdrop.material.color.setScalar(0.85);
  backdrop.position.y = 3 - 0.05; backdrop.visible = false;
  stageGroup.add(backdrop);
  // tubulação real (geometria) a meia distância — fica desfocada pela névoa/baixo contraste
  const plant = new THREE.Group(); plant.visible = false; stageGroup.add(plant);
  {
    const pm = (c, r = 0.45, m = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, transparent: true, opacity: 0 });
    const mats = [pm(0x8a9096, 0.5, 0.35), pm(0xc09a20, 0.55, 0.1), pm(0x9a3026, 0.55, 0.1), pm(0x5a6066, 0.5, 0.4)];
    const pipe = (r, len, mat, pos, axis) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), mat);
      if (axis === 'x') p.rotation.z = Math.PI / 2; else if (axis === 'z') p.rotation.x = Math.PI / 2;
      p.position.set(...pos); plant.add(p); return p;
    };
    // rack de tubulação ao fundo (z ≈ -4,2) e outro na lateral esquerda (x ≈ -3,6): alturas baixas p/ entrar no quadro
    const rackZ = -4.2, rackX = -3.6;
    const runs = [[0.32, 0.11, 0], [0.62, 0.075, 1], [0.86, 0.15, 3], [1.15, 0.05, 2], [1.32, 0.09, 0]];
    for (const [y, r, mi] of runs) {
      pipe(r, 16, mats[mi], [0, y, rackZ - r], 'x');
      pipe(r, 12, mats[mi], [rackX - r, y, 1], 'z');
      for (let x = -7; x <= 7; x += 1.9) pipe(r * 1.32, 0.045, mats[3], [x + y, y, rackZ - r], 'x');
      for (let z = -4; z <= 6; z += 1.9) pipe(r * 1.32, 0.045, mats[3], [rackX - r, y, z + y], 'z');
    }
    const steel = pm(0x30353a, 0.6, 0.5);
    for (let x = -7; x <= 7; x += 2.4) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), steel); s.position.set(x, 0.75, rackZ - 0.35); plant.add(s); const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5), steel); t.position.set(x, 1.45, rackZ - 0.2); plant.add(t); }
    for (let z = -4; z <= 6; z += 2.4) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), steel); s.position.set(rackX - 0.35, 0.75, z); plant.add(s); }
    // tanque vertical e válvula grande (silhuetas reconhecíveis)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 40), pm(0x8a8f94, 0.35, 0.7)); tank.position.set(2.6, 1.3, -5.2); plant.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), tank.material); cap.position.set(2.6, 2.6, -5.2); plant.add(cap);
    pipe(0.06, 1.6, mats[1], [1.4, 0.5, -4.6], 'x');
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), pm(0x2a2e33, 0.7, 0.3)); col.position.set(-1.2, 3, -5.6); plant.add(col);
    const col2 = col.clone(); col2.position.set(4.8, 3, -5.6); plant.add(col2);
    plant.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.stage = true; } });
  }
  const plantMats = []; plant.traverse((o) => { if (o.isMesh && !plantMats.includes(o.material)) plantMats.push(o.material); });

  scene.fog = new THREE.FogExp2(0x000000, 0.0);

  // ------------------------------------------------------------ sombra de contato (estilo three examples)
  const CS = { res: high ? 1024 : 512, height: 0.07, blur: 2.2 };
  const csRT = new THREE.WebGLRenderTarget(CS.res, CS.res); csRT.texture.generateMipmaps = false;
  const csRTb = new THREE.WebGLRenderTarget(CS.res, CS.res); csRTb.texture.generateMipmaps = false;
  const csGroup = new THREE.Group(); csGroup.position.y = 0.0004; stageGroup.add(csGroup);
  const csPlaneGeo = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2);
  const csMat = new THREE.MeshBasicMaterial({ map: csRT.texture, transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000, fog: false });
  // o mapa é preto com alfa → usar alphaMap seria mais limpo; usamos map + shader simples via onBeforeCompile
  csMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor = vec4(vec3(0.0), sampledDiffuseColor.a * opacity);\n#endif');
  };
  const csPlane = new THREE.Mesh(csPlaneGeo, csMat); csPlane.renderOrder = -1; csPlane.scale.y = -1; csPlane.userData.stage = true;
  csGroup.add(csPlane);
  const csBlurPlane = new THREE.Mesh(csPlaneGeo); csBlurPlane.visible = false; csGroup.add(csBlurPlane);
  const csCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, CS.height);
  csCam.rotation.x = Math.PI / 2; csGroup.add(csCam);
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: 1.8 };
  depthMat.onBeforeCompile = (sh) => {
    sh.uniforms.darkness = depthMat.userData.darkness;
    sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'float k = 1.0 - fragCoordZ; gl_FragColor = vec4( vec3( 0.0 ), k * k * darkness );');
  };
  depthMat.depthTest = false; depthMat.depthWrite = false; depthMat.side = THREE.DoubleSide;
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); hBlur.depthTest = false;
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader); vBlur.depthTest = false;
  function blurContact(amount) {
    csBlurPlane.visible = true;
    csBlurPlane.material = hBlur; hBlur.uniforms.tDiffuse.value = csRT.texture; hBlur.uniforms.h.value = amount / CS.res;
    renderer.setRenderTarget(csRTb); renderer.render(csBlurPlane, csCam);
    csBlurPlane.material = vBlur; vBlur.uniforms.tDiffuse.value = csRTb.texture; vBlur.uniforms.v.value = amount / CS.res;
    renderer.setRenderTarget(csRT); renderer.render(csBlurPlane, csCam);
    csBlurPlane.visible = false;
  }
  function renderContact() {
    const fog = scene.fog, envT = scene.environment;
    stageGroup.visible = false; scene.fog = null;
    const prevA = renderer.getClearAlpha(); const prevC = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(0x000000, 0);
    scene.overrideMaterial = depthMat;
    renderer.setRenderTarget(csRT); renderer.clear(); renderer.render(scene, csCam);
    scene.overrideMaterial = null;
    // csCam é filho de csGroup (que está em stageGroup, invisível) → matrizes já atualizadas pela chamada acima
    blurContact(CS.blur); blurContact(CS.blur * 0.45);
    renderer.setRenderTarget(null); renderer.setClearColor(prevC, prevA);
    stageGroup.visible = true; scene.fog = fog; scene.environment = envT;
  }

  // ------------------------------------------------------------ enquadramento automático de sombras pelo conteúdo
  const box = new THREE.Box3(), tmpB = new THREE.Box3();
  function fitShadows() {
    box.makeEmpty();
    for (const ch of scene.children) {
      if (ch === stageGroup) continue;
      ch.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        // marca sombras automaticamente (os módulos podem vetar com userData.noShadow)
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const clear = m && ((m.transparent && m.opacity < 0.75) || m.transmission > 0.5);
        if (!o.userData.noShadow && !o.userData._shadowSet) { o.castShadow = !clear; o.receiveShadow = true; o.userData._shadowSet = true; }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmpB.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (tmpB.max.y < 1.2 && tmpB.min.y > -0.2) box.union(tmpB);
      });
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.15, 0.1));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    // sombra de contato: quadrado cobrindo a pegada + margem p/ blur
    const half = Math.min(0.9, Math.max(s.x, s.z) / 2 + 0.05);
    csGroup.position.x = c.x; csGroup.position.z = c.z;
    csPlane.scale.set(half * 2, -1, half * 2); csBlurPlane.scale.set(half * 2, 1, half * 2);
    csCam.left = -half; csCam.right = half; csCam.top = half; csCam.bottom = -half; csCam.updateProjectionMatrix();
    // luz-chave: caixa ortográfica justa (resolução de sombra máxima) — raio da esfera envolvente
    const rad = Math.min(1.2, s.length() / 2 + 0.03);
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad; sc.near = 0.05; sc.far = 3 + rad * 2; sc.updateProjectionMatrix();
    key.target.position.copy(c);
    shadowCenter.copy(c); shadowRad = rad;
  }
  const shadowCenter = new THREE.Vector3(); let shadowRad = 0.3;

  // ------------------------------------------------------------ pós-processo
  const rtSize = new THREE.Vector2(); renderer.getDrawingBufferSize(rtSize);
  const rt = new THREE.WebGLRenderTarget(Math.max(1, rtSize.x), Math.max(1, rtSize.y), { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  const bgPass = new RenderPass(bgScene, bgCam);
  const mainPass = new RenderPass(scene, camera); mainPass.clear = false;
  composer.addPass(bgPass); composer.addPass(mainPass);
  let gtao = null;
  if (high && Q.get('ao') !== '0') {
    gtao = new GTAOPass(scene, camera, 2, 2);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.012, distanceExponent: 1.6, thickness: 0.004, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    // o G-buffer do GTAO ignora o palco (piso infinito rasante gerava faixa no horizonte); contato = sombra de contato
    const ov = gtao.overrideVisibility.bind(gtao), rv = gtao.restoreVisibility.bind(gtao);
    gtao.overrideVisibility = () => { ov(); stageGroup.visible = false; };
    gtao.restoreVisibility = () => { stageGroup.visible = true; rv(); };
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.28, 3.0);
  bloom.highPassUniforms.emissiveGain = { value: 0.4 };
  bloom.materialHighPassFilter.fragmentShader = /* glsl */`
    uniform sampler2D tDiffuse; uniform float luminosityThreshold, smoothWidth, emissiveGain; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      float v = max(t.r, max(t.g, t.b));
      float a = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
      float e = smoothstep(0.12, 0.6, t.a - 1.0) * emissiveGain;
      gl_FragColor = vec4(min(t.rgb * max(a, e), vec3(40.0)), 1.0);
    }`;
  bloom.materialHighPassFilter.needsUpdate = true;
  bloom.highPassUniforms.smoothWidth.value = 1.5;
  composer.addPass(bloom);
  const star = new StarPass(high ? 2 : 4); composer.addPass(star);
  const output = new OutputPass(); composer.addPass(output);
  const grade = new GradePass(); composer.addPass(grade);
  let fxaa = null;
  if (!high) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }

  // ------------------------------------------------------------ probe de calibração (?probe=1) — só p/ o agente RENDER
  if (Q.get('probe') === '1') {
    const g = new THREE.Group(); g.position.set(0, 0, 0.13);
    const mk = (mat, x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 64, 32), mat); m.position.set(x, 0.018, 0); g.add(m); };
    mk(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.95 }), -0.1);               // branco difuso
    mk(new THREE.MeshPhysicalMaterial({ color: 0xf2c500, roughness: 0.52, clearcoat: 0.12, clearcoatRoughness: 0.5 }), -0.06); // borracha amarela
    mk(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06 }), -0.02);  // cromo
    mk(new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 1, roughness: 0.28 }), 0.02);   // alumínio
    mk(new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }), 0.06); // plástico preto
    mk(new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6 }), 0.1);                  // cartão 18 %
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.003), new THREE.MeshPhysicalMaterial({ color: 0xc9cec4, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 }));
    glass.position.set(0.17, 0.03, 0); g.add(glass);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.003, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.0, 0.25).multiplyScalar(14) }));
    led.position.set(0.17, 0.062, 0); g.add(led);
    scene.add(g);
  }

  // ------------------------------------------------------------ modos e transição
  const cur = {}; let from = null, to = MODES.estudio, tMode = 1, modeName = 'estudio';
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const tmpC = new THREE.Color();
  function applyMode(t) {
    const A = from || to, B = to, k = ease(t);
    const L = (n) => lerp(A[n], B[n], k);
    const LA = (n) => A[n].map((v, i) => lerp(v, B[n][i], k));
    // fundo calibrado: inverte a curva de tom para acertar o branco exato
    const exp = L('exposure'); renderer.toneMappingExposure = exp;
    const vA = lerp(invertToneGray(A.bgCenter, renderer.toneMapping, exp), invertToneGray(B.bgCenter, renderer.toneMapping, exp), k);
    const vB = lerp(invertToneGray(A.bgEdge, renderer.toneMapping, exp), invertToneGray(B.bgEdge, renderer.toneMapping, exp), k);
    const fc = LA('fogColor');
    const wC = L('w'); // peso do campo
    bgUniforms.cA.value.setRGB(vA, vA, vA).lerp(tmpC.setRGB(...fc), wC);
    bgUniforms.cB.value.setRGB(vB, vB, vB).lerp(tmpC.setRGB(...fc).multiplyScalar(0.7), wC);
    const kd = new THREE.Vector3(...LA('keyDir')).normalize();
    key.userData.dir = kd;
    key.color.setRGB(...LA('keyColor')); key.intensity = L('keyI');
    if (high) key.shadow.radius = L('shadowR');
    catcherMat.opacity = L('shadowOpacity'); catcher.visible = catcherMat.opacity > 0.002;
    csMat.opacity = L('contactOpacity');
    scene.fog.density = L('fog'); scene.fog.color.setRGB(...fc);
    grade.uniforms.vignette.value = L('vignette');
    bloom.strength = L('bloom');
    scene.environmentIntensity = L('envI');
    // piso de concreto / pano de fundo / tubulação
    floorMat.opacity = wC; floor.visible = wC > 0.002; floorMat.transparent = wC < 0.999; floorMat.depthWrite = wC > 0.5;
    backdrop.material.opacity = wC; backdrop.visible = wC > 0.002;
    for (const m of plantMats) { m.opacity = wC; m.transparent = wC < 0.999; }
    plant.visible = wC > 0.002;
    bakeEnv(Math.round(wC * 40) / 40);
  }
  applyMode(1);

  function setMode(m) {
    const target = MODES[m] ? m : 'estudio';
    if (target === modeName && tMode >= 1) return;
    // snapshot do estado atual como "from" (permite trocar no meio de uma transição)
    const k = ease(Math.min(1, tMode)), A = from || to;
    const snap = {};
    for (const n of Object.keys(to)) snap[n] = Array.isArray(to[n]) ? A[n].map((v, i) => lerp(v, to[n][i], k)) : lerp(A[n], to[n], k);
    from = snap; to = MODES[target]; modeName = target; tMode = initialFrame ? 1 : 0;
    if (initialFrame) { from = null; applyMode(1); }
  }
  let initialFrame = true;

  // ------------------------------------------------------------ desempenho adaptativo
  let fAcc = 0, fN = 0, frameNo = 0, adaptT = 0;
  function adapt(dt) {
    if (!dt || dt > 0.25) return;
    fAcc += dt; fN++; adaptT += dt;
    if (adaptT < 2.0) return;
    const fps = fN / fAcc; fAcc = 0; fN = 0; adaptT = 0;
    if (Q.get('adapt') === '0' || frameNo < 120) return;
    if (fps < 46) {
      if (gtao && gtao.enabled) { gtao.enabled = false; return; }
      if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); applySize(); }
    }
  }

  // ------------------------------------------------------------ API
  let W = 1, H = 1;
  function applySize() {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(W, H);
    bgUniforms.aspect.value = W / H;
    if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (W * pixelRatio), 1 / (H * pixelRatio));
  }
  function resize(w, h) {
    W = Math.max(1, w | 0); H = Math.max(1, h | 0);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    applySize();
  }

  function render(dt = 0) {
    frameNo++;
    if (initialFrame) initialFrame = false;
    if (tMode < 1) { tMode = Math.min(1, tMode + (dt || 0.016) / 1.4); applyMode(tMode); if (tMode >= 1) from = null; }
    if (frameNo % 30 === 1) fitShadows();
    // luz-chave posicionada ao longo da direção do modo, a partir do centro das sombras
    const d = key.userData.dir || new THREE.Vector3(0, 1, 0);
    key.position.copy(shadowCenter).addScaledVector(d, 1.5 + shadowRad);
    key.target.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderContact();               // consome o needsUpdate (mapas de sombra atualizados aqui, 1x por quadro)
    composer.render(dt);
    adapt(dt);
  }

  return {
    renderer, scene, camera, render, resize, setMode, floorY: 0,
    composer, passes: { bloom, star, gtao, output, grade, fxaa }, key,
    get mode() { return modeName; },
    setQualityAO(on) { if (gtao) gtao.enabled = !!on; },
    dispose() { composer.dispose(); pmrem.dispose(); envRT && envRT.dispose(); csRT.dispose(); csRTb.dispose(); renderer.dispose(); },
  };
}
