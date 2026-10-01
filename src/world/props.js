import * as THREE from 'three';
import { Noise, rngFrom, clamp01, lerp, TAU } from '../core/noise.js';
import { MAT, toFlat, mergeGeometries, transformed, labelTexture, bannerTexture } from './kit.js';
import { SITE, GORGE_Z } from './terrain.js';

const DEG = Math.PI / 180;

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return toFlat(g);
}

function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return toFlat(g);
}

/** 单坡瓦顶（牌坊檐） */
function slopedRoof(w, d, h) {
  const parts = [];
  const slab = new THREE.BoxGeometry(w, 0.3, d);
  slab.rotateX(-9 * DEG);
  slab.translate(0, h, 0);
  parts.push(toFlat(slab));
  parts.push(box(w + 0.4, 0.22, 0.34, 0, h + 0.3, 0));
  return mergeGeometries(parts);
}

function stoneTexture(seed = 3) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const rng = rngFrom(seed);
  ctx.fillStyle = '#8d8b80';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * 256, y = rng() * 256, r = 0.6 + rng() * 2.4;
    const v = 118 + Math.floor(rng() * 74);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 12},${0.10 + rng() * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Props {
  constructor(terrain, seed = 606) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.flicker = [];
    this.stone = new THREE.MeshStandardMaterial({
      color: 0x8d8b80, map: stoneTexture(11), roughness: 0.95, metalness: 0, flatShading: true
    });
  }

  _paifang() {
    const g = new THREE.Group();
    const { x, z } = SITE.gate;
    const y = this.terrain.height(x, z);
    g.position.set(x, y - 0.6, z);

    const SPAN = 15;      // 总宽
    const H = 12.5;       // 柱高
    const colR = 0.72;

    // 四根立柱 + 两根副柱（三间）
    const colX = [-SPAN / 2, -SPAN / 6.4, SPAN / 6.4, SPAN / 2];
    const stones = [];
    const reds = [];
    for (const cx of colX) {
      const tall = Math.abs(cx) > 3 ? H : H * 0.86;
      stones.push(cyl(colR * 1.35, colR * 1.5, 1.1, 8, cx, 0.55, 0));       // 柱础
      stones.push(cyl(colR * 0.92, colR, tall, 8, cx, 1.1 + tall / 2, 0));  // 柱身
      stones.push(box(colR * 2.6, 0.42, colR * 2.6, cx, 1.1 + tall + 0.2, 0)); // 斗栱
    }
    // 额枋（横梁）
    for (const zz of [0]) {
      stones.push(box(SPAN + 2.4, 1.5, 1.5, 0, H + 1.0, zz));
      stones.push(box(SPAN * 0.42, 1.0, 1.3, -SPAN / 3.4, H * 0.86 + 1.9, zz));
      stones.push(box(SPAN * 0.42, 1.0, 1.3, SPAN / 3.4, H * 0.86 + 1.9, zz));
    }
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones), this.stone);
    stoneMesh.castShadow = stoneMesh.receiveShadow = true;
    g.add(stoneMesh);

    // 檐顶
    const roofs = [
      { w: SPAN + 3.4, d: 3.4, h: 1.5, y: H + 1.9 },
      { w: SPAN * 0.56, d: 2.8, h: 1.2, y: H * 0.86 + 2.6 }
    ];
    for (const r of roofs) {
      const m = new THREE.Mesh(slopedRoof(r.w, r.d, r.h), MAT.graniteDark);
      m.position.set(0, r.y, 0);
      m.castShadow = true;
      g.add(m);
    }

    // 朱红梁枋
    reds.push(box(SPAN + 1.2, 0.7, 1.05, 0, H + 1.95, 0));
    reds.push(box(SPAN * 0.5, 0.5, 0.9, -SPAN / 3.4, H * 0.86 + 2.5, 0));
    reds.push(box(SPAN * 0.5, 0.5, 0.9, SPAN / 3.4, H * 0.86 + 2.5, 0));
    for (const cx of colX) reds.push(box(colR * 2.2, 0.34, colR * 2.2, cx, H + 1.72, 0));
    const redMesh = new THREE.Mesh(mergeGeometries(reds), MAT.lacquerRed);
    redMesh.castShadow = true;
    g.add(redMesh);

    // 匾额「花果山」
    const plaqueTex = labelTexture('花果山', { w: 512, h: 200, vertical: false, fontScale: 1.15, bg: '#1a1512', fg: '#e8c882' });
    const plaque = new THREE.Mesh(
      toFlat(new THREE.BoxGeometry(9.2, 3.0, 0.42)),
      [MAT.woodDark, MAT.woodDark, MAT.woodDark, MAT.woodDark,
        new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.8 }), MAT.woodDark]
    );
    plaque.position.set(0, H * 0.86 + 3.6, 0.95);
    plaque.castShadow = true;
    g.add(plaque);
    const frame = new THREE.Mesh(
      mergeGeometries([box(10.0, 0.34, 0.62, 0, 1.62, 0), box(10.0, 0.34, 0.62, 0, -1.62, 0), box(0.34, 3.6, 0.62, -4.9, 0, 0), box(0.34, 3.6, 0.62, 4.9, 0, 0)]),
      MAT.gold
    );
    frame.position.copy(plaque.position);
    g.add(frame);

    // 两侧石狮
    for (const sx of [-1, 1]) {
      const lion = this._lion();
      lion.position.set(sx * (SPAN / 2 + 2.6), 0, 0.4);
      lion.scale.setScalar(1.15);
      g.add(lion);
    }

    this.group.add(g);
  }

  _lion() {
    const parts = [];
    parts.push(box(1.5, 0.5, 2.0, 0, 0.25, 0));                       // 底座
    parts.push(cyl(0.44, 0.62, 1.5, 7, 0, 1.25, 0));                 // 身
    parts.push(box(0.8, 0.8, 0.75, 0, 2.25, 0.16));                  // 头
    parts.push(box(0.34, 0.34, 0.3, -0.26, 2.6, 0.5));               // 耳/鬃
    parts.push(box(0.34, 0.34, 0.3, 0.26, 2.6, 0.5));
    parts.push(cyl(0.17, 0.17, 0.62, 6, 0, 2.0, 0.55, Math.PI / 2)); // 前爪
    const m = new THREE.Mesh(mergeGeometries(parts), this.stone);
    m.castShadow = true;
    return m;
  }

  _bridge() {
    const g = new THREE.Group();
    const bx = SITE.bridge.x, bz = SITE.bridge.z;

    // 峡谷是 z≈GORGE_Z 的低槽：北壁陡、南侧缓升。桥面贴北壁高度架起，南端用石阶引道落地。
    const zN = bz - 9, zS = bz + 11;
    const hN = this.terrain.height(bx, zN);
    const hS = this.terrain.height(bx, zS);
    const deckY = hN + 1.8;
    const span = zS - zN;
    const sag = 1.1;
    const deckAt = (t) => deckY - Math.sin(t * Math.PI) * sag;

    const planks = [];
    const N = 26;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const z = zN + t * span;
      planks.push(box(4.4, 0.26, (span / N) * 0.8, bx, deckAt(t), z));
    }
    for (const ox of [-1.6, 1.6]) {
      planks.push(box(0.36, 0.46, span + 0.4, bx + ox, deckY - 0.44, bz + (span / 2 - 9)));
    }
    const deck = new THREE.Mesh(mergeGeometries(planks), MAT.plank);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);

    // 铁链栏杆
    const irons = [];
    for (const ox of [-2.2, 2.2]) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const z = zN + t * span;
        const h = 2.0 - Math.sin(t * TAU) * 0.3;
        irons.push(cyl(0.075, 0.075, h, 5, bx + ox, deckAt(t) + h / 2, z));
      }
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10, t1 = (i + 1) / 10;
        const z0 = zN + t0 * span, z1 = zN + t1 * span;
        const y0 = deckAt(t0) + 2.0 - Math.sin(t0 * TAU) * 0.3;
        const y1 = deckAt(t1) + 2.0 - Math.sin(t1 * TAU) * 0.3;
        const len = Math.hypot(z1 - z0, y1 - y0);
        const bar = cyl(0.08, 0.08, len, 5, bx + ox, (y0 + y1) / 2, (z0 + z1) / 2);
        bar.rotateX(Math.atan2(y1 - y0, z1 - z0) + Math.PI / 2);
        irons.push(bar);
      }
    }
    // 桥头铁柱
    for (const t of [0, 1]) {
      const z = zN + t * span;
      for (const ox of [-2.4, 2.4]) {
        irons.push(cyl(0.28, 0.34, 3.2, 6, bx + ox, deckAt(t) + 1.6, z));
        irons.push(box(0.85, 0.42, 0.85, bx + ox, deckAt(t) + 3.3, z));
      }
    }
    const iron = new THREE.Mesh(mergeGeometries(irons), MAT.iron);
    iron.castShadow = true;
    g.add(iron);

    // 铁桁架：桥面下的斜撑与横梁，替代长桥墩，形成两端锚固的跨桥
    const truss = [];
    const BAYS = 8;
    for (const ox of [-2.2, 2.2]) {
      for (let i = 0; i < BAYS; i++) {
        const t0 = i / BAYS, t1 = (i + 1) / BAYS;
        const z0 = zN + t0 * span, z1 = zN + t1 * span;
        const y0 = deckAt(t0) - 0.5, y1 = deckAt(t1) - 0.5;
        const lower = 2.6;
        // 斜撑（人字形）
        for (const s of [0, 1]) {
          const za = s ? z1 : z0, ya = s ? y1 : y0;
          const len = Math.hypot(z1 - z0, lower);
          const bar = cyl(0.13, 0.13, len, 5, bx + ox, (ya + (deckAt(s ? t0 : t1) - 0.5 - lower)) / 2, (za + (s ? z0 : z1)) / 2);
          bar.rotateX(Math.atan2(lower, Math.abs(z1 - z0)) * (s ? 1 : -1) + Math.PI / 2);
          truss.push(bar);
        }
        // 下弦
        truss.push(cyl(0.15, 0.15, Math.hypot(z1 - z0, y1 - y0), 5, bx + ox, (y0 + y1) / 2 - lower, (z0 + z1) / 2)
          .rotateX(Math.atan2(y1 - y0, z1 - z0) + Math.PI / 2));
      }
    }
    // 横梁
    for (let i = 0; i <= BAYS; i++) {
      const t = i / BAYS;
      truss.push(cyl(0.13, 0.13, 4.6, 5, bx, deckAt(t) - 0.5 - 2.6, zN + t * span, 0, 0, Math.PI / 2));
    }
    const trussMesh = new THREE.Mesh(mergeGeometries(truss), MAT.ironRust);
    trussMesh.castShadow = true;
    g.add(trussMesh);

    // 只在桥面贴近地面处放短桥墩
    const piers = [];
    for (const t of [0.5]) {
      const z = zN + t * span;
      const ground = this.terrain.height(bx, z);
      const top = deckAt(t) - 3.2;
      if (top - ground < 1.5 || top - ground > 14) continue;
      piers.push(cyl(0.85, 1.25, top - ground, 7, bx, (top + ground) / 2, z));
      piers.push(box(3.0, 0.4, 2.4, bx, top - 0.2, z));
    }
    if (piers.length) {
      const pm = new THREE.Mesh(mergeGeometries(piers), this.stone);
      pm.castShadow = pm.receiveShadow = true;
      g.add(pm);
    }

    // 北桥台
    const abut = [];
    abut.push(box(6.4, 3.2, 3.0, bx, hN - 0.6, zN - 0.8));
    abut.push(box(5.4, 0.5, 2.2, bx, deckY - 0.35, zN - 0.4));
    const am = new THREE.Mesh(mergeGeometries(abut), this.stone);
    am.castShadow = am.receiveShadow = true;
    g.add(am);

    // 南端石阶引道
    const steps = [];
    const drop = deckAt(1) - hS;
    const count = Math.max(4, Math.round(drop / 0.62));
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const z = zS + 0.6 + t * (drop * 1.5);
      const y = this.terrain.height(bx, z);
      steps.push(box(5.0, 0.5, (drop * 1.5) / count * 1.05, bx, Math.min(y, deckAt(1) - t * drop) + 0.2, z));
    }
    if (steps.length) {
      const sm = new THREE.Mesh(mergeGeometries(steps), this.stone);
      sm.castShadow = sm.receiveShadow = true;
      g.add(sm);
    }

    this.group.add(g);
  }

  _stele() {
    const g = new THREE.Group();
    const { x, z } = SITE.gate;
    const sx = x + 15, sz = z - 7;
    const y = this.terrain.height(sx, sz);
    g.position.set(sx, y - 0.4, sz);
    g.rotation.y = -0.5;

    const base = [];
    base.push(box(3.4, 0.55, 2.0, 0, 0.27, 0));
    base.push(box(2.7, 0.45, 1.5, 0, 0.72, 0));
    base.push(box(2.3, 0.3, 1.2, 0, 1.05, 0));
    const bm = new THREE.Mesh(mergeGeometries(base), this.stone);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);

    // 碑身（略带收分与碑首）
    const body = new THREE.BoxGeometry(1.9, 3.4, 0.42);
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      pos.setX(i, pos.getX(i) * lerp(1.0, 0.82, clamp01((py + 1.7) / 3.4)));
    }
    pos.needsUpdate = true;
    body.translate(0, 1.2 + 1.7, 0);
    const tex = labelTexture('花果山福地', { w: 384, h: 640, vertical: true, bg: '#6f6c62', fg: '#3b3830', sub: '猴王仙石' });
    const bodyMesh = new THREE.Mesh(toFlat(body), [
      this.stone, this.stone, this.stone, this.stone,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
      this.stone
    ]);
    bodyMesh.castShadow = true;
    g.add(bodyMesh);

    // 碑首
    const cap = new THREE.Mesh(mergeGeometries([
      box(2.1, 0.42, 0.5, 0, 4.82, 0),
      cyl(0.5, 0.5, 0.42, 8, 0, 5.2, 0)
    ]), this.stone);
    cap.castShadow = true;
    g.add(cap);

    this.group.add(g);
  }

  _banner() {
    const g = new THREE.Group();
    const spots = [
      { x: SITE.gate.x - 12, z: SITE.gate.z + 5, s: 1.0 },
      { x: SITE.summit.x + 9, z: SITE.summit.z + 7, s: 1.25 }
    ];
    for (const sp of spots) {
      const y = this.terrain.height(sp.x, sp.z);
      const pole = new THREE.Group();
      pole.position.set(sp.x, y - 0.3, sp.z);
      pole.scale.setScalar(sp.s);

      const h = 17;
      const shaft = new THREE.Mesh(cyl(0.19, 0.26, h, 7, 0, h / 2, 0), MAT.woodDark);
      shaft.castShadow = true;
      pole.add(shaft);
      const tip = new THREE.Mesh(cyl(0.02, 0.19, 1.1, 6, 0, h + 0.5, 0), MAT.goldBright);
      pole.add(tip);
      const collar = new THREE.Mesh(cyl(0.3, 0.3, 0.3, 8, 0, h * 0.72, 0), MAT.gold);
      pole.add(collar);

      // 旗面
      const tex = bannerTexture('齐天大圣', { w: 320, h: 720, base: '#c8342f' });
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 8.2, 8, 14),
        new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 })
      );
      cloth.position.set(1.35, h - 5.0, 0);
      cloth.castShadow = true;
      pole.add(cloth);
      this.flicker.push({ mesh: cloth, base: cloth.geometry.attributes.position.array.slice(), phase: Math.random() * TAU });
      g.add(pole);
    }
    this.group.add(g);
  }

  /** 从山门沿山势上行的石阶 */
  _stairs() {
    const parts = [];
    let x = SITE.gate.x + 2.5;
    let z = SITE.gate.z - 10;
    const rng = rngFrom(88);
    const total = 150;
    for (let i = 0; i < total; i++) {
      const h = this.terrain.height(x, z);
      if (h > 104) break;
      // 朝山顶方向蜿蜒
      const tx = SITE.summit.x - x, tz = SITE.summit.z - z;
      const len = Math.hypot(tx, tz) || 1;
      const w = 3.0 + rng() * 0.8;
      const step = box(w, 0.36, 1.45 + rng() * 0.45, 0, 0, 0);
      const yaw = Math.atan2(tx, tz);
      const pitch = Math.atan2(
        this.terrain.height(x, z + 2) - this.terrain.height(x, z - 2), 4
      ) * 0.5;
      parts.push(transformed(step, [x, h + 0.17, z], [pitch, yaw, 0], [1, 1, 1]));
      // 步进方向：主要沿 z 收窄，x 缓慢向中轴靠拢并左右摆动
      x += (tx / len) * 1.15 + Math.sin(i * 0.23) * 0.42;
      z += (tz / len) * 1.15;
    }
    if (parts.length < 4) return;
    const m = new THREE.Mesh(mergeGeometries(parts), this.stone);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
  }

  /** 山门两侧的仙桃树与果篮 */
  _peachStand() {
    const { x, z } = SITE.gate;
    for (const sx of [-1, 1]) {
      const px = x + sx * 6.5, pz = z + 4.5;
      const y = this.terrain.height(px, pz);
      const g = new THREE.Group();
      g.position.set(px, y, pz);
      const basket = new THREE.Mesh(mergeGeometries([
        cyl(0.95, 0.7, 0.9, 9, 0, 0.45, 0),
        cyl(0.98, 0.98, 0.16, 9, 0, 0.92, 0)
      ]), MAT.plank);
      basket.castShadow = basket.receiveShadow = true;
      g.add(basket);
      const rng = rngFrom(sx > 0 ? 31 : 47);
      for (let i = 0; i < 7; i++) {
        const peach = new THREE.Mesh(
          toFlat(new THREE.SphereGeometry(0.24 + rng() * 0.08, 7, 5)),
          MAT.peachDeep
        );
        const a = rng() * TAU, r = rng() * 0.6;
        peach.position.set(Math.cos(a) * r, 1.0 + rng() * 0.22, Math.sin(a) * r);
        peach.scale.y = 0.86;
        peach.castShadow = true;
        g.add(peach);
      }
      this.group.add(g);
    }
  }

  build() {
    this._paifang();
    this._bridge();
    this._stele();
    this._banner();
    this._stairs();
    this._peachStand();
    this.group.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    return this.group;
  }

  update(dt, time) {
    for (const f of this.flicker) {
      const p = f.mesh.geometry.attributes.position;
      const arr = p.array, base = f.base;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i], by = base[i + 1];
        const fall = clamp01((1.35 - bx) / 2.6);
        arr[i + 2] = base[i + 2] + Math.sin(time * 2.1 + by * 0.55 + f.phase) * 0.42 * fall
                   + Math.sin(time * 3.7 + by * 1.3) * 0.16 * fall;
      }
      p.needsUpdate = true;
      f.mesh.geometry.computeVertexNormals();
    }
  }
}
