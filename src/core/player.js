import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from './noise.js';

const EYE = 1.72;
const WALK = 26;
const SPRINT = 58;
const CROUCH_SPEED = 0.42;   // 蹲行速度系数
const CROUCH_DROP = 0.62;    // 蹲下时视高下降量
const FLY = 40;
const FLY_BOOST = 110;
const GRAVITY = 62;
const JUMP = 20;
const ACCEL = 12;

const MODE_LABEL = {
  walk: ['行走', 'SPACE 跳 · F 飞行 · Q 穿墙'],
  fly: ['飞行', 'SHIFT 加速 · SPACE 升 · CTRL 降 · F 落地'],
  orbit: ['环绕', 'WASD 推拉 · Q 退出环绕']
};

const TOUR = [
  { name: '山门', pos: [2, 62, 172], look: [0, 74, 120] },
  { name: '铁板桥', pos: [-34, 58, 112], look: [4, 54, 90] },
  { name: '水帘洞', pos: [2, 42, 100], look: [2, 50, 76] },
  { name: '瀑帘洞天', pos: [2, 51, 70], look: [2, 52, 50] },
  { name: '东海岸', pos: [4, 30, 176], look: [0, 60, 60] },
  { name: '蟠桃园', pos: [70, 92, 52], look: [88, 84, 34] },
  { name: '花果山顶', pos: [0, 134, 30], look: [0, 96, -40] }
];

export class Player {
  constructor(stage, terrain, sky, sites) {
    this.stage = stage;
    this.camera = stage.camera;
    this.terrain = terrain;
    this.sky = sky;
    this.sites = sites || {};

    this.yaw = Math.PI;
    this.pitch = -0.06;
    this.mode = 'walk';
    this.noclip = false;
    this.orbit = false;
    this.tour = false;
    this.tourT = 0;
    this.tourLeg = 0;

    this.pos = new THREE.Vector3(4, 0, 176);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = false;
    this.crouching = false;
    this.orbitDist = 26;
    this.sprinting = false;

    this.keys = new Set();
    this.locked = false;
    this.enabled = true;
    this.pos.y = this.terrain.height(this.pos.x, this.pos.z) + EYE;

    this.el = {
      hud: document.getElementById('hud'),
      crosshair: document.getElementById('crosshair'),
      modeName: document.getElementById('modeName'),
      modeHint: document.getElementById('modeHint'),
      placeName: document.getElementById('placeName'),
      compassStrip: document.getElementById('compassStrip'),
      compassNeedle: document.getElementById('compassNeedle'),
      stats: document.getElementById('stats'),
      minimap: document.getElementById('minimap'),
      keycard: document.getElementById('keycard'),
      toast: document.getElementById('toast'),
      lockHint: document.getElementById('lockHint')
    };

    this._buildCompass();
    this._bind();
    this._refreshMode();
    this._statsAcc = 0;
    this._toastTimer = 0;
    this._mmCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
  }

  show() {
    this.el.hud?.classList.remove('hidden');
    this.el.lockHint?.classList.remove('hidden');
  }

  requestLock() {
    if (!this.locked) this.stage.renderer.domElement.requestPointerLock?.();
  }

  _bind() {
    const canvas = this.stage.renderer.domElement;

    canvas.addEventListener('click', () => this.requestLock());
    this.el.lockHint?.addEventListener('click', () => this.requestLock());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.el.lockHint?.classList.toggle('hidden', this.locked);
      this.el.crosshair?.classList.toggle('hidden', !this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });

    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (k === 'Tab') e.preventDefault();
      this.keys.add(k);
      this._onKey(k, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _onKey(k, e) {
    if (k === 'KeyF') {
      this.orbit = false;
      this.mode = this.mode === 'fly' ? 'walk' : 'fly';
      if (this.mode === 'walk') this.vy = 0;
      this._refreshMode();
      this.toast(this.mode === 'fly' ? '自由飞行' : '落地行走');
      return;
    }
    if (k === 'KeyQ') {
      if (this.orbit) {
        this.orbit = false;
        this.toast('退出环绕');
      } else {
        this.noclip = !this.noclip;
        this.toast(this.noclip ? '穿墙 · 无碰撞' : '恢复碰撞');
      }
      this._refreshMode();
      return;
    }
    if (k === 'KeyC') {
      this.orbit = !this.orbit;
      if (this.orbit) {
        this.tour = false;
        this.pos.copy(this.camera.position);
      }
      this._refreshMode();
      this.toast(this.orbit ? '第三人称环绕' : '第一人称');
      return;
    }
    if (k === 'KeyH') {
      this.el.keycard?.classList.toggle('hidden');
      return;
    }
    if (k === 'KeyR') {
      this.teleport('山门');
      return;
    }
    if (k === 'KeyN') {
      this.sky.autoCycle = !this.sky.autoCycle;
      this.toast(this.sky.autoCycle ? '昼夜循环 · 开' : '昼夜循环 · 关');
      return;
    }
    if (k === 'KeyT') {
      this.tour = !this.tour;
      this.tourT = 0;
      this.toast(this.tour ? '自动巡游 · 开' : '自动巡游 · 关');
      return;
    }
    if (k === 'KeyP') {
      this.screenshot();
      return;
    }
    // 注意：不能用 'Digit123456'.indexOf(k) —— 'Digit2' 并不是该字符串的子串，
    // 结果恒为 -1，只有 Digit1 能命中。这里按后缀数字解析。
    const m = /^Digit([1-9])$/.exec(k);
    if (m) {
      const i = Number(m[1]) - 1;
      if (TOUR[i]) this.teleport(TOUR[i].name);
    }
  }

  teleport(name) {
    const spot = TOUR.find((t) => t.name === name);
    if (!spot) return;
    this.tour = false;
    this.orbit = false;
    this.pos.set(...spot.pos);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    const look = new THREE.Vector3(...spot.look);
    const dir = look.sub(this.pos);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.clone().normalize().y, -1, 1));
    this.toast(`传送 · ${name}`);
    this._refreshMode();
  }

  screenshot() {
    // 交给 stage 在合成完成的同一帧内取图，避免拿到被清空的绘制缓冲
    const name = this.stage.requestShot('huaguoshan');
    this.toast(name ? '已截图' : '截图失败');
  }

  toast(msg) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
  }

  _refreshMode() {
    const key = this.orbit ? 'orbit' : this.mode;
    const [name, hint] = MODE_LABEL[key];
    if (this.el.modeName) {
      this.el.modeName.textContent = name + (this.noclip ? ' · 穿墙' : '') + (this.crouching ? ' · 蹲' : '');
    }
    if (this.el.modeHint) this.el.modeHint.textContent = hint;
  }

  _buildCompass() {
    const strip = this.el.compassStrip;
    if (!strip) return;
    const marks = [];
    for (let i = 0; i < 24; i++) {
      const deg = i * 15;
      const card = { 0: '北', 90: '东', 180: '南', 270: '西' }[deg];
      marks.push(`<i class="${card ? 'card' : ''}">${card ?? deg}</i>`);
    }
    strip.innerHTML = marks.join('');
  }

  _updateCompass() {
    const strip = this.el.compassStrip;
    const needle = this.el.compassNeedle;
    if (!strip || !needle) return;
    let deg = (-this.yaw * 180) / Math.PI % 360;
    if (deg < 0) deg += 360;
    strip.style.transform = `translateX(${-deg * 1.3333}px)`;
    needle.style.transform = `rotate(${-deg}deg)`;
  }

  _updateMinimap() {
    const ctx = this._mmCtx;
    if (!ctx) return;
    const cv = this.el.minimap;
    const w = cv.width;
    const h = cv.height;
    const R = 300;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);

    const grid = ctx.createRadialGradient(0, 0, 10, 0, 0, w / 2);
    grid.addColorStop(0, 'rgba(24,40,44,0.86)');
    grid.addColorStop(1, 'rgba(12,22,26,0.92)');
    ctx.fillStyle = grid;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(150,200,190,0.22)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(0, 0, (w / 2 - 6) * (r / 3), 0, Math.PI * 2);
      ctx.stroke();
    }

    const scale = (w / 2 - 6) / R;
    ctx.save();
    ctx.rotate(this.yaw);
    ctx.translate(0, 0);

    ctx.fillStyle = 'rgba(86,132,110,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 200 * scale, -0.62, 0.62);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(216,162,65,0.9)';
    for (const spot of TOUR) {
      const dx = spot.pos[0] - this.pos.x;
      const dz = spot.pos[2] - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      ctx.beginPath();
      ctx.arc(dx * scale, dz * scale, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.rotate(this.yaw);
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(230,240,235,0.7)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(this.pos.x)}, ${Math.round(this.pos.z)}`, w / 2, h - 6);
  }

  _updateStats(fps) {
    const s = this.el.stats;
    if (!s) return;
    const t = ((this.sky.timeOfDay ?? 0.36) * 24 + 6) % 24;
    const hh = String(Math.floor(t)).padStart(2, '0');
    const mm = String(Math.floor((t % 1) * 60)).padStart(2, '0');
    s.textContent =
      `${fps} FPS　高度 ${this.pos.y.toFixed(0)} m　` +
      `${MODE_LABEL[this.orbit ? 'orbit' : this.mode][0]}　${hh}:${mm}`;
  }

  update(dt, time) {
    if (!this.enabled) return;
    const k = this.keys;
    const cam = this.camera;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (k.has('KeyW')) wish.add(fwd);
    if (k.has('KeyS')) wish.sub(fwd);
    if (k.has('KeyD')) wish.add(right);
    if (k.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight');

    if (this.tour) {
      this._updateTour(dt);
    } else if (this.orbit) {
      this._updateOrbit(dt, wish);
    } else if (this.noclip) {
      this._updateNoclip(dt, wish);
    } else {
      this._updateWalkFly(dt, wish);
    }

    if (!this.orbit && !this.tour) {
      cam.position.copy(this.pos);
      cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    }

    this._updateCompass();
    this._updateMinimap();
    this._statsAcc += dt;
    if (this._statsAcc > 0.25) {
      this._statsAcc = 0;
      this._updateStats(window.__dbg?.fps ?? 0);
    }
  }

  _updateNoclip(dt, wish) {
    const speed = this.mode === 'fly'
      ? (this.sprinting ? FLY_BOOST : FLY)
      : (this.sprinting ? SPRINT : WALK);
    this.vel.lerp(wish.multiplyScalar(speed), Math.min(1, ACCEL * dt));
    this.pos.addScaledVector(this.vel, dt);
    let vy = 0;
    if (this.keys.has('Space')) vy += speed;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) vy -= speed;
    this.pos.y += vy * dt;
    this.vy = 0;
    this.grounded = false;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -210, 210);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -210, 210);
    if (this.pos.y < -40) this.pos.y = -40;
  }

  _updateWalkFly(dt, wish) {
    const fly = this.mode === 'fly';
    // 蹲下只在行走时生效：降速 + 压低视高；飞行时 Ctrl 仍是下降
    const wantCrouch = !fly && (this.keys.has('ControlLeft') || this.keys.has('ControlRight'));
    if (wantCrouch !== this.crouching) {
      this.crouching = wantCrouch;
      this._refreshMode();
    }
    const speed = fly
      ? this.sprinting ? FLY_BOOST : FLY
      : this.crouching ? WALK * CROUCH_SPEED
      : this.sprinting ? SPRINT : WALK;

    this.vel.lerp(wish.multiplyScalar(speed), Math.min(1, ACCEL * dt));

    if (fly) {
      let vy = 0;
      if (this.keys.has('Space')) vy += speed;
      if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) vy -= speed;
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y += vy * dt;
      this.vy = 0;
      return;
    }

    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -210, 210);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -210, 210);

    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;

    const eye = EYE - (this.crouching ? CROUCH_DROP : 0);
    const floor = this.terrain.height(this.pos.x, this.pos.z) + eye;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      this.vy = 0;
      this.grounded = true;
      if (this.keys.has('Space')) this.vy = JUMP;
    } else {
      this.grounded = false;
    }
  }

  _updateOrbit(dt, wish) {
    const cam = this.camera;
    this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + wish.z * 40 * dt, 6, 180);
    const target = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    let want = target.clone().addScaledVector(dir, this.orbitDist);
    const floor = this.terrain.height(want.x, want.z) + 2.2;
    want.y = Math.max(want.y, floor);
    cam.position.lerp(want, Math.min(1, 8 * dt));
    cam.lookAt(target);
  }

  _updateTour(dt) {
    this.tourT += dt;
    const dur = 7.0;
    const leg = Math.floor(this.tourT / dur);
    if (leg !== this.tourLeg) {
      this.tourLeg = leg;
      this.toast(`巡游 · ${TOUR[leg % TOUR.length].name}`);
    }
    const a = TOUR[leg % TOUR.length];
    const b = TOUR[(leg + 1) % TOUR.length];
    let t = (this.tourT % dur) / dur;
    t = smoothstep(0, 1, t);
    const pa = new THREE.Vector3(...a.pos);
    const pb = new THREE.Vector3(...b.pos);
    const la = new THREE.Vector3(...a.look);
    const lb = new THREE.Vector3(...b.look);
    const p = pa.lerp(pb, t);
    const l = la.lerp(lb, t);
    this.pos.copy(p);
    this.camera.position.copy(p);
    this.camera.lookAt(l);
    this.yaw = Math.atan2(-(l.x - p.x), -(l.z - p.z));
  }
}