// By The_headphones
// Headless checks of car physics, ball hits and full AI matches.
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/game/simulation.js';
import { FIXED_DT, TEAM_BLUE, TEAM_ORANGE } from '../src/game/constants.js';
import { arenaSDF } from '../src/game/arenaShape.js';

await RAPIER.init();
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const run = (sim, seconds, fn) => { const n = Math.round(seconds / FIXED_DT); for (let i = 0; i < n; i++) { fn?.(sim, i * FIXED_DT); sim.step(); } };

function freeplay() {
  const sim = new Simulation(RAPIER, { mode: 'freeplay', seed: 7 });
  sim.events.length = 0;
  return sim;
}

// 1. Rest height & stability
{
  const sim = freeplay();
  const car = sim.human;
  run(sim, 2);
  check('car settles at rest', Math.abs(car.position.y - 0.38) < 0.05 && car.speed < 0.05 && car.wheelContacts === 4,
    `y=${car.position.y.toFixed(3)} v=${car.speed.toFixed(3)} wheels=${car.wheelContacts}`);
  sim.dispose();
}
// 2. Throttle top speed, boost top speed (lane away from the free-play ball)
{
  const sim = freeplay();
  const car = sim.human;
  car.reset(20, -45, Math.PI);
  run(sim, 3, () => { car.input.throttle = 1; });
  const v1 = car.forwardSpeed;
  car.reset(-20, -45, Math.PI);
  let t23 = -1;
  run(sim, 3, (s, t) => { car.input.throttle = 1; car.input.boost = true; if (t23 < 0 && car.forwardSpeed > 22.9) t23 = t; });
  const v2 = car.forwardSpeed;
  check('throttle top speed ~14.1', Math.abs(v1 - 14.1) < 0.3, `v=${v1.toFixed(2)}`);
  check('boost top speed 23', Math.abs(v2 - 23) < 0.3, `v=${v2.toFixed(2)} reached 23 at ${t23.toFixed(2)}s`);
  sim.dispose();
}
// 3. Jump heights
{
  for (const [label, hold, dbl] of [['tap', 0.02, false], ['full', 0.3, false], ['double', 0.3, true]]) {
    const sim = freeplay();
    const car = sim.human;
    run(sim, 1);
    let maxY = 0, t = 0;
    run(sim, 2.2, (s, time) => {
      t = time;
      car.input.jump = time < hold;
      car.input.jumpPressed = time === 0 || (dbl && Math.abs(time - 0.35) < FIXED_DT / 2);
      maxY = Math.max(maxY, car.position.y);
    });
    check(`${label} jump height`, maxY > 0.6 && maxY < 6, `peak=${maxY.toFixed(2)}m`);
    sim.dispose();
  }
}
// 4. Steering: turn radius at speed
{
  const sim = freeplay();
  const car = sim.human;
  run(sim, 2, () => { car.input.throttle = 1; });
  const z0 = car.position.clone();
  let minX = Infinity, maxX = -Infinity;
  run(sim, 4, () => { car.input.throttle = 1; car.input.steer = 1; minX = Math.min(minX, car.position.x); maxX = Math.max(maxX, car.position.x); });
  check('steering turns the car (circle)', maxX - minX > 5 && maxX - minX < 30 && car.wheelContacts >= 3, `diameter~${(maxX - minX).toFixed(1)} wheels=${car.wheelContacts}`);
  void z0;
  sim.dispose();
}
// 5. Wall driving: boost into the +X side wall and up it
{
  const sim = freeplay();
  const car = sim.human;
  car.reset(10, 0, -Math.PI / 2); // facing +x
  let maxY = 0, wallTime = 0;
  run(sim, 4, () => {
    car.input.throttle = 1; car.input.boost = true;
    maxY = Math.max(maxY, car.position.y);
    if (car.onGround && car.groundNormal.x < -0.8) wallTime += FIXED_DT;
  });
  check('drives up the wall', maxY > 6 && wallTime > 0.3, `maxY=${maxY.toFixed(1)} wallTime=${wallTime.toFixed(2)}s`);
  sim.dispose();
}
// 6. Ball hit at speed
{
  const sim = freeplay();
  const car = sim.human;
  car.reset(0, -30, Math.PI); // facing +z toward ball at origin
  let maxBall = 0;
  run(sim, 4, () => { car.input.throttle = 1; car.input.boost = true; maxBall = Math.max(maxBall, sim.ball.velocity.length()); });
  check('ball hit at full speed launches ball', maxBall > 25 && maxBall < 60, `ball peak speed=${maxBall.toFixed(1)} m/s touches=${car.stats.touches}`);
  sim.dispose();
}
// 7. Front flip
{
  const sim = freeplay();
  const car = sim.human;
  car.reset(0, -40, Math.PI);
  run(sim, 1.5, () => { car.input.throttle = 1; });
  const v0 = car.forwardSpeed;
  let upsideDown = false, landedUpright = false;
  run(sim, 2, (s, time) => {
    car.input.throttle = 1;
    car.input.jump = time < 0.05 || (time > 0.12 && time < 0.16);
    car.input.jumpPressed = time === 0 || Math.abs(time - 0.12) < FIXED_DT / 2;
    car.input.stickY = time > 0.1 && time < 0.2 ? 1 : 0;
    if (car.up.y < -0.5) upsideDown = true;
  });
  landedUpright = car.onGround && car.up.y > 0.9;
  check('front flip rotates and lands upright', upsideDown && landedUpright, `v0=${v0.toFixed(1)} v=${car.forwardSpeed.toFixed(1)} up.y=${car.up.y.toFixed(2)}`);
  sim.dispose();
}
// 8. AI matches
for (const [label, size, diff, secs] of [['1v1 pro', 1, 'pro', 300], ['2v2 allstar', 2, 'allstar', 300], ['1v1 rookie', 1, 'rookie', 180]]) {
  const sim = new Simulation(RAPIER, { mode: 'match', teamSize: size, difficulty: diff, matchSeconds: secs, seed: 42 });
  // replace the human with an AI so it's bot vs bot
  const { AIController } = await import('../src/game/ai.js');
  sim.ais.push(new AIController(sim.human, sim, diff));
  let bad = false, escaped = 0, steps = 0, touches = 0, goals = [];
  const t0 = performance.now();
  while (sim.state !== 'ended' && steps < (secs + 120) * 120) {
    sim.step(); steps++;
    for (const e of sim.events) { if (e.type === 'hit') touches++; if (e.type === 'goal') goals.push(`${e.team === TEAM_BLUE ? 'B' : 'O'}@${(secs - sim.timeLeft).toFixed(0)}s${e.own ? '(own)' : ''}`); }
    sim.events.length = 0;
    for (const c of sim.cars) if (!Number.isFinite(c.position.x)) bad = true;
    if (!sim.ball.hidden && arenaSDF(sim.ball.position.x, sim.ball.position.y, sim.ball.position.z) < -0.5) escaped++;
  }
  const ms = performance.now() - t0;
  check(`${label} match completes`, sim.state === 'ended' && !bad && escaped === 0,
    `score ${sim.score[0]}-${sim.score[1]} touches=${touches} goals=[${goals.join(' ')}] sim ${(steps * FIXED_DT).toFixed(0)}s in ${(ms / 1000).toFixed(1)}s (${(ms / steps).toFixed(3)} ms/step)`);
  check(`${label} bots score goals`, sim.score[0] + sim.score[1] >= 2);
  const stats = sim.cars.map((c) => `${c.name}[${c.team}] g${c.stats.goals} s${c.stats.shots} sv${c.stats.saves} t${c.stats.touches} d${c.stats.demos}`);
  console.log('   ', stats.join(' | '));
  sim.dispose();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nALL PASSED');
process.exit(failed.length ? 1 : 0);
