import * as THREE from 'three';
import { PIGMENT } from '../core/palette.js';
import { clamp01, lerp, smoothstep } from '../core/noise.js';

const SERIF = '"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC","SimSun","STKaiti","Kaiti SC",serif';

export const MAT = {};

export function initMaterials() {
  MAT.granite = new THREE.MeshStandardMaterial({ color: 0x7b7d76, roughness: 0.95, metalness: 0, flatShading: true });
  MAT.graniteDark = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.96, metalness: 0, flatShading: true });
  MAT.graniteLight = new THREE.MeshStandardMaterial({ color: 0x9d9a8c, roughness: 0.92, metalness: 0, flatShading: true });
  MAT.marble = new THREE.MeshStandardMaterial({ color: 0xb9b4a2, roughness: 0.7, metalness: 0.02, flatShading: true });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.88, metalness: 0 });
  MAT.woodDark = new THREE.MeshStandardMaterial({ color: 0x402c1c, roughness: 0.9, metalness: 0 });
  MAT.plank = new THREE.MeshStandardMaterial({ color: 0x7d5a3a, roughness: 0.86, metalness: 0 });
  MAT.iron = new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 0.52, metalness: 0.75, flatShading: true });
  MAT.ironRust = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 0.78, metalness: 0.45, flatShading: true });
  MAT.lacquerRed = new THREE.MeshStandardMaterial({ color: 0x8e2b23, roughness: 0.44, metalness: 0.06 });
  MAT.cinnabar = new THREE.MeshStandardMaterial({ color: 0xb0332c, roughness: 0.5, metalness: 0.05 });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xc79a3e, roughness: 0.34, metalness: 0.82, emissive: 0x2a1c06, emissiveIntensity: 0.4 });
  MAT.goldBright = new THREE.MeshStandardMaterial({ color: 0xe8bf5c, roughness: 0.24, metalness: 0.9, emissive: 0x3a2808, emissiveIntensity: 0.5 });
  MAT.jade = new THREE.MeshStandardMaterial({ color: 0x2f7f66, roughness: 0.4, metalness: 0.12 });
  MAT.jadePale = new THREE.MeshStandardMaterial({ color: 0x7fc3a4, roughness: 0.42, metalness: 0.06 });
  MAT.paper = new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
  MAT.bark = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95, metalness: 0, flatShading: true });
  MAT.bambooStalk = new THREE.MeshStandardMaterial({ color: 0x9db85a, roughness: 0.72, metalness: 0.02 });
  MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x4f8a48, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  MAT.pineNeedle = new THREE.MeshStandardMaterial({ color: 0x2f6047, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  MAT.peachBlossom = new THREE.MeshStandardMaterial({ color: 0xf0a8c2, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, flatShading: true, emissive: 0x2a0f18, emissiveIntensity: 0.35 });
  MAT.peachDeep = new THREE.MeshStandardMaterial({ color: 0xdc7ba4, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  MAT.bananaLeaf = new THREE.MeshStandardMaterial({ color: 0x4e7f3a, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  MAT.furMonkey = new THREE.MeshStandardMaterial({ color: 0x8a6642, roughness: 0.94, metalness: 0, flatShading: true });
  MAT.furMonkeyDark = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 0.95, metalness: 0, flatShading: true });
  MAT.furMonkeyPale = new THREE.MeshStandardMaterial({ color: 0xd8c3a4, roughness: 0.92, metalness: 0, flatShading: true });
  MAT.craneWhite = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.86, metalness: 0, flatShading: true });
  MAT.craneRed = new THREE.MeshStandardMaterial({ color: 0xa8332c, roughness: 0.8, metalness: 0, flatShading: true });
  MAT.lanternPaper = new THREE.MeshStandardMaterial({
    color: 0xd8402f, roughness: 0.8, metalness: 0,
    emissive: 0xff5a2a, emissiveIntensity: 0.0, side: THREE.DoubleSide
  });
  MAT.coal = new THREE.MeshStandardMaterial({ color: 0x181513, roughness: 1, metalness: 0 });
  MAT.moss = new THREE.MeshStandardMaterial({ color: 0x4c7239, roughness: 0.95, metalness: 0, flatShading: true });
  return MAT;
}

export function labelTexture(text, opts = {}) {
  const {
    w = 512, h = 256, bg = '#1d1a16', fg = '#e8c882',
    vertical = true, border = true, fontScale = 1,
    sub = null, subColor = 'rgba(232,200,130,0.72)'
  } = opts;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = 'rgba(210,170,100,0.75)';
    ctx.lineWidth = Math.max(3, w * 0.012);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    ctx.strokeStyle = 'rgba(210,170,100,0.32)';
    ctx.lineWidth = Math.max(1, w * 0.005);
    ctx.strokeRect(ctx.lineWidth * 3, ctx.lineWidth * 3, w - ctx.lineWidth * 6, h - ctx.lineWidth * 6);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  if (vertical) {
    const size = Math.min((h * 0.78) / chars.length, w * 0.62) * fontScale;
    ctx.font = `${size}px ${SERIF}`;
    const step = (h * 0.8) / chars.length;
    const startY = h * 0.5 - (step * (chars.length - 1)) / 2;
    chars.forEach((c, i) => ctx.fillText(c, w * 0.5, startY + i * step));
  } else {
    const size = Math.min((w * 0.82) / chars.length, h * 0.66) * fontScale;
    ctx.font = `${size}px ${SERIF}`;
    ctx.fillText(text, w * 0.5, h * 0.5);
  }
  if (sub) {
    ctx.fillStyle = subColor;
    ctx.font = `${Math.round(h * 0.085)}px ${SERIF}`;
    ctx.fillText(sub, w * 0.5, h * 0.9);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function bannerTexture(text, opts = {}) {
  const { w = 384, h = 640, base = '#c8342f', ink = '#f4e4b4' } = opts;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, base);
  g.addColorStop(0.5, shade(base, 1.12));
  g.addColorStop(1, shade(base, 0.88));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(244,228,180,0.9)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const size = (h * 0.74) / chars.length;
  ctx.font = `${size}px ${SERIF}`;
  chars.forEach((c, i) => ctx.fillText(c, w * 0.5, h * 0.5 - (size * (chars.length - 1)) / 2 + i * size));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

export function toFlat(geo) {
  return geo.index ? geo.toNonIndexed() : geo;
}

export function mergeGeometries(list) {
  const out = [];
  let vertexCount = 0;
  let hasUV = true;
  for (const g of list) {
    if (!g.attributes.uv) hasUV = false;
    out.push(g);
    vertexCount += g.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = hasUV ? new Float32Array(vertexCount * 2) : null;
  const indices = [];
  let offset = 0;
  for (const g of out) {
    const p = g.attributes.position;
    const nAttr = g.attributes.normal;
    const uAttr = g.attributes.uv;
    position.set(p.array.subarray(0, p.count * 3), offset * 3);
    if (nAttr) normal.set(nAttr.array.subarray(0, p.count * 3), offset * 3);
    if (uv && uAttr) uv.set(uAttr.array.subarray(0, uAttr.count * 2), offset * 2);
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    } else {
      for (let i = 0; i < p.count; i++) indices.push(i + offset);
    }
    offset += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  return geo;
}

export function transformed(geo, position, rotation, scale) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rotation) q.setFromEuler(new THREE.Euler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0));
  m.compose(
    new THREE.Vector3(position[0] || 0, position[1] || 0, position[2] || 0),
    q,
    new THREE.Vector3(
      Array.isArray(scale) ? scale[0] : (scale ?? 1),
      Array.isArray(scale) ? scale[1] : (scale ?? 1),
      Array.isArray(scale) ? scale[2] : (scale ?? 1)
    )
  );
  g.applyMatrix4(m);
  return g;
}

export function noiseDisplace(geo, noise, amp, freq, seedOffset = 0) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise.fbm3(v.x * freq + seedOffset, v.y * freq + seedOffset * 1.7, v.z * freq - seedOffset, 4);
    const len = v.length() || 1;
    v.multiplyScalar(1 + (n * amp) / len * 1.0);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function jitterVertexColors(geo, base, variance, noise, freq = 0.6) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise.fbm3(x * freq, y * freq, z * freq, 3);
    c.copy(base).multiplyScalar(1 + n * variance);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export const smooth = smoothstep;
export const mixv = lerp;
export const sat = clamp01;
