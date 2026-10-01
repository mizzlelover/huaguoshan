import * as THREE from 'three';
import { PIGMENT, sampleSky, SUN_PATH } from '../core/palette.js';
import { Noise, clamp01, smoothstep, lerp } from '../core/noise.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.999999;
}
`;

const SKY_FRAG = `
precision highp float;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uStar;
uniform float uTime;
uniform float uCloudAmount;
varying vec3 vDir;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p *= 2.04;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  float t = pow(clamp(h, 0.0, 1.0), 0.74);
  vec3 col = mix(uHorizon, uZenith, t);

  float belowFade = smoothstep(-0.16, 0.02, h);
  col = mix(mix(uHorizon, uZenith, 0.0) * 0.86, col, belowFade);

  float sunDot = dot(dir, uSunDir);
  float sunDisc = smoothstep(0.99880, 0.99955, sunDot);
  float sunGlow = pow(clamp(sunDot, 0.0, 1.0), 900.0) * 0.42
                + pow(clamp(sunDot, 0.0, 1.0), 40.0) * 0.16
                + pow(clamp(sunDot, 0.0, 1.0), 7.0) * 0.06;
  float sunUp = smoothstep(-0.14, 0.10, uSunDir.y);
  col += uSunTint * sunGlow * (0.35 + sunUp * 1.25);
  col += uSunTint * sunDisc * 3.2 * sunUp;

  float moonDot = dot(dir, uMoonDir);
  float moonDisc = smoothstep(0.99900, 0.99948, moonDot);
  float moonGlow = pow(clamp(moonDot, 0.0, 1.0), 900.0) * 0.7
                 + pow(clamp(moonDot, 0.0, 1.0), 40.0) * 0.16;
  float moonUp = smoothstep(-0.06, 0.16, uMoonDir.y);
  float nightUp = uStar;
  col += vec3(0.80, 0.85, 1.0) * moonDisc * 3.4 * nightUp * moonUp;
  col += vec3(0.62, 0.72, 0.95) * moonGlow * nightUp * moonUp;

  if (uStar > 0.001) {
    vec3 sp = dir * 190.0;
    vec3 cell = floor(sp);
    float hsh = hash31(cell);
    float bright = smoothstep(0.968, 0.999, hsh);
    vec3 jit = vec3(hash31(cell + 3.1), hash31(cell + 7.7), hash31(cell + 11.3)) - 0.5;
    float d = length(fract(sp) - 0.5 - jit * 0.55);
    float star = bright * smoothstep(0.16, 0.0, d);
    float tw = 0.62 + 0.38 * sin(uTime * 1.9 + hsh * 63.0);
    col += star * tw * uStar * 1.55 * vec3(0.92, 0.95, 1.0) * smoothstep(-0.05, 0.12, h);

    vec3 bandN = normalize(vec3(0.42, 0.36, -0.83));
    float band = 1.0 - abs(dot(dir, bandN));
    float mw = smoothstep(0.72, 1.0, band);
    float mwn = fbm(dir * 7.0 + 13.0, 4);
    col += mw * mwn * uStar * 0.20 * vec3(0.72, 0.78, 1.0) * smoothstep(0.0, 0.3, h);
  }

  float above = smoothstep(-0.02, 0.06, h);
  vec3 cp = dir / max(abs(h) + 0.16, 0.16);
  float cirrus = fbm(vec3(cp.x * 0.42, cp.z * 0.42, uTime * 0.006), 5);
  cirrus = smoothstep(0.62, 0.98, cirrus) * smoothstep(0.03, 0.26, h) * smoothstep(0.80, 0.26, h);
  float deck = fbm(vec3(cp.x * 0.17 + uTime * 0.004, cp.z * 0.17, 0.5), 5);
  float deckN = fbm(vec3(cp.x * 0.42 - uTime * 0.003, cp.z * 0.42 + 3.0, 1.7), 4);
  deck = deck * 0.78 + deckN * 0.30;
  float deckMask = smoothstep(0.64, 1.00, deck) * smoothstep(0.004, 0.050, h) * (1.0 - smoothstep(0.10, 0.34, h));
  float cloudMask = clamp(cirrus * 0.34 + deckMask * 0.80, 0.0, 1.0) * uCloudAmount;

  float shadeSide = clamp(dot(normalize(dir + vec3(0.0, 0.55, 0.0)), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 cloudLit = mix(uZenith, uHorizon, 0.34) * 1.55 + vec3(0.30, 0.33, 0.38) + uSunTint * sunGlow * 0.5;
  vec3 cloudCol = mix(cloudLit * 0.42, cloudLit * 0.92, shadeSide);
  cloudCol = mix(cloudCol, uZenith * 1.25, 0.22 * (1.0 - shadeSide));
  col = mix(col, cloudCol, cloudMask * 0.86 * above);

  col = mix(col, mix(uHorizon, uZenith, 0.4) * 1.02, smoothstep(0.30, -0.05, h) * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
`;

const RANGE_VERT = `
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const RANGE_FRAG = `
precision highp float;
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uRangeH;
uniform float uBaseY;
uniform float uTime;
uniform float uOpacity;
varying vec3 vLocal;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float t = clamp((vLocal.y - uBaseY) / uRangeH, 0.0, 1.0);
  float band = 0.5 + 0.5 * sin(vLocal.y * 0.06 + vLocal.x * 0.005);
  vec3 col = mix(uColor, uColor * 1.14, band * 0.45);
  col = mix(col, uColor * 0.86, smoothstep(0.5, 1.0, t) * 0.55);
  col = mix(uHaze, col, mix(0.34, 0.94, smoothstep(0.0, 0.42, t)));
  col = mix(col, uHaze, smoothstep(0.55, 1.0, t) * 0.34);
  float a = uOpacity * mix(1.0, 0.42, t);
  a *= 0.92 + 0.08 * hash21(floor(vLocal.xy * 0.6));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

function buildRange(noise, radius, baseY, height, seed, segments, roughness, peaks) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    let h = 0;
    h += noise.ridged2(Math.cos(a) * 2.4 + seed, Math.sin(a) * 2.4 + seed * 0.7, 4) * roughness;
    h += (noise.fbm2(Math.cos(a) * 4.4 + seed * 2, Math.sin(a) * 4.4 - seed, 4) * 0.5 + 0.32) * roughness * 0.75;
    for (let p = 0; p < peaks.length; p++) {
      const pa = peaks[p].a;
      let d = Math.abs(((a - pa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const w = peaks[p].w;
      h += Math.exp(-(d * d) / (w * w)) * peaks[p].h;
    }
    const top = baseY + h * height;
    positions.push(x, baseY - height * 0.55, z);
    positions.push(x, top, z);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class Sky {
  constructor(stage, noise) {
    this.stage = stage;
    this.noise = noise || new Noise(4711);
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.timeOfDay = 0.34;
    this.speed = 1 / 420;
    this.autoCycle = true;

    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2c74ad) },
      uHorizon: { value: new THREE.Color(0xbcd8e0) },
      uSunTint: { value: new THREE.Color(0xfff4d8) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.7) },
      uMoonDir: { value: new THREE.Vector3(-0.4, -0.5, -0.7) },
      uStar: { value: 0 },
      uTime: { value: 0 },
      uCloudAmount: { value: 0.40 }
    };

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(7000, 64, 40),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
      })
    );
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.ranges = new THREE.Group();
    this.rangeMats = [];
    const specs = [
      { r: 900, base: -30, h: 132, seed: 3.1, rough: 0.45, color: 0x39606d, haze: 0x8fb4bd, op: 0.72,
        peaks: [{ a: 1.05, w: 0.30, h: 0.85 }, { a: 3.55, w: 0.34, h: 0.6 }, { a: 5.1, w: 0.26, h: 0.45 }] },
      { r: 1450, base: -24, h: 200, seed: 8.7, rough: 0.5, color: 0x476e85, haze: 0xa3c2cc, op: 0.58,
        peaks: [{ a: 2.2, w: 0.34, h: 0.7 }, { a: 4.4, w: 0.30, h: 0.55 }] },
      { r: 2400, base: -18, h: 310, seed: 14.2, rough: 0.55, color: 0x5a7f9b, haze: 0xb6cdd6, op: 0.44,
        peaks: [{ a: 0.2, w: 0.38, h: 0.6 }, { a: 3.1, w: 0.44, h: 0.45 }] },
      { r: 3900, base: -10, h: 470, seed: 21.4, rough: 0.6, color: 0x6e90aa, haze: 0xc8dae1, op: 0.30,
        peaks: [{ a: 1.7, w: 0.55, h: 0.5 }] },
      { r: 5800, base: 0, h: 700, seed: 30.9, rough: 0.7, color: 0x86a3ba, haze: 0xdbe6eb, op: 0.18,
        peaks: [] }
    ];
    for (const s of specs) {
      const geo = buildRange(this.noise, s.r, s.base, s.h, s.seed, 220, s.rough, s.peaks);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(s.color) },
          uHaze: { value: new THREE.Color(s.haze) },
          uRangeH: { value: s.h * 1.5 },
          uBaseY: { value: s.base - s.h * 0.55 },
          uTime: { value: 0 },
          uOpacity: { value: s.op }
        },
        vertexShader: RANGE_VERT,
        fragmentShader: RANGE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -900 + s.r;
      mesh.frustumCulled = false;
      this.ranges.add(mesh);
      this.rangeMats.push(mat);
    }
    this.group.add(this.ranges);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sun.castShadow = true;
    if ('intensity' in this.sun.shadow) this.sun.shadow.intensity = 0.44;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 640;
    sc.left = -200;
    sc.right = 200;
    sc.top = 230;
    sc.bottom = -140;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.7;
    this.stage.scene.add(this.sun);
    this.stage.scene.add(this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xc6dfe6, 0x44604a, 0.55);
    this.stage.scene.add(this.ambient);

    this.fill = new THREE.DirectionalLight(0x9fc0d8, 0.35);
    this.fill.position.set(-120, 60, -90);
    this.stage.scene.add(this.fill);

    this.fog = new THREE.FogExp2(0xbfd2da, 0.00058);
    this.stage.scene.fog = this.fog;

    this.apply(this.timeOfDay);
  }

  apply(t) {
    this.timeOfDay = ((t % 1) + 1) % 1;
    const s = sampleSky(this.timeOfDay);
    const elev = SUN_PATH.elevation(this.timeOfDay);
    const azim = SUN_PATH.azimuth(this.timeOfDay);
    const sunDir = new THREE.Vector3(
      Math.cos(azim) * Math.cos(elev * Math.PI * 0.92 - Math.PI * 0.46),
      Math.sin(elev * Math.PI * 0.92 - Math.PI * 0.46),
      Math.sin(azim) * Math.cos(elev * Math.PI * 0.92 - Math.PI * 0.46)
    ).normalize();
    this.sunDir = sunDir;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uMoonDir.value.copy(sunDir).multiplyScalar(-1);
    this.uniforms.uZenith.value.copy(s.zenith);
    this.uniforms.uHorizon.value.copy(s.horizon);
    this.uniforms.uSunTint.value.copy(s.sunTint);
    this.uniforms.uStar.value = s.star;

    this.sun.position.copy(sunDir).multiplyScalar(340);
    this.sun.target.position.set(0, 40, 0);
    this.sun.color.copy(s.light);
    this.sun.intensity = Math.max(0.05, s.intensity);
    this.ambient.color.copy(s.horizon);
    this.ambient.groundColor.copy(s.ambient).multiplyScalar(1.05);
    this.ambient.intensity = lerp(0.52, 0.86, clamp01(s.intensity * 0.6));
    this.fill.color.copy(s.ambient).lerp(new THREE.Color(0xffffff), 0.4);
    this.fill.intensity = lerp(0.30, 0.72, clamp01(s.intensity * 0.6));
    this.fog.color.copy(s.fog).lerp(s.zenith, 0.22);
    this.stage.nightMix = s.star;
    this.state = s;
    for (const m of this.rangeMats) {
      m.uniforms.uHaze.value.copy(s.fog).lerp(s.horizon, 0.55).multiplyScalar(0.56);
    }
  }

  setTime(t) { this.apply(t); }

  stepTime(dt) {
    if (this.autoCycle) this.apply(this.timeOfDay + dt * this.speed);
    else this.apply(this.timeOfDay);
  }

  update(dt, time, camera) {
    this.uniforms.uTime.value = time;
    this.dome.position.copy(camera.position);
    for (const m of this.ranges.children) {
      m.position.x = camera.position.x;
      m.position.z = camera.position.z;
    }
    this.sun.position.copy(this.sunDir).multiplyScalar(340).add(new THREE.Vector3(camera.position.x * 0.35, 0, camera.position.z * 0.35));
    this.sun.target.position.set(camera.position.x * 0.35, 40, camera.position.z * 0.35);
    this.sun.target.updateMatrixWorld();
  }
}
