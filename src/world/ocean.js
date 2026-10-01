import * as THREE from 'three';
import { PIGMENT } from '../core/palette.js';

const VERT = `
precision highp float;
uniform float uTime;
uniform vec2 uCenter;
uniform float uWindDir;
uniform float uChoppy;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vCrest;
varying float vDetail;

vec3 gerstner(vec2 p, vec2 d, float steep, float len, float spd, inout vec3 tang, inout vec3 bino) {
  float k = 6.28318530718 / len;
  float c = sqrt(9.8 / k);
  float f = k * (dot(d, p) - c * spd * uTime);
  float a = steep / k;
  tang += vec3(-d.x * d.x * (steep * sin(f)), d.x * (steep * cos(f)), -d.x * d.y * (steep * sin(f)));
  bino += vec3(-d.x * d.y * (steep * sin(f)), d.y * (steep * cos(f)), -d.y * d.y * (steep * sin(f)));
  return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
}

void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 p = wp.xz;

  float ang = uWindDir;
  vec2 d0 = vec2(cos(ang), sin(ang));
  vec2 d1 = vec2(cos(ang + 0.85), sin(ang + 0.85));
  vec2 d2 = vec2(cos(ang - 1.15), sin(ang - 1.15));
  vec2 d3 = vec2(cos(ang + 2.25), sin(ang + 2.25));
  vec2 d4 = vec2(cos(ang - 2.6), sin(ang - 2.6));

  float camDist = length(wp.xz - cameraPosition.xz);
  float detail = 1.0 - smoothstep(340.0, 1500.0, camDist);
  float mid = 1.0 - smoothstep(900.0, 3400.0, camDist);

  vec3 tang = vec3(1.0, 0.0, 0.0);
  vec3 bino = vec3(0.0, 0.0, 1.0);
  vec3 off = vec3(0.0);
  off += gerstner(p, d0, 0.30 * uChoppy, 142.0, 1.0, tang, bino);
  off += gerstner(p, d1, 0.22 * uChoppy * mid, 84.0, 1.15, tang, bino);
  off += gerstner(p, d2, 0.16 * uChoppy * detail, 51.0, 1.3, tang, bino);
  off += gerstner(p, d3, 0.10 * uChoppy * detail, 29.0, 1.5, tang, bino);
  off += gerstner(p, d4, 0.06 * uChoppy * detail, 16.0, 1.8, tang, bino);
  off.y *= mix(0.45, 1.0, mid);

  wp += off;
  vWorld = wp;
  vNormalW = normalize(cross(bino, tang));
  vCrest = off.y;
  vDetail = detail;

  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform float uTime;
uniform sampler2D uMask;
uniform float uMaskExtent;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunPower;
uniform float uFoamAmount;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vCrest;
varying float vDetail;

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

void main() {
  vec2 uv = vWorld.xz / uMaskExtent + 0.5;
  float inMask = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float landH = -14.0;
  if (inMask > 0.5) {
    vec2 tx = 1.5 / vec2(textureSize(uMask, 0));
    float m = texture2D(uMask, uv).r * 0.36
            + texture2D(uMask, uv + vec2(tx.x, 0.0)).r * 0.16
            + texture2D(uMask, uv - vec2(tx.x, 0.0)).r * 0.16
            + texture2D(uMask, uv + vec2(0.0, tx.y)).r * 0.16
            + texture2D(uMask, uv - vec2(0.0, tx.y)).r * 0.16;
    landH = m * 14.0 - 14.0;
  }
  float depth = max(0.0, -landH);

  vec2 p = vWorld.xz;
  float n1 = vnoise(p * 0.11 + vec2(uTime * 0.10, uTime * 0.06));
  float n2 = vnoise(p * 0.38 - vec2(uTime * 0.19, uTime * 0.09));
  float n3 = vnoise(p * 1.25 + vec2(uTime * 0.31, -uTime * 0.22));
  vec3 ripple = vec3(
    (n1 - 0.5) * 0.42 + (n2 - 0.5) * 0.26,
    0.0,
    (n2 - 0.5) * 0.42 + (n3 - 0.5) * 0.26
  );
  vec3 nrm = normalize(vNormalW + ripple * 0.5 * vDetail);
  nrm = normalize(mix(nrm, vec3(0.0, 1.0, 0.0), smoothstep(9.0, 40.0, depth) * 0.45));

  vec3 viewDir = normalize(cameraPosition - vWorld);
  // 菲涅尔（天空反射）用平滑宏观法线，细节法线只用于太阳高光，
  // 否则波纹会把整片海面按 4.6 次幂推向天空色，形成苍白大理石纹。
  vec3 nrmMacro = normalize(mix(vNormalW, nrm, 0.30));
  float fres = pow(1.0 - clamp(dot(nrmMacro, viewDir), 0.0, 1.0), 4.6);
  fres = mix(0.015, 0.55, fres);

  vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(reflect(-viewDir, nrmMacro).y, 0.0, 1.0) * 0.75 + 0.2);

  vec3 water = mix(uShallow, uDeep, smoothstep(0.10, 2.4, depth));
  water = mix(water, uShallow * 0.94, smoothstep(1.10, 0.06, depth) * 0.42);

  vec3 col = mix(water, sky, fres * 0.40);

  vec3 halfV = normalize(uSunDir + viewDir);
  float viewDist = length(vWorld - cameraPosition);
  float specLod = 1.0 - smoothstep(180.0, 900.0, viewDist);
  float spec = pow(max(dot(nrm, halfV), 0.0), 420.0);
  float sparkle = pow(max(dot(nrm, halfV), 0.0), 1600.0) * step(0.945, n3) * 0.85 * vDetail;
  col += uSunColor * (spec * 1.1 * mix(0.18, 1.0, specLod) + sparkle * specLod) * uSunPower;

  float shoreFoam = (1.0 - smoothstep(0.0, 0.38, depth)) * smoothstep(-0.06, 0.10, depth);
  float band = 0.55 + 0.45 * sin(depth * 5.0 - uTime * 1.2 + n1 * 4.0);
  shoreFoam *= mix(0.42, 1.0, band);
  shoreFoam += (1.0 - smoothstep(0.0, 0.16, depth)) * 0.12;
  float crestFoam = smoothstep(3.35, 4.2, vCrest) * smoothstep(0.80, 0.97, n2 * 0.6 + n3 * 0.5) * vDetail;
  float foam = clamp(shoreFoam * 0.55 + crestFoam * 0.26, 0.0, 1.0) * uFoamAmount;
  foam *= smoothstep(0.40, 0.78, n1 * 0.5 + n2 * 0.55 + n3 * 0.45);

  vec3 foamCol = vec3(0.74, 0.81, 0.84) * (0.55 + uSunPower * 0.18);
  col = mix(col, foamCol, foam * 0.75);

  float alpha = mix(1.0, 0.95, smoothstep(2.2, 0.15, depth));
  alpha = mix(alpha, 1.0, foam);
  alpha = mix(alpha, 1.0, smoothstep(600.0, 2400.0, length(vWorld.xz - cameraPosition.xz)));
  alpha = max(alpha, smoothstep(1400.0, 3400.0, length(vWorld.xz - cameraPosition.xz)));

  gl_FragColor = vec4(col, alpha);
}
`;

function radialPlane(size, rings, segments, power) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rings; r++) {
    const rt = r / rings;
    const rad = Math.pow(rt, power) * size;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class Ocean {
  constructor(terrain) {
    this.group = new THREE.Group();
    this.group.name = 'ocean';
    this.terrain = terrain;

    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uWindDir: { value: 0.7 },
      uChoppy: { value: 1.0 },
      uMask: { value: terrain.maskTexture },
      uMaskExtent: { value: terrain.size },
      uDeep: { value: PIGMENT.seaDeep.clone() },
      uShallow: { value: PIGMENT.seaShallow.clone() },
      uSkyHorizon: { value: new THREE.Color(0xbcd8e0) },
      uSkyZenith: { value: new THREE.Color(0x2c74ad) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.6) },
      uSunColor: { value: new THREE.Color(0xfff4d8) },
      uSunPower: { value: 1 },
      uFoamAmount: { value: 0.44 }
    };

    const geo = radialPlane(5200, 220, 140, 2.9);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: false
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.receiveShadow = false;
    this.group.add(this.mesh);

    this.abyss = new THREE.Mesh(
      new THREE.CircleGeometry(5200, 64),
      new THREE.MeshBasicMaterial({ color: PIGMENT.seaDeep.clone(), fog: false, depthWrite: false })
    );
    this.abyss.rotation.x = -Math.PI / 2;
    this.abyss.position.y = -3.2;
    this.abyss.renderOrder = -20;
    this.group.add(this.abyss);
  }

  update(dt, time, camera, sky) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
    this.mesh.position.set(camera.position.x, 0, camera.position.z);
    this.abyss.position.x = camera.position.x;
    this.abyss.position.z = camera.position.z;
    if (sky) {
      this.uniforms.uSkyHorizon.value.copy(sky.state.horizon);
      this.uniforms.uSkyZenith.value.copy(sky.state.zenith);
      this.uniforms.uSunDir.value.copy(sky.sunDir);
      this.uniforms.uSunColor.value.copy(sky.state.light);
      this.uniforms.uSunPower.value = Math.max(0.06, sky.state.intensity * 0.55);
      this.abyss.material.color.copy(PIGMENT.seaDeep).lerp(sky.state.fog, 0.14);
    }
  }
}
