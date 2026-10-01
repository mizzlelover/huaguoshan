import * as THREE from 'three';
import { Noise, clamp01, smoothstep, lerp } from '../core/noise.js';
import { PIGMENT } from '../core/palette.js';
import { makePuffTextureShared } from './cloudtex.js';

const SEA_VERT = `
varying vec2 vXZ;
varying float vDist;
varying float vSlant;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  vec3 toCam = wp.xyz - cameraPosition;
  vDist = length(toCam);
  vSlant = abs(normalize(toCam).y);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SEA_FRAG = `
precision highp float;
uniform float uTime;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSunColor;
uniform float uOpacity;
uniform float uInner;
uniform float uOuter;
varying vec2 vXZ;
varying float vDist;
varying float vSlant;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.06 + 17.3;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 p = vXZ * 0.0021;
  float t = uTime * 0.006;
  float a = fbm(p + vec2(t, t * 0.4));
  float b = fbm(p * 2.3 - vec2(t * 0.6, t * 0.22) + 9.1);
  float m = a * 0.72 + b * 0.36;

  float shape = smoothstep(0.44, 0.90, m);
  float wisp = smoothstep(0.58, 0.98, m) * 0.45;

  float near = smoothstep(140.0, 1100.0, vDist);
  float far = 1.0 - smoothstep(2200.0, 4200.0, vDist);
  float edge = smoothstep(0.015, 0.16, vSlant);

  // 云海只存在于岛外海面：按离岛中心的半径淡入，避免平面与地形相交出现硬切白边
  float ring = smoothstep(uInner, uOuter, length(vXZ));
  // 俯视时把云层压薄，避免整片白云盖住山体
  float topDown = 1.0 - 0.82 * smoothstep(0.70, 0.99, vSlant);

  float alpha = (shape * 0.8 + wisp) * uOpacity * near * near * far * ring * topDown
              * mix(0.06, 1.0, edge);

  float ridge = smoothstep(0.5, 0.98, m);
  vec3 col = mix(uShade, uLit, ridge);
  col = mix(col, uSunColor, 0.18 * pow(ridge, 3.0));
  col = mix(col, uShade, smoothstep(0.60, 0.38, m) * 0.4);

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

const PUFF_VERT = `
attribute vec3 iOffset;
attribute vec4 iParams;
attribute float iScale;
attribute float iSeed;
uniform float uTime;
uniform float uSpan;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  vSeed = iSeed;
  float speed = iParams.x;
  float spin = iParams.y;
  float bob = iParams.z;
  float rot = iParams.w;
  vec2 puv = position.xy;
  float cs = cos(rot), sn = sin(rot);
  vec2 ruv = vec2(puv.x * cs - puv.y * sn, puv.x * sn + puv.y * cs) + 0.5;
  vUv = ruv;

  vec3 off = iOffset;
  float ang = spin * uTime;
  float c = cos(ang), s = sin(ang);
  vec2 rot2 = vec2(off.x * c - off.z * s, off.x * s + off.z * c);
  vec3 center = vec3(rot2.x, off.y + sin(uTime * 0.11 + iSeed * 9.0) * bob, rot2.y);
  center.x = mod(center.x - cameraPosition.x + uSpan * 0.5, uSpan) - uSpan * 0.5 + cameraPosition.x;
  center.z = mod(center.z - cameraPosition.z + uSpan * 0.5, uSpan) - uSpan * 0.5 + cameraPosition.z;
  float scale = iScale * (1.0 + 0.07 * sin(uTime * 0.23 + iSeed * 5.0));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center + (right * (ruv.x - 0.5) + up * (ruv.y - 0.5)) * scale;
  float d = distance(world, cameraPosition);
  vFade = smoothstep(14.0, 90.0, d) * (1.0 - smoothstep(uSpan * 0.30, uSpan * 0.47, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const PUFF_FRAG = `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSunColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * uOpacity * vFade;
  if (a < 0.006) discard;
  float shade = smoothstep(0.85, 0.15, vUv.y);
  vec3 col = mix(uShade, uLit, shade);
  col = mix(col, uSunColor, 0.10 * smoothstep(0.55, 1.0, vUv.y));
  gl_FragColor = vec4(col, a);
}
`;

export class Clouds {
  constructor(terrain, seed = 909) {
    this.group = new THREE.Group();
    this.group.name = 'clouds';
    const noise = new Noise(seed);

    this.seaUniforms = {
      uTime: { value: 0 },
      uLit: { value: new THREE.Color(0xcdd6de) },
      uShade: { value: new THREE.Color(0x7e90a6) },
      uSunColor: { value: new THREE.Color(0xfff4d8) },
      uOpacity: { value: 0.30 },
      uInner: { value: 520 },
      uOuter: { value: 1150 }
    };

    const seaGeo = new THREE.PlaneGeometry(12000, 12000, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(
      seaGeo,
      new THREE.ShaderMaterial({
        uniforms: this.seaUniforms,
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      })
    );
    this.sea.position.y = 26;
    this.sea.renderOrder = -8;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);

    this.seaLow = new THREE.Mesh(seaGeo.clone(), this.sea.material.clone());
    this.seaLow.material.uniforms = {
      uTime: { value: 0 },
      uLit: { value: new THREE.Color(0xcdd6de) },
      uShade: { value: new THREE.Color(0x7e90a6) },
      uSunColor: { value: new THREE.Color(0xfff4d8) },
      uOpacity: { value: 0.20 },
      uInner: { value: 760 },
      uOuter: { value: 1500 }
    };
    this.seaLow.position.y = 18;
    this.seaLow.scale.setScalar(0.62);
    this.seaLow.renderOrder = -9;
    this.seaLow.frustumCulled = false;
    this.group.add(this.seaLow);

    this.puffUniforms = {
      uTime: { value: 0 },
      uMap: { value: makePuffTextureShared() },
      uLit: { value: new THREE.Color(0xcfd8e2) },
      uShade: { value: new THREE.Color(0x8296ae) },
      uSunColor: { value: new THREE.Color(0xfff4d8) },
      uOpacity: { value: 0.21 },
      uSpan: { value: 3400 }
    };

    const COUNT = 210;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    const off = new Float32Array(COUNT * 3);
    const par = new Float32Array(COUNT * 4);
    const scl = new Float32Array(COUNT);
    const sed = new Float32Array(COUNT);
    const span = this.puffUniforms.uSpan.value;
    for (let i = 0; i < COUNT; i++) {
      const ang = (i / COUNT) * Math.PI * 2 * 3.7 + noise.noise2(i * 0.31, 1.1) * 2;
      const rad = 430 + Math.pow(Math.abs(noise.noise2(i * 0.7, 5.5)), 0.55) * 1350;
      const y = 26 + Math.abs(noise.noise2(i * 1.3, 9.1)) * 150 + (rad / 1780) * 150;
      off[i * 3] = Math.cos(ang) * rad;
      off[i * 3 + 1] = y;
      off[i * 3 + 2] = Math.sin(ang) * rad;
      par[i * 4] = (0.0008 + 0.0015 * (0.5 + 0.5 * noise.noise2(i * 0.9, 2.2))) * (i % 2 === 0 ? 1 : -1);
      par[i * 4 + 1] = 0.005 * noise.noise2(i * 0.4, 7.7);
      par[i * 4 + 2] = 2.5 + 9 * Math.abs(noise.noise2(i * 1.7, 3.3));
      par[i * 4 + 3] = noise.noise2(i * 2.9, 6.1) * Math.PI;
      scl[i] = 95 + 235 * Math.pow(Math.abs(noise.noise2(i * 2.1, 4.4)), 1.4);
      sed[i] = Math.abs(noise.noise2(i * 3.3, 6.6));
    }
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('iParams', new THREE.InstancedBufferAttribute(par, 4));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scl, 1));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(sed, 1));
    geo.instanceCount = COUNT;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span);

    this.puffs = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.puffUniforms,
        vertexShader: PUFF_VERT,
        fragmentShader: PUFF_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: false
      })
    );
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 6;
    this.group.add(this.puffs);
  }

  update(dt, time, camera, sky) {
    this.seaUniforms.uTime.value = time;
    this.seaLow.material.uniforms.uTime.value = time * 0.72;
    this.puffUniforms.uTime.value = time;
    this.sea.position.x = camera.position.x;
    this.sea.position.z = camera.position.z;
    this.seaLow.position.x = camera.position.x;
    this.seaLow.position.z = camera.position.z;

    if (sky) {
      const s = sky.state;
      const lit = PIGMENT.silk.clone().lerp(s.light, 0.30);
      const shade = PIGMENT.azuriteLight.clone().lerp(s.fog, 0.55).multiplyScalar(0.82);
      this.seaUniforms.uLit.value.copy(lit);
      this.seaUniforms.uShade.value.copy(shade);
      this.seaUniforms.uSunColor.value.copy(s.light);
      this.puffUniforms.uLit.value.copy(lit);
      this.puffUniforms.uShade.value.copy(shade);
      this.puffUniforms.uSunColor.value.copy(s.light);
      this.puffUniforms.uOpacity.value = lerp(0.46, 0.76, clamp01(s.intensity * 0.5));
    }
  }
}
