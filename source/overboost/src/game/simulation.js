// By The_headphones
// Rendering-agnostic game simulation. Runs identically in the browser and in
// Node (see tests/sim.test.mjs). The app reads state and drains `events`.
import * as THREE from 'three';
import {
  BALL, BIG_PADS, FIXED_DT, GRAVITY, KICKOFF_SPOTS, RESPAWN_SPOTS, SMALL_PADS,
  TEAM_BLUE, TEAM_ORANGE,
} from './constants.js';
import { PhysicsWorld } from './physics.js';
import { Car, emptyInput } from './car.js';
import { Ball } from './ball.js';
import { AIController } from './ai.js';
import { arenaSDF, goalContaining, predictBallPath } from './arenaShape.js';
import { SHOT_TIME, TRAINING_SHOTS } from './training.js';

const BOT_NAMES = ['Viper', 'Comet', 'Sundown', 'Bandit', 'Frost', 'Rook', 'Nova', 'Jinx', 'Ember', 'Static'];
const KICKOFF_PAIRS = [[0, 1], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4], [0, 3], [1, 2]];
const FROZEN_INPUT = emptyInput();
const PRED_STEPS = 120;
const PRED_DT = 1 / 30;

const _d = new THREE.Vector3();
const _v = new THREE.Vector3();

export const faceYaw = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hitScale(relSpeed) {
  // Extra "kick" on top of the rigid-body response, strongest for soft touches.
  if (relSpeed <= 5) return 0.65;
  if (relSpeed <= 23) return 0.65 - 0.1 * ((relSpeed - 5) / 18);
  return 0.55 - 0.25 * Math.min(1, (relSpeed - 23) / 23);
}

export class Simulation {
  constructor(RAPIER, config = {}) {
    this.config = {
      mode: 'match', // match | freeplay | training | exhibition
      teamSize: 1,
      difficulty: 'pro',
      matchSeconds: 300,
      seed: undefined,
      ...config,
    };
    let seed = this.config.seed ?? Math.floor(Math.random() * 1e9);
    this.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    this.physics = new PhysicsWorld(RAPIER);
    this.ball = new Ball(this.physics);
    this.cars = [];
    this.ais = [];
    this.human = null;
    this.events = [];
    this.time = 0;
    this.stepCount = 0;
    this.score = [0, 0];
    this.state = 'init';
    this.stateTime = 0;
    this.countdown = 0;
    this.lastCount = 0;
    this.timed = Number.isFinite(this.config.matchSeconds) && (this.config.mode === 'match');
    this.timeLeft = this.timed ? this.config.matchSeconds : 0;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.overtimeWait = 0;
    this.kickoffActive = false;
    this.clockRunning = false;
    this.goalDelay = 3;
    this.winner = -1;
    this.freeplayGoals = 0;
    this.ballHold = { x: 0, y: BALL.radius, z: 0, vx: 0, vy: 0, vz: 0 };
    this.resetCooldown = 0;

    this.pads = [
      ...BIG_PADS.map(([x, z]) => ({ x, z, big: true, active: true, timer: 0 })),
      ...SMALL_PADS.map(([x, z]) => ({ x, z, big: false, active: true, timer: 0 })),
    ];
    this.prediction = Array.from({ length: PRED_STEPS }, () => ({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    this.predictionValid = false;
    this.ballThreat = -1;
    this.threatTime = 99;
    this.lastShotBy = null;
    this.pendingShotCheck = null;
    this.lastTouchByTeam = [null, null];
    this.roles = new Map();
    this.training = null;
    this.hitThisStep = false;

    this.onContact = this.onContact.bind(this);
    this.setupCars();
    this.startMode();
  }

  // ------------------------------------------------------------------ setup

  setupCars() {
    const { mode, teamSize, difficulty } = this.config;
    const names = shuffled(BOT_NAMES, this.random);
    let ni = 0;
    const add = (team, isHuman, diff) => {
      const car = new Car(this.physics, {
        id: this.cars.length, team, isHuman, name: isHuman ? 'You' : names[ni++],
      });
      this.cars.push(car);
      if (!isHuman) {
        car.difficulty = diff;
        this.ais.push(new AIController(car, this, diff));
      }
      return car;
    };
    if (mode === 'exhibition') {
      add(TEAM_BLUE, false, 'pro');
      add(TEAM_BLUE, false, 'allstar');
      add(TEAM_ORANGE, false, 'pro');
      add(TEAM_ORANGE, false, 'allstar');
    } else if (mode === 'freeplay' || mode === 'training') {
      this.human = add(TEAM_BLUE, true);
      this.human.unlimitedBoost = true;
      this.human.boost = 100;
    } else {
      this.human = add(TEAM_BLUE, true);
      for (let i = 1; i < teamSize; i++) add(TEAM_BLUE, false, difficulty);
      for (let i = 0; i < teamSize; i++) add(TEAM_ORANGE, false, difficulty);
    }
  }

  startMode() {
    const { mode } = this.config;
    if (mode === 'freeplay') {
      this.resetFreeplay();
      this.setState('playing');
    } else if (mode === 'training') {
      this.training = { index: 0, results: [], timer: SHOT_TIME, total: TRAINING_SHOTS.length };
      this.startShot();
    } else {
      this.startKickoff();
    }
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  emit(e) {
    this.events.push(e);
  }

  carsOf(team) {
    return this.cars.filter((c) => c.team === team);
  }

  // --------------------------------------------------------------- kickoff

  startKickoff() {
    this.ball.reset(0, BALL.radius, 0);
    this.ballHold = { x: 0, y: BALL.radius, z: 0, vx: 0, vy: 0, vz: 0 };
    const blue = this.carsOf(TEAM_BLUE), orange = this.carsOf(TEAM_ORANGE);
    const n = Math.max(blue.length, orange.length);
    let spots;
    if (n <= 1) spots = [Math.floor(this.random() * KICKOFF_SPOTS.length)];
    else spots = KICKOFF_PAIRS[Math.floor(this.random() * KICKOFF_PAIRS.length)];
    const place = (team, cars) => {
      const order = shuffled(spots, this.random);
      cars.forEach((car, i) => {
        const s = KICKOFF_SPOTS[order[i % order.length]];
        const x = team === TEAM_BLUE ? s.x : -s.x;
        const z = team === TEAM_BLUE ? s.z : -s.z;
        if (car.demolished) car.setDemolished(false);
        car.respawnTimer = 0;
        car.reset(x, z, faceYaw(x, z, 0, 0));
        car.boost = car.unlimitedBoost ? 100 : 33;
      });
    };
    place(TEAM_BLUE, blue);
    place(TEAM_ORANGE, orange);
    for (const p of this.pads) { p.active = true; p.timer = 0; }
    this.countdown = 3;
    this.lastCount = 4;
    this.kickoffActive = true;
    this.clockRunning = false;
    this.lastShotBy = null;
    this.lastTouchByTeam = [null, null];
    this.setState('countdown');
    this.emit({ type: 'kickoff' });
  }

  resetFreeplay() {
    this.ball.reset(0, BALL.radius, 0);
    this.lastTouchByTeam = [null, null];
    const car = this.human;
    car.reset(0, -30, Math.PI);
    car.boost = 100;
  }

  // ---------------------------------------------------------------- training

  startShot() {
    const t = this.training;
    const shot = TRAINING_SHOTS[t.index];
    const [px, py, pz] = shot.ball.p, [vx, vy, vz] = shot.ball.v;
    this.ball.reset(px, py, pz);
    this.ballHold = { x: px, y: py, z: pz, vx, vy, vz };
    this.lastTouchByTeam = [null, null];
    this.human.reset(shot.car.x, shot.car.z, shot.car.yaw);
    this.human.boost = 100;
    t.timer = SHOT_TIME;
    this.countdown = 2;
    this.lastCount = 3;
    this.setState('countdown');
    this.emit({ type: 'trainingShot', index: t.index, name: shot.name, total: t.total });
  }

  endShot(success) {
    const t = this.training;
    t.results.push(success);
    this.emit({ type: 'trainingResult', index: t.index, success });
  }

  nextShot() {
    const t = this.training;
    t.index++;
    if (t.index >= t.total) {
      this.setState('ended');
      this.emit({ type: 'trainingEnd', results: t.results.slice() });
    } else {
      this.startShot();
    }
  }

  // ------------------------------------------------------------------ step

  step() {
    const dt = FIXED_DT;
    this.time += dt;
    this.stepCount++;
    this.stateTime += dt;
    if (this.resetCooldown > 0) this.resetCooldown -= dt;
    if (this.stepCount % 4 === 1) this.updatePrediction();
    if (this.stepCount % 12 === 1) this.updateRoles();

    const frozen = this.state === 'countdown' || this.state === 'ended';
    if (!frozen) for (const ai of this.ais) ai.update(dt);

    this.ball.beginStep();
    for (const car of this.cars) {
      car.beginStep();
      if (car.demolished) {
        car.respawnTimer -= dt;
        if (car.respawnTimer <= 0 && this.state !== 'ended') this.respawn(car);
        continue;
      }
      if (frozen) {
        car.input.jumpPressed = false;
        car.update(dt, FROZEN_INPUT);
      } else {
        car.update(dt);
      }
      if (car.justJumped) this.emit({ type: 'jump', car });
      if (car.justDoubleJumped) this.emit({ type: 'jump', car, double: true });
      if (car.justDodged) this.emit({ type: 'dodge', car });
      if (car.justLanded) this.emit({ type: 'land', car });
    }

    if (this.state === 'countdown' && !this.ball.hidden) {
      const h = this.ballHold;
      this.ball.body.setTranslation({ x: h.x, y: h.y, z: h.z }, true);
      this.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    this.hitThisStep = false;
    this.physics.step(this.onContact);
    this.ball.afterStep();
    for (const car of this.cars) car.afterStep();

    this.detectBounce(dt);
    this.updatePads(dt);
    this.updateState(dt);
    this.safetyChecks();
  }

  detectBounce(dt) {
    const b = this.ball;
    if (b.hidden || this.hitThisStep || this.state === 'countdown') return;
    _v.copy(b.velocity).sub(b.preVelocity);
    _v.y += GRAVITY * dt;
    const dv = _v.length();
    if (dv > 2.5 && arenaSDF(b.position.x, b.position.y, b.position.z) < BALL.radius + 0.25) {
      this.emit({ type: 'bounce', strength: dv, position: b.position.clone() });
    }
  }

  updatePads(dt) {
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) pad.active = true;
        continue;
      }
      const r = pad.big ? 2.08 : 1.44;
      const r2 = r * r;
      for (const car of this.cars) {
        if (car.demolished || car.boost >= 100) continue;
        const dx = car.position.x - pad.x, dz = car.position.z - pad.z;
        if (dx * dx + dz * dz < r2 && car.position.y < (pad.big ? 2.2 : 1.9)) {
          car.boost = Math.min(100, car.boost + (pad.big ? 100 : 12));
          pad.active = false;
          pad.timer = pad.big ? 10 : 4;
          this.emit({ type: 'pickup', car, big: pad.big, pad });
          break;
        }
      }
    }
  }

  updateState(dt) {
    const mode = this.config.mode;
    switch (this.state) {
      case 'countdown': {
        this.countdown -= dt;
        const c = Math.ceil(this.countdown);
        if (c !== this.lastCount && c > 0 && c <= 3) {
          this.lastCount = c;
          this.emit({ type: 'countdown', value: c });
        }
        if (this.countdown <= 0) {
          const h = this.ballHold;
          if (h.vx || h.vy || h.vz) this.ball.reset(h.x, h.y, h.z, h.vx, h.vy, h.vz);
          this.setState('playing');
          this.emit({ type: 'go' });
        }
        break;
      }
      case 'playing': {
        if (!this.clockRunning && (this.ball.lastTouch || this.stateTime > 4)) {
          this.clockRunning = true;
        }
        if (this.kickoffActive && (this.ball.lastTouch || this.stateTime > 6)) this.kickoffActive = false;
        if (this.timed && !this.overtime && this.clockRunning) {
          if (this.timeLeft > 0) {
            this.timeLeft = Math.max(0, this.timeLeft - dt);
            if (this.timeLeft === 0) this.emit({ type: 'timeUp' });
          } else {
            this.overtimeWait += dt;
            const grounded = this.ball.position.y < BALL.radius + 0.25;
            if (grounded || this.overtimeWait > 12) this.endRegulation();
          }
        }
        if (this.overtime) this.overtimeElapsed += dt;
        if (mode === 'training') {
          this.training.timer -= dt;
          if (this.training.timer <= 0) {
            this.training.timer = 0;
            this.endShot(false);
            this.setState('shotEnd');
            break;
          }
        }
        this.checkGoal();
        break;
      }
      case 'goal':
        if (this.stateTime >= this.goalDelay) this.afterGoal();
        break;
      case 'shotEnd':
        if (this.stateTime >= 1.6) this.nextShot();
        break;
      case 'overtimeIntro':
        if (this.stateTime >= 2.5) {
          this.overtime = true;
          this.startKickoff();
        }
        break;
      default:
        break;
    }
  }

  checkGoal() {
    const b = this.ball;
    if (b.hidden) return;
    const side = goalContaining(b.position.x, b.position.y, b.position.z, BALL.radius);
    if (side) this.onGoal(side > 0 ? TEAM_BLUE : TEAM_ORANGE);
  }

  onGoal(team) {
    const b = this.ball;
    const mode = this.config.mode;
    // Credit goes to the scoring team's most recent toucher; it is only an own
    // goal when nobody on the scoring team touched the ball since the kickoff.
    const scorer = this.lastTouchByTeam[team];
    const own = !scorer && !!b.lastTouch;
    const speedKmh = b.velocity.length() * 3.6;
    const position = b.position.clone();
    if (mode === 'match' || mode === 'exhibition') {
      this.score[team]++;
      if (scorer) scorer.stats.goals++;
    } else if (mode === 'freeplay') {
      this.freeplayGoals++;
    }
    if (mode === 'training') this.endShot(team === TEAM_BLUE);
    this.emit({ type: 'goal', team, scorer, own, speedKmh, position });
    b.setHidden(true);

    // Shockwave pushes nearby cars away from the explosion.
    for (const car of this.cars) {
      if (car.demolished) continue;
      _d.copy(car.position).sub(position);
      const dist = _d.length();
      if (dist < 14 && dist > 0.01) {
        const k = (14 - dist) * 1.1;
        _d.multiplyScalar(k / dist);
        _d.y += k * 0.35;
        const lv = car.body.linvel();
        car.body.setLinvel({ x: lv.x + _d.x, y: lv.y + _d.y, z: lv.z + _d.z }, true);
      }
    }
    this.goalDelay = mode === 'freeplay' ? 2 : (mode === 'training' ? 2 : 3);
    this.setState('goal');
  }

  afterGoal() {
    const mode = this.config.mode;
    if (mode === 'freeplay') {
      this.ball.reset(0, 5, 0);
      this.lastTouchByTeam = [null, null];
      this.setState('playing');
      return;
    }
    if (mode === 'training') {
      this.nextShot();
      return;
    }
    if (this.overtime) return this.endMatch();
    if (this.timed && this.timeLeft <= 0) return this.endRegulation();
    this.startKickoff();
  }

  endRegulation() {
    if (this.score[0] === this.score[1]) {
      this.ball.setHidden(true);
      this.setState('overtimeIntro');
      this.emit({ type: 'overtime' });
    } else {
      this.endMatch();
    }
  }

  endMatch() {
    this.winner = this.score[0] > this.score[1] ? TEAM_BLUE : TEAM_ORANGE;
    this.setState('ended');
    this.emit({ type: 'matchEnd', winner: this.winner, score: this.score.slice() });
  }

  // -------------------------------------------------------------- contacts

  onContact(a, b) {
    if (!a || !b) return;
    if (a.kind === 'ball' && b.kind === 'car') this.carHitBall(b);
    else if (a.kind === 'car' && b.kind === 'ball') this.carHitBall(a);
    else if (a.kind === 'car' && b.kind === 'car') this.carHitCar(a, b);
  }

  carHitBall(car) {
    const ball = this.ball;
    if (ball.hidden || this.state === 'countdown') return;
    this.hitThisStep = true;
    if (this.time - car.lastBallTouch < 0.1) {
      car.lastBallTouch = this.time;
      return;
    }
    car.lastBallTouch = this.time;
    ball.readState();
    car.readState();
    _d.copy(ball.position).sub(car.position);
    _v.copy(ball.preVelocity).sub(car.cmdVelocity);
    const relSpeed = Math.min(_v.length(), 46);
    if (relSpeed > 0.5) {
      _d.y *= 0.35;
      _d.normalize();
      ball.velocity.addScaledVector(_d, relSpeed * hitScale(relSpeed));
      ball.body.setLinvel(ball.velocity, true);
    }
    if (this.ballThreat === car.team && this.lastShotBy && this.lastShotBy.team !== car.team && this.threatTime < 2.5) {
      car.stats.saves++;
      this.lastShotBy = null;
      this.emit({ type: 'save', car });
    }
    ball.lastTouch = car;
    ball.lastTouchTime = this.time;
    this.lastTouchByTeam[car.team] = car;
    car.stats.touches++;
    this.pendingShotCheck = car;
    _d.copy(car.position).sub(ball.position).normalize().multiplyScalar(BALL.radius).add(ball.position);
    this.emit({ type: 'hit', car, strength: relSpeed, position: _d.clone() });
  }

  carHitCar(a, b) {
    if (a.demolished || b.demolished) return;
    for (const [att, vic] of [[a, b], [b, a]]) {
      _d.copy(vic.position).sub(att.position);
      const dist = _d.length() || 1;
      _d.multiplyScalar(1 / dist);
      const closing = att.cmdVelocity.dot(_d);
      if (att.team !== vic.team && att.supersonic && closing > 14 && this.state !== 'countdown') {
        this.demolish(vic, att);
        return;
      }
    }
    // Ordinary bump: the faster car shoves the other a little extra.
    _d.copy(b.position).sub(a.position).normalize();
    const ca = a.cmdVelocity.dot(_d), cb = -b.cmdVelocity.dot(_d);
    const [att, vic, closing] = ca >= cb ? [a, b, ca] : [b, a, cb];
    if (closing > 5) {
      if (att === b) _d.negate();
      const lv = vic.body.linvel();
      const k = closing * 0.3;
      vic.body.setLinvel({ x: lv.x + _d.x * k, y: lv.y + 1.2 + Math.max(0, _d.y) * k, z: lv.z + _d.z * k }, true);
      this.emit({ type: 'bump', a: att, b: vic, strength: closing });
    }
  }

  demolish(victim, attacker) {
    const position = victim.position.clone();
    victim.setDemolished(true);
    victim.respawnTimer = 3;
    attacker.stats.demos++;
    this.emit({ type: 'demolish', victim, attacker, position });
  }

  respawn(car) {
    const s = RESPAWN_SPOTS[Math.floor(this.random() * RESPAWN_SPOTS.length)];
    const x = car.team === TEAM_BLUE ? s.x : -s.x;
    const z = car.team === TEAM_BLUE ? s.z : -s.z;
    car.setDemolished(false);
    car.reset(x, z, faceYaw(x, z, 0, 0));
    car.boost = car.unlimitedBoost ? 100 : 33;
    this.emit({ type: 'respawn', car });
  }

  /** Player-requested reset (R). */
  requestReset() {
    const car = this.human;
    if (!car || this.resetCooldown > 0 || this.state === 'countdown' || this.state === 'ended') return false;
    const mode = this.config.mode;
    if (mode === 'freeplay') {
      this.resetFreeplay();
    } else if (mode === 'training') {
      const shot = TRAINING_SHOTS[this.training.index];
      car.reset(shot.car.x, shot.car.z, shot.car.yaw);
    } else {
      if (car.demolished) return false;
      const s = RESPAWN_SPOTS[Math.floor(this.random() * RESPAWN_SPOTS.length)];
      car.reset(s.x, s.z, faceYaw(s.x, s.z, 0, 0));
      this.resetCooldown = 2;
    }
    this.emit({ type: 'reset', car });
    return true;
  }

  // ------------------------------------------------------------- AI support

  updatePrediction() {
    const b = this.ball;
    if (b.hidden) {
      this.predictionValid = false;
      this.ballThreat = -1;
      return;
    }
    predictBallPath(
      { x: b.position.x, y: b.position.y, z: b.position.z, vx: b.velocity.x, vy: b.velocity.y, vz: b.velocity.z },
      { radius: BALL.radius, gravity: GRAVITY, restitution: BALL.restitution, drag: BALL.linearDamping, dt: PRED_DT, steps: PRED_STEPS },
      this.prediction,
    );
    this.predictionValid = true;
    this.ballThreat = -1;
    this.threatTime = 99;
    for (const s of this.prediction) {
      const g = goalContaining(s.x, s.y, s.z, BALL.radius * 0.5);
      if (g) {
        this.ballThreat = g > 0 ? TEAM_ORANGE : TEAM_BLUE;
        this.threatTime = s.t;
        break;
      }
    }
    const c = this.pendingShotCheck;
    if (c) {
      this.pendingShotCheck = null;
      if (this.ballThreat >= 0 && this.ballThreat !== c.team && this.threatTime < 4 && this.lastShotBy !== c) {
        c.stats.shots++;
        this.lastShotBy = c;
        this.emit({ type: 'shot', car: c });
      }
    }
  }

  costToBall(car) {
    const p = this.predictionValid ? this.prediction[15] : this.ball.position;
    const dx = p.x - car.position.x, dz = p.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    const s = car.team === TEAM_BLUE ? 1 : -1;
    let cost = dist / 15;
    if ((p.z - car.position.z) * s < -2) cost += 1.4; // on the wrong side of the ball
    if (car.isHuman) cost -= 0.35; // bots defer to a human teammate
    if (this.roles.get(car) === 'attack') cost -= 0.25; // hysteresis
    return cost;
  }

  updateRoles() {
    for (const team of [TEAM_BLUE, TEAM_ORANGE]) {
      let best = null, bestCost = Infinity;
      const mates = this.cars.filter((c) => c.team === team && !c.demolished);
      for (const c of mates) {
        const cost = this.costToBall(c);
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      for (const c of mates) this.roles.set(c, c === best ? 'attack' : 'support');
    }
  }

  roleOf(car) {
    return this.roles.get(car) || 'attack';
  }

  safetyChecks() {
    // If anything ever escapes the arena (should not happen), put it back.
    const b = this.ball;
    if (!b.hidden && arenaSDF(b.position.x, b.position.y, b.position.z) < -2.5) {
      b.reset(0, 5, 0);
    }
    for (const car of this.cars) {
      if (car.demolished) continue;
      if (arenaSDF(car.position.x, car.position.y, car.position.z) < -1.5 || !Number.isFinite(car.position.x)) {
        this.respawn(car);
      }
    }
  }

  dispose() {
    this.physics.free();
    this.cars.length = 0;
    this.ais.length = 0;
  }
}
