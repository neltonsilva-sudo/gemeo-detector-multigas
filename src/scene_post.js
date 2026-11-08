// Pós-processo do agente RENDER: filtro estrela (Kawase streak) + grade final (vinheta, grão/dither)
// e inversão numérica das curvas de tone mapping (para calibrar o branco do fundo infinito).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ---------------------------------------------------------------- curvas de tom (caminho cinza)
const sat = (x) => Math.min(1, Math.max(0, x));
function neutralGray(x) {
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  x -= offset;
  const sc = 0.76;
  if (x < sc) return x;
  const d = 1 - sc;
  return 1 - (d * d) / (x + d - sc);
}
function acesGray(x) {
  x /= 0.6;
  const a = x * (x + 0.0245786) - 0.000090537;
  const b = x * (0.983729 * x + 0.432951) + 0.238081;
  return sat(a / b);
}
function agxGray(x) {
  let v = Math.max(x, 1e-10);
  v = Math.min(Math.max(Math.log2(v), -12.47393), 4.026069);
  v = (v + 12.47393) / 16.5;
  const x2 = v * v, x4 = x2 * x2;
  v = 15.5 * x4 * x2 - 40.14 * x4 * v + 31.96 * x4 - 6.868 * x2 * v + 0.4298 * x2 + 0.1191 * v - 0.00232;
  return sat(Math.pow(Math.max(0, v), 2.2));
}
export function toneGray(x, tm, exposure) {
  x *= exposure;
  if (tm === THREE.NeutralToneMapping) return neutralGray(x);
  if (tm === THREE.ACESFilmicToneMapping) return acesGray(x);
  if (tm === THREE.AgXToneMapping) return agxGray(x);
  return sat(x);
}
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** valor linear de cena que, após tone mapping + sRGB, sai como `srgb8` (0..255) */
export function invertToneGray(srgb8, tm, exposure) {
  const target = srgbToLin(srgb8 / 255);
  let lo = 0, hi = 64;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (toneGray(m, tm, exposure) < target) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- shaders utilitários
const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const emiMat = () => new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
    void main(){
      vec4 a = texture2D(tDiffuse, vUv + texel * vec2(-0.5,-0.5)), b = texture2D(tDiffuse, vUv + texel * vec2(0.5,-0.5));
      vec4 c = texture2D(tDiffuse, vUv + texel * vec2(-0.5, 0.5)), d = texture2D(tDiffuse, vUv + texel * vec2(0.5, 0.5));
      // rgb médio; alfa = luminância emissiva (máscara gravada pelo patch de opaque_fragment: alfa = 1 + Le)
      float e = max(max(a.a, b.a), max(c.a, d.a)) - 1.0;
      gl_FragColor = vec4(min((a.rgb + b.rgb + c.rgb + d.rgb) * 0.25, vec3(60.0)), max(e, 0.0));
    }`,
  depthTest: false, depthWrite: false,
});
// redução de máximo do alfa (para achar o pico de emissão do quadro → fonte pontual da estrela)
const reduceMat = () => new THREE.ShaderMaterial({
  uniforms: { src: { value: null }, block: { value: 8 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D src; uniform int block;
    void main(){
      ivec2 sz = textureSize(src, 0); ivec2 o = ivec2(gl_FragCoord.xy) * block; float m = 0.0;
      for (int y = 0; y < 16; y++) { if (y >= block) break;
        for (int x = 0; x < 16; x++) { if (x >= block) break;
          ivec2 p = o + ivec2(x, y); if (p.x < sz.x && p.y < sz.y) m = max(m, texelFetch(src, p, 0).a); } }
      gl_FragColor = vec4(0.0, 0.0, 0.0, m);
    }`,
  depthTest: false, depthWrite: false,
});
const weightMat = () => new THREE.ShaderMaterial({
  uniforms: { tEmi: { value: null }, tMax: { value: null }, emiLo: { value: 1.6 }, core: { value: 0.1 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tEmi, tMax; uniform float emiLo, core; varying vec2 vUv;
    void main(){
      float m = texelFetch(tMax, ivec2(0), 0).a;            // pico de emissão do quadro
      float e = texture2D(tEmi, vUv).a;
      float w = m > emiLo ? clamp((e - (1.0 - core) * m) / (core * m), 0.0, 1.0) : 0.0;
      w *= w;
      gl_FragColor = vec4(vUv * w, w, 0.0);                 // p/ centróide ponderado do núcleo do LED
    }`,
  depthTest: false, depthWrite: false,
});
const sumMat = () => new THREE.ShaderMaterial({
  uniforms: { src: { value: null }, block: { value: 8 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D src; uniform int block;
    void main(){
      ivec2 sz = textureSize(src, 0); ivec2 o = ivec2(gl_FragCoord.xy) * block; vec4 acc = vec4(0.0);
      for (int y = 0; y < 16; y++) { if (y >= block) break;
        for (int x = 0; x < 16; x++) { if (x >= block) break;
          ivec2 p = o + ivec2(x, y); if (p.x < sz.x && p.y < sz.y) acc += texelFetch(src, p, 0); } }
      gl_FragColor = acc;
    }`,
  depthTest: false, depthWrite: false,
});

/**
 * Filtro estrela de câmera (o "star filter" da foto ref1). Fonte = núcleo do emissor mais forte do quadro, achado na
 * GPU (máscara de emissão no alfa → redução de máximo → centróide ponderado). Os raios são analíticos (finos e longos,
 * como os de uma lente real com filtro cruzado), coloridos pela cor do LED e com intensidade ∝ emissão de pico.
 * Reflexos de softbox, fundo branco e o LCD retroiluminado nunca geram raios. Custo: ~8 passes minúsculos + 1 composição.
 */
export class StarPass extends Pass {
  constructor(div = 2) {
    super();
    this.div = div;
    this.gain = 2.2;
    this.emiLo = 1.6;           // emissão (luminância) mínima p/ existir estrela: LED aceso ≈ 3+, LCD ≈ 0,4
    this.length = 0.42;         // comprimento do raio principal em fração da altura do quadro
    this.width = 1.5;           // meia-largura do raio em px (a 720p)
    // [ângulo°, comprimento relativo, intensidade] — 8 raios assimétricos como na foto
    this.rays = [[90, 0.85, 0.9], [270, 0.6, 0.7], [52, 1.0, 1.0], [232, 0.7, 0.75], [128, 1.0, 1.0], [308, 0.7, 0.75], [12, 0.5, 0.45], [192, 0.5, 0.45]];
    const opt = { type: THREE.FloatType, depthBuffer: false };
    const mk = () => { const r = new THREE.WebGLRenderTarget(1, 1, opt); r.texture.minFilter = r.texture.magFilter = THREE.NearestFilter; r.texture.generateMipmaps = false; return r; };
    this.rtEmi = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtW = mk(); this.rtR1 = mk(); this.rtR2 = mk(); this.rtR3 = mk(); this.rtS1 = mk(); this.rtS2 = mk(); this.rtS3 = mk();
    this.mEmi = emiMat(); this.mReduce = reduceMat(); this.mWeight = weightMat(); this.mSum = sumMat();
    const rayU = []; for (let i = 0; i < 8; i++) rayU.push(new THREE.Vector3());
    this.mComp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tEmi: { value: null }, tMax: { value: null }, tSum: { value: null },
        gain: { value: 1 }, emiLo: { value: 1.6 }, res: { value: new THREE.Vector2(1, 1) }, len: { value: 200 }, wid: { value: 1.1 }, rays: { value: rayU } },
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse, tEmi, tMax, tSum; uniform float gain, emiLo, len, wid; uniform vec2 res; uniform vec3 rays[8];
        varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float m = texelFetch(tMax, ivec2(0), 0).a;
          vec4 S = texelFetch(tSum, ivec2(0), 0);
          if (m > emiLo && S.z > 1e-4) {
            vec2 cen = S.xy / S.z;
            vec3 col = texture2D(tEmi, cen).rgb; col /= max(1e-3, max(col.r, max(col.g, col.b)));
            col = mix(col, vec3(1.0), 0.06);                                   // raios levemente "lavados" como na foto
            float k = gain * smoothstep(emiLo, emiLo * 2.0, m) * (0.6 + 0.4 * min(m / 4.0, 2.0));
            vec2 d = (vUv - cen) * res;                                         // px
            float r = length(d); float acc = 0.0;
            for (int i = 0; i < 8; i++) {
              vec2 dir = vec2(cos(rays[i].x), sin(rays[i].x));
              float al = dot(d, dir); if (al <= 0.0) continue;
              float pe = abs(dot(d, vec2(-dir.y, dir.x)));
              float L = len * rays[i].y;
              float w = wid * (1.0 + al / L * 0.8);                             // difração: alarga levemente para fora
              acc += rays[i].z * exp(-pe * pe / (w * w)) * pow(max(0.0, 1.0 - al / L), 2.2);
            }
            float core = exp(-r / (len * 0.035)) * 1.6 + exp(-r / (len * 0.12)) * 0.25;
            // sobre fundo claro um raio puramente aditivo some (o branco já está no ombro da curva): como no filtro
            // da foto, o raio também "tinge" (mistura para a cor do LED) e soma energia no núcleo.
            float I = k * (acc * 1.4 + core);
            c.rgb = mix(c.rgb, col * (1.3 + I), clamp(I, 0.0, 1.0) * 0.55) + col * I * 0.45;
          }
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
    this.W = 1; this.H = 1; this.lastBlock = 1;
  }
  setSize(w, h) {
    this.W = w; this.H = h;
    const qw = Math.max(1, Math.round(w / this.div)), qh = Math.max(1, Math.round(h / this.div));
    this.rtEmi.setSize(qw, qh); this.rtW.setSize(qw, qh);
    const r1w = Math.ceil(qw / 8), r1h = Math.ceil(qh / 8), r2w = Math.ceil(r1w / 8), r2h = Math.ceil(r1h / 8);
    this.rtR1.setSize(r1w, r1h); this.rtS1.setSize(r1w, r1h);
    this.rtR2.setSize(r2w, r2h); this.rtS2.setSize(r2w, r2h);
    this.rtR3.setSize(1, 1); this.rtS3.setSize(1, 1);
    this.lastBlock = Math.min(16, Math.max(r2w, r2h));
  }
  render(renderer, writeBuffer, readBuffer) {
    const prevAuto = renderer.autoClear; renderer.autoClear = false;
    const pass = (mat, dst) => { this.quad.material = mat; renderer.setRenderTarget(dst); this.quad.render(renderer); };
    this.mEmi.uniforms.tDiffuse.value = readBuffer.texture;
    this.mEmi.uniforms.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    pass(this.mEmi, this.rtEmi);
    const red = (mat, src, dst, block) => { mat.uniforms.src.value = src.texture; mat.uniforms.block.value = block; pass(mat, dst); };
    red(this.mReduce, this.rtEmi, this.rtR1, 8); red(this.mReduce, this.rtR1, this.rtR2, 8); red(this.mReduce, this.rtR2, this.rtR3, this.lastBlock);
    const mw = this.mWeight.uniforms; mw.tEmi.value = this.rtEmi.texture; mw.tMax.value = this.rtR3.texture; mw.emiLo.value = this.emiLo;
    pass(this.mWeight, this.rtW);
    red(this.mSum, this.rtW, this.rtS1, 8); red(this.mSum, this.rtS1, this.rtS2, 8); red(this.mSum, this.rtS2, this.rtS3, this.lastBlock);
    const u = this.mComp.uniforms, sH = this.H / 720;
    u.tDiffuse.value = readBuffer.texture; u.tEmi.value = this.rtEmi.texture; u.tMax.value = this.rtR3.texture; u.tSum.value = this.rtS3.texture;
    u.gain.value = this.gain; u.emiLo.value = this.emiLo; u.res.value.set(this.W, this.H);
    u.len.value = this.length * this.H; u.wid.value = this.width * Math.max(1, sH);
    this.rays.forEach(([deg, l, g], i) => u.rays.value[i].set(deg * Math.PI / 180, l, g));
    pass(this.mComp, this.renderToScreen ? null : writeBuffer);
    renderer.autoClear = prevAuto;
  }
  dispose() {
    for (const rt of [this.rtEmi, this.rtW, this.rtR1, this.rtR2, this.rtR3, this.rtS1, this.rtS2, this.rtS3]) rt.dispose();
    for (const m of [this.mEmi, this.mReduce, this.mWeight, this.mSum, this.mComp]) m.dispose();
    this.quad.dispose();
  }
}

/** Grade final em espaço de exibição: vinheta suave + dither triangular (mata banding do fundo claro). */
export class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null }, vignette: { value: 0 }, aspect: { value: 1 }, time: { value: 0 }, grain: { value: 0 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float vignette, aspect, time, grain; varying vec2 vUv;
        float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
          float r = length(p) / length(vec2(aspect, 1.0) * 0.5);
          c.rgb *= 1.0 - vignette * smoothstep(0.35, 1.05, r);
          vec2 fc = gl_FragCoord.xy + fract(time * 7.13) * 37.0;
          float n = h12(fc) + h12(fc + 17.7) - 1.0;           // triangular [-1,1]
          c.rgb += n * (1.0 / 255.0) + n * grain;
          gl_FragColor = vec4(c.rgb, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.uniforms.aspect.value = w / Math.max(1, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.time.value = (this.uniforms.time.value + 0.0167) % 100;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}
