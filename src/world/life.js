import * as THREE from 'three';
import { Noise, rngFrom, clamp01, lerp, smoothstep, TAU } from '../core/noise.js';
import { MAT, toFlat, mergeGeometries, transformed } from './kit.js';
import { SITE } from './terrain.js';

const _v = new THREE.Vector3();

function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,235,1)');
  g.addColorStop(0.22, 'rgba(226,255,150,0.85)');
  g.addColorStop(0.55, 'rgba(150,220,70,0.22)');
  g.addColorStop(1.0, 'rgba(120,200,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 低多边形猴子：身、头、耳、脸、四肢、卷尾 */
function monkeyGeo(detail = 0) {
  const parts = [];
  // 躯干
  const body = new THREE.SphereGeometry(0.52, 7, 5);
  body.scale(1.0, 0.92, 1.25);
  body.translate(0, 0.62, 0);
  parts.push(toFlat(body));
  // 头
  const head = new THREE.SphereGeometry(0.34, 7, 5);
  head.scale(1.0, 0.94, 0.95);
  head.translate(0, 1.16, 0.30);
  parts.push(toFlat(head));
  // 口鼻
  const muzzle = new THREE.SphereGeometry(0.19, 6, 4);
  muzzle.scale(1.1, 0.8, 0.9);
  muzzle.translate(0, 1.10, 0.58);
  parts.push(toFlat(muzzle));
  // 耳
  for (const s of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.12, 5, 4);
    ear.scale(0.5, 1.15, 1);
    ear.translate(s * 0.32, 1.24, 0.28);
    parts.push(toFlat(ear));
  }
  // 前肢
  for (const s of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.10, 0.42, 2, 5);
    arm.rotateX(0.75);
    arm.translate(s * 0.34, 0.78, 0.22);
    parts.push(toFlat(arm));
  }
  // 后肢（蹲坐）
  for (const s of [-1, 1]) {
    const thigh = new THREE.CapsuleGeometry(0.14, 0.26, 2, 5);
    thigh.rotateZ(s * 0.5);
    thigh.translate(s * 0.30, 0.30, -0.16);
    parts.push(toFlat(thigh));
    const shin = new THREE.CapsuleGeometry(0.10, 0.24, 2, 5);
    shin.rotateX(-0.4);
    shin.translate(s * 0.34, 0.16, 0.02);
    parts.push(toFlat(shin));
  }
  return mergeGeometries(parts);
}

/** 尾巴：分节弯曲，方便摆动 */
function tailGeo() {
  const parts = [];
  let y = 0, ang = 0;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.SphereGeometry(0.075 - i * 0.008, 5, 4);
    ang += 0.42;
    y += 0.16;
    seg.translate(Math.sin(ang) * 0.10, y - 0.1, -0.12 - i * 0.13);
    parts.push(toFlat(seg));
  }
  return mergeGeometries(parts);
}

/** 仙鹤：身、颈、头、喙、冠、翅、腿 */
function craneGeo() {
  const body = [];
  const bodyParts = [];
  const torso = new THREE.SphereGeometry(0.62, 8, 6);
  torso.scale(0.86, 0.9, 1.5);
  torso.translate(0, 0, 0);
  bodyParts.push(toFlat(torso));
  // 颈
  const neck = new THREE.CapsuleGeometry(0.11, 1.15, 3, 6);
  neck.rotateX(-0.42);
  neck.translate(0, 0.52, 0.72);
  bodyParts.push(toFlat(neck));
  // 头
  const head = new THREE.SphereGeometry(0.17, 6, 5);
  head.translate(0, 1.10, 1.02);
  bodyParts.push(toFlat(head));
  // 尾羽
  const tail = new THREE.ConeGeometry(0.26, 0.8, 5, 1);
  tail.rotateX(Math.PI / 2 + 0.25);
  tail.translate(0, 0.05, -0.92);
  bodyParts.push(toFlat(tail));
  const bodyMesh = mergeGeometries(bodyParts);

  const redParts = [];
  // 丹顶
  const crown = new THREE.SphereGeometry(0.15, 6, 4);
  crown.scale(1, 0.6, 1);
  crown.translate(0, 1.21, 1.02);
  redParts.push(toFlat(crown));
  // 喙
  const beak = new THREE.ConeGeometry(0.075, 0.62, 5, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 1.06, 1.42);
  redParts.push(toFlat(beak));
  // 腿（独立 mesh，飞行时后掠收腿）
  const legParts = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.CapsuleGeometry(0.045, 0.85, 2, 4);
    leg.translate(s * 0.16, -0.75, 0.04);
    legParts.push(toFlat(leg));
  }
  return {
    body: bodyMesh,
    red: mergeGeometries(redParts),
    legs: mergeGeometries(legParts),
    wing: (() => {
      const parts = [];
      for (const s of [-1, 1]) {
        const w = new THREE.PlaneGeometry(1.5, 0.82, 3, 1);
        w.rotateX(-Math.PI / 2);
        w.translate(s * 0.82, 0.12, -0.06);
        parts.push(toFlat(w));
        const tip = new THREE.ConeGeometry(0.24, 0.9, 4, 1);
        tip.rotateZ(s * -Math.PI / 2);
        tip.translate(s * 1.85, 0.10, -0.06);
        parts.push(toFlat(tip));
      }
      return mergeGeometries(parts);
    })()
  };
}

export class Life {
  constructor(terrain, seed = 8080) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.group = new THREE.Group();
    this.group.name = 'life';
    this.monkeys = [];
    this.cranes = [];
    this.time = 0;
  }

  _monkeys() {
    const bodyGeo = monkeyGeo();
    const tailG = tailGeo();
    const spots = [
      { x: SITE.gate.x + 5, z: SITE.gate.z + 2, n: 3, r: 5 },
      { x: SITE.peach.x - 6, z: SITE.peach.z + 4, n: 4, r: 9 },
      { x: SITE.summit.x + 4, z: SITE.summit.z - 3, n: 2, r: 4 },
      { x: SITE.bridge.x + 2, z: SITE.bridge.z + 4, n: 2, r: 3 },
      { x: 2, z: 62, n: 3, r: 7 }   // 洞内
    ];
    const rng = rngFrom(1213);
    for (const sp of spots) {
      for (let i = 0; i < sp.n; i++) {
        const g = new THREE.Group();
        const dark = rng() > 0.62;
        const pale = rng() > 0.86;
        const body = new THREE.Mesh(bodyGeo, dark ? MAT.furMonkeyDark : pale ? MAT.furMonkeyPale : MAT.furMonkey);
        body.castShadow = true;
        g.add(body);
        const tail = new THREE.Mesh(tailG, dark ? MAT.furMonkeyDark : MAT.furMonkey);
        tail.position.set(0, 0.72, -0.5);
        tail.castShadow = true;
        g.add(tail);

        const a = rng() * TAU, rr = rng() * sp.r;
        const hx = sp.x + Math.cos(a) * rr, hz = sp.z + Math.sin(a) * rr;
        const scale = 0.9 + rng() * 0.5;
        g.scale.setScalar(scale);
        this.group.add(g);

        this.monkeys.push({
          g, tail, body,
          hx, hz, hy: this.terrain.height(hx, hz),
          phase: rng() * TAU,
          speed: 0.16 + rng() * 0.22,
          radius: 1.4 + rng() * 3.2,
          base: new THREE.Vector3(hx, this.terrain.height(hx, hz), hz),
          hop: rng() > 0.55
        });
      }
    }
  }

  _cranes() {
    const geos = craneGeo();
    const N = 5;
    for (let i = 0; i < N; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geos.body, MAT.craneWhite);
      body.castShadow = true;
      g.add(body);
      const red = new THREE.Mesh(geos.red, MAT.craneRed);
      g.add(red);
      const wingL = new THREE.Mesh(geos.wing, MAT.craneWhite);
      wingL.castShadow = true;
      g.add(wingL);
      const legs = new THREE.Mesh(geos.legs, MAT.craneRed);
      legs.rotation.x = 1.15;              // 飞行时后掠收腿
      g.add(legs);
      const s = 1.5 + (i % 3) * 0.35;
      g.scale.setScalar(s);
      this.group.add(g);
      const a0 = (i / N) * TAU;
      this.cranes.push({
        g, wing: wingL,
        cx: 30 + (i % 2) * 40, cz: 90 + (i % 3) * 30,
        r: 52 + i * 13, y: 44 + i * 7,
        a0, speed: 0.055 + (i % 3) * 0.012,
        flap: 1.5 + (i % 4) * 0.25, phase: i * 1.3, scale: s
      });
    }
  }

  _fireflies() {
    const N = 420;
    const pos = new Float32Array(N * 3);
    const seedArr = new Float32Array(N);
    const rng = rngFrom(6161);
    this.ffHome = [];
    // 聚集在桃林、竹海、洞内与山门附近
    const zones = [
      { x: SITE.peach.x, z: SITE.peach.z, r: 46, n: 150, h: 9 },
      { x: SITE.bamboo.x, z: SITE.bamboo.z, r: 44, n: 110, h: 10 },
      { x: 2, z: 64, r: 18, n: 90, h: 7 },
      { x: SITE.gate.x, z: SITE.gate.z, r: 20, n: 70, h: 8 }
    ];
    let k = 0;
    for (const z0 of zones) {
      for (let i = 0; i < z0.n; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * z0.r;
        const x = z0.x + Math.cos(a) * r, z = z0.z + Math.sin(a) * r;
        const y = this.terrain.height(x, z) + 1.2 + rng() * z0.h;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        seedArr[k] = rng() * 100;
        this.ffHome.push({ x, y, z, ph: rng() * TAU, sp: 0.35 + rng() * 0.75, rad: 1.4 + rng() * 4.2 });
        k++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ffBase = pos.slice();
    this.ffMat = new THREE.PointsMaterial({
      size: 1.05, map: glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xdcff9a, sizeAttenuation: true, opacity: 0
    });
    this.fireflies = new THREE.Points(geo, this.ffMat);
    this.fireflies.frustumCulled = false;
    this.fireflies.renderOrder = 8;
    this.group.add(this.fireflies);
  }

  build() {
    this._monkeys();
    this._cranes();
    this._fireflies();
    this.group.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    return this.group;
  }

  update(dt, time, sky) {
    this.time += dt;
    const t = this.time;

    for (const m of this.monkeys) {
      const a = t * m.speed + m.phase;
      const x = m.base.x + Math.cos(a) * m.radius;
      const z = m.base.z + Math.sin(a) * m.radius * 0.7;
      const ground = this.terrain.height(x, z);
      const hop = m.hop ? Math.max(0, Math.sin(t * 2.3 + m.phase)) * 0.55 : 0;
      m.g.position.set(x, ground + hop, z);
      m.g.rotation.y = -a + Math.PI * 0.5;
      // 呼吸/蹲伏起伏
      const bob = 1 + Math.sin(t * 2.1 + m.phase) * 0.028;
      m.g.scale.set(m.base.scale || m.g.scale.x, m.g.scale.x * bob, m.g.scale.x);
      m.tail.rotation.y = Math.sin(t * 1.7 + m.phase) * 0.5;
      m.tail.rotation.z = Math.sin(t * 2.6 + m.phase) * 0.22;
    }

    for (const c of this.cranes) {
      const a = c.a0 + t * c.speed;
      const x = c.cx + Math.cos(a) * c.r;
      const z = c.cz + Math.sin(a) * c.r;
      const y = c.y + Math.sin(t * 0.35 + c.phase) * 2.4;
      c.g.position.set(x, y, z);
      c.g.rotation.y = -a - Math.PI * 0.5;
      c.g.rotation.z = Math.sin(t * 0.5 + c.phase) * 0.10;
      // 扇翅
      const f = Math.sin(t * c.flap + c.phase);
      c.wing.rotation.x = f * 0.55;
      c.wing.rotation.z = f * 0.10;
    }

    if (this.fireflies) {
      const night = sky ? 1 - clamp01(sky.state.intensity) : 0;
      const vis = smoothstep(0.30, 0.72, night);
      this.ffMat.opacity = vis * 0.95;
      this.fireflies.visible = vis > 0.02;
      if (this.fireflies.visible) {
        const p = this.fireflies.geometry.attributes.position;
        const arr = p.array;
        for (let i = 0; i < this.ffHome.length; i++) {
          const h = this.ffHome[i];
          const a = t * h.sp + h.ph;
          arr[i * 3] = h.x + Math.cos(a) * h.rad;
          arr[i * 3 + 1] = h.y + Math.sin(t * 0.8 * h.sp + h.ph * 2.1) * 1.5;
          arr[i * 3 + 2] = h.z + Math.sin(a * 0.8) * h.rad;
        }
        p.needsUpdate = true;
      }
    }
  }
}
