// By The_headphones
// Visible arena: swept from the exact same profile the physics uses.
import * as THREE from 'three';
import { ARENA, BIG_PADS, SMALL_PADS, TEAM_COLORS } from '../game/constants.js';
import { WALLS, insetVertex, profilePoints, wallFrame, wallS } from '../game/arenaShape.js';
import {
  makeFieldTexture, makeGrassBump, makeHexTexture, makeNetTexture, makeWallTexture,
} from './textures.js';

const {
  halfWidth: W, halfLength: L, height: H, goalHalfWidth: GW, goalHeight: GH, goalDepth: GD,
  floorRadius: RF, ceilRadius: RC,
} = ARENA;

const BLUE_TINT = new THREE.Color(0.5, 0.7, 1.0);
const ORANGE_TINT = new THREE.Color(1.0, 0.66, 0.42);
const MID_TINT = new THREE.Color(0.8, 0.83, 0.9);
const _c = new THREE.Color();

function tintAt(z, out) {
  const t = THREE.MathUtils.smoothstep(z, -20, 20);
  if (t < 0.5) out.copy(BLUE_TINT).lerp(MID_TINT, t * 2);
  else out.copy(MID_TINT).lerp(ORANGE_TINT, (t - 0.5) * 2);
  return out;
}

class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
  }

  get count() { return this.pos.length / 3; }

  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }

  /** Adds triangle a,b,c oriented so its face normal agrees with the stored vertex normal. */
  tri(a, b, c) {
    const p = this.pos, n = this.nor;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az;
    const e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const nx = n[a * 3] + n[b * 3] + n[c * 3], ny = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1], nz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function emitStrip(b, w, prof, s0, s1, uScale, vOffset, vScale) {
  const f = wallFrame(w);
  const segs = Math.max(1, Math.ceil(Math.abs(s1[0] - s0[0]) / 3));
  const base = b.count;
  for (let j = 0; j < prof.length; j++) {
    const p = prof[j];
    for (let k = 0; k <= segs; k++) {
      const s = s0[j] + ((s1[j] - s0[j]) * k) / segs;
      const x = f.fx + f.tx * s + w.nx * p.d;
      const z = f.fz + f.tz * s + w.nz * p.d;
      // Wall tangents run right-to-left when seen from inside, so negate u to keep text readable.
      b.vert(x, p.y, z, w.nx * p.nd, p.ny, w.nz * p.nd, -s / uScale, (p.v - vOffset) / vScale, tintAt(z, _c));
    }
  }
  for (let j = 0; j < prof.length - 1; j++) {
    for (let k = 0; k < segs; k++) {
      const a = base + j * (segs + 1) + k, c = a + segs + 1;
      b.tri(a, a + 1, c + 1);
      b.tri(a, c + 1, c);
    }
  }
}

function buildWallGeometry(prof, lower, uScale, vOffset, vScale) {
  const b = new GeoBuilder();
  for (let i = 0; i < 8; i++) {
    const w = WALLS[i], prev = WALLS[(i + 7) % 8], next = WALLS[(i + 1) % 8];
    const sA = prof.map((p) => { const v = insetVertex(prev, w, p.d); return wallS(w, v.x, v.z); });
    const sB = prof.map((p) => { const v = insetVertex(w, next, p.d); return wallS(w, v.x, v.z); });
    if (w.kind === 'end' && lower) {
      emitStrip(b, w, prof, sA, prof.map(() => Math.sign(sA[0]) * GW), uScale, vOffset, vScale);
      emitStrip(b, w, prof, prof.map(() => Math.sign(sB[0]) * GW), sB, uScale, vOffset, vScale);
    } else {
      emitStrip(b, w, prof, sA, sB, uScale, vOffset, vScale);
    }
  }
  if (lower) {
    // Caps where the floor ramp stops beside each goal mouth.
    const fillet = prof.filter((p) => p.y <= RF + 1e-6);
    for (const w of WALLS) {
      if (w.kind !== 'end') continue;
      const f = wallFrame(w);
      for (const sg of [1, -1]) {
        const s = sg * GW;
        const nx = -sg * f.tx, nz = -sg * f.tz;
        const at = (d, y) => {
          const x = f.fx + f.tx * s + w.nx * d, z = f.fz + f.tz * s + w.nz * d;
          return b.vert(x, y, z, nx, 0, nz, d / uScale, y / vScale, tintAt(z, _c));
        };
        const corner = at(0, 0);
        const ids = fillet.map((p) => at(p.d, p.y));
        for (let j = 0; j < ids.length - 1; j++) b.tri(corner, ids[j], ids[j + 1]);
      }
    }
  }
  return b.build();
}

function buildTrimGeometry(y, halfH, inset) {
  const b = new GeoBuilder();
  for (let i = 0; i < 8; i++) {
    const w = WALLS[i];
    const a = insetVertex(WALLS[(i + 7) % 8], w, inset);
    const c = insetVertex(w, WALLS[(i + 1) % 8], inset);
    const segs = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 3));
    const base = b.count;
    for (let k = 0; k <= segs; k++) {
      const x = a.x + ((c.x - a.x) * k) / segs, z = a.z + ((c.z - a.z) * k) / segs;
      tintAt(z, _c);
      b.vert(x, y - halfH, z, w.nx, 0, w.nz, 0, 0, _c);
      b.vert(x, y + halfH, z, w.nx, 0, w.nz, 0, 1, _c);
    }
    for (let k = 0; k < segs; k++) {
      const v = base + k * 2;
      b.tri(v, v + 2, v + 3);
      b.tri(v, v + 3, v + 1);
    }
  }
  return b.build();
}

function buildCeilingGeometry() {
  const b = new GeoBuilder();
  _c.setRGB(1, 1, 1);
  const center = b.vert(0, H, 0, 0, -1, 0, 0, 0, _c);
  const ids = [];
  for (let i = 0; i < 8; i++) {
    const v = insetVertex(WALLS[(i + 7) % 8], WALLS[i], RC);
    ids.push(b.vert(v.x, H, v.z, 0, -1, 0, v.x / 8, v.z / 8, _c));
  }
  for (let i = 0; i < 8; i++) b.tri(center, ids[i], ids[(i + 1) % 8]);
  const g = b.build();
  // centre vertex uv
  return g;
}

export class ArenaView {
  constructor(renderer) {
    this.group = new THREE.Group();
    this.group.name = 'arena';
    const aniso = renderer.capabilities.getMaxAnisotropy();
    this.disposables = [];

    // ---- Field
    const fieldTex = makeFieldTexture(Math.min(8, aniso));
    const bump = makeGrassBump();
    const floorMat = new THREE.MeshStandardMaterial({
      map: fieldTex, bumpMap: bump, bumpScale: 0.7, roughness: 0.93, metalness: 0,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * (L + GD)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'field';
    this.group.add(floor);

    // ---- Walls
    const prof = profilePoints(24);
    const split = prof.findIndex((p) => p.split);
    const lowerProf = prof.slice(0, split + 1);
    const upperProf = prof.slice(split);
    const vSplit = prof[split].v;
    const vRamp = prof[24].v;
    const wallTex = makeWallTexture(vSplit, vRamp, Math.min(8, aniso));
    const lowerMat = new THREE.MeshStandardMaterial({
      map: wallTex, vertexColors: true, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6,
    });
    const lower = new THREE.Mesh(buildWallGeometry(lowerProf, true, 16, 0, vSplit), lowerMat);
    lower.receiveShadow = true;
    this.group.add(lower);

    const hex = makeHexTexture();
    hex.repeat.set(1, 1);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 1, alphaMap: hex,
      emissive: 0x6f88a8, emissiveMap: hex, emissiveIntensity: 0.25,
      roughness: 0.15, metalness: 0.4, depthWrite: false, side: THREE.FrontSide,
    });
    glassMat.onBeforeCompile = (shader) => {
      // Keep the lattice faint: lines 0.35, panes 0.07 alpha.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        'diffuseColor.a *= mix(0.07, 0.38, texture2D(alphaMap, vAlphaMapUv).g);',
      );
    };
    const upperVScale = 7;
    const upper = new THREE.Mesh(buildWallGeometry(upperProf, false, 7, vSplit, upperVScale), glassMat);
    upper.renderOrder = 2;
    this.group.add(upper);

    const ceilHex = hex.clone();
    ceilHex.needsUpdate = true;
    const ceilMat = glassMat.clone();
    ceilMat.alphaMap = ceilHex;
    ceilMat.emissiveMap = ceilHex;
    ceilMat.vertexColors = false;
    ceilMat.color.set(0xa9b7c9);
    ceilMat.onBeforeCompile = glassMat.onBeforeCompile;
    const ceil = new THREE.Mesh(buildCeilingGeometry(), ceilMat);
    ceil.renderOrder = 2;
    this.group.add(ceil);

    // ---- Neon trims
    const trimMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    trimMat.color.setScalar(2.6);
    this.group.add(new THREE.Mesh(buildTrimGeometry(GH, 0.07, 0.03), trimMat));
    const trimMat2 = trimMat.clone();
    trimMat2.color.setScalar(1.4);
    this.group.add(new THREE.Mesh(buildTrimGeometry(H - RC, 0.05, 0.03), trimMat2));

    // ---- Goals
    this.goalLights = [];
    const net = makeNetTexture();
    for (const s of [-1, 1]) {
      const team = s < 0 ? 0 : 1;
      const col = new THREE.Color(TEAM_COLORS[team]);
      const mkNet = (w, h) => {
        const t = net.clone();
        t.needsUpdate = true;
        t.repeat.set(w / 1.1, h / 1.1);
        return new THREE.MeshStandardMaterial({
          color: 0x05070a, roughness: 0.9, metalness: 0.05, emissive: col, emissiveMap: t, emissiveIntensity: 1.6,
        });
      };
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GH), mkNet(2 * GW, GH));
      back.position.set(0, GH / 2, s * (L + GD));
      back.rotation.y = s > 0 ? Math.PI : 0;
      this.group.add(back);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH), mkNet(GD, GH));
        wall.position.set(side * GW, GH / 2, s * (L + GD / 2));
        wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.group.add(wall);
      }
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GD), mkNet(2 * GW, GD));
      roof.position.set(0, GH, s * (L + GD / 2));
      roof.rotation.x = Math.PI / 2;
      this.group.add(roof);

      const frameMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3.2), toneMapped: false });
      const t = 0.14;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(t, GH, t), frameMat);
        post.position.set(side * GW, GH / 2, s * L);
        this.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * GW + t, t, t), frameMat);
      bar.position.set(0, GH, s * L);
      this.group.add(bar);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, 0.28), frameMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.012, s * L);
      this.group.add(line);

      const light = new THREE.PointLight(col, 40, 24, 1.8);
      light.position.set(0, 3.4, s * (L + 3.5));
      this.group.add(light);
      this.goalLights.push(light);
    }

    // ---- Boost pads
    this.buildPads();
  }

  buildPads() {
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.6, metalness: 0.4 });
    const smallBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 0.95, 0.06, 20), baseMat, SMALL_PADS.length);
    this.smallCore = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      SMALL_PADS.length,
    );
    const m = new THREE.Matrix4();
    SMALL_PADS.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.03, z);
      smallBase.setMatrixAt(i, m);
      m.makeTranslation(x, 0.07, z);
      this.smallCore.setMatrixAt(i, m);
    });
    smallBase.receiveShadow = true;
    this.group.add(smallBase, this.smallCore);

    this.bigOrbs = [];
    const orbGeo = new THREE.IcosahedronGeometry(0.62, 2);
    const ringGeo = new THREE.TorusGeometry(1.45, 0.07, 8, 40);
    const bigBaseGeo = new THREE.CylinderGeometry(1.9, 2.05, 0.1, 32);
    BIG_PADS.forEach(([x, z]) => {
      const base = new THREE.Mesh(bigBaseGeo, baseMat);
      base.position.set(x, 0.05, z);
      base.receiveShadow = true;
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.3), toneMapped: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.12, z);
      const orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.9, 0.45), toneMapped: false });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(x, 1.15, z);
      this.group.add(base, ring, orb);
      this.bigOrbs.push({ orb, ringMat, x, z });
    });
    this.padState = null;
  }

  /** Sync pad glow with simulation state. */
  updatePads(pads, time) {
    if (!pads) return;
    const smallActive = new THREE.Color(2.2, 1.35, 0.3);
    const smallIdle = new THREE.Color(0.18, 0.12, 0.05);
    if (!this.padState) this.padState = pads.map(() => null);
    let si = 0, bi = 0, dirty = false;
    pads.forEach((p, i) => {
      if (p.big) {
        const o = this.bigOrbs[bi++];
        o.orb.visible = p.active;
        o.orb.position.y = 1.15 + Math.sin(time * 2 + o.x) * 0.12;
        o.orb.rotation.y = time * 1.5;
        if (this.padState[i] !== p.active) {
          o.ringMat.color.setRGB(p.active ? 2.4 : 0.25, p.active ? 1.5 : 0.16, p.active ? 0.3 : 0.05);
        }
      } else {
        if (this.padState[i] !== p.active) {
          this.smallCore.setColorAt(si, p.active ? smallActive : smallIdle);
          dirty = true;
        }
        si++;
      }
      this.padState[i] = p.active;
    });
    if (dirty && this.smallCore.instanceColor) this.smallCore.instanceColor.needsUpdate = true;
  }

  resetPads() {
    this.padState = null;
  }
}
