import * as THREE from 'three';
import { Noise, rngFrom, clamp01, smoothstep, lerp, TAU } from '../core/noise.js';
import { PIGMENT } from '../core/palette.js';
import { SITE } from './terrain.js';
import { toFlat, MAT, mergeGeometries, transformed, noiseDisplace } from './kit.js';

export function makeRockGeometry(noise, seed, opts = {}) {
  const {
    detail = 1, radius = 1, height = 1,
    rough = 0.34, freq = 1.1, squash = 1, ridge = 0.4
  } = opts;
  let geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = noise.fbm3(v.x * freq + seed, v.y * freq + seed * 1.3, v.z * freq - seed, 4);
    const n2 = noise.ridged2(v.x * freq * 2.2 + seed, v.z * freq * 2.2 - seed, 3);
    const k = 1 + n1 * rough + (n2 - 0.5) * ridge * 0.6;
    v.multiplyScalar(k);
    v.y *= height;
    v.x *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  const flat = toFlat(geo);
  flat.computeVertexNormals();
  geo.dispose();
  return flat;
}

export function makeSpireGeometry(noise, seed, opts = {}) {
  const { height = 30, radius = 6, segments = 9, rings = 8, lean = 0.12 } = opts;
  const rng = rngFrom(Math.floor(seed * 100000));
  const positions = [];
  const indices = [];
  const twist = (rng() - 0.5) * 0.8;
  const leanX = (rng() - 0.5) * lean * height;
  const leanZ = (rng() - 0.5) * lean * height;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = t * height;
    const rad = radius * Math.pow(1 - t, 0.78) * (1 + 0.22 * Math.sin(t * 9 + seed * 5));
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * TAU + t * twist;
      const jitter = 1 + noise.noise2(s * 0.8 + seed * 3, t * 4.1) * 0.28;
      positions.push(
        Math.cos(a) * rad * jitter + leanX * t * t,
        y,
        Math.sin(a) * rad * jitter + leanZ * t * t
      );
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const flat = toFlat(geo);
  flat.computeVertexNormals();
  geo.dispose();
  return flat;
}

export class Rocks {
  constructor(terrain, seed = 777) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.rng = rngFrom(seed);
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    this.time = 0;
  }

  addSpires() {
    const t = this.terrain;
    const specs = [
      { x: -18, z: 16, h: 22, r: 9.5 },
      { x: 22, z: 8, h: 17, r: 8.0 },
      { x: -34, z: -22, h: 26, r: 10.5 },
      { x: 40, z: -18, h: 19, r: 8.8 },
      { x: -46, z: 34, h: 18, r: 8.5 },
      { x: 52, z: 30, h: 15, r: 7.6 }
    ];
    const geos = [];
    specs.forEach((s, i) => {
      const geo = makeSpireGeometry(this.noise, i * 1.7 + 0.3, {
        height: s.h, radius: s.r, segments: 10, rings: 7
      });
      const y = t.height(s.x, s.z) - 2.5;
      geos.push(transformed(geo, [s.x, y, s.z], [0, i * 0.7, 0], [1, 1, 1]));
      geo.dispose();
    });
    const merged = mergeGeometries(geos);
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      color: 0x74766f, roughness: 0.96, metalness: 0, flatShading: true
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    geos.forEach((g) => g.dispose());
    return mesh;
  }

  addBoulders() {
    const t = this.terrain;
    const rng = this.rng;
    const COUNT = 190;
    const geo = makeRockGeometry(this.noise, 4.1, { detail: 1, rough: 0.36, freq: 1.3, ridge: 0.5 });
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, flatShading: true }),
      COUNT
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    let placed = 0;
    let guard = 0;
    while (placed < COUNT && guard < COUNT * 24) {
      guard++;
      const ang = rng() * TAU;
      const rad = 14 + Math.pow(rng(), 0.62) * 176;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const h = t.height(x, z);
      if (h < 0.4 || h > 104) continue;
      const slope = t.slope(x, z);
      const preferSlope = smoothstep(0.05, 0.35, slope) * smoothstep(0.7, 0.3, slope);
      const nearShore = smoothstep(26, 3, Math.abs(h - 2.5)) * 0.8;
      if (rng() > 0.18 + preferSlope * 0.72 + nearShore * 0.4) continue;
      const scale = 0.8 + Math.pow(rng(), 2.1) * 5.2;
      e.set(rng() * TAU, rng() * TAU, rng() * TAU);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(x, h - scale * 0.34, z),
        q,
        new THREE.Vector3(scale, scale * (0.6 + rng() * 0.5), scale * (0.8 + rng() * 0.4))
      );
      mesh.setMatrixAt(placed, m);
      const tone = 0.78 + rng() * 0.44;
      c.setHex(0x7b7d76).lerp(PIGMENT.graniteLight, rng() * 0.7).multiplyScalar(tone);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    return mesh;
  }

  addShoreRocks() {
    const t = this.terrain;
    const rng = this.rng;
    const geos = [];
    for (let i = 0; i < 26; i++) {
      const ang = rng() * TAU;
      const rad = 162 + rng() * 22;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const h = t.height(x, z);
      if (h > 4 || h < -0.4) continue;
      const g = makeRockGeometry(this.noise, i * 2.7 + 11, {
        detail: 1, radius: 2.4 + rng() * 4.2, height: 0.5 + rng() * 0.5,
        rough: 0.4, freq: 0.9, ridge: 0.6
      });
      geos.push(transformed(g, [x, h - 0.6, z], [rng() * 0.4, rng() * TAU, rng() * 0.4], [1, 1, 1]));
      g.dispose();
    }
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), MAT.graniteDark);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    geos.forEach((g) => g.dispose());
    return mesh;
  }

  buildCaveRoof() {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const n = this.noise.fbm3(v.x * 2.4 + 5, v.y * 2.4, v.z * 2.4, 4);
      const r = 1 + n * 0.14;
      v.multiplyScalar(r);
      v.x *= 31;
      v.y *= 27;
      v.z *= 29;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x3a3a38, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide
    }));
    mesh.position.set(SITE.chamber.x, 44, SITE.chamber.z);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildCavePortal() {
    const t = this.terrain;
    const z = 78.5;
    const x = SITE.caveMouth.x;
    const y = t.height(x, z);
    const parts = [];
    const w = 15.5;
    const h = 15;

    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      const px = x + Math.cos(a) * (w * 0.5 + 1.6);
      const py = y + 2 + Math.sin(a) * (h * 0.62);
      const g = new THREE.BoxGeometry(3.1, 2.6, 3.6);
      noiseDisplace(g, this.noise, 0.5, 0.7, i * 3.1);
      parts.push(transformed(g, [px, py, z], [0, 0, -a + Math.PI / 2], [1, 1, 1]));
      g.dispose();
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const g = new THREE.BoxGeometry(3.0, 2.7, 3.8);
        noiseDisplace(g, this.noise, 0.55, 0.6, i * 5.7 + side * 3);
        parts.push(transformed(g, [x + side * (w * 0.5 + 1.8), y + 0.6 + i * 2.6, z], [0, 0, (rngFrom(i * 3 + side)() - 0.5) * 0.2], [1, 1, 1]));
        g.dispose();
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({
      color: 0x84857c, roughness: 0.95, metalness: 0, flatShading: true
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    parts.forEach((g) => g.dispose());
    return { mesh, y, z, x, w, h };
  }

  buildWaterfallRocks() {
    const t = this.terrain;
    const parts = [];
    const top = SITE.fallTop;
    const base = SITE.fallBase;
    const halfW = top.w * 0.5 + 1.6;

    for (let i = 0; i < 11; i++) {
      const px = top.x - halfW + (i / 10) * halfW * 2;
      const pz = top.z - 0.8 + Math.sin(i * 0.8) * 0.5;
      const h = Math.max(46, t.height(px, pz + 1.2));
      const g = new THREE.BoxGeometry(2.9, 5.2 + (i % 3) * 1.0, 3.6);
      noiseDisplace(g, this.noise, 0.7, 0.45, i * 2.3);
      parts.push(transformed(g, [px, h - 1.4, pz], [0.06, (i % 2) * 0.16, 0], [1, 1, 1]));
      g.dispose();
    }
    for (const s2 of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const px = top.x + s2 * (halfW + 1.0 + i * 2.1);
        const pz = top.z - 0.4 + Math.cos(i * 1.2) * 0.8;
        const h = Math.max(45, t.height(px, pz));
        const g = new THREE.BoxGeometry(2.8, 6.5 + i * 0.8, 4.4);
        noiseDisplace(g, this.noise, 0.8, 0.4, i * 3.7 + s2 * 5);
        parts.push(transformed(g, [px, h - 0.6, pz], [0, s2 * 0.2, s2 * 0.05], [1, 1, 1]));
        g.dispose();
      }
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const rr = 3.4 + (i % 3) * 3.4;
      const px = base.x + Math.cos(a) * rr * 1.5;
      const pz = base.z + 2.0 + Math.sin(a) * rr;
      const h = Math.min(t.height(px, pz), base.y + 0.6);
      const s3 = 1.5 + (i % 3) * 1.1;
      const g = makeRockGeometry(this.noise, i * 4.1 + 21, {
        detail: 1, radius: s3, height: 0.85, rough: 0.45, freq: 0.9
      });
      parts.push(transformed(g, [px, h + s3 * 0.28, pz], [0, i * 0.9, 0], [1, 1, 1]));
      g.dispose();
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), MAT.graniteDark);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    parts.forEach((g) => g.dispose());
    return mesh;
  }

  build() {
    this.addSpires();
    this.addBoulders();
    this.addShoreRocks();
    this.buildWaterfallRocks();
    return this.group;
  }
}
