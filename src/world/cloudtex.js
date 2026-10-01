import * as THREE from 'three';

let cached = null;

export function makePuffTextureShared() {
  if (cached) return cached;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const blobs = [];
  let seed = 0.37;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 34; i++) {
    blobs.push({
      x: 0.5 + (rnd() - 0.5) * 0.52,
      y: 0.56 + (rnd() - 0.5) * 0.26,
      r: 0.085 + rnd() * 0.13,
      a: 0.22 + rnd() * 0.3
    });
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let acc = 0;
      for (const b of blobs) {
        const dx = (u - b.x), dy = (v - b.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r) acc += b.a * (1 - dist / b.r);
      }
      const nx = (u - 0.5) * 2, ny = (v - 0.5) * 2;
      const fall = Math.max(0, 1 - Math.pow(Math.min(1, Math.sqrt(nx * nx * 1.02 + ny * ny * 1.38)), 1.25));
      const i = (y * S + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.floor(Math.min(1, Math.pow(acc, 1.35) * fall * 0.92) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  cached = new THREE.CanvasTexture(cv);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.minFilter = THREE.LinearMipmapLinearFilter;
  cached.magFilter = THREE.LinearFilter;
  cached.needsUpdate = true;
  return cached;
}
