// By The_headphones
// Static scene (arena, stadium, lights, environment) plus per-match views.
import * as THREE from 'three';
import { ArenaView } from './arenaView.js';
import { Stadium } from './stadium.js';
import { Effects } from './effects.js';
import { BallView, CarView } from './views.js';
import { CameraRig } from './cameraRig.js';

const _v = new THREE.Vector3();

export class World {
  constructor(gfx, quality) {
    this.gfx = gfx;
    const scene = gfx.scene;
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x0b1222, 140, 620);

    const hemi = new THREE.HemisphereLight(0xc6d3ee, 0x1f2a18, 0.75);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1e0, 2.3);
    key.position.set(22, 62, 12);
    key.target.position.set(0, 0, 0);
    const sc = key.shadow.camera;
    sc.left = -72; sc.right = 72; sc.top = 72; sc.bottom = -72; sc.near = 10; sc.far = 170;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.55);
    fill.position.set(-30, 40, -25);
    scene.add(fill);
    gfx.setKeyLight(key);

    this.arena = new ArenaView(gfx.renderer);
    scene.add(this.arena.group);
    this.stadium = new Stadium(quality);
    scene.add(this.stadium.group);

    // Environment reflections captured from the finished stadium.
    const pmrem = new THREE.PMREMGenerator(gfx.renderer);
    const env = pmrem.fromScene(scene, 0.035, 0.1, 900, { size: 256, position: new THREE.Vector3(0, 7, 0) });
    scene.environment = env.texture;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();

    this.effects = new Effects(scene);
    this.ballView = new BallView(scene);
    this.carViews = [];
    this.rig = new CameraRig(gfx.camera);
    this.sim = null;
    this.time = 0;
    this.setQuality(quality);
  }

  setQuality(q) {
    this.gfx.setQuality(q);
    this.stadium.setQuality(q);
    this.effects.setQuality(q);
    const blobs = q === 'low';
    this.ballView.useBlob = blobs;
    for (const v of this.carViews) v.useBlob = blobs;
    this.updateViewport();
  }

  updateViewport() {
    this.rig.updateFov();
    this.effects.setViewport(this.gfx.drawingHeight, this.gfx.camera.fov);
  }

  bind(sim) {
    this.unbind();
    this.sim = sim;
    for (const car of sim.cars) {
      const v = new CarView(this.gfx.scene, car);
      v.useBlob = this.gfx.qualityName === 'low';
      this.carViews.push(v);
    }
    this.arena.resetPads();
    this.effects.clear();
    this.rig.reset();
  }

  unbind() {
    for (const v of this.carViews) v.dispose(this.gfx.scene);
    this.carViews.length = 0;
    this.sim = null;
  }

  viewOf(car) {
    return this.carViews.find((v) => v.car === car) || null;
  }

  handleEvent(e) {
    const fx = this.effects;
    switch (e.type) {
      case 'goal':
        fx.goalExplosion(e.position, e.team);
        this.rig.shake(1.0);
        this.stadium.cheer(1);
        break;
      case 'hit':
        if (e.strength > 12) fx.sparks(e.position, e.strength, e.car.team);
        if (e.strength > 18) this.rig.shake(0.12);
        break;
      case 'demolish':
        fx.demolition(e.position);
        this.rig.shake(0.35);
        this.stadium.cheer(0.4);
        break;
      case 'pickup':
        fx.pickup(_v.set(e.pad.x, 0, e.pad.z), e.big);
        break;
      case 'save':
      case 'shot':
        this.stadium.cheer(0.25);
        break;
      default:
        break;
    }
  }

  /** `alpha` is the physics interpolation factor. Camera handled by the caller. */
  update(dt, alpha) {
    this.time += dt;
    const sim = this.sim;
    if (sim) {
      this.ballView.update(sim.ball, alpha);
      for (const v of this.carViews) v.update(alpha, dt, this.effects);
      this.arena.updatePads(sim.pads, this.time);
      // Crowd gets louder as the ball nears either goal.
      const bz = Math.abs(sim.ball.position.z);
      if (!sim.ball.hidden && bz > 38) this.stadium.excite = Math.max(this.stadium.excite, 0.15 + (bz - 38) / 40);
    }
    this.stadium.update(dt);
    this.effects.update(dt);
  }

  render() {
    this.gfx.render();
  }
}
