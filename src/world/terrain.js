import * as THREE from 'three';
import { Noise, clamp, clamp01, smoothstep, lerp } from '../core/noise.js';
import { PIGMENT, TERRACE_MASKS } from '../core/palette.js';
import { toFlat } from './kit.js';

export const WORLD = {
  size: 480,
  segments: 224,
  seaLevel: 0,
  peakHeight: 118
};

const PROFILE = [
  [0, 118], [22, 116], [42, 110], [60, 99], [78, 86],
  [92, 73], [104, 60], [114, 47], [126, 35], [142, 22],
  [158, 10], [172, 1.5], [182, -6], [196, -19], [214, -38],
  [238, -56], [280, -68], [340, -76]
];

export const GORGE_Z = 108;
export const GORGE_FLOOR = 24;

export const RAVINE = [
  { x: 2, z: 120, w: 23, y: GORGE_FLOOR },
  { x: 2, z: 110, w: 20, y: 28.5 },
  { x: 2, z: 100, w: 16.5, y: 32 },
  { x: 2, z: 93, w: 14.5, y: 33.5 },
  { x: 2, z: 88, w: 14, y: 33.5 },
  { x: 2, z: 84.5, w: 14.5, y: 33.5 },
  { x: 2, z: 82, w: 19, y: 38 },
  { x: 2, z: 79.5, w: 25, y: 48 },
  { x: 2, z: 76, w: 27, y: 48 }
];

export const SITE = {
  chamber: { x: 2, z: 64, r: 20, floor: 48 },
  fallTop: { x: 2, z: 79.6, y: 48, w: 11 },
  fallBase: { x: 2, z: 84.0, y: 33.5, w: 12 },
  caveMouth: { x: 2, z: 77.5, y: 48 },
  bridge: { x: -34, z: GORGE_Z },
  gate: { x: 2, z: 128 },
  summit: { x: 0, z: 0, y: 118 },
  peach: { x: 88, z: 36 },
  bamboo: { x: -30, z: -100 },
  banana: { x: -86, z: 24 },
  beach: { x: 4, z: 158 }
};

function profileAt(r) {
  if (r <= PROFILE[0][0]) return PROFILE[0][1];
  const last = PROFILE[PROFILE.length - 1];
  if (r >= last[0]) return last[1] - (r - last[0]) * 0.14;
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, h0] = PROFILE[i];
    const [r1, h1] = PROFILE[i + 1];
    if (r >= r0 && r <= r1) {
      const t = (r - r0) / (r1 - r0);
      return lerp(h0, h1, t * t * (3 - 2 * t));
    }
  }
  return 0;
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
  t = clamp01(t);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

export class Terrain {
  constructor(seed = 20240915) {
    this.noise = new Noise(seed);
    this.size = WORLD.size;
    this.half = WORLD.size / 2;
    this.minY = Infinity;
    this.maxY = -Infinity;
    this._build();
  }

  _baseHeight(x, z) {
    const n = this.noise;
    const r = Math.hypot(x, z);
    const warp = 0.155 * n.fbm2(x * 0.0072 + 11.4, z * 0.0072 - 4.1, 4) + 0.055 * n.fbm2(x * 0.021, z * 0.021 + 9.7, 3);
    const rEff = r / (1 + warp);

    const raw = profileAt(rEff);
    const island = smoothstep(178, 152, rEff);
    let h = raw > 0 ? raw * lerp(0.05, 1.0, island) : raw;

    const shoulders = [
      { x: -74, z: 46, rx: 52, rz: 46, h: 26 },
      { x: 78, z: 40, rx: 56, rz: 50, h: 24 },
      { x: 6, z: -84, rx: 58, rz: 50, h: 28 },
      { x: -88, z: -46, rx: 44, rz: 40, h: 20 },
      { x: 92, z: -58, rx: 42, rz: 38, h: 17 },
      { x: 26, z: 78, rx: 30, rz: 26, h: 10 }
    ];
    for (const s of shoulders) {
      const d = Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz);
      if (d < 1) h += s.h * Math.pow(1 - d, 1.9) * island;
    }

    const cragMask = smoothstep(6, 40, h) * (1 - smoothstep(104, 116, h) * 0.55);
    h += (n.ridged2(x * 0.0128, z * 0.0128, 4, 2.09, 0.42) - 0.5) * 24 * cragMask;
    h += (n.ridged2(x * 0.0262 + 9, z * 0.0262 - 4, 3, 2.2, 0.40) - 0.5) * 8.5 * cragMask;
    h += n.ridged2(x * 0.041, z * 0.041, 2, 2.2, 0.38) * 4.2 * cragMask;
    h += n.fbm2(x * 0.031 + 5, z * 0.031 - 2, 4) * 8.5 * island;
    h += n.fbm2(x * 0.098, z * 0.098, 3) * 2.6 * island;
    h += n.fbm2(x * 0.31, z * 0.31, 2) * 0.85 * island;

    const shelfFade = smoothstep(-2, 6, h);
    h += n.fbm2(x * 0.02, z * 0.02, 3) * 3.0 * shelfFade;
    h += n.fbm2(x * 0.014 + 60, z * 0.014 - 30, 3) * 5.5 * (1 - shelfFade);
    h -= 2.0 * smoothstep(148, 176, rEff) * island;

    return h;
  }

  gorgeCenterZ(x) {
    return GORGE_Z + 15 * this.noise.fbm2(x * 0.0082 + 5.5, 2.2, 4) + 4.5 * this.noise.fbm2(x * 0.028, 8.1, 3);
  }

  gorgeHalfWidth(x) {
    return 14 + 5.5 * this.noise.fbm2(x * 0.013 - 3.3, 1.7, 3);
  }

  _carveGorge(x, z, h) {
    const cz = this.gorgeCenterZ(x);
    const w = this.gorgeHalfWidth(x);
    const d = Math.abs(z - cz);
    if (d > w) return h;
    const k = smoothstep(w, w * 0.14, d);
    const floorY = GORGE_FLOOR + 2.8 * this.noise.fbm2(x * 0.019, 4.4, 3) - 1.4 * (1 - d / w);
    const carved = lerp(h, floorY, k);
    return Math.min(h, carved);
  }

  _carveRavine(x, z, h) {
    let best = null;
    for (let i = 0; i < RAVINE.length - 1; i++) {
      const a = RAVINE[i];
      const b = RAVINE[i + 1];
      const s = segmentDistance(x, z, a.x, a.z, b.x, b.z);
      if (!best || s.d < best.d) {
        best = { ...s, a, b };
      }
    }
    if (!best) return h;
    const a = best.a, b = best.b;
    const rawD = best.d;
    const w = lerp(a.w, b.w, best.t) * (1 + 0.16 * this.noise.fbm2(x * 0.05, z * 0.05, 2));
    if (rawD > w) return h;
    const k = smoothstep(w, w * 0.16, rawD);
    const floorY = lerp(a.y, b.y, best.t) + 0.7 * this.noise.fbm2(x * 0.11, z * 0.11, 2);
    const shaped = lerp(floorY, floorY + 3.4, smoothstep(0.42, 1.0, rawD / w));
    return Math.min(h, lerp(h, shaped, k));
  }

  _carveChamber(x, z, h) {
    const c = SITE.chamber;
    const d = Math.hypot((x - c.x) * 0.86, z - c.z);
    const w = c.r;
    if (d > w) return h;
    const k = smoothstep(w, w * 0.12, d);
    const floorY = c.floor + 0.7 * this.noise.fbm2(x * 0.13, z * 0.13, 2);
    return Math.min(h, lerp(h, floorY, k));
  }

  _applyTerraces(x, z, h) {
    for (const m of TERRACE_MASKS) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d > m.r) continue;
      const edge = 1 - smoothstep(m.r * 0.6, m.r, d);
      const step = m.levelHeight;
      const q = Math.round(h / step) * step;
      h = lerp(h, Math.max(lerp(h, q, 0.85), h - 4.5), edge);
    }
    return h;
  }

  _carvePlazas(x, z, h) {
    const plaza = (cx, cz, rad, target, soft) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d > rad) return h;
      const k = smoothstep(rad, rad * soft, d);
      return lerp(h, Math.min(h, target), k);
    };
    let r = h;
    r = plaza(SITE.summit.x, SITE.summit.z, 11, 117.2, 0.45);
    r = plaza(-32, 128, 9, 47, 0.5);
    r = plaza(4, 158, 20, 6.5, 0.4);

    const pd = Math.hypot(x - SITE.fallBase.x, z - (SITE.fallBase.z + 2.5));
    if (pd < 17) {
      const k = smoothstep(17, 4, pd);
      r = lerp(r, Math.min(r, SITE.fallBase.y - 1.6), k);
    }
    return r;
  }

  height(x, z) {
    let h = this._baseHeight(x, z);
    h = this._carveGorge(x, z, h);
    h = this._carveRavine(x, z, h);
    h = this._applyTerraces(x, z, h);
    h = this._carvePlazas(x, z, h);
    return h;
  }

  normal(x, z, e = 1.0) {
    return new THREE.Vector3(
      this.height(x - e, z) - this.height(x + e, z),
      2 * e,
      this.height(x, z - e) - this.height(x, z + e)
    ).normalize();
  }

  slope(x, z) {
    return 1 - this.normal(x, z).y;
  }

  colorAt(x, z, h, slope, out) {
    const n = this.noise;
    const strataY = h + 5.0 * n.fbm2(x * 0.019, z * 0.019, 3) + 1.5 * n.fbm2(x * 0.072, z * 0.072, 2);
    const band = 0.5 + 0.5 * Math.sin(strataY * 0.40);
    const fine = 0.5 + 0.5 * Math.sin(strataY * 1.42 + 1.1);
    const bandMix = clamp01(band * 0.74 + fine * 0.26);

    const cool = PIGMENT.slate.clone().lerp(PIGMENT.slateDeep, clamp01(0.35 + 0.55 * n.fbm2(x * 0.014 + 3, z * 0.014, 3)));
    const warm = PIGMENT.granite.clone().lerp(PIGMENT.graniteLight, clamp01(0.3 + 0.6 * n.fbm2(x * 0.017 - 7, z * 0.017, 3)));
    const ochreMix = clamp01(n.fbm2(x * 0.0085 - 21, z * 0.0085 + 13, 3) * 1.35 - 0.52);
    const lightRock = warm.clone().lerp(PIGMENT.ochreLight, ochreMix * 0.20);
    out.copy(cool).lerp(lightRock, bandMix * 0.50 + 0.05);

    const striation = n.ridged2(x * 0.058, z * 0.058, 4);
    out.multiplyScalar(lerp(1.02, 0.76, smoothstep(0.38, 0.9, striation) * smoothstep(0.14, 0.5, slope)));

    const sunFace = clamp01(0.5 + 0.5 * n.fbm2(x * 0.006 - 40, z * 0.006, 2));
    out.lerp(PIGMENT.ochre, sunFace * 0.07 * smoothstep(0.25, 0.6, slope));

    const mossAmt =
      smoothstep(0.66, 0.26, slope) *
      smoothstep(114, 30, h) *
      clamp01(n.fbm2(x * 0.041 - 15, z * 0.041 + 4, 4) * 1.7 + 0.44);
    const green = PIGMENT.malachite.clone()
      .lerp(PIGMENT.moss, clamp01(0.4 + 0.6 * n.fbm2(x * 0.088, z * 0.088, 2)))
      .lerp(PIGMENT.malachiteLight, clamp01(n.fbm2(x * 0.16, z * 0.16, 2) * 0.8));
    out.lerp(green, mossAmt);

    const lichen = clamp01(n.fbm2(x * 0.052 + 21, z * 0.052 - 9, 3) * 1.7 - 0.72);
    out.lerp(PIGMENT.mossLight, lichen * 0.2 * smoothstep(0.18, 0.44, slope));

    const cz = this.gorgeCenterZ(x);
    const gorgeD = Math.abs(z - cz);
    const wet = smoothstep(this.gorgeHalfWidth(x) + 7, 2, gorgeD) * smoothstep(40, 26, h);
    out.lerp(PIGMENT.inkWash, wet * 0.55);

    const ravWet = 1 - smoothstep(4, 15, Math.hypot(x - 2, Math.max(0, z - 80)));
    out.lerp(PIGMENT.ink.clone().lerp(PIGMENT.inkWash, 0.4), clamp01(ravWet) * 0.42 * smoothstep(64, 40, h));

    const silt = smoothstep(-26, -2, h) * smoothstep(0.42, 0.14, slope);
    out.lerp(PIGMENT.slateDeep.clone().lerp(PIGMENT.inkWash, 0.45), silt * 0.85);
    const abyss = 1 - smoothstep(-30, -4, h);
    out.lerp(PIGMENT.seaDeep.clone().multiplyScalar(0.7), abyss * 0.7);

    const sand = smoothstep(-1.2, 0.6, h) * (1 - smoothstep(1.6, 4.6, h)) * smoothstep(0.44, 0.14, slope);
    out.lerp(PIGMENT.graniteLight.clone().lerp(PIGMENT.bone, 0.5), sand * 0.62);

    const crown = smoothstep(98, 116, h);
    out.lerp(PIGMENT.silk, crown * 0.26 * smoothstep(0.55, 0.22, slope));

    const qing = clamp01(0.10 + 0.16 * (1 - smoothstep(30, 118, h)));
    out.lerp(PIGMENT.malachiteDeep.clone().lerp(PIGMENT.slate, 0.45), qing);

    return out;
  }

  _build() {
    const S = WORLD.segments;
    const size = WORLD.size;
    const geo = new THREE.PlaneGeometry(size, size, S, S);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      if (h < this.minY) this.minY = h;
      if (h > this.maxY) this.maxY = h;
    }
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      this.colorAt(x, z, pos.getY(i), 1 - nrm.getY(i), c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const flat = toFlat(geo);
    flat.computeVertexNormals();
    geo.dispose();

    this.mesh = new THREE.Mesh(
      flat,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0.0,
        flatShading: true,
        dithering: true
      })
    );
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.geometry = flat;
    this._buildMask();
  }

  _buildMask() {
    const RES = 512;
    const data = new Uint8Array(RES * RES * 4);
    for (let j = 0; j < RES; j++) {
      const z = -this.half + (j / (RES - 1)) * this.size;
      for (let i = 0; i < RES; i++) {
        const x = -this.half + (i / (RES - 1)) * this.size;
        const h = this.height(x, z);
        const k = (j * RES + i) * 4;
        data[k] = Math.floor(clamp01((h + 14) / 14) * 255);
        data[k + 1] = Math.floor(clamp01(h / WORLD.peakHeight) * 255);
        data[k + 2] = Math.floor(clamp01(this.slope(x, z)) * 255);
        data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTexture = tex;
  }
}
