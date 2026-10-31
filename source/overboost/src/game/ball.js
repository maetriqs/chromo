// By The_headphones
import * as THREE from 'three';
import { BALL } from './constants.js';

export class Ball {
  constructor(physics) {
    const { body, collider } = physics.createBall(this);
    this.body = body;
    this.collider = collider;
    this.kind = 'ball';
    this.radius = BALL.radius;
    this.position = new THREE.Vector3(0, BALL.radius, 0);
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.prevPosition = this.position.clone();
    this.prevQuaternion = new THREE.Quaternion();
    this.preVelocity = new THREE.Vector3();
    this.hidden = false;
    this.lastTouch = null;
    this.lastTouchTime = -10;
  }

  readState() {
    const b = this.body;
    const t = b.translation(), r = b.rotation(), lv = b.linvel(), av = b.angvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(lv.x, lv.y, lv.z);
    this.angularVelocity.set(av.x, av.y, av.z);
  }

  reset(x, y, z, vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0) {
    this.setHidden(false);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    this.body.setAngvel({ x: wx, y: wy, z: wz }, true);
    this.readState();
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.lastTouch = null;
  }

  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.body.setEnabled(!hidden);
  }

  beginStep() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.preVelocity.copy(this.velocity);
  }

  afterStep() {
    if (this.hidden) return;
    this.readState();
    let changed = false;
    const sp = this.velocity.length();
    if (sp > BALL.maxSpeed) { this.velocity.multiplyScalar(BALL.maxSpeed / sp); changed = true; }
    const w = this.angularVelocity.length();
    if (w > BALL.maxAngSpeed) { this.angularVelocity.multiplyScalar(BALL.maxAngSpeed / w); changed = true; }
    if (!Number.isFinite(sp) || !Number.isFinite(this.position.y)) {
      this.reset(0, BALL.radius + 2, 0);
      return;
    }
    if (changed) {
      this.body.setLinvel(this.velocity, true);
      this.body.setAngvel(this.angularVelocity, true);
    }
  }

  setVelocity(v) {
    this.velocity.copy(v);
    this.body.setLinvel(v, true);
  }
}
