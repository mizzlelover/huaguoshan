import * as THREE from 'three';
import { Noise, rngFrom, clamp01, smoothstep, lerp, TAU } from '../core/noise.js';
import { MAT, transformed, mergeGeometries, toFlat } from './kit.js';
import { SITE } from './terrain.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function place(mesh, i, x, y, z, ry, scale, tiltX = 0, tiltZ = 0) {
  _e.set(tiltX, ry, tiltZ);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

/** 按坡度/海拔/离中心距离筛选可种植点 */
function scatter(terrain, noise, opts) {
  const {
    cx, cz, radius, count, seed,
    minH = 0, maxH = 200, maxSlope = 0.5,
    clumping = 0.55, innerBias = 0.35, tries = count * 34
  } = opts;
  const rng = rngFrom(seed);
  const out = [];
  for (let i = 0; i < tries && out.length < count; i++) {
    const a = rng() * TAU;
    const r = radius * Math.pow(rng(), innerBias);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const h = terrain.height(x, z);
    if (h < minH || h > maxH) continue;
    const sl = terrain.slope(x, z);
    if (sl > maxSlope) continue;
    const clump = noise.fbm2(x * 0.021 + seed, z * 0.021 - seed, 3);
    if (clump < clumping) continue;
    out.push({ x, z, y: h, ry: rng() * TAU, k: 0.78 + rng() * 0.46, sl });
  }
  return out;
}

function pineTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.34, 0.62, 9.5, 6, 1);
  g.translate(0, 4.75, 0);
  return toFlat(g);
}

function pineCanopyGeo() {
  const parts = [];
  const tiers = [
    { y: 5.4, r: 4.5, h: 5.0 },
    { y: 8.0, r: 3.6, h: 4.4 },
    { y: 10.4, r: 2.6, h: 3.8 },
    { y: 12.6, r: 1.5, h: 3.0 }
  ];
  for (const t of tiers) {
    const c = new THREE.ConeGeometry(t.r, t.h, 7, 1);
    c.translate(0, t.y + t.h * 0.5 - 1.2, 0);
    parts.push(toFlat(c));
  }
  return mergeGeometries(parts);
}

function broadTrunkGeo(h, r) {
  const g = new THREE.CylinderGeometry(r * 0.62, r, h, 6, 2);
  g.translate(0, h * 0.5, 0);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lean = (v.y / h) * (v.y / h);
    pos.setXYZ(i, v.x + lean * 0.5, v.y, v.z - lean * 0.34);
  }
  pos.needsUpdate = true;
  return toFlat(g);
}

function blobGeo(radius, detail, squash = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.scale(1, squash, 1);
  return toFlat(g);
}

function bambooGeo(h) {
  const g = new THREE.CylinderGeometry(0.13, 0.2, h, 5, 6);
  g.translate(0, h * 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const r = 1 + Math.sin(y * 1.9) * 0.10;
    pos.setX(i, pos.getX(i) * r);
    pos.setZ(i, pos.getZ(i) * r);
  }
  pos.needsUpdate = true;
  return toFlat(g);
}

function bambooLeavesGeo(h) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const q = new THREE.PlaneGeometry(2.6, 0.72);
    q.rotateX(-0.5);
    q.translate(1.1, h - 0.6, 0);
    q.rotateY(a);
    parts.push(toFlat(q));
  }
  return mergeGeometries(parts);
}

function bananaLeafGeo(len, wide) {
  const g = new THREE.PlaneGeometry(wide, len, 2, 5);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y + len * 0.5) / len;
    const taper = Math.sin(t * Math.PI) * 0.85 + 0.15;
    const droop = (1 - t) * (1 - t) * len * 0.42;
    v.x *= taper;
    v.z += droop;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.translate(0, len * 0.5, 0);
  return toFlat(g);
}

function tuftGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    const b = new THREE.ConeGeometry(0.34, 1.5, 4, 1);
    b.translate(0, 0.75, 0);
    b.rotateX(0.34);
    b.rotateY(a);
    parts.push(toFlat(b));
  }
  return mergeGeometries(parts);
}

export class Flora {
  constructor(terrain, seed = 2024) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.group = new THREE.Group();
    this.group.name = 'flora';
    this.time = 0;
    this.sway = [];
  }

  _pine(points, tag = 'pine') {
    if (!points.length) return;
    const trunk = new THREE.InstancedMesh(pineTrunkGeo(), MAT.bark, points.length);
    const canopy = new THREE.InstancedMesh(pineCanopyGeo(), MAT.pineNeedle, points.length);
    trunk.name = `${tag}.trunk`;
    canopy.name = `${tag}.canopy`;
    trunk.castShadow = canopy.castShadow = true;
    canopy.receiveShadow = true;
    points.forEach((p, i) => {
      const k = p.k;
      place(trunk, i, p.x, p.y - 0.4, p.z, p.ry, k, 0, (p.sl - 0.2) * 0.16);
      place(canopy, i, p.x, p.y - 0.4, p.z, p.ry + i * 0.21, k * lerp(0.85, 1.15, (i % 5) / 5));
    });
    this.group.add(trunk, canopy);
  }

  _broad(points, trunkGeo, canopyGeo, canopyMat, fruitMat, fruitChance, tag = 'broad') {
    if (!points.length) return;
    const n = points.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, MAT.bark, n);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, n);
    trunks.name = `${tag}.trunk`;
    canopies.name = `${tag}.canopy`;
    trunks.castShadow = canopies.castShadow = true;
    canopies.receiveShadow = true;
    points.forEach((p, i) => {
      const k = p.k;
      place(trunks, i, p.x, p.y - 0.3, p.z, p.ry, k, (p.sl - 0.25) * 0.12, 0);
      place(canopies, i, p.x, p.y - 0.3, p.z, p.ry + i * 0.37, k, 0, 0);
    });
    this.group.add(trunks, canopies);

    if (!fruitMat || !fruitChance) return;
    const fruitGeo = blobGeo(0.42, 0, 1);
    const fruit = new THREE.InstancedMesh(fruitGeo, fruitMat, n);
    const rng = rngFrom(7717);
    const m = new THREE.Matrix4();
    let used = 0;
    for (let i = 0; i < n; i++) {
      if (rng() > fruitChance) continue;
      const p = points[i];
      const a = rng() * TAU;
      const r = 1.2 + rng() * 2.2;
      _p.set(p.x + Math.cos(a) * r, p.y + (3.4 + rng() * 2.6) * p.k, p.z + Math.sin(a) * r);
      _q.setFromEuler(_e.set(0, rng() * TAU, 0));
      _s.setScalar(p.k * (0.7 + rng() * 0.6));
      m.compose(_p, _q, _s);
      fruit.setMatrixAt(used++, m);
    }
    fruit.count = used;
    fruit.name = `${tag}.fruit`;
    fruit.castShadow = true;
    this.group.add(fruit);
  }

  _bamboo(points, tag = 'bamboo') {
    if (!points.length) return;
    const n = points.length;
    const rng = rngFrom(5150);
    const stalks = new THREE.InstancedMesh(bambooGeo(11), MAT.bambooStalk, n);
    const leaves = new THREE.InstancedMesh(bambooLeavesGeo(11), MAT.leaf, n);
    stalks.name = `${tag}.stalk`;
    leaves.name = `${tag}.leaf`;
    stalks.castShadow = leaves.castShadow = true;
    points.forEach((p, i) => {
      const h = 0.8 + rng() * 0.7;
      place(stalks, i, p.x, p.y - 0.2, p.z, p.ry, p.k * h, (p.sl - 0.2) * 0.1, 0);
      place(leaves, i, p.x, p.y - 0.2, p.z, p.ry + i * 0.4, p.k * h, 0, 0);
    });
    this.group.add(stalks, leaves);
  }

  _banana(points, tag = 'banana') {
    if (!points.length) return;
    const rng = rngFrom(3391);
    const leafGeo = bananaLeafGeo(6.4, 2.3);
    const plants = new THREE.InstancedMesh(leafGeo, MAT.bananaLeaf, points.length * 5);
    const stems = new THREE.InstancedMesh(
      toFlat(new THREE.CylinderGeometry(0.42, 0.6, 2.2, 6, 1)),
      MAT.bark, points.length
    );
    plants.name = `${tag}.leaf`;
    stems.name = `${tag}.stem`;
    plants.castShadow = true;
    stems.castShadow = true;
    let li = 0;
    points.forEach((p, i) => {
      place(stems, i, p.x, p.y, p.z, p.ry, p.k, 0, 0);
      const blades = 5;
      for (let b = 0; b < blades; b++) {
        const a = p.ry + (b / blades) * TAU + rng() * 0.4;
        const tilt = 0.55 + rng() * 0.5;
        _e.set(tilt, a, 0);
        _q.setFromEuler(_e);
        _p.set(p.x, p.y + 2.1 * p.k, p.z);
        _s.setScalar(p.k * (0.82 + rng() * 0.4));
        _m.compose(_p, _q, _s);
        plants.setMatrixAt(li++, _m);
      }
    });
    plants.count = li;
    this.group.add(stems, plants);
  }

  _tufts(tag = 'tuft') {
    const pts = scatter(this.terrain, this.noise, {
      cx: 0, cz: 40, radius: 190, count: 620, seed: 4242,
      minH: 3, maxH: 98, maxSlope: 0.64, clumping: 0.12, innerBias: 0.6
    });
    if (!pts.length) return;
    const mesh = new THREE.InstancedMesh(tuftGeo(), MAT.leaf, pts.length);
    mesh.name = tag;
    mesh.receiveShadow = true;
    pts.forEach((p, i) => {
      place(mesh, i, p.x, p.y - 0.2, p.z, p.ry, p.k * 1.5, 0, 0);
    });
    this.group.add(mesh);
  }

  build() {
    const t = this.terrain;

    this._pine(scatter(t, this.noise, {
      cx: -6, cz: -20, radius: 165, count: 210, seed: 11,
      minH: 32, maxH: 116, maxSlope: 0.56, clumping: 0.33
    }), 'pine.main');

    this._pine(scatter(t, this.noise, {
      cx: 78, cz: -40, radius: 96, count: 74, seed: 17,
      minH: 24, maxH: 96, maxSlope: 0.54, clumping: 0.37
    }), 'pine.outer');

    this._broad(
      scatter(t, this.noise, {
        cx: SITE.peach.x, cz: SITE.peach.z, radius: 52, count: 86, seed: 23,
        minH: 54, maxH: 126, maxSlope: 0.52, clumping: 0.28
      }),
      broadTrunkGeo(4.6, 0.52),
      mergeGeometries([blobGeo(4.1, 1, 0.82), transformed(blobGeo(2.9, 1, 0.86), [2.6, 1.5, 0.9], [0, 0.7, 0], [1, 1, 1])]),
      MAT.peachBlossom, MAT.peachDeep, 0.55, 'peach'
    );

    this._bamboo(scatter(t, this.noise, {
      cx: SITE.bamboo.x, cz: SITE.bamboo.z, radius: 62, count: 240, seed: 29,
      minH: 27, maxH: 100, maxSlope: 0.50, clumping: 0.24
    }), 'bamboo');

    this._banana(scatter(t, this.noise, {
      cx: SITE.banana.x, cz: SITE.banana.z, radius: 44, count: 34, seed: 31,
      minH: 21, maxH: 78, maxSlope: 0.46, clumping: 0.22
    }), 'banana');

    this._tufts('tuft');

    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.frustumCulled = false;
    });
    return this.group;
  }

  update(dt) {
    this.time += dt;
  }
}
