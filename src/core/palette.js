import * as THREE from 'three';
import { lerp, clamp01, smoothstep } from './noise.js';

const C = (hex) => new THREE.Color(hex);

export const PIGMENT = {
  azuriteDeep: C(0x1d4f6b),
  azurite: C(0x2f7597),
  azuriteLight: C(0x5f9fb6),
  indigo: C(0x3a5a78),
  malachiteDeep: C(0x2f6249),
  malachite: C(0x3f8a5c),
  malachiteLight: C(0x7cae8a),
  ochreDeep: C(0x5e4530),
  ochre: C(0x9c6b3e),
  ochreLight: C(0xc39a68),
  carmine: C(0xc1415c),
  carmineSoft: C(0xde7c8c),
  gamboge: C(0xe8b94a),
  silk: C(0xe8e1d2),
  ink: C(0x241f1c),
  inkWash: C(0x37474f),
  bone: C(0xb8ac95),
  slateDeep: C(0x24363e),
  slate: C(0x47606a),
  granite: C(0x70837f),
  graniteLight: C(0xb3b5a2),
  mossDeep: C(0x37573a),
  moss: C(0x54903f),
  mossLight: C(0x8cab5f),
  peach: C(0xf6b9cd),
  peachDeep: C(0xe886ac),
  bamboo: C(0x86a84e),
  bambooDeep: C(0x4d6f2e),
  pine: C(0x2f5540),
  pineLight: C(0x4c7d5a),
  seaDeep: C(0x0a2735),
  sea: C(0x155061),
  seaShallow: C(0x1c4f52),
  jade: C(0x2f8f7a),
  gold: C(0xf2c14e),
  cinnabar: C(0xc8342f),
  goldLeaf: C(0xd9a441)
};

export const SKY_KEYS = [
  {
    t: 0.0,
    zenith: C(0x0a1430),
    horizon: C(0x2b3b5c),
    sunTint: C(0xff9d6e),
    fog: C(0x243350),
    light: C(0x5f7cb8),
    ambient: C(0x2a3552),
    intensity: 0.35,
    star: 1.0
  },
  {
    t: 0.20,
    zenith: C(0x274a72),
    horizon: C(0xd39370),
    sunTint: C(0xff8f52),
    fog: C(0x8f7f92),
    light: C(0xffa469),
    ambient: C(0x6b6a86),
    intensity: 1.05,
    star: 0.12
  },
  {
    t: 0.32,
    zenith: C(0x22578a),
    horizon: C(0xa88b74),
    sunTint: C(0xffd9a0),
    fog: C(0xc9bfae),
    light: C(0xffd8a8),
    ambient: C(0x8e9fb4),
    intensity: 1.55,
    star: 0.0
  },
  {
    t: 0.50,
    zenith: C(0x0f4c85),
    horizon: C(0x6e9cb6),
    sunTint: C(0xfff4d8),
    fog: C(0xbfd2da),
    light: C(0xfff3da),
    ambient: C(0x9fbcd0),
    intensity: 2.0,
    star: 0.0
  },
  {
    t: 0.70,
    zenith: C(0x1d5282),
    horizon: C(0xa98a72),
    sunTint: C(0xffc47e),
    fog: C(0xcbb59e),
    light: C(0xffca8a),
    ambient: C(0x93979f),
    intensity: 1.6,
    star: 0.0
  },
  {
    t: 0.82,
    zenith: C(0x2a4472),
    horizon: C(0xc4794f),
    sunTint: C(0xff7a45),
    fog: C(0x8a6a74),
    light: C(0xff8a55),
    ambient: C(0x6b5a72),
    intensity: 1.0,
    star: 0.2
  },
  {
    t: 1.0,
    zenith: C(0x0a1430),
    horizon: C(0x2b3b5c),
    sunTint: C(0xff9d6e),
    fog: C(0x243350),
    light: C(0x5f7cb8),
    ambient: C(0x2a3552),
    intensity: 0.35,
    star: 1.0
  }
];

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

export function sampleSky(t) {
  t = ((t % 1) + 1) % 1;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) {
      a = SKY_KEYS[i];
      b = SKY_KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(1e-5, b.t - a.t);
  const k = clamp01((t - a.t) / span);
  const e = k * k * (3 - 2 * k);
  return {
    zenith: scratchA.copy(a.zenith).lerp(b.zenith, e).clone(),
    horizon: scratchB.copy(a.horizon).lerp(b.horizon, e).clone(),
    sunTint: a.sunTint.clone().lerp(b.sunTint, e),
    fog: a.fog.clone().lerp(b.fog, e),
    light: a.light.clone().lerp(b.light, e),
    ambient: a.ambient.clone().lerp(b.ambient, e),
    intensity: lerp(a.intensity, b.intensity, e),
    star: lerp(a.star, b.star, e)
  };
}

export const SUN_PATH = {
  elevation: (t) => Math.sin(t * Math.PI * 2 - Math.PI * 0.5) * 0.5 + 0.5,
  azimuth: (t) => t * Math.PI * 2 + 0.6
};

export const LAYER = {
  farMountains: 0,
  ocean: 1,
  terrain: 2,
  flora: 3,
  props: 4,
  life: 5
};

export const MOUNTAIN = {
  height: 118,
  baseRadius: 132,
  seaLevel: 0,
  summit: new THREE.Vector3(0, 118, 0),
  waterCurtainCave: new THREE.Vector3(4, 52, 74),
  bridge: { x: -78, z: 96 },
  peachGarden: { x: 86, z: 30, r: 46 },
  bambooGrove: { x: -18, z: -96, r: 54 },
  bannerPole: { x: -14, y: 124, z: -12 },
  stele: { x: 16, y: 34, z: 84 },
  gatePos: { x: 2, z: 112 }
};

export const TERRACE_MASKS = [
  { ...MOUNTAIN.peachGarden, levels: 5, levelHeight: 4.6, softness: 9 },
  { x: -74, z: 66, r: 26, levels: 3, levelHeight: 5.2, softness: 8 }
];

export const BIOME = {
  cliffThreshold: 0.42,
  mossSlopeMax: 0.62,
  shoreHeight: 3.4
};

export function gradeToward(color, target, amount) {
  return color.clone().lerp(target, smoothstep(0, 1, amount));
}
