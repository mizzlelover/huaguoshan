import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { Noise, clamp01, lerp, smoothstep } from './core/noise.js';
import { Sky } from './world/sky.js';
import { Terrain, SITE } from './world/terrain.js';
import { Ocean } from './world/ocean.js';
import { Clouds } from './world/clouds.js';
import { Rocks } from './world/rocks.js';
import { Water } from './world/water.js';
import { Grotto } from './world/grotto.js';
import { Flora } from './world/flora.js';
import { Props } from './world/props.js';
import { Life } from './world/life.js';
import { Player } from './core/player.js';
import { initMaterials } from './world/kit.js';
import { PIGMENT } from './core/palette.js';

const boot = document.getElementById('boot');
const bootTip = document.getElementById('bootTip');

function fatal(err) {
  console.error(err);
  const el = document.createElement('div');
  el.id = 'fatal';
  el.textContent = '场景初始化失败\n\n' + (err && err.stack ? err.stack : String(err));
  document.body.appendChild(el);
  boot?.classList.add('hidden');
}

window.addEventListener('error', (e) => fatal(e.error || e.message));

async function main() {
  initMaterials();
  const stage = new Stage(document.getElementById('scene'));
  const noise = new Noise(4242);

  const terrain = new Terrain();
  stage.scene.add(terrain.mesh);

  const sky = new Sky(stage, noise);
  stage.scene.add(sky.group);

  const ocean = new Ocean(terrain);
  stage.scene.add(ocean.group);

  const clouds = new Clouds(terrain);
  stage.scene.add(clouds.group);

  const rocks = new Rocks(terrain);
  stage.scene.add(rocks.build());

  const water = new Water(terrain);
  stage.scene.add(water.build());

  const grotto = new Grotto(terrain);
  stage.scene.add(grotto.build());

  const flora = new Flora(terrain);
  stage.scene.add(flora.build());

  const props = new Props(terrain);
  stage.scene.add(props.build());

  const life = new Life(terrain);
  stage.scene.add(life.build());

  sky.autoCycle = false;
  sky.apply(0.34);
  boot?.classList.add('hidden');

  const cam = stage.camera;
  const player = new Player(stage, terrain, sky, SITE);
  cam.position.set(4, terrain.height(4, 176) + 2.4, 176);
  cam.lookAt(0, 40, 60);
  player.teleport('水帘洞');
  player.show();

  const clock = new THREE.Clock();
  let t = 0;
  let frames = 0;
  let fpsAcc = 0;
  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    frames++;
    fpsAcc += dt;
    if (fpsAcc > 0.5) { window.__dbg.fps = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; }
    sky.stepTime(dt);
    sky.update(dt, t, cam);
    ocean.update(dt, t, cam, sky);
    clouds.update(dt, t, cam, sky);
    water.update(dt, t, sky);
    grotto.update(dt, t, sky);
    flora.update(dt, t);
    props.update(dt, t);
    life.update(dt, t, sky);
    player.update(dt, t);
    stage.render(t);
    requestAnimationFrame(loop);
  };

  window.__dbg = {
    THREE, stage, terrain, sky, ocean, clouds, rocks, water, grotto, flora, props, life, player, cam, SITE, PIGMENT,
    fps: 0,
    setTime: (x) => { sky.apply(x); sky.autoCycle = false; },
    snap: () => { cam.updateMatrixWorld(true); },
    look: (x, y, z) => { cam.lookAt(x, y, z); },
    ground: (x, z, up) => { cam.position.set(x, terrain.height(x, z) + (up ?? 2.2), z); }
  };

  loop();
}

main().catch(fatal);
