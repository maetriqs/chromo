// By The_headphones
// Third-person chase camera with ball cam, free look and arena collision.
import * as THREE from 'three';
import { arenaSDF } from '../game/arenaShape.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _look = new THREE.Vector3();
const _right = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.dir = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.pos = new THREE.Vector3(0, 10, -30);
    this.settings = { distance: 2.9, height: 1.05, fov: 100, stiffness: 0.45 };
    this.ballCam = true;
    this.freeYaw = 0;
    this.freePitch = 0;
    this.freeActive = false;
    this.shakeAmp = 0;
    this.orbitAngle = 0;
    this.initialized = false;
    this.lookAt = new THREE.Vector3();
  }

  applySettings(s) {
    this.settings.distance = s.cameraDistance;
    this.settings.height = s.cameraHeight;
    this.settings.fov = s.fov;
    this.settings.stiffness = s.cameraStiffness;
    this.updateFov();
  }

  updateFov() {
    const cam = this.camera;
    const h = THREE.MathUtils.degToRad(this.settings.fov);
    const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(0.5, cam.aspect));
    cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 40, 100);
    cam.updateProjectionMatrix();
  }

  addFreeLook(dx, dy) {
    this.freeActive = true;
    this.freeYaw = THREE.MathUtils.clamp(this.freeYaw - dx, -Math.PI * 0.95, Math.PI * 0.95);
    this.freePitch = THREE.MathUtils.clamp(this.freePitch - dy, -0.5, 0.9);
  }

  shake(amount) {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount);
  }

  reset() {
    this.initialized = false;
  }

  /** Keep the camera inside the playable volume by marching from `from` toward `to`. */
  clampInside(from, to) {
    const margin = 0.35;
    if (arenaSDF(to.x, to.y, to.z) > margin) return to;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      _tmp.lerpVectors(from, to, m);
      if (arenaSDF(_tmp.x, _tmp.y, _tmp.z) > margin) lo = m; else hi = m;
    }
    return to.lerpVectors(from, to, lo);
  }

  follow(dt, car, carPos, carQuat, ball, ballPos) {
    const st = this.settings;
    const ballVisible = ball && !ball.hidden;

    // Camera "up" follows the surface when driving on walls, world up otherwise.
    const wallUp = car.onGround && car.groundNormal.y < 0.75 ? car.groundNormal : WORLD_UP;
    this.up.lerp(wallUp, 1 - Math.exp(-dt * 4)).normalize();
    const up = this.up;

    // Desired horizontal look direction
    if (this.ballCam && ballVisible) {
      _d.copy(ballPos).sub(carPos);
    } else {
      _d.set(0, 0, -1).applyQuaternion(carQuat);
      if (!car.onGround && car.velocity.lengthSq() > 25) {
        _d.lerp(_tmp.copy(car.velocity).normalize(), 0.35);
      }
    }
    _d.addScaledVector(up, -_d.dot(up));
    if (_d.lengthSq() < 0.04) _d.copy(this.dir);
    _d.normalize();

    if (!this.initialized) {
      this.dir.copy(_d);
      this.initialized = true;
    }
    const rate = this.ballCam && ballVisible ? 9 : 4 + st.stiffness * 10;
    this.dir.lerp(_d, 1 - Math.exp(-dt * rate));
    this.dir.addScaledVector(up, -this.dir.dot(up));
    if (this.dir.lengthSq() < 1e-6) this.dir.copy(_d);
    this.dir.normalize();

    // Free look decays back to centre when released.
    if (!this.freeActive) {
      this.freeYaw *= Math.exp(-dt * 6);
      this.freePitch *= Math.exp(-dt * 6);
    }
    this.freeActive = false;
    _d.copy(this.dir).applyAxisAngle(up, this.freeYaw);
    _right.crossVectors(_d, up).normalize();

    const speedPull = (1 - st.stiffness) * Math.min(1, car.speed / 23) * 0.6;
    const dist = st.distance * (1 + speedPull);
    _focus.copy(carPos).addScaledVector(up, 0.25);
    _p.copy(carPos).addScaledVector(_d, -dist * Math.cos(this.freePitch)).addScaledVector(up, st.height + dist * Math.sin(this.freePitch));
    this.clampInside(_focus, _p);
    if (_p.y < 0.25) _p.y = 0.25;

    if (this.ballCam && ballVisible && Math.abs(this.freeYaw) < 0.3) {
      _look.copy(ballPos).sub(_p);
      const len = _look.length();
      _look.normalize();
      // Limit how far up/down the ball can drag the view so the car stays on screen.
      const elev = Math.asin(THREE.MathUtils.clamp(_look.dot(up), -1, 1));
      const clamped = THREE.MathUtils.clamp(elev, -0.32, 0.72);
      if (clamped !== elev) {
        _tmp.copy(_look).addScaledVector(up, -_look.dot(up)).normalize();
        _look.copy(_tmp).multiplyScalar(Math.cos(clamped)).addScaledVector(up, Math.sin(clamped));
      }
      _look.multiplyScalar(Math.max(4, len)).add(_p);
    } else {
      _look.copy(carPos).addScaledVector(_d, 4).addScaledVector(up, 0.55);
    }
    this.apply(dt, _p, _look, up);
  }

  orbit(dt, center, radius, height, speed) {
    this.orbitAngle += dt * speed;
    _p.set(center.x + Math.cos(this.orbitAngle) * radius, height, center.z + Math.sin(this.orbitAngle) * radius);
    if (!this.initialized) { this.pos.copy(_p); this.initialized = true; }
    this.pos.lerp(_p, 1 - Math.exp(-dt * 2));
    this.lookAt.lerp(center, 1 - Math.exp(-dt * 3));
    this.apply(dt, this.pos, this.lookAt, WORLD_UP);
  }

  /** Cinematic spectator view that drifts around the ball. */
  spectate(dt, ballPos, time) {
    const a = time * 0.07;
    _p.set(Math.cos(a) * 30, 11 + Math.sin(time * 0.13) * 3, Math.sin(a) * 34);
    _p.lerp(ballPos, 0.25);
    _p.y = Math.max(_p.y, 5);
    if (!this.initialized) { this.pos.copy(_p); this.lookAt.copy(ballPos); this.initialized = true; }
    this.pos.lerp(_p, 1 - Math.exp(-dt * 0.8));
    this.lookAt.lerp(ballPos, 1 - Math.exp(-dt * 2.5));
    this.apply(dt, this.pos, this.lookAt, WORLD_UP);
  }

  apply(dt, pos, look, up) {
    const cam = this.camera;
    cam.position.copy(pos);
    if (this.shakeAmp > 0.001) {
      const a = this.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * a * 0.5;
      cam.position.y += (Math.random() - 0.5) * a * 0.5;
      cam.position.z += (Math.random() - 0.5) * a * 0.5;
      this.shakeAmp *= Math.exp(-dt * 5);
    }
    cam.up.copy(up);
    cam.lookAt(look);
  }
}
