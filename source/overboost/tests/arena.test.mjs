// By The_headphones
// Verifies the Rapier cuboid set matches the analytic arena SDF.
import { arenaSDF, buildColliderSpecs, traceArena } from '../src/game/arenaShape.js';
import { ARENA } from '../src/game/constants.js';
import * as THREE from 'three';

const specs = buildColliderSpecs();
console.log('collider cuboids:', specs.length);

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
function insideBox(s, x, y, z, pad = 0) {
  _q.set(s.q[0], s.q[1], s.q[2], s.q[3]).invert();
  _v.set(x - s.cx, y - s.cy, z - s.cz).applyQuaternion(_q);
  return Math.abs(_v.x) < s.hx - pad && Math.abs(_v.y) < s.hy - pad && Math.abs(_v.z) < s.hz - pad;
}

let rng = 12345;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const { halfWidth: W, halfLength: L, height: H, goalDepth: GD } = ARENA;
let badFree = 0, badSolid = 0, nFree = 0, nSolid = 0;
const examplesFree = [], examplesSolid = [];
for (let i = 0; i < 400000; i++) {
  const x = (rand() * 2 - 1) * (W + 2);
  const y = rand() * (H + 2) - 1;
  const z = (rand() * 2 - 1) * (L + GD + 2);
  const d = arenaSDF(x, y, z);
  if (d > 0.02) {
    nFree++;
    if (specs.some((s) => insideBox(s, x, y, z))) { badFree++; if (examplesFree.length < 5) examplesFree.push([x, y, z, d]); }
  } else if (d < -0.02 && d > -1.2) {
    nSolid++;
    if (!specs.some((s) => insideBox(s, x, y, z))) { badSolid++; if (examplesSolid.length < 5) examplesSolid.push([x, y, z, d]); }
  }
}
console.log(`free samples ${nFree}, inside a collider: ${badFree}`, examplesFree);
console.log(`solid samples ${nSolid}, not covered: ${badSolid}`, examplesSolid);

// Ray sanity: straight down from 1 m above the floor hits at ~1 m
const n = { x: 0, y: 0, z: 0 };
const t = traceArena(5, 1, 5, 0, -1, 0, 3, n);
console.log('floor ray t=', t.toFixed(4), 'normal', n);
const t2 = traceArena(0, 5, 0, 1, 0, 0, 100, n);
console.log('side wall ray t=', t2.toFixed(3), 'expected', W, 'normal', n);
const t3 = traceArena(0, 2, 0, 0, 0, 1, 100, n, 200);
console.log('goal ray (+z through mouth) t=', t3.toFixed(3), 'expected', L + GD);

if (badFree > 0 || badSolid > 0) { console.error('ARENA MISMATCH'); process.exit(1); }
console.log('arena OK');
