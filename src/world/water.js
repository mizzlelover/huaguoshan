import * as THREE from 'three';
import { Noise, rngFrom, clamp01, smoothstep, lerp, TAU } from '../core/noise.js';
import { PIGMENT } from '../core/palette.js';
import { SITE, RAVINE, GORGE_Z } from './terrain.js';
import { makePuffTextureShared } from './cloudtex.js';

const NOISE_GLSL = `
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
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 11.1; a *= 0.5; }
  return s;
}
`;

const FALL_VERT = `
uniform float uTime;
varying vec2 vUv;
varying float vFall;
void main() {
  vUv = uv;
  vFall = uv.y;
  vec3 p = position;
  float t = uTime;
  float ripple = sin(uv.x * 26.0 + t * 3.4) * 0.10 + sin(uv.x * 47.0 - t * 2.1) * 0.05;
  p.z += ripple * (0.25 + uv.y * 1.1) * smoothstep(0.0, 0.12, uv.y);
  p.x += sin(uv.y * 7.0 + t * 1.6 + uv.x * 3.0) * 0.22 * uv.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FALL_FRAG = `
precision highp float;
uniform float uTime;
uniform vec3 uSkyTint;
uniform vec3 uSunColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vFall;
${NOISE_GLSL}
void main() {
  float v = vUv.y;
  float u = vUv.x;
  float speed = 2.2 + v * 3.4;
  float streak = fbm(vec2(u * 26.0, v * 7.0 - uTime * speed));
  float streak2 = fbm(vec2(u * 62.0 + 5.0, v * 15.0 - uTime * speed * 1.7));
  float body = smoothstep(0.30, 0.78, streak * 0.62 + streak2 * 0.48);

  float edge = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.86, 1.0, u));
  float taper = smoothstep(1.0, 0.80, v) * smoothstep(0.0, 0.03, v);
  float breakup = smoothstep(0.42, 0.95, v) * (0.20 + 0.80 * fbm(vec2(u * 17.0, v * 10.0 - uTime * 5.0)));
  float a = (0.10 + body * 0.62) * edge * taper * mix(1.0, breakup, smoothstep(0.18, 0.85, v));
  a += (1.0 - smoothstep(0.0, 0.05, v)) * 0.34 * edge;
  float gaps = smoothstep(0.30, 0.62, fbm(vec2(u * 8.0, v * 3.2 - uTime * 1.2)));
  a *= mix(0.55, 1.0, gaps);
  a *= uOpacity;
  if (a < 0.006) discard;

  vec3 col = mix(uSkyTint, vec3(1.0), 0.42 + body * 0.55);
  col = mix(col, uSunColor, 0.22 * pow(body, 2.0));
  col = mix(col * 0.86, col, smoothstep(0.0, 0.5, v));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

const POOL_VERT = `
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const POOL_FRAG = `
precision highp float;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uSkyTint;
uniform vec3 uSunColor;
uniform float uRadius;
uniform vec3 uCenter;
uniform float uOpacity;
varying vec2 vXZ;
${NOISE_GLSL}
void main() {
  vec2 d = vXZ - uCenter.xz;
  float r = length(d) / uRadius;
  if (r > 1.0) discard;
  float ripple = sin(r * 26.0 - uTime * 3.4) * 0.5 + 0.5;
  ripple *= 1.0 - smoothstep(0.2, 1.0, r);
  float n = fbm(vXZ * 0.55 + vec2(uTime * 0.12, -uTime * 0.08));
  vec3 nrm = normalize(vec3((n - 0.5) * 0.5 * (1.0 - r * 0.5), 1.0, (fbm(vXZ * 0.62 - vec2(uTime * 0.09, uTime * 0.11)) - 0.5) * 0.5 * (1.0 - r * 0.5)));
  vec3 viewDir = normalize(cameraPosition - vec3(vXZ.x, uCenter.y, vXZ.y));
  float fres = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 3.4);
  vec3 col = mix(uDeep, uSkyTint, clamp(fres * 0.9, 0.05, 0.85));
  vec3 halfV = normalize(vec3(0.3, 0.85, 0.4) + viewDir);
  col += uSunColor * pow(max(dot(nrm, halfV), 0.0), 120.0) * 0.8;
  float foam = (1.0 - smoothstep(0.60, 0.99, r)) * (0.25 + 0.55 * ripple);
  foam += smoothstep(0.90, 1.0, r) * 0.20 * (0.4 + 0.6 * fbm(vXZ * 2.4 + uTime * 0.6));
  col = mix(col, vec3(0.78, 0.86, 0.88), clamp(foam, 0.0, 1.0) * 0.45);
  float a = (1.0 - smoothstep(0.90, 1.0, r)) * uOpacity;
  gl_FragColor = vec4(col, a);
}
`;

const STREAM_VERT = `
varying vec2 vUv;
varying float vEdge;
attribute float aEdge;
void main() {
  vUv = uv;
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const STREAM_FRAG = `
precision highp float;
uniform float uTime;
uniform vec3 uSkyTint;
uniform vec3 uSunColor;
varying vec2 vUv;
varying float vEdge;
${NOISE_GLSL}
void main() {
  float flow = fbm(vec2(vUv.x * 5.0, vUv.y * 26.0 - uTime * 2.6));
  float flow2 = fbm(vec2(vUv.x * 12.0 + 3.0, vUv.y * 60.0 - uTime * 4.2));
  float body = smoothstep(0.3, 0.75, flow * 0.6 + flow2 * 0.5);
  float edge = smoothstep(0.0, 0.22, vEdge) * (1.0 - smoothstep(0.78, 1.0, vEdge));
  float a = (0.26 + body * 0.40) * edge;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.10, 0.24, 0.26), uSkyTint, 0.42 + body * 0.30);
  col = mix(col, uSunColor, 0.14 * body);
  col += vec3(0.26) * pow(body, 3.0);
  gl_FragColor = vec4(col, a);
}
`;

const MIST_VERT = `
attribute vec3 iSeed;
attribute float iScale;
uniform float uTime;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = iSeed.z;
  float life = fract(uTime * iSeed.y + iSeed.x);
  vLife = life;
  vec3 center = vec3(
    iSeed.x * 6.0,
    iSeed.y * 7.0,
    iSeed.z * 4.0
  );
  center.x += sin(uTime * 0.5 + iSeed.x * 21.0) * 3.4 + life * 4.0;
  center.z += cos(uTime * 0.42 + iSeed.z * 17.0) * 3.2;
  center.y += life * 9.0;
  float scale = iScale * (0.3 + life * 1.35);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center + (right * position.x + up * position.y) * scale;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const MIST_FRAG = `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
void main() {
  float a = texture2D(uMap, vUv).a;
  a *= sin(vLife * 3.14159) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export class Water {
  constructor(terrain, seed = 5150) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.time = 0;
    this.skyTint = new THREE.Color(0xbfd2da);
    this.sunColor = new THREE.Color(0xfff4d8);
    this.night = 0;
  }

  _buildFall() {
    const top = SITE.fallTop;
    const bottom = SITE.fallBase;
    const drop = top.y - bottom.y;
    const U = 34, V = 40;
    const geo = new THREE.PlaneGeometry(1, 1, U, V);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const t = Math.pow(v, 0.82);
      const y = top.y - t * drop;
      const widen = 1 + t * 0.30;
      const arc = Math.pow(t, 0.7) * 2.6;
      pos.setXYZ(i, top.x + (u - 0.5) * (top.w + 1.5) * widen, y, top.z + arc);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSkyTint: { value: this.skyTint },
        uSunColor: { value: this.sunColor },
        uOpacity: { value: 0.78 }
      },
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 4;
    this.fallMat = mat;
    this.group.add(mesh);

    const lipGeo = new THREE.PlaneGeometry(top.w + 3, 6, 12, 6);
    const lp = lipGeo.attributes.position;
    const luv = lipGeo.attributes.uv;
    for (let i = 0; i < lp.count; i++) {
      const u = luv.getX(i), v = luv.getY(i);
      lp.setXYZ(i, top.x + (u - 0.5) * (top.w + 1.5), top.y + 0.25 - v * 0.6, top.z + 0.9 - v * 2.6);
    }
    lp.needsUpdate = true;
    lipGeo.computeVertexNormals();
    const lipMat = mat.clone();
    lipMat.uniforms = THREE.UniformsUtils.clone(mat.uniforms);
    lipMat.uniforms.uTime = mat.uniforms.uTime;
    lipMat.uniforms.uSkyTint = mat.uniforms.uSkyTint;
    lipMat.uniforms.uSunColor = mat.uniforms.uSunColor;
    lipMat.uniforms.uOpacity = { value: 1.0 };
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.rotation.x = -Math.PI / 2;
    lip.renderOrder = 3;
    this.group.add(lip);
    this.lipMat = lipMat;
  }

  _buildPool() {
    const y = SITE.fallBase.y - 1.05;
    const geo = new THREE.CircleGeometry(13, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: PIGMENT.jade.clone().multiplyScalar(0.55) },
        uSkyTint: { value: this.skyTint },
        uSunColor: { value: this.sunColor },
        uRadius: { value: 13 },
        uCenter: { value: new THREE.Vector3(SITE.fallBase.x, y, SITE.fallBase.z + 2.5) },
        uOpacity: { value: 0.88 }
      },
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.poolMat = mat;
  }

  _buildStream() {
    const positions = [];
    const uvs = [];
    const edges = [];
    const indices = [];
    const path = RAVINE.filter((p) => p.z >= SITE.fallBase.z - 1);
    let vi = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const wA = 5.2;
      const wB = 5.2;
      positions.push(a.x - wA, a.y + 0.22, a.z, a.x + wA, a.y + 0.22, a.z, b.x - wB, b.y + 0.22, b.z, b.x + wB, b.y + 0.22, b.z);
      edges.push(0, 1, 0, 1);
      uvs.push(0, i / (path.length - 1), 1, i / (path.length - 1), 0, (i + 1) / (path.length - 1), 1, (i + 1) / (path.length - 1));
      indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
      vi += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    geo.setIndex(indices);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSkyTint: { value: this.skyTint },
        uSunColor: { value: this.sunColor }
      },
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.streamMat = mat;
  }

  _buildMist() {
    const COUNT = 26;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    const seed = new Float32Array(COUNT * 3);
    const scale = new Float32Array(COUNT);
    const rng = rngFrom(31337);
    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      seed[i * 3] = rng();
      seed[i * 3 + 1] = 0.045 + rng() * 0.05;
      seed[i * 3 + 2] = rng();
      scale[i] = 2.6 + rng() * 4.6;
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scale, 1));
    geo.instanceCount = COUNT;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: makePuffTextureShared() },
        uColor: { value: new THREE.Color(0xdfeaef) },
        uOpacity: { value: 0.2 }
      },
      vertexShader: MIST_VERT,
      fragmentShader: MIST_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false
    });
    this.mist = new THREE.Mesh(geo, mat);
    this.mist.position.set(SITE.fallBase.x, SITE.fallBase.y - 0.6, SITE.fallBase.z + 3.4);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 8;
    this.group.add(this.mist);
    this.mistMat = mat;
  }

  _buildGorgeRiver() {
    const positions = [];
    const uvs = [];
    const edges = [];
    const indices = [];
    let vi = 0;
    const t = this.terrain;
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const xa = -210 + (i / steps) * 420;
      const xb = -210 + ((i + 1) / steps) * 420;
      const ca = t.gorgeCenterZ(xa);
      const cb = t.gorgeCenterZ(xb);
      const ya = t.gorgeHalfWidth(xa) * 0.42;
      const yb = t.gorgeHalfWidth(xb) * 0.42;
      const ha = t.height(xa, ca);
      const hb = t.height(xb, cb);
      positions.push(xa, ha + 0.18, ca - ya, xa, ha + 0.18, ca + ya, xb, hb + 0.18, cb - yb, xb, hb + 0.18, cb + yb);
      edges.push(0, 1, 0, 1);
      uvs.push(0, i * 0.12, 1, i * 0.12, 0, (i + 1) * 0.12, 1, (i + 1) * 0.12);
      indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
      vi += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    geo.setIndex(indices);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSkyTint: { value: this.skyTint },
        uSunColor: { value: this.sunColor }
      },
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.gorgeMat = mat;
  }

  build() {
    this._buildFall();
    this._buildPool();
    this._buildStream();
    this._buildGorgeRiver();
    this._buildMist();
    return this.group;
  }

  update(dt, time, sky) {
    this.time = time;
    this.fallMat.uniforms.uTime.value = time;
    this.lipMat.uniforms.uTime.value = time;
    this.poolMat.uniforms.uTime.value = time;
    this.streamMat.uniforms.uTime.value = time;
    this.gorgeMat.uniforms.uTime.value = time;
    this.mistMat.uniforms.uTime.value = time;
    if (sky) {
      const s = sky.state;
      this.skyTint.copy(s.horizon).lerp(s.zenith, 0.45);
      this.sunColor.copy(s.light);
      this.fallMat.uniforms.uSkyTint.value.copy(this.skyTint);
      this.fallMat.uniforms.uSunColor.value.copy(this.sunColor);
      this.lipMat.uniforms.uSkyTint.value.copy(this.skyTint);
      this.lipMat.uniforms.uSunColor.value.copy(this.sunColor);
      this.poolMat.uniforms.uSkyTint.value.copy(this.skyTint);
      this.poolMat.uniforms.uSunColor.value.copy(this.sunColor);
      this.streamMat.uniforms.uSkyTint.value.copy(this.skyTint);
      this.streamMat.uniforms.uSunColor.value.copy(this.sunColor);
      this.gorgeMat.uniforms.uSkyTint.value.copy(this.skyTint);
      this.gorgeMat.uniforms.uSunColor.value.copy(this.sunColor);
      this.mistMat.uniforms.uColor.value.copy(this.skyTint).lerp(new THREE.Color(0xffffff), 0.55);
      this.night = s.star;
    }
  }
}
