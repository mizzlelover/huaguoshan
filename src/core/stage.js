import * as THREE from 'three';

const QUAD = new THREE.PlaneGeometry(2, 2);

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tScene, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-5);
  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

const BLUR_FRAG = `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSource, vUv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  sum += texture2D(tSource, vUv + o1).rgb * 0.3162162162;
  sum += texture2D(tSource, vUv - o1).rgb * 0.3162162162;
  sum += texture2D(tSource, vUv + o2).rgb * 0.0702702703;
  sum += texture2D(tSource, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform float uBloom;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uNight;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uAberration;
varying vec2 vUv;

vec3 acesApprox(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  float ab = uAberration * r2;
  vec3 scene;
  scene.r = texture2D(tScene, uv - fromCenter * ab).r;
  scene.g = texture2D(tScene, uv).g;
  scene.b = texture2D(tScene, uv + fromCenter * ab).b;

  vec3 bloom = texture2D(tBloomA, uv).rgb * 0.62 + texture2D(tBloomB, uv).rgb * 0.38;
  vec3 color = scene + bloom * uBloom;

  color *= uExposure;
  color = acesApprox(color);

  color = clamp(uGain * (color + uLift * (1.0 - color)), 0.0, 1.0);

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);

  vec3 shadowTint = mix(vec3(0.62, 0.74, 0.92), vec3(0.66, 0.72, 0.98), uNight);
  float shadowMask = 1.0 - smoothstep(0.0, 0.62, luma);
  color = mix(color, color * shadowTint, shadowMask * 0.34);

  float vig = 1.0 - uVignette * smoothstep(0.16, 0.78, r2);
  color *= vig;

  float grain = hash12(uv * 1024.0 + fract(uTime) * 91.7) - 0.5;
  color += grain * uGrain * (1.0 - luma * 0.55);

  gl_FragColor = vec4(linearToSRGB(clamp(color, 0.0, 1.0)), 1.0);
}
`;

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.25, 12000);

    this.bloomStrength = 0.62;
    this.exposure = 1.62;
    this.vignette = 0.17;
    this.grain = 0.015;
    this.saturation = 1.1;
    this.aberration = 0.0026;
    this.nightMix = 0;
    this.lift = new THREE.Color(0.030, 0.042, 0.058);
    this.gain = new THREE.Color(1.02, 1.0, 0.965);

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.matBright = this._mat(BRIGHT_FRAG, {
      tScene: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 0.86 },
      uKnee: { value: 0.42 }
    });
    this.matBlur = this._mat(BLUR_FRAG, {
      tSource: { value: null },
      uDir: { value: new THREE.Vector2() }
    });
    this.matComposite = this._mat(COMPOSITE_FRAG, {
      tScene: { value: null },
      tBloomA: { value: null },
      tBloomB: { value: null },
      uBloom: { value: this.bloomStrength },
      uExposure: { value: 1.0 },
      uVignette: { value: this.vignette },
      uGrain: { value: this.grain },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uLift: { value: this.lift },
      uGain: { value: this.gain },
      uSaturation: { value: this.saturation },
      uAberration: { value: this.aberration }
    });
    this.quad = new THREE.Mesh(QUAD, this.matComposite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this._buildTargets(1, 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _mat(fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader,
      depthTest: false,
      depthWrite: false
    });
  }

  _buildTargets(w, h) {
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.LinearSRGBColorSpace
    };
    const light = { ...opts, depthBuffer: false };
    this.rtScene?.dispose();
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtC?.dispose();
    this.rtD?.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtA = new THREE.WebGLRenderTarget(w >> 2, h >> 2, light);
    this.rtB = new THREE.WebGLRenderTarget(w >> 2, h >> 2, light);
    this.rtC = new THREE.WebGLRenderTarget(w >> 3, h >> 3, light);
    this.rtD = new THREE.WebGLRenderTarget(w >> 3, h >> 3, light);
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD]) {
      rt.texture.generateMipmaps = false;
      rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    }
  }

  resize() {
    const w = Math.max(2, window.innerWidth);
    const h = Math.max(2, window.innerHeight);
    const pr = this.renderer.getPixelRatio();
    const pw = Math.floor(w * pr);
    const ph = Math.floor(h * pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._buildTargets(pw, ph);
    this._w = pw;
    this._h = ph;
  }

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(time) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);

    this.matBright.uniforms.tScene.value = this.rtScene.texture;
    this.matBright.uniforms.uTexel.value.set(1 / this._w, 1 / this._h);
    this._blit(this.matBright, this.rtA);

    const blur = (src, tmp, dst, w, h) => {
      this.matBlur.uniforms.tSource.value = src.texture;
      this.matBlur.uniforms.uDir.value.set(1 / w, 0);
      this._blit(this.matBlur, tmp);
      this.matBlur.uniforms.tSource.value = tmp.texture;
      this.matBlur.uniforms.uDir.value.set(0, 1 / h);
      this._blit(this.matBlur, dst);
    };

    blur(this.rtA, this.rtB, this.rtA, this.rtA.width, this.rtA.height);
    blur(this.rtA, this.rtB, this.rtC, this.rtC.width, this.rtC.height);
    blur(this.rtC, this.rtD, this.rtC, this.rtC.width, this.rtC.height);

    const u = this.matComposite.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloomA.value = this.rtA.texture;
    u.tBloomB.value = this.rtC.texture;
    u.uBloom.value = this.bloomStrength;
    u.uExposure.value = this.exposure;
    u.uVignette.value = this.vignette;
    u.uGrain.value = this.grain;
    u.uSaturation.value = this.saturation;
    u.uAberration.value = this.aberration;
    u.uNight.value = this.nightMix;
    u.uTime.value = time;
    this._blit(this.matComposite, null);

    // 截图必须在合成 blit 之后、同一帧内取：WebGL 绘制缓冲会在本帧结束后被清空，
    // 若在键盘事件里直接 toDataURL 会得到空白图（用这个时机也无需 preserveDrawingBuffer）。
    if (this._shotPending) {
      const name = this._shotPending;
      this._shotPending = null;
      this._emitShot(name);
    }
  }

  /** 请求在下一帧合成完成后截图并下载 */
  requestShot(prefix = 'huaguoshan') {
    this._shotPending = `${prefix}-${Date.now()}.png`;
  }

  _emitShot(name) {
    let url;
    try {
      url = this.renderer.domElement.toDataURL('image/png');
    } catch (err) {
      console.warn('截图失败：画布不可读', err);
      return null;
    }
    if (!url.startsWith('data:image/png') || url.length < 1024) {
      console.warn('截图失败：得到空白画布');
      return null;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    return name;
  }
}
