// By The_headphones
// Rocket car: a Rapier rigid body driven by an arcade controller.
// Car space: forward = -Z, up = +Y, right = +X.
import * as THREE from 'three';
import { CAR, GRAVITY } from './constants.js';
import { arenaSDF, traceArena } from './arenaShape.js';

export function emptyInput() {
  return {
    throttle: 0, // -1..1 (ground + air throttle)
    steer: 0, // -1..1, right positive (ground)
    pitch: 0, // -1..1, nose up positive (air)
    yaw: 0, // -1..1, left positive (air)
    roll: 0, // -1..1, left positive (air)
    stickX: 0, // dodge direction, right positive
    stickY: 0, // dodge direction, forward positive
    jump: false, // held
    jumpPressed: false, // edge, consumed by the car each step
    boost: false,
    powerslide: false,
  };
}

const WHEEL_LOCAL = [
  new THREE.Vector3(-CAR.wheelX, CAR.anchorY, CAR.wheelFrontZ),
  new THREE.Vector3(CAR.wheelX, CAR.anchorY, CAR.wheelFrontZ),
  new THREE.Vector3(-CAR.wheelX, CAR.anchorY, CAR.wheelBackZ),
  new THREE.Vector3(CAR.wheelX, CAR.anchorY, CAR.wheelBackZ),
];

// Turn curvature (1/m) by forward speed; the car turns tighter when slow.
const CURVATURE = [[0, 0.69], [5, 0.398], [10, 0.235], [15, 0.1375], [17.5, 0.11], [23, 0.088]];
export function curvatureAt(speed) {
  const s = Math.min(Math.abs(speed), 23);
  for (let i = 1; i < CURVATURE.length; i++) {
    if (s <= CURVATURE[i][0]) {
      const [s0, c0] = CURVATURE[i - 1], [s1, c1] = CURVATURE[i];
      return c0 + (c1 - c0) * ((s - s0) / (s1 - s0));
    }
  }
  return CURVATURE[CURVATURE.length - 1][1];
}

function throttleAccel(speed) {
  if (speed < 14) return 16 - 14.4 * (speed / 14);
  if (speed < CAR.throttleTopSpeed) return 1.6 * (CAR.throttleTopSpeed - speed) / (CAR.throttleTopSpeed - 14);
  return 0;
}

export const CAR_REST_HEIGHT = 0.39;

const _vel = new THREE.Vector3();
const _ang = new THREE.Vector3();
const _a = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _ff = new THREE.Vector3();
const _lw = new THREE.Vector3();
const _hf = new THREE.Vector3();
const _hr = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _hn = { x: 0, y: 0, z: 0 };
const _sn = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class Car {
  constructor(physics, { id, team, name, isHuman = false }) {
    this.id = id;
    this.team = team;
    this.name = name;
    this.isHuman = isHuman;
    const { body, collider } = physics.createCar(this);
    this.body = body;
    this.collider = collider;
    this.kind = 'car';

    this.input = emptyInput();
    this.frozen = false;
    this.boost = 33;
    this.unlimitedBoost = false;

    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.prevQuaternion = new THREE.Quaternion();
    this.cmdVelocity = new THREE.Vector3(); // velocity handed to the solver this step
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);

    this.wheels = WHEEL_LOCAL.map((l) => ({
      local: l.clone(), contact: false, compression: 0, rayT: CAR.rayLength, normal: new THREE.Vector3(0, 1, 0),
    }));
    this.wheelContacts = 0;
    this.onGround = false;
    this.wasGrounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.ffOmega = new THREE.Vector3();

    this.isJumping = false;
    this.jumpTime = 0;
    this.groundIgnore = 0;
    this.hasJumped = false;
    this.hasDoubleJumped = false;
    this.hasFlipped = false;
    this.timeSinceJump = 0;
    this.airTime = 0;
    this.dodgeTime = -1;
    this.dodgeLocal = new THREE.Vector3();
    this.turtleTime = 0;
    this.slide = 0;

    this.boosting = false;
    this.supersonic = false;
    this.braking = false;
    this.forwardSpeed = 0;
    this.speed = 0;

    this.demolished = false;
    this.respawnTimer = 0;
    this.lastBallTouch = -10;
    this.stats = { goals: 0, shots: 0, saves: 0, touches: 0, demos: 0 };

    // One-step event flags read by the simulation
    this.justJumped = false;
    this.justDoubleJumped = false;
    this.justDodged = false;
    this.justLanded = false;
  }

  /** Places the car at rest at (x, z) facing `yaw` (radians about +Y). */
  reset(x, z, yaw, y = CAR_REST_HEIGHT) {
    const q = new THREE.Quaternion().setFromAxisAngle(_yAxis, yaw);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.isJumping = false;
    this.hasJumped = this.hasDoubleJumped = this.hasFlipped = false;
    this.dodgeTime = -1;
    this.groundIgnore = 0;
    this.turtleTime = 0;
    this.slide = 0;
    this.ffOmega.set(0, 0, 0);
    this.readState();
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  setDemolished(on) {
    this.demolished = on;
    this.body.setEnabled(!on);
    if (on) {
      this.boosting = false;
      this.supersonic = false;
    }
  }

  readState() {
    const b = this.body;
    const t = b.translation(), r = b.rotation(), lv = b.linvel(), av = b.angvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(lv.x, lv.y, lv.z);
    this.angularVelocity.set(av.x, av.y, av.z);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.speed = this.velocity.length();
    this.forwardSpeed = this.velocity.dot(this.forward);
  }

  beginStep() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  update(dt, inputOverride) {
    this.justJumped = this.justDoubleJumped = this.justDodged = this.justLanded = false;
    if (this.demolished) return;
    this.readState();
    const inp = inputOverride || this.input;
    const vel = _vel.copy(this.velocity);
    const w = _ang.copy(this.angularVelocity);
    const { up, forward: fwd, right } = this;

    // --- Wheels: sphere-trace the analytic arena surface along -up
    let contacts = 0, compSum = 0, springForce = 0;
    _n.set(0, 0, 0);
    for (const wh of this.wheels) {
      _a.copy(wh.local).applyQuaternion(this.quaternion).add(this.position);
      const t = traceArena(_a.x, _a.y, _a.z, -up.x, -up.y, -up.z, CAR.rayLength, _hn);
      if (t >= 0) {
        wh.contact = true;
        wh.rayT = t;
        wh.compression = CAR.rayLength - t;
        wh.normal.set(_hn.x, _hn.y, _hn.z);
        contacts++;
        compSum += wh.compression;
        springForce += CAR.springK * wh.compression;
        _n.add(wh.normal);
      } else {
        wh.contact = false;
        wh.rayT = CAR.rayLength;
        wh.compression = 0;
      }
    }
    this.wheelContacts = contacts;
    if (this.groundIgnore > 0) this.groundIgnore -= dt;
    const leaving = this.groundIgnore > 0;
    const grounded = contacts >= 3 && !leaving;
    const touching = contacts > 0 && !leaving;
    if (contacts > 0) _n.normalize();

    // --- Suspension and surface stick
    if (touching) {
      const vn = vel.dot(_n);
      let f = springForce - CAR.springC * contacts * vn;
      if (f < 0) f = 0;
      vel.addScaledVector(_n, (f / CAR.mass) * dt);
      if (compSum / contacts > CAR.bumpCompression) {
        const vn2 = vel.dot(_n);
        if (vn2 < 0) vel.addScaledVector(_n, -vn2);
      }
      if (grounded) {
        // Extra pull on walls/ceiling so the car can drive anywhere it has grip.
        const away = Math.max(0, -GRAVITY * _n.y);
        vel.addScaledVector(_n, -(CAR.stickAccel + away) * dt);
        // The springs store a lot of energy on curved ramps; never let them
        // fling a grounded car off its surface (jumps bypass this via groundIgnore).
        const vOut = vel.dot(_n);
        if (vOut > 0.8) vel.addScaledVector(_n, 0.8 - vOut);
      }
    }

    const boosting = inp.boost && (this.boost > 0 || this.unlimitedBoost);

    // --- Ground handling
    this.braking = false;
    if (grounded) {
      _f.copy(fwd).addScaledVector(_n, -fwd.dot(_n));
      if (_f.lengthSq() < 1e-6) _f.copy(up).negate();
      _f.normalize();
      _r.crossVectors(_f, _n);
      let vf = vel.dot(_f), vr = vel.dot(_r);
      const vn = vel.dot(_n);
      let th = inp.throttle;
      if (boosting) th = 1;
      const absF = Math.abs(vf);
      if (Math.abs(th) > 0.02) {
        if (vf * th < 0 && absF > 0.1) {
          const dv = CAR.brakeAccel * dt * Math.min(1, Math.abs(th) * 1.5);
          vf = absF <= dv ? 0 : vf - Math.sign(vf) * dv;
          this.braking = true;
        } else {
          vf += Math.sign(th) * throttleAccel(absF) * Math.abs(th) * dt;
        }
      } else {
        const dv = CAR.coastAccel * dt;
        vf = absF <= dv ? 0 : vf - Math.sign(vf) * dv;
      }

      const slideTarget = inp.powerslide ? 1 : 0;
      this.slide += (slideTarget - this.slide) * Math.min(1, dt * (inp.powerslide ? 20 : 3.5));
      const grip = CAR.gripNormal + (CAR.gripSlide - CAR.gripNormal) * this.slide;
      vr *= Math.exp(-grip * dt);
      vel.copy(_n).multiplyScalar(vn).addScaledVector(_f, vf).addScaledVector(_r, vr);

      // Steering: yaw rate from curvature, sharper while powersliding.
      const yawTarget = -inp.steer * curvatureAt(absF) * vf * (1 + (CAR.slideYawBoost - 1) * this.slide);

      // Align the chassis with the surface, plus feed-forward of how fast the
      // surface normal is rotating under us (keeps the nose clear on curves).
      _axis.crossVectors(up, _n);
      const s = _axis.length();
      const angle = Math.atan2(s, up.dot(_n));
      if (s > 1e-6) _axis.multiplyScalar((angle * CAR.alignRate) / s); else _axis.set(0, 0, 0);
      if (this.wasGrounded) {
        _ff.crossVectors(this.groundNormal, _n).multiplyScalar(1 / dt);
        const l = _ff.length();
        if (l > 12) _ff.multiplyScalar(12 / l);
        this.ffOmega.lerp(_ff, 0.5);
      } else {
        this.ffOmega.set(0, 0, 0);
      }
      const curYaw = w.dot(_n);
      const newYaw = curYaw + (yawTarget - curYaw) * Math.min(1, dt * 30);
      w.copy(_axis).add(this.ffOmega);
      w.addScaledVector(_n, newYaw - w.dot(_n));

      this.groundNormal.copy(_n);
      if (!this.onGround) this.justLanded = true;
      this.onGround = true;
      this.hasJumped = this.hasDoubleJumped = this.hasFlipped = false;
      this.dodgeTime = -1;
      this.airTime = 0;
    } else {
      this.onGround = false;
      this.airTime += dt;
      this.slide = Math.max(0, this.slide - dt * 3);
      if (touching && up.dot(_n) > 0.7) {
        // One or two wheels down: gently settle onto the rest.
        _axis.crossVectors(up, _n).multiplyScalar(5);
        w.add(_axis.multiplyScalar(dt * 10));
      }
    }
    this.wasGrounded = grounded;

    // --- Air control
    if (!grounded) {
      _qi.copy(this.quaternion).invert();
      _lw.copy(w).applyQuaternion(_qi);
      if (this.dodgeTime >= 0) {
        this.dodgeTime += dt;
        _lw.x = this.dodgeLocal.x;
        _lw.z = this.dodgeLocal.z;
        _lw.y += CAR.airTorque.yaw * inp.yaw * dt * 0.4;
        if (this.dodgeTime >= CAR.dodgeDuration) {
          this.dodgeTime = -1;
          _lw.x = 0;
          _lw.z = 0;
        }
      } else {
        const p = inp.pitch, y = inp.yaw, r = inp.roll;
        _lw.x += (CAR.airTorque.pitch * p - CAR.airDamp.pitch * _lw.x * (1 - Math.abs(p))) * dt;
        _lw.y += (CAR.airTorque.yaw * y - CAR.airDamp.yaw * _lw.y * (1 - Math.abs(y))) * dt;
        _lw.z += (CAR.airTorque.roll * r - CAR.airDamp.roll * _lw.z) * dt;
        const l = _lw.length();
        if (l > CAR.maxAngSpeed) _lw.multiplyScalar(CAR.maxAngSpeed / l);
      }
      w.copy(_lw).applyQuaternion(this.quaternion);
      if (Math.abs(inp.throttle) > 0.02 && !boosting && !touching) {
        vel.addScaledVector(fwd, CAR.airThrottleAccel * inp.throttle * dt);
      }
    }

    // --- Turtle recovery (on the roof or side, nearly stopped)
    const centerDist = arenaSDF(this.position.x, this.position.y, this.position.z, _sn);
    const turtled = contacts === 0 && centerDist < 0.6 && up.dot(_sn) < 0.45 && vel.lengthSq() < 16;
    this.turtleTime = turtled ? this.turtleTime + dt : 0;

    // --- Jumps, double jumps and dodges
    this.timeSinceJump += dt;
    if (turtled && ((inp.jumpPressed && this.turtleTime > 0.08) || this.turtleTime > 2.2)) {
      vel.addScaledVector(_sn, 3.8);
      _axis.crossVectors(up, _sn);
      if (_axis.lengthSq() < 1e-4) _axis.copy(fwd);
      w.copy(_axis.normalize().multiplyScalar(6.8));
      this.turtleTime = 0;
      this.hasJumped = true;
      this.hasFlipped = true;
      this.timeSinceJump = 0;
      this.groundIgnore = 0.15;
      this.justJumped = true;
    } else if (inp.jumpPressed) {
      if (grounded || (touching && contacts >= 2 && up.dot(_n) > 0.8)) {
        vel.addScaledVector(up, CAR.jumpImpulse);
        this.isJumping = true;
        this.jumpTime = 0;
        this.groundIgnore = 0.12;
        this.hasJumped = true;
        this.timeSinceJump = 0;
        this.onGround = false;
        this.justJumped = true;
      } else if (!this.hasDoubleJumped && !this.hasFlipped && this.dodgeTime < 0
        && (!this.hasJumped || this.timeSinceJump < CAR.flipWindow)) {
        const sx = inp.stickX, sy = inp.stickY;
        const mag = Math.hypot(sx, sy);
        if (mag > 0.3) {
          const nx = sx / mag, ny = sy / mag;
          _hf.copy(fwd).setY(0);
          _hr.copy(right).setY(0);
          if (_hf.lengthSq() < 1e-4) _hf.copy(up).negate().setY(0);
          if (_hr.lengthSq() < 1e-4) _hr.crossVectors(_hf, _yAxis);
          _hf.normalize();
          _hr.normalize();
          const fImp = ny >= 0 ? CAR.dodgeImpulse : CAR.dodgeBackImpulse;
          vel.addScaledVector(_hf, ny * fImp).addScaledVector(_hr, nx * CAR.dodgeImpulse);
          vel.y = vel.y > 0 ? vel.y * 0.25 : vel.y * 0.55;
          const spin = (Math.PI * 2) / CAR.dodgeDuration;
          this.dodgeLocal.set(-ny * spin, 0, -nx * spin);
          this.dodgeTime = 0;
          this.hasFlipped = true;
          this.isJumping = false;
          this.justDodged = true;
        } else {
          vel.addScaledVector(up, CAR.jumpImpulse);
          this.hasDoubleJumped = true;
          this.isJumping = false;
          this.justDoubleJumped = true;
        }
      }
    }
    if (this.isJumping) {
      this.jumpTime += dt;
      const holding = inp.jump && this.jumpTime < CAR.jumpHoldTime;
      if (holding || this.jumpTime < CAR.jumpMinTime) {
        vel.addScaledVector(up, CAR.jumpHoldAccel * dt);
      } else {
        this.isJumping = false;
      }
    }

    // --- Boost
    if (boosting) {
      vel.addScaledVector(fwd, CAR.boostAccel * dt);
      if (!this.unlimitedBoost) this.boost = Math.max(0, this.boost - CAR.boostPerSecond * dt);
    }
    this.boosting = boosting;

    // --- Limits
    const sp = vel.length();
    if (sp > CAR.maxSpeed) vel.multiplyScalar(CAR.maxSpeed / sp);
    const wl = w.length();
    const wMax = this.dodgeTime >= 0 ? 10 : (grounded ? 14 : CAR.maxAngSpeed);
    if (wl > wMax) w.multiplyScalar(wMax / wl);
    if (!Number.isFinite(sp) || !Number.isFinite(wl)) {
      vel.set(0, 0, 0);
      w.set(0, 0, 0);
    }

    this.body.setLinvel(vel, true);
    this.body.setAngvel(w, true);
    this.cmdVelocity.copy(vel);
    inp.jumpPressed = false;
  }

  afterStep() {
    if (this.demolished) return;
    this.readState();
    const sp = this.speed;
    this.supersonic = sp >= CAR.supersonicSpeed || (this.supersonic && sp > 21.0);
  }
}
