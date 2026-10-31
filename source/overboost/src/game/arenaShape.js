// By The_headphones
// Single source of truth for the arena shape.
//
// The playable volume is an octagonal prism (rectangle with 45-degree corner
// bevels) whose floor/wall and wall/ceiling edges are rounded with quarter
// circles, plus two goal boxes cut into the end walls.
//
// It is described three ways from the same numbers:
//  * an analytic signed distance field (positive inside the playable space)
//    used for wheel suspension, the camera, AI ball prediction and safety checks;
//  * a set of static cuboids for Rapier (curves become thin planar facets);
//  * profile data the renderer sweeps into visible geometry.

import { ARENA } from './constants.js';

const {
  halfWidth: W, halfLength: L, height: H, cornerCut: C,
  floorRadius: RF, ceilRadius: RC, rampSegments: NSEG,
  goalHalfWidth: GW, goalHeight: GH, goalDepth: GD,
} = ARENA;

const S = Math.SQRT1_2;
const CK = (W + L - C) * S;

// Inward unit normal (nx, nz) in the ground plane and offset k:
// signed distance from the wall = nx*x + nz*z + k (positive inside).
// Ordered counter-clockwise starting at +X so neighbours are adjacent.
export const WALLS = [
  { nx: -1, nz: 0, k: W, kind: 'side' },
  { nx: -S, nz: -S, k: CK, kind: 'corner' },
  { nx: 0, nz: -1, k: L, kind: 'end', goalSign: 1 },
  { nx: S, nz: -S, k: CK, kind: 'corner' },
  { nx: 1, nz: 0, k: W, kind: 'side' },
  { nx: S, nz: S, k: CK, kind: 'corner' },
  { nx: 0, nz: 1, k: L, kind: 'end', goalSign: -1 },
  { nx: -S, nz: S, k: CK, kind: 'corner' },
];

// The goal "carve" boxes reach a little into the field so they also remove the
// floor fillet in front of the goal mouth (the goal floor is flush with the field).
const GOAL_INNER_REACH = RF + 0.5;
export const GOAL_BOXES = [1, -1].map((s) => ({
  sign: s,
  minX: -GW, maxX: GW, minY: 0, maxY: GH,
  minZ: s > 0 ? L - GOAL_INNER_REACH : -L - GD,
  maxZ: s > 0 ? L + GD : -L + GOAL_INNER_REACH,
}));

// ---------------------------------------------------------------------------
// 2D profile of a wall: d = distance in from the wall plane, y = height.

const G2 = { d: 0, y: 0 };

/** Signed distance inside the wall profile, with gradient written to g. */
export function profileSD(d, y, g) {
  if (d < RF && y < RF) {
    const dx = d - RF, dy = y - RF;
    const len = Math.hypot(dx, dy) || 1e-9;
    g.d = -dx / len; g.y = -dy / len;
    return RF - len;
  }
  if (d < RC && y > H - RC) {
    const dx = d - RC, dy = y - (H - RC);
    const len = Math.hypot(dx, dy) || 1e-9;
    g.d = -dx / len; g.y = -dy / len;
    return RC - len;
  }
  let v = d; g.d = 1; g.y = 0;
  if (y < v) { v = y; g.d = 0; g.y = 1; }
  if (H - y < v) { v = H - y; g.d = 0; g.y = -1; }
  return v;
}

const G3 = { x: 0, y: 0, z: 0 };

function boxSD(x, y, z, b, g) {
  const dx0 = x - b.minX, dx1 = b.maxX - x;
  const dy0 = y - b.minY, dy1 = b.maxY - y;
  const dz0 = z - b.minZ, dz1 = b.maxZ - z;
  const ix = dx0 < dx1 ? dx0 : dx1;
  const iy = dy0 < dy1 ? dy0 : dy1;
  const iz = dz0 < dz1 ? dz0 : dz1;
  if (ix > 0 && iy > 0 && iz > 0) {
    if (ix <= iy && ix <= iz) { g.x = dx0 < dx1 ? 1 : -1; g.y = 0; g.z = 0; return ix; }
    if (iy <= iz) { g.x = 0; g.y = dy0 < dy1 ? 1 : -1; g.z = 0; return iy; }
    g.x = 0; g.y = 0; g.z = dz0 < dz1 ? 1 : -1; return iz;
  }
  const vx = dx0 < 0 ? -dx0 : (dx1 < 0 ? dx1 : 0);
  const vy = dy0 < 0 ? -dy0 : (dy1 < 0 ? dy1 : 0);
  const vz = dz0 < 0 ? -dz0 : (dz1 < 0 ? dz1 : 0);
  const dist = Math.hypot(vx, vy, vz) || 1e-9;
  g.x = vx / dist; g.y = vy / dist; g.z = vz / dist;
  return -dist;
}

/**
 * Signed distance to the arena surface: positive inside the playable volume.
 * The result is exact or a conservative under-estimate, which keeps sphere
 * tracing safe. `out` (optional) receives the outward-from-surface normal.
 */
export function arenaSDF(x, y, z, out) {
  let best = Infinity, bx = 0, by = 1, bz = 0;
  for (let i = 0; i < 8; i++) {
    const w = WALLS[i];
    const d = w.nx * x + w.nz * z + w.k;
    const v = profileSD(d, y, G2);
    if (v < best) { best = v; bx = w.nx * G2.d; by = G2.y; bz = w.nz * G2.d; }
  }
  if (z > L - GOAL_INNER_REACH - 2 || z < -L + GOAL_INNER_REACH + 2) {
    for (let i = 0; i < 2; i++) {
      const v = boxSD(x, y, z, GOAL_BOXES[i], G3);
      if (v > best) { best = v; bx = G3.x; by = G3.y; bz = G3.z; }
    }
  }
  if (out) { out.x = bx; out.y = by; out.z = bz; }
  return best;
}

/**
 * Sphere-traces a ray against the arena surface.
 * Returns the hit distance (0 if the origin is already inside geometry) or -1.
 */
export function traceArena(ox, oy, oz, dx, dy, dz, maxT, outNormal, maxIter = 16) {
  let t = 0;
  for (let i = 0; i < maxIter; i++) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    const d = arenaSDF(px, py, pz, outNormal);
    if (d < 0.0015) return t;
    t += d;
    if (t > maxT) return -1;
  }
  return -1;
}

/** Which goal (if any) a point is inside of: +1 for the +Z goal, -1 for -Z, 0 none. */
export function goalContaining(x, y, z, margin = 0) {
  if (Math.abs(x) > GW + 1 || y > GH + 1) return 0;
  if (z > L + margin) return 1;
  if (z < -L - margin) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Profile polyline shared by physics facets and render geometry.

/**
 * Points from the floor tangent up to the ceiling tangent:
 * { d, y, nd, ny (smooth surface normal in profile space), v (arc length) }.
 * Exactly one point sits at y = goalHeight; the renderer splits there.
 */
export function profilePoints(segments = NSEG) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI / 2;
    pts.push({ d: RF - RF * Math.sin(a), y: RF - RF * Math.cos(a), nd: Math.sin(a), ny: Math.cos(a) });
  }
  pts.push({ d: 0, y: GH, nd: 1, ny: 0, split: true });
  for (let i = 0; i <= segments; i++) {
    const b = (i / segments) * Math.PI / 2;
    pts.push({ d: RC - RC * Math.cos(b), y: H - RC + RC * Math.sin(b), nd: Math.cos(b), ny: -Math.sin(b) });
  }
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) v += Math.hypot(pts[i].d - pts[i - 1].d, pts[i].y - pts[i - 1].y);
    pts[i].v = v;
  }
  return pts;
}

/** Intersection of the two wall lines offset inward by d. */
export function insetVertex(wa, wb, d) {
  const det = wa.nx * wb.nz - wa.nz * wb.nx;
  const ra = d - wa.k, rb = d - wb.k;
  return {
    x: (ra * wb.nz - wa.nz * rb) / det,
    z: (wa.nx * rb - ra * wb.nx) / det,
  };
}

/** Tangent along a wall (direction of increasing s) and the foot point at s = 0. */
export function wallFrame(w) {
  return { tx: -w.nz, tz: w.nx, fx: -w.k * w.nx, fz: -w.k * w.nz };
}

/** Position along a wall line (s) of an XZ point. */
export function wallS(w, x, z) {
  const f = wallFrame(w);
  return (x - f.fx) * f.tx + (z - f.fz) * f.tz;
}

// ---------------------------------------------------------------------------
// Physics colliders (plain data; physics.js turns them into Rapier cuboids).

function quatFromBasis(ax, ay, az) {
  // Columns ax, ay, az (unit, right-handed) -> quaternion [x, y, z, w]
  const m00 = ax[0], m01 = ay[0], m02 = az[0];
  const m10 = ax[1], m11 = ay[1], m12 = az[1];
  const m20 = ax[2], m21 = ay[2], m22 = az[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}

function axisBox(minX, maxX, minY, maxY, minZ, maxZ) {
  return {
    hx: (maxX - minX) / 2, hy: (maxY - minY) / 2, hz: (maxZ - minZ) / 2,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, cz: (minZ + maxZ) / 2,
    q: [0, 0, 0, 1],
  };
}

/**
 * Cuboid lying on the solid side of a planar facet of wall `w`.
 * The facet spans profile points p0 -> p1 and wall coordinate s in [s0, s1].
 * Because the playable volume is convex apart from the goals, any slab on the
 * solid side of a facet plane can be extended freely without intruding.
 */
function facetBox(w, p0, p1, s0, s1, extend = 0.3, thickness = 2) {
  let td = p1.d - p0.d, ty = p1.y - p0.y;
  const len = Math.hypot(td, ty);
  td /= len; ty /= len;
  let nd = -ty, ny = td;
  const md = (p0.d + p1.d) / 2, my = (p0.y + p1.y) / 2;
  const g = { d: 0, y: 0 };
  if (profileSD(md + nd * 0.01, my + ny * 0.01, g) < profileSD(md - nd * 0.01, my - ny * 0.01, g)) {
    nd = -nd; ny = -ny;
  }
  const f = wallFrame(w);
  const A = [f.tx, 0, f.tz];
  const B = [w.nx * td, ty, w.nz * td];
  const N = [w.nx * nd, ny, w.nz * nd];
  // Make (A, B, N) right-handed.
  const cx = A[1] * B[2] - A[2] * B[1];
  const cy = A[2] * B[0] - A[0] * B[2];
  const cz = A[0] * B[1] - A[1] * B[0];
  if (cx * N[0] + cy * N[1] + cz * N[2] < 0) { A[0] = -A[0]; A[2] = -A[2]; }
  const sc = (s0 + s1) / 2;
  const px = f.fx + f.tx * sc + w.nx * md;
  const pz = f.fz + f.tz * sc + w.nz * md;
  return {
    hx: Math.abs(s1 - s0) / 2, hy: len / 2 + extend, hz: thickness / 2,
    cx: px - N[0] * thickness / 2, cy: my - N[1] * thickness / 2, cz: pz - N[2] * thickness / 2,
    q: quatFromBasis(A, B, N),
  };
}

export function buildColliderSpecs() {
  const specs = [];
  const big = 12;
  specs.push(axisBox(-W - big, W + big, -2, 0, -L - GD - big, L + GD + big)); // floor
  specs.push(axisBox(-W - big, W + big, H, H + 2, -L - GD - big, L + GD + big)); // ceiling

  const prof = profilePoints(NSEG);
  const splitIdx = prof.findIndex((p) => p.split);
  const fillet = prof.slice(0, NSEG + 1); // floor quarter circle
  const ceil = prof.slice(splitIdx + 1); // ceiling quarter circle
  const along = 4; // extend past the wall ends so neighbours overlap inside the solid

  for (let i = 0; i < 8; i++) {
    const w = WALLS[i];
    const a = insetVertex(WALLS[(i + 7) % 8], w, 0);
    const b = insetVertex(w, WALLS[(i + 1) % 8], 0);
    let s0 = wallS(w, a.x, a.z), s1 = wallS(w, b.x, b.z);
    if (s0 > s1) [s0, s1] = [s1, s0];
    s0 -= along; s1 += along;

    if (w.kind !== 'end') {
      for (let j = 0; j < prof.length - 1; j++) {
        if (prof[j].split && prof[j + 1].split) continue;
        specs.push(facetBox(w, prof[j], prof[j + 1], s0, s1));
      }
      continue;
    }

    // End walls: the floor fillet only exists beside the goal mouth.
    for (let j = 0; j < fillet.length - 1; j++) {
      specs.push(facetBox(w, fillet[j], fillet[j + 1], GW, s1, 0.3));
      specs.push(facetBox(w, fillet[j], fillet[j + 1], s0, -GW, 0.3));
    }
    for (let j = 0; j < ceil.length - 1; j++) {
      specs.push(facetBox(w, ceil[j], ceil[j + 1], s0, s1));
    }
    const sg = w.goalSign;
    const zIn = sg * L, zOut = sg * (L + 2);
    const zMin = Math.min(zIn, zOut), zMax = Math.max(zIn, zOut);
    // Wall face around the goal mouth
    specs.push(axisBox(GW, W + big, -1, H + 1, zMin, zMax));
    specs.push(axisBox(-W - big, -GW, -1, H + 1, zMin, zMax));
    specs.push(axisBox(-GW, GW, GH, H + 1, zMin, zMax));
    // Goal box shell
    const gz0 = sg * L, gz1 = sg * (L + GD + 1.5);
    const gzMin = Math.min(gz0, gz1), gzMax = Math.max(gz0, gz1);
    specs.push(axisBox(-GW - 1.5, GW + 1.5, GH, GH + 1.5, gzMin, gzMax)); // roof
    specs.push(axisBox(GW, GW + 1.5, -1, GH + 1.5, gzMin, gzMax)); // side
    specs.push(axisBox(-GW - 1.5, -GW, -1, GH + 1.5, gzMin, gzMax)); // side
    const bz0 = sg * (L + GD), bz1 = sg * (L + GD + 1.5);
    specs.push(axisBox(-GW - 1.5, GW + 1.5, -1, GH + 1.5, Math.min(bz0, bz1), Math.max(bz0, bz1))); // back
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Cheap ballistic ball prediction against the SDF (used by AI and stats).

const PN = { x: 0, y: 0, z: 0 };

export function predictBallPath(state, opts, out) {
  const { radius, gravity, restitution, drag, dt, steps } = opts;
  let x = state.x, y = state.y, z = state.z;
  let vx = state.vx, vy = state.vy, vz = state.vz;
  for (let i = 0; i < steps; i++) {
    vy -= gravity * dt;
    const damp = 1 - drag * dt;
    vx *= damp; vy *= damp; vz *= damp;
    x += vx * dt; y += vy * dt; z += vz * dt;
    const d = arenaSDF(x, y, z, PN);
    if (d < radius) {
      const pen = radius - d;
      x += PN.x * pen; y += PN.y * pen; z += PN.z * pen;
      const vn = vx * PN.x + vy * PN.y + vz * PN.z;
      if (vn < 0) {
        const j = (1 + (vn < -1.5 ? restitution : 0)) * vn;
        vx -= PN.x * j; vy -= PN.y * j; vz -= PN.z * j;
        if (vn < -1.5) {
          // Tangential loss on real bounces
          const tvn = vx * PN.x + vy * PN.y + vz * PN.z;
          vx = (vx - PN.x * tvn) * 0.88 + PN.x * tvn;
          vy = (vy - PN.y * tvn) * 0.88 + PN.y * tvn;
          vz = (vz - PN.z * tvn) * 0.88 + PN.z * tvn;
        }
      }
    }
    const o = out[i];
    o.t = (i + 1) * dt; o.x = x; o.y = y; o.z = z; o.vx = vx; o.vy = vy; o.vz = vz;
  }
  return out;
}
