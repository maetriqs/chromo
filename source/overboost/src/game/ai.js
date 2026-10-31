// By The_headphones
// Bot driver. It only ever writes to car.input, exactly like a human would.
import * as THREE from 'three';
import { ARENA, BALL, TEAM_BLUE } from './constants.js';
import { curvatureAt } from './car.js';

const PROFILES = {
  rookie: {
    reaction: 0.55, throttle: 0.75, boost: 0.1, maxSpeed: 13, dodge: 0, jumpShot: false,
    aerial: false, aim: 5.5, steerGain: 1.9, kickoffDodge: false, sloppy: 0.25,
  },
  pro: {
    reaction: 0.2, throttle: 1, boost: 0.75, maxSpeed: 23, dodge: 0.6, jumpShot: true,
    aerial: false, aim: 1.9, steerGain: 2.8, kickoffDodge: true,
  },
  allstar: {
    reaction: 0.06, throttle: 1, boost: 1, maxSpeed: 23, dodge: 0.95, jumpShot: true,
    aerial: true, aim: 0.5, steerGain: 2.8, kickoffDodge: true,
  },
};

const { halfWidth: W, halfLength: L, goalHalfWidth: GW } = ARENA;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const _rel = new THREE.Vector3();
const _err = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwdT = new THREE.Vector3();
const _upT = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _lw = new THREE.Vector3();
const _le = new THREE.Vector3();

/** Car centre height t seconds after a full (held) jump, optionally with a double jump at 0.25 s. */
export function jumpHeight(t, double) {
  const h0 = 0.38, g = 6.5;
  if (t <= 0.2) return h0 + 2.92 * t + 0.5 * (14.58 - g) * t * t;
  const h1 = h0 + 2.92 * 0.2 + 0.5 * (14.58 - g) * 0.04;
  let v = 2.92 + (14.58 - g) * 0.2;
  if (!double || t <= 0.25) {
    const dt = t - 0.2;
    return h1 + v * dt - 0.5 * g * dt * dt;
  }
  const h2 = h1 + v * 0.05 - 0.5 * g * 0.0025;
  v = v - g * 0.05 + 2.92;
  const dt = t - 0.25;
  return h2 + v * dt - 0.5 * g * dt * dt;
}

function travelDistance(v0, vmax, t, accel) {
  const v = Math.min(v0, vmax);
  const tAcc = Math.max(0, (vmax - v) / accel);
  if (t <= tAcc) return v * t + 0.5 * accel * t * t;
  return v * tAcc + 0.5 * accel * tAcc * tAcc + vmax * (t - tAcc);
}

export class AIController {
  constructor(car, sim, difficulty = 'pro') {
    this.car = car;
    this.sim = sim;
    this.p = PROFILES[difficulty] || PROFILES.pro;
    this.planTimer = sim.random() * this.p.reaction;
    this.target = new THREE.Vector3();
    this._detour = new THREE.Vector3();
    this.faceTarget = null;
    this.avoidBall = false;
    this.targetSpeed = 23;
    this.mode = 'idle';
    this.intercept = null;
    this.seq = null;
    this.seqCooldown = 0;
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.aimOffset = (sim.random() * 2 - 1) * this.p.aim;
    this.boostRoll = 1;
    this.dodgeRoll = 1;
  }

  get sign() {
    return this.car.team === TEAM_BLUE ? 1 : -1;
  }

  update(dt) {
    const car = this.car;
    const inp = car.input;
    if (car.demolished) return;
    inp.throttle = 0; inp.steer = 0; inp.pitch = 0; inp.yaw = 0; inp.roll = 0;
    inp.stickX = 0; inp.stickY = 0; inp.boost = false; inp.powerslide = false;
    inp.jump = false; inp.jumpPressed = false;

    this.planTimer -= dt;
    if (this.seqCooldown > 0) this.seqCooldown -= dt;
    if (this.planTimer <= 0) {
      this.plan();
      this.planTimer = this.p.reaction;
    }

    if (this.seq) {
      this.runSequence(dt);
      return;
    }
    if (car.onGround) {
      this.drive(dt);
      this.considerJump();
    } else if (car.turtleTime > 0.15) {
      inp.jumpPressed = true;
    } else {
      this.recover();
      inp.throttle = 1;
    }
  }

  // ---------------------------------------------------------------- planning

  plan() {
    const sim = this.sim, car = this.car;
    this.boostRoll = sim.random();
    this.dodgeRoll = sim.random();
    this.faceTarget = null;
    this.avoidBall = false;
    if (sim.ball.hidden || !sim.predictionValid) {
      this.mode = 'idle';
      this.target.set(clamp(car.position.x, -20, 20), 0, -this.sign * 30);
      this.targetSpeed = 10;
      return;
    }
    const role = sim.roleOf(car);
    if (sim.kickoffActive) {
      if (role === 'attack') {
        this.mode = 'kickoff';
        this.target.set(0, 0, -this.sign * 0.4);
        this.targetSpeed = 23;
      } else {
        this.mode = 'support';
        this.target.set(clamp(car.position.x * 0.5, -10, 10), 0, -this.sign * (L - 8));
        this.targetSpeed = 18;
      }
      return;
    }
    if (role === 'attack') this.planAttack();
    else this.planSupport();
    if (this.p.sloppy && sim.random() < this.p.sloppy) {
      this.mode = 'attack';
      this.avoidBall = false;
      this.target.set(sim.ball.position.x, 0, sim.ball.position.z);
      this.targetSpeed = 14;
    }
  }

  /** Average acceleration needed to be at point (x,y,z) after t seconds of free flight. */
  aerialAccel(x, y, z, t, out, extraVy = 0) {
    const car = this.car;
    const k = 2 / (t * t);
    out.set(
      (x - car.position.x - car.velocity.x * t) * k,
      (y - car.position.y - (car.velocity.y + extraVy) * t) * k + 6.5,
      (z - car.position.z - car.velocity.z * t) * k,
    );
    return out;
  }

  findIntercept() {
    const car = this.car, pred = this.sim.prediction;
    const maxH = this.p.aerial ? 9 : (this.p.jumpShot ? 3.5 : 2.3);
    const hasBoost = car.boost > 8 && this.p.boost > 0.25;
    const vmax = Math.min(this.p.maxSpeed, hasBoost ? 23 : 14);
    const speed = Math.max(0, car.forwardSpeed);
    const fx = car.forward.x, fz = car.forward.z;
    const fl = Math.hypot(fx, fz) || 1;
    for (let i = 0; i < pred.length; i += 2) {
      const b = pred[i];
      if (b.y > maxH) continue;
      if (b.y > 3.6) {
        // Only take high balls we can realistically fly to.
        if (car.boost < 30 || b.t < 0.6 || b.t > 1.8) continue;
        const need = this.aerialAccel(b.x, b.y, b.z, b.t, _tmp, 5.5).length();
        if (need > 8.5) continue;
        return b;
      }
      const dx = b.x - car.position.x, dz = b.z - car.position.z;
      const dist = Math.hypot(dx, dz);
      const cosA = dist > 0.1 ? (dx * fx + dz * fz) / (dist * fl) : 1;
      const turn = Math.acos(clamp(cosA, -1, 1)) * 0.5;
      const t = b.t - turn;
      if (t <= 0) continue;
      if (travelDistance(speed, vmax, t, hasBoost ? 11 : 8) >= dist - 1.6) return b;
    }
    return pred[pred.length - 1];
  }

  planAttack() {
    const car = this.car, sim = this.sim, s = this.sign;
    const ic = this.findIntercept();
    this.intercept = ic;
    this.mode = 'attack';

    let aimX = clamp(ic.x * 0.25 + this.aimOffset, -GW + 1.8, GW - 1.8);
    let aimZ = s * (L + 4);
    // Deep in our own corner with a bad angle: clear toward the side wall instead.
    const ownDepth = -ic.z * s;
    if (ownDepth > L - 18 && Math.abs(ic.x) > GW) {
      aimX = Math.sign(ic.x) * W;
      aimZ = s * 0;
    }
    let sx = aimX - ic.x, sz = aimZ - ic.z;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl; sz /= sl;

    const cx = ic.x - car.position.x, cz = ic.z - car.position.z;
    const dist = Math.hypot(cx, cz) || 0.001;
    const align = (cx * sx + cz * sz) / dist;
    const goalSide = cz * s > 1.0;
    let tx, tz;
    if (ownDepth > L - 16 && !goalSide) {
      // Ball is deep in our end and we are upfield of it: get back to the far post first.
      this.mode = 'retreat';
      this.avoidBall = true;
      this.target.set(-(Math.sign(ic.x) || 1) * (GW - 2.5), 0, -s * (L - 1.5));
      this.targetSpeed = 23;
      return;
    }
    if (align < 0.1) {
      this.avoidBall = true;
      // We are level with or ahead of the ball: loop around it on our side,
      // wide enough not to clip it back toward our own net.
      const px = sz, pz = -sx;
      const side = Math.sign(-cx * px - cz * pz) || 1;
      const wide = dist < 8 ? 6.5 : 5;
      tx = ic.x - sx * 7 + px * side * wide;
      tz = ic.z - sz * 7 + pz * side * wide;
      this.targetSpeed = 23;
    } else {
      let offset = BALL.radius + 0.55;
      if (align < 0.85) offset += (0.85 - align) * Math.min(dist * 0.45, 9);
      tx = ic.x - sx * offset;
      tz = ic.z - sz * offset;
      // Drive at the average speed that gets us there on time (no early overshoot).
      this.targetSpeed = ic.t < 0.25 ? 23 : clamp((dist - offset) / ic.t + 1.5, 3, 23);
    }
    this.target.set(clamp(tx, -W + 2, W - 2), 0, clamp(tz, -L + 1.5, L - 1.5));
    // Allow chasing into the goal mouth when the ball is there.
    if (Math.abs(ic.x) < GW && Math.abs(ic.z) > L - 3) this.target.z = clamp(tz, -L - 6, L + 6);
    if (sim.ballThreat === car.team && sim.threatTime < 2.5) this.targetSpeed = 23;
  }

  planSupport() {
    const car = this.car, sim = this.sim, s = this.sign;
    const ball = sim.ball.position;
    this.mode = 'support';
    this.avoidBall = true;
    const ballOurHalf = ball.z * s < 4;
    if (ballOurHalf || sim.ballThreat === car.team) {
      this.target.set(clamp(ball.x * 0.35, -5, 5), 0, -s * (L - 3.5));
      this.faceTarget = ball;
      const d = this.target.distanceTo(_tmp.set(car.position.x, 0, car.position.z));
      this.targetSpeed = d > 12 ? 23 : Math.max(3, d * 1.5);
      return;
    }
    if (car.boost < 35) {
      let best = null, bd = Infinity;
      for (let i = 0; i < this.sim.pads.length; i++) {
        const pad = this.sim.pads[i];
        if (!pad.big || !pad.active || pad.z * s > 10) continue;
        const d = Math.hypot(pad.x - car.position.x, pad.z - car.position.z);
        if (d < bd) { bd = d; best = pad; }
      }
      if (best && bd < 45) {
        this.target.set(best.x, 0, best.z);
        this.targetSpeed = 23;
        return;
      }
    }
    this.target.set(clamp(ball.x * 0.45, -25, 25), 0, clamp(ball.z - s * 24, -L + 6, L - 6));
    this.faceTarget = ball;
    const d = this.target.distanceTo(_tmp.set(car.position.x, 0, car.position.z));
    this.targetSpeed = d > 10 ? 20 : Math.max(2, d * 1.4);
  }

  // ----------------------------------------------------------------- driving

  drive(dt) {
    const car = this.car, inp = car.input, p = this.p;
    let target = this.target;
    if (this.avoidBall && !this.sim.ball.hidden) target = this.detour(target);
    const toTarget = _rel.copy(target).sub(car.position);
    let dist = Math.hypot(toTarget.x, toTarget.z);
    if (this.faceTarget && dist < 3) {
      target = this.faceTarget;
      toTarget.copy(target).sub(car.position);
    }
    // Project onto the car's driving plane (works on walls too).
    const lf = toTarget.dot(car.forward), lr = toTarget.dot(car.right);
    const ang = Math.atan2(lr, lf);
    dist = Math.hypot(lf, lr);
    const speed = car.forwardSpeed;

    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      inp.throttle = -1;
      inp.steer = -Math.sign(ang);
      return;
    }

    inp.steer = clamp(ang * p.steerGain, -1, 1);
    let desired = Math.min(this.targetSpeed, p.maxSpeed);
    if (this.faceTarget && this.target.distanceTo(car.position) < 3) {
      desired = Math.abs(ang) > 0.5 ? 3 : 0;
    }
    // Target inside our turning circle: slow down so we can actually get there.
    const radius = 1 / curvatureAt(Math.max(speed, 1));
    const sideDist = Math.abs(lr), aheadDist = Math.abs(lf);
    const cxDist = Math.hypot(sideDist - radius, aheadDist);
    if (cxDist < radius * 0.95 && dist < radius * 2.2) desired = Math.min(desired, 7);
    if (Math.abs(ang) > 1.0) desired = Math.min(desired, 13);

    if (speed < desired - 0.5) inp.throttle = p.throttle;
    else if (speed > desired + 2.5) inp.throttle = -0.6;
    else inp.throttle = 0.15;
    inp.powerslide = Math.abs(ang) > 1.35 && speed > 7;
    inp.boost = this.boostRoll < p.boost && Math.abs(ang) < 0.3 && speed > 2 && speed < desired - 1
      && desired > 15 && car.boost > 0;
    if (this.mode === 'kickoff' && p.boost > 0.5) inp.boost = Math.abs(ang) < 0.5;

    // Stuck against something?
    if (inp.throttle > 0.5 && Math.abs(speed) < 1.2 && car.wheelContacts >= 3) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.1) {
        this.stuckTime = 0;
        this.reverseTime = 0.7;
      }
    } else {
      this.stuckTime = 0;
    }
  }

  /** If the straight path to `target` clips the ball, steer past its side instead. */
  detour(target) {
    const car = this.car, b = this.sim.ball.position;
    const ax = car.position.x, az = car.position.z;
    const dx = target.x - ax, dz = target.z - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return target;
    const t = ((b.x - ax) * dx + (b.z - az) * dz) / len2;
    if (t <= 0 || t >= 1 || b.y > 3) return target;
    const px = ax + dx * t - b.x, pz = az + dz * t - b.z;
    const clear = 3.2;
    if (px * px + pz * pz > clear * clear) return target;
    const len = Math.sqrt(len2);
    let nx = -dz / len, nz = dx / len;
    if (nx * (ax - b.x) + nz * (az - b.z) < 0) { nx = -nx; nz = -nz; }
    return this._detour.set(b.x + nx * (clear + 1), 0, b.z + nz * (clear + 1));
  }

  considerJump() {
    if (this.seqCooldown > 0) return;
    const car = this.car, sim = this.sim, p = this.p;
    if (sim.ball.hidden) return;
    const ball = sim.ball;
    _rel.copy(ball.position).sub(car.position);
    const lf = _rel.dot(car.forward), lr = _rel.dot(car.right);
    const horiz = Math.hypot(lf, lr);
    const ang = Math.atan2(lr, lf);
    const h = ball.position.y;
    const closing = car.velocity.dot(_tmp.copy(_rel).normalize()) - ball.velocity.dot(_tmp);
    const onFloor = car.groundNormal.y > 0.9;

    if (this.mode === 'kickoff') {
      if (p.kickoffDodge && horiz < 3.6 + Math.max(0, closing) * 0.12 && Math.abs(ang) < 0.35) {
        this.startSeq('dodge', { x: clamp(lr * 0.4, -1, 1), y: 1 });
      }
      return;
    }
    if (this.mode !== 'attack') {
      // Defensive emergency clear when the ball rolls past us.
      const goalSide = (ball.position.z - car.position.z) * this.sign > 0.8;
      if (goalSide && horiz < 3 && h < 1.6 && sim.ballThreat === car.team && Math.abs(ang) < 0.4 && onFloor) {
        this.startSeq('dodge', { x: 0, y: 1 });
      }
      return;
    }
    // Aerial (All-Star only)
    const ic = this.intercept;
    if (p.aerial && ic && onFloor && ic.y > 4.5 && ic.t > 0.6 && ic.t < 1.8 && car.boost > 30
      && !this.opponentCloser(ic)) {
      const a = this.aerialAccel(ic.x, ic.y, ic.z, ic.t, _tmp, 5.5);
      const dx = ic.x - car.position.x, dz = ic.z - car.position.z;
      const fl = Math.hypot(car.forward.x, car.forward.z) || 1;
      const facing = (dx * car.forward.x + dz * car.forward.z) / ((Math.hypot(dx, dz) || 1) * fl);
      if (a.length() < 7.5 && facing > 0.94) {
        this.startSeq('aerial', null);
        return;
      }
    }
    if (p.jumpShot && onFloor && Math.abs(ang) < 0.35 && sim.predictionValid) {
      // Time until we reach the ball, then match its predicted height with a jump arc.
      const vc = Math.max(1, closing);
      const tReach = Math.max(0, horiz - 1.1) / vc;
      if (tReach > 0.12 && tReach < 0.95) {
        const idx = clamp(Math.round(tReach * 30) - 1, 0, sim.prediction.length - 1);
        const bh = sim.prediction[idx].y;
        if (bh > 1.9) {
          if (Math.abs(bh - (jumpHeight(tReach, false) + 0.55)) < 0.55) { this.startSeq('jump', null); return; }
          if (bh > 3.0 && Math.abs(bh - (jumpHeight(tReach, true) + 0.55)) < 0.65) { this.startSeq('doubleJump', null); return; }
        }
      }
    }
    if (this.dodgeRoll < p.dodge && onFloor && h < 1.7 && horiz < 3.1 && Math.abs(ang) < 0.25
      && car.forwardSpeed > 7) {
      const s = this.sign;
      const toGoalZ = s * L - ball.position.z;
      const toGoalX = -ball.position.x;
      const gl = Math.hypot(toGoalX, toGoalZ) || 1;
      const align = (_rel.x * toGoalX + _rel.z * toGoalZ) / ((Math.hypot(_rel.x, _rel.z) || 1) * gl);
      if (align > 0.6) this.startSeq('dodge', { x: clamp(lr * 0.35, -0.6, 0.6), y: 1 });
    }
  }

  opponentCloser(p) {
    const me = Math.hypot(p.x - this.car.position.x, p.z - this.car.position.z);
    for (const c of this.sim.cars) {
      if (c.team === this.car.team || c.demolished) continue;
      if (Math.hypot(p.x - c.position.x, p.z - c.position.z) < me - 2) return true;
    }
    return false;
  }

  // ---------------------------------------------------------- jump sequences

  startSeq(type, dir) {
    this.seq = { type, t: 0, dir, pressed: 0 };
    this.seqCooldown = 1.0;
  }

  runSequence(dt) {
    const car = this.car, inp = car.input, s = this.seq;
    s.t += dt;
    inp.throttle = 1;
    switch (s.type) {
      case 'dodge':
        if (s.pressed === 0) { inp.jump = true; inp.jumpPressed = true; s.pressed = 1; }
        else if (s.t < 0.06) inp.jump = true;
        else if (s.pressed === 1 && s.t >= 0.1) {
          inp.jump = true; inp.jumpPressed = true; s.pressed = 2;
          inp.stickX = s.dir.x; inp.stickY = s.dir.y;
          inp.pitch = -s.dir.y; inp.yaw = -s.dir.x;
        }
        if (s.t > 0.95 || (s.pressed === 2 && car.onGround && s.t > 0.3)) this.seq = null;
        break;
      case 'jump':
      case 'doubleJump':
        if (s.pressed === 0) { inp.jump = true; inp.jumpPressed = true; s.pressed = 1; }
        else if (s.t < 0.2) inp.jump = true;
        else if (s.type === 'doubleJump' && s.pressed === 1 && s.t > 0.24) {
          inp.jump = true; inp.jumpPressed = true; s.pressed = 2;
        }
        this.aimNose(this.sim.ball.position, false);
        if (s.t > 1.2 || (car.onGround && s.t > 0.3)) this.seq = null;
        break;
      case 'aerial': {
        if (s.pressed === 0) { inp.jump = true; inp.jumpPressed = true; s.pressed = 1; }
        else if (s.t < 0.2) inp.jump = true;
        else if (s.pressed === 1 && s.t > 0.24) { inp.jump = true; inp.jumpPressed = true; s.pressed = 2; }
        // Re-pick the predicted ball sample that needs the least acceleration to reach.
        const pred = this.sim.prediction;
        const sg = this.sign;
        let best = Infinity, bx = 0, by = 0, bz = 0, bt = 1;
        if (this.sim.predictionValid) {
          for (let i = 2; i < 60; i += 2) {
            const b = pred[i];
            let gx = -b.x, gz = sg * L - b.z;
            const gl = Math.hypot(gx, gz) || 1;
            gx /= gl; gz /= gl;
            const need = this.aerialAccel(b.x - gx * 0.9, b.y, b.z - gz * 0.9, b.t, _upT).length();
            if (need < best) { best = need; bx = b.x - gx * 0.9; by = b.y; bz = b.z - gz * 0.9; bt = b.t; }
          }
        }
        if (best > 11 || !this.sim.predictionValid) { this.seq = null; break; }
        const a = this.aerialAccel(bx, by, bz, bt, _upT);
        _fwdT.copy(a).normalize();
        const aligned = this.aimNose(_fwdT.add(car.position), false, 0);
        if (s.t > 0.05) inp.boost = car.boost > 0 && aligned > 0.8 && best > 2.5;
        const done = this.sim.ball.lastTouch === car && this.sim.time - this.sim.ball.lastTouchTime < 0.2;
        if (done || s.t > 2.6 || (car.onGround && s.t > 0.4)) this.seq = null;
        break;
      }
      default:
        this.seq = null;
    }
  }

  /** Air orientation: point the nose at `point`; returns dot(forward, desired). */
  aimNose(point, rollUpright, rollWeight = rollUpright ? 1 : 0.4) {
    const car = this.car;
    _fwdT.copy(point).sub(car.position);
    if (_fwdT.lengthSq() < 1e-4) return 1;
    _fwdT.normalize();
    _upT.set(0, 1, 0);
    if (rollUpright) _upT.addScaledVector(_fwdT, -_fwdT.y).normalize();
    this.orient(_fwdT, _upT, rollWeight);
    return car.forward.dot(_fwdT);
  }

  /** Air recovery: land on the wheels, nose along horizontal travel. */
  recover() {
    const car = this.car;
    _fwdT.set(car.velocity.x, 0, car.velocity.z);
    if (_fwdT.lengthSq() < 4) _fwdT.set(car.forward.x, 0, car.forward.z);
    if (_fwdT.lengthSq() < 1e-4) _fwdT.set(0, 0, this.sign);
    _fwdT.normalize();
    // Nose slightly down when falling so the front wheels meet the ground first.
    _upT.set(0, 1, 0);
    this.orient(_fwdT, _upT, 1);
  }

  orient(fwdT, upT, rollWeight) {
    const car = this.car, inp = car.input;
    _err.crossVectors(car.forward, fwdT).add(_tmp.crossVectors(car.up, upT).multiplyScalar(rollWeight));
    if (car.forward.dot(fwdT) < -0.5) _err.add(_tmp.copy(car.up).multiplyScalar(0.8));
    _qi.copy(car.quaternion).invert();
    _le.copy(_err).applyQuaternion(_qi);
    _lw.copy(car.angularVelocity).applyQuaternion(_qi);
    const kp = 4.2, kd = 0.75;
    inp.pitch = clamp(_le.x * kp - _lw.x * kd, -1, 1);
    inp.yaw = clamp(_le.y * kp - _lw.y * kd, -1, 1);
    inp.roll = clamp(_le.z * kp - _lw.z * kd, -1, 1);
  }
}
