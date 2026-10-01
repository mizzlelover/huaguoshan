import * as THREE from 'three';
import { Noise, rngFrom, clamp01, smoothstep, lerp, TAU } from '../core/noise.js';
import { SITE } from './terrain.js';
import { toFlat, MAT, mergeGeometries, transformed, labelTexture } from './kit.js';

export const GROTTO = {
  floor: 48,
  spring: 53,
  crown: 65,
  top: 93,
  x0: -30, x1: 32,
  zBack: 40, zFront: 82,
  caveX0: -8, caveX1: 12,
  caveZBack: 50, caveZFront: 77.5
};

function rockBox(noise, seed, x0, x1, y0, y1, z0, z1, seg = 3, amp = 1.1) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise.fbm3(v.x * 0.09 + seed, v.y * 0.075 + seed * 1.7, v.z * 0.09 - seed, 4);
    const edge = Math.max(Math.abs(v.x) / (w * 0.5), Math.abs(v.y) / (h * 0.5), Math.abs(v.z) / (d * 0.5));
    const k = 1 + n * amp * (0.35 + edge * 0.65);
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const flat = toFlat(geo);
  flat.computeVertexNormals();
  geo.dispose();
  flat.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return flat;
}

function barrelVault(noise, seed, z0, z1, cx, springY, rx, ry, thick, segs = 18, rings = 4) {
  const positions = [];
  const indices = [];
  const push = (x, y, z) => positions.push(x, y, z);
  for (let ri = 0; ri <= rings; ri++) {
    const rt = ri / rings;
    const scale = 1 + rt * (thick / Math.min(rx, ry));
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI;
      const jitter = 1 + noise.noise2(s * 0.7 + seed, ri * 1.3) * 0.05;
      push(
        cx + Math.cos(a) * rx * scale * jitter,
        springY + Math.sin(a) * ry * scale * jitter,
        z0
      );
      push(
        cx + Math.cos(a) * rx * scale * jitter,
        springY + Math.sin(a) * ry * scale * jitter,
        z1
      );
    }
  }
  const rowLen = (segs + 1) * 2;
  for (let ri = 0; ri < rings; ri++) {
    for (let s = 0; s < segs; s++) {
      const a = ri * rowLen + s * 2;
      const b = a + 1;
      const c = a + rowLen;
      const d = c + 1;
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

function archRing(noise, seed, cx, cz, springY, rx, ry, depth, blocks = 13) {
  const parts = [];
  for (let i = 0; i < blocks; i++) {
    const t = i / (blocks - 1);
    const a = lerp(Math.PI, 0, t);
    const x = cx + Math.cos(a) * rx;
    const y = springY + Math.sin(a) * ry;
    const geo = new THREE.BoxGeometry(2.3, 2.0, depth);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const n = noise.noise3(v.x * 0.5 + i, v.y * 0.5, seed);
      pos.setXYZ(k, v.x * (1 + n * 0.12), v.y * (1 + n * 0.12), v.z * (1 + n * 0.1));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const flat = toFlat(geo);
    flat.computeVertexNormals();
    geo.dispose();
    parts.push(transformed(flat, [x, y, cz], [0, 0, -a + Math.PI / 2], [1, 1, 1]));
    flat.dispose();
  }
  return parts;
}

export class Grotto {
  constructor(terrain, seed = 8899) {
    this.terrain = terrain;
    this.noise = new Noise(seed);
    this.rng = rngFrom(seed);
    this.group = new THREE.Group();
    this.group.name = 'grotto';
    this.lights = [];
  }

  build() {
    const G = GROTTO;
    const n = this.noise;
    const parts = [];

    parts.push(rockBox(n, 1.1, G.x0, G.x1, G.floor - 9, G.floor, G.zBack, G.zFront, 6, 0.9));
    parts.push(rockBox(n, 2.3, G.x0, G.x1, G.floor, G.top, G.zBack, G.caveZBack + 2, 5, 1.0));
    parts.push(rockBox(n, 3.7, G.x0, G.caveX0 - 1.5, G.floor, G.top, G.caveZBack, G.zFront, 5, 1.0));
    parts.push(rockBox(n, 4.1, G.caveX1 + 1.5, G.x1, G.floor, G.top, G.caveZBack, G.zFront, 5, 1.0));
    parts.push(rockBox(n, 5.9, G.caveX0 - 2, G.caveX1 + 2, G.crown, G.top, G.caveZBack, G.zFront, 5, 1.4));
    parts.push(rockBox(n, 6.4, G.caveX0 - 1.5, G.caveX1 + 1.5, G.spring, G.crown + 1, G.caveZBack, G.zFront, 4, 0.6));

    parts.push(rockBox(n, 7.1, G.x0, G.caveX0 - 1, G.floor, G.top, G.zFront - 9, G.zFront, 4, 1.05));
    parts.push(rockBox(n, 7.9, G.caveX1 + 1, G.x1, G.floor, G.top, G.zFront - 9, G.zFront, 4, 1.05));
    parts.push(rockBox(n, 8.3, G.caveX0 - 2, G.caveX1 + 2, G.spring + 10.5, G.top, G.zFront - 9, G.zFront, 4, 0.95));

    const vault = barrelVault(n, 12.3, G.caveZBack, G.zFront, (G.caveX0 + G.caveX1) / 2, G.spring, 12.5, 13.5, 7.5, 20, 3);
    parts.push(vault);

    const ring = archRing(n, 21.7, (G.caveX0 + G.caveX1) / 2, G.zFront - 4.2, G.spring, 11.2, 12.4, 3.4, 15);
    parts.push(...ring);

    for (const p of parts) p.computeBoundingSphere?.();
    const shell = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({
      color: 0x5d6b66, roughness: 0.96, metalness: 0, flatShading: true
    }));
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.group.add(shell);
    parts.forEach((g) => g.dispose());

    this._buildPlaque();
    this._buildInterior();
    this._buildExteriorDressing();
    return this.group;
  }

  _buildPlaque() {
    const G = GROTTO;
    const w = 11, h = 2.6;
    const tex = labelTexture('水帘洞', { w: 512, h: 128, bg: '#1a1611', fg: '#e0b463', vertical: false, fontScale: 0.92 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.25 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), [
      MAT.woodDark, MAT.woodDark, MAT.woodDark, MAT.woodDark, mat, MAT.woodDark
    ]);
    plaque.position.set((G.caveX0 + G.caveX1) / 2, G.spring + 9.4, G.zFront - 0.4);
    plaque.castShadow = true;
    this.group.add(plaque);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, h + 1.1, 0.35), MAT.gold);
    frame.position.set((G.caveX0 + G.caveX1) / 2, G.spring + 9.4, G.zFront - 0.6);
    this.group.add(frame);

    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.7), MAT.gold);
      post.position.set((G.caveX0 + G.caveX1) / 2 + s * (w * 0.5 + 1.4), G.spring + 6.6, G.zFront - 0.6);
      this.group.add(post);
    }
  }

  _buildInterior() {
    const G = GROTTO;
    const cx = (G.caveX0 + G.caveX1) / 2;
    const cz = (G.caveZBack + G.caveZFront) / 2;
    const n = this.noise;

    const floorDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 9.9, 0.5, 26),
      new THREE.MeshStandardMaterial({ color: 0x565851, roughness: 0.9, flatShading: true })
    );
    floorDisc.position.set(cx, G.floor + 0.2, cz);
    floorDisc.receiveShadow = true;
    this.group.add(floorDisc);

    const table = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.2, 0.55, 18), MAT.graniteLight);
    table.position.set(cx, G.floor + 1.5, cz - 1);
    table.castShadow = true;
    table.receiveShadow = true;
    this.group.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 1.35, 10), MAT.granite);
    leg.position.set(cx, G.floor + 0.75, cz - 1);
    this.group.add(leg);

    const stoolGeo = new THREE.CylinderGeometry(0.95, 1.1, 1.5, 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      const s = new THREE.Mesh(stoolGeo, MAT.granite);
      s.position.set(cx + Math.cos(a) * 6.6, G.floor + 0.75, cz - 1 + Math.sin(a) * 6.6);
      s.castShadow = true;
      this.group.add(s);
    }

    const potGeo = new THREE.CylinderGeometry(2.1, 1.7, 2.0, 16);
    const pot = new THREE.Mesh(potGeo, MAT.ironRust);
    pot.position.set(cx - 6.2, G.floor + 1.0, cz - 7.5);
    pot.castShadow = true;
    this.group.add(pot);
    const pot2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.15, 1.4, 14), MAT.ironRust);
    pot2.position.set(cx - 3.4, G.floor + 0.7, cz - 8.6);
    this.group.add(pot2);

    const stalGeo = new THREE.ConeGeometry(0.8, 3.4, 7);
    for (let i = 0; i < 26; i++) {
      const a = this.rng() * TAU;
      const r = 4 + this.rng() * 8;
      const x = cx + Math.cos(a) * r;
      const z = cz - 4 + Math.sin(a) * r;
      const yTop = G.spring + Math.sin(Math.acos(clamp01(r / 12.5))) * 13.5;
      const len = 1.4 + this.rng() * 3.2;
      const s = new THREE.Mesh(stalGeo, MAT.graniteDark);
      s.position.set(x, yTop - len * 0.5, z);
      s.scale.set(0.6 + this.rng() * 0.7, len / 3.4, 0.6 + this.rng() * 0.7);
      s.rotation.y = this.rng() * TAU;
      s.castShadow = true;
      this.group.add(s);
    }

    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 1.3, 10), MAT.iron);
    brazier.position.set(cx + 6.0, G.floor + 0.65, cz - 6.0);
    this.group.add(brazier);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 1.1, 6), MAT.iron);
      const a = (i / 3) * TAU;
      leg.position.set(cx + 6.0 + Math.cos(a) * 0.6, G.floor + 0.5, cz - 6.0 + Math.sin(a) * 0.6);
      leg.rotation.z = Math.cos(a) * 0.22;
      leg.rotation.x = -Math.sin(a) * 0.22;
      this.group.add(leg);
    }
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 1.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.92 })
    );
    fire.position.set(cx + 6.0, G.floor + 1.75, cz - 6.0);
    this.group.add(fire);
    this.fire = fire;

    const fireLight = new THREE.PointLight(0xff8a3a, 26, 34, 2);
    fireLight.position.set(cx + 6.0, G.floor + 2.4, cz - 6.0);
    fireLight.castShadow = false;
    this.group.add(fireLight);
    this.fireLight = fireLight;

    const glow = new THREE.PointLight(0x7fc6e0, 12, 30, 2);
    glow.position.set(cx, G.floor + 9, cz - 12);
    this.group.add(glow);

    for (const s of [-1, 1]) {
      const lantern = this._lantern(cx + s * 8.2, G.floor + 4.4, cz - 3.5);
      this.group.add(lantern);
      const l = new THREE.PointLight(0xffb066, 8, 16, 2);
      l.position.set(cx + s * 8.2, G.floor + 4.2, cz - 3.5);
      this.group.add(l);
      this.lights.push(l);
    }
  }

  _lantern(x, y, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd8402f, emissive: 0xff6a30, emissiveIntensity: 1.1,
        roughness: 0.7, metalness: 0
      })
    );
    body.scale.set(1, 1.25, 1);
    g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.22, 10), MAT.woodDark);
    cap.position.y = 0.82;
    g.add(cap);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), MAT.woodDark);
    cord.position.y = 1.6;
    g.add(cord);
    g.position.set(x, y, z);
    g.userData.isLantern = true;
    g.userData.body = body;
    return g;
  }

  _buildExteriorDressing() {
    const G = GROTTO;
    const n = this.noise;
    const t = this.terrain;
    const parts = [];
    const rng = this.rng;
    for (let i = 0; i < 34; i++) {
      const x = G.x0 + rng() * (G.x1 - G.x0);
      const z = G.zBack + rng() * (G.zFront - G.zBack);
      if (x > G.caveX0 - 2 && x < G.caveX1 + 2 && z > G.caveZBack && z < G.zFront) continue;
      const baseY = z > G.caveZBack && z < G.zFront
        ? (x < G.caveX0 ? G.floor : G.top)
        : G.top;
      const y = z < G.caveZBack ? G.floor : baseY;
      const s = 1.6 + rng() * 4.4;
      const geo = new THREE.IcosahedronGeometry(s, 1);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k);
        const nn = n.fbm3(v.x * 0.5 + i, v.y * 0.5, v.z * 0.5, 3);
        v.multiplyScalar(1 + nn * 0.36);
        v.y *= 0.7 + rng() * 0.4;
        pos.setXYZ(k, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const flat = toFlat(geo);
      flat.computeVertexNormals();
      geo.dispose();
      parts.push(transformed(flat, [x, y + s * 0.2, z], [rng() * 0.5, rng() * TAU, rng() * 0.5], [1, 1, 1]));
      flat.dispose();
    }
    if (parts.length) {
      const mesh = new THREE.Mesh(mergeGeometries(parts), MAT.granite);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      parts.forEach((g) => g.dispose());
    }

    for (let i = 0; i < 10; i++) {
      const x = G.x0 - 6 + rng() * (G.x1 - G.x0 + 12);
      const z = G.zFront - 2 + rng() * 16;
      const y = Math.max(t.height(x, z), G.floor - 2);
      if (y > G.floor + 2) continue;
      const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + rng() * 1.8, 0), MAT.moss);
      moss.position.set(x, y + 0.2, z);
      moss.scale.set(1, 0.3, 1);
      this.group.add(moss);
    }
  }

  update(dt, time, sky) {
    if (this.fire) {
      const f = 1 + Math.sin(time * 11.3) * 0.13 + Math.sin(time * 23.7) * 0.07;
      this.fire.scale.set(0.9 + f * 0.12, f, 0.9 + f * 0.12);
    }
    if (this.fireLight) {
      this.fireLight.intensity = 22 + Math.sin(time * 9.1) * 6 + Math.sin(time * 17.3) * 3;
    }
    const night = sky ? sky.state.star : 0;
    for (const l of this.lights) l.intensity = 4 + night * 16;
    this.group.traverse((o) => {
      if (o.userData && o.userData.isLantern && o.userData.body) {
        o.userData.body.material.emissiveIntensity = 0.35 + night * 2.4 + Math.sin(time * 3 + o.position.x) * 0.12;
      }
    });
  }
}
