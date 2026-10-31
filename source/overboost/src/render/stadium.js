// By The_headphones
// Stands, crowd, roof light rigs and the night sky around the arena.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALLS, insetVertex } from '../game/arenaShape.js';
import { makeGlowTexture } from './textures.js';

const TIERS = 24;
const TIER_DEPTH = 1.05;
const TIER_RISE = 0.62;
const STAND_OFFSET = 14;
const BASE_Y = 4.5;

function ringVertex(i, offset) {
  return insetVertex(WALLS[(i + 7) % 8], WALLS[i], -offset);
}

function sideColor(z) {
  if (z < -22) return new THREE.Color(0x1d3f7a);
  if (z > 22) return new THREE.Color(0x7a3a14);
  return new THREE.Color(0x2a2f38);
}

export class Stadium {
  constructor(quality) {
    this.group = new THREE.Group();
    this.group.name = 'stadium';
    this.excite = 0.15;
    this.time = 0;
    this.buildStands();
    this.buildCrowd();
    this.buildRoof();
    this.buildSky();
    this.setQuality(quality);
  }

  buildStands() {
    const pos = [], nor = [], col = [], idx = [];
    const c = new THREE.Color();
    const quad = (a, b, d, e, n, color) => {
      const base = pos.length / 3;
      for (const v of [a, b, d, e]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(n[0], n[1], n[2]);
        col.push(color.r, color.g, color.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let i = 0; i < 8; i++) {
      const w = WALLS[i];
      const inward = [w.nx, 0, w.nz];
      for (let t = 0; t <= TIERS; t++) {
        const o0 = STAND_OFFSET + t * TIER_DEPTH, o1 = o0 + TIER_DEPTH;
        const y = BASE_Y + t * TIER_RISE;
        const a0 = ringVertex(i, o0), b0 = ringVertex((i + 1) % 8, o0);
        const a1 = ringVertex(i, o1), b1 = ringVertex((i + 1) % 8, o1);
        const mid = { x: (a0.x + b0.x) / 2, z: (a0.z + b0.z) / 2 };
        c.copy(sideColor(mid.z)).multiplyScalar(t % 2 ? 0.85 : 1);
        if (t < TIERS) {
          // tread (faces up) - winding a0, a1, b1, b0 viewed from above
          quad([a0.x, y, a0.z], [b0.x, y, b0.z], [b1.x, y, b1.z], [a1.x, y, a1.z], [0, 1, 0], c);
          // riser (faces the arena)
          const y2 = y + TIER_RISE;
          quad([a1.x, y, a1.z], [b1.x, y, b1.z], [b1.x, y2, b1.z], [a1.x, y2, a1.z], inward, c.clone().multiplyScalar(0.6));
        } else {
          // back wall
          const top = y + 9;
          quad([a0.x, y, a0.z], [b0.x, y, b0.z], [b0.x, top, b0.z], [a0.x, top, a0.z], inward, new THREE.Color(0x15181d));
        }
      }
      // front wall below the first tier
      const a = ringVertex(i, STAND_OFFSET), b = ringVertex((i + 1) % 8, STAND_OFFSET);
      quad([a.x, -2, a.z], [b.x, -2, b.z], [b.x, BASE_Y, b.z], [a.x, BASE_Y, a.z], inward, new THREE.Color(0x101318));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    // Fix winding so every face points along its stored normal.
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) {
      const a = ix[k] * 3, b = ix[k + 1] * 3, d = ix[k + 2] * 3;
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const e2 = [p[d] - p[a], p[d + 1] - p[a + 1], p[d + 2] - p[a + 2]];
      const fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0];
      if (fx * n[a] + fy * n[a + 1] + fz * n[a + 2] < 0) { const tmp = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = tmp; }
    }
    g.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.stands = new THREE.Mesh(g, mat);
    this.group.add(this.stands);
  }

  buildCrowd() {
    const body = new THREE.BoxGeometry(0.44, 0.58, 0.3);
    body.translate(0, 0.5, 0);
    const head = new THREE.OctahedronGeometry(0.15, 0);
    head.translate(0, 0.93, 0);
    const arms = new THREE.BoxGeometry(0.62, 0.12, 0.12);
    arms.translate(0, 0.72, 0);
    // Box geometries are indexed, polyhedra are not: de-index everything before merging.
    const geo = mergeGeometries([body.toNonIndexed(), head, arms.toNonIndexed()]);
    if (!geo) throw new Error('crowd geometry merge failed');
    const spots = [];
    let seed = 99;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let t = 0; t < TIERS; t++) {
      const o = STAND_OFFSET + t * TIER_DEPTH + TIER_DEPTH * 0.45;
      const y = BASE_Y + t * TIER_RISE;
      for (let i = 0; i < 8; i++) {
        const a = ringVertex(i, o), b = ringVertex((i + 1) % 8, o);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.floor(len / 0.82);
        const yaw = Math.atan2(WALLS[i].nx, WALLS[i].nz);
        for (let k = 0; k < n; k++) {
          if (rnd() < 0.14) continue;
          const f = (k + 0.5 + (rnd() - 0.5) * 0.3) / n;
          spots.push({ x: a.x + (b.x - a.x) * f, y, z: a.z + (b.z - a.z) * f, yaw: yaw + (rnd() - 0.5) * 0.4, r: rnd() });
        }
      }
    }
    // Shuffle so lowering the instance count thins the crowd evenly.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const mat = new THREE.MeshLambertMaterial();
    this.crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0.15 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.crowdUniforms.uTime;
      shader.uniforms.uExcite = this.crowdUniforms.uExcite;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uExcite;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float cid = float(gl_InstanceID);
          float ph = fract(sin(cid * 12.9898) * 43758.5453) * 6.2831;
          float rate = 4.0 + fract(cid * 0.6180339) * 3.0;
          float hop = max(0.0, sin(uTime * rate + ph));
          transformed.y += hop * hop * uExcite * 0.42 + sin(uTime * 1.1 + ph) * 0.015;
          if (position.y > 0.65 && position.y < 0.8) transformed.y += uExcite * 0.25 * (0.5 + 0.5 * sin(uTime * rate * 0.5 + ph)) * abs(position.x) * 2.0;`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const blue = [0x2f7bff, 0x1e5ad6, 0x5aa0ff, 0xe8edf5];
    const orange = [0xff7a1a, 0xe85d0c, 0xffa64d, 0xe8edf5];
    const neutral = [0x8b93a1, 0x3c4350, 0xc9cfd8, 0x2f7bff, 0xff7a1a, 0x6b4e3a];
    const c = new THREE.Color();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(yAxis, sp.yaw);
      s.setScalar(0.92 + sp.r * 0.16);
      m.compose(p.set(sp.x, sp.y, sp.z), q, s);
      mesh.setMatrixAt(i, m);
      const pal = sp.z < -20 ? blue : sp.z > 20 ? orange : neutral;
      c.setHex(pal[Math.floor(sp.r * 997) % pal.length]).multiplyScalar(0.75 + sp.r * 0.35);
      mesh.setColorAt(i, c);
    });
    mesh.frustumCulled = false;
    this.crowd = mesh;
    this.crowdTotal = spots.length;
    this.group.add(mesh);
  }

  buildRoof() {
    const topY = BASE_Y + TIERS * TIER_RISE + 9;
    const outer = STAND_OFFSET + TIERS * TIER_DEPTH;
    const inner = 4;
    const pos = [], idx = [];
    for (let i = 0; i < 8; i++) {
      const a0 = ringVertex(i, outer), b0 = ringVertex((i + 1) % 8, outer);
      const a1 = ringVertex(i, inner), b1 = ringVertex((i + 1) % 8, inner);
      const base = pos.length / 3;
      pos.push(a0.x, topY, a0.z, b0.x, topY, b0.z, b1.x, topY + 4, b1.z, a1.x, topY + 4, a1.z);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const roof = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x0c0f14, side: THREE.DoubleSide }));
    this.group.add(roof);

    // Floodlight banks along the inner roof edge
    const fixtures = [];
    for (let i = 0; i < 8; i++) {
      const a = ringVertex(i, inner + 1.5), b = ringVertex((i + 1) % 8, inner + 1.5);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(2, Math.round(len / 9));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        fixtures.push({ x: a.x + (b.x - a.x) * f, y: topY + 3.2, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(WALLS[i].nx, WALLS[i].nz) });
      }
    }
    const lampGeo = new THREE.BoxGeometry(2.6, 1.1, 0.25);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.9, 3.6), toneMapped: false }), fixtures.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const glowPos = new Float32Array(fixtures.length * 3);
    fixtures.forEach((f, i) => {
      e.set(-0.5, f.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, 1, 1));
      lamps.setMatrixAt(i, m);
      glowPos.set([f.x, f.y, f.z], i * 3);
    });
    this.group.add(lamps);
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: makeGlowTexture(), color: new THREE.Color(1.15, 1.1, 1.0), size: 6.5, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    glow.renderOrder = 3;
    this.group.add(glow);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x02040a) },
        horizon: { value: new THREE.Color(0x14203a) },
        glow: { value: new THREE.Color(0x2a3a5a) },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, smoothstep(0.0, 0.55, h));
          c += glow * exp(-abs(h) * 9.0) * 0.6;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    this.group.add(sky);

    const n = 1400;
    const p = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = 0.15 + rnd() * 0.85;
      const r = 560;
      p[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r;
      p[i * 3 + 1] = v * r;
      p[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8d4ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    this.group.add(stars);
  }

  setQuality(q) {
    const frac = q === 'low' ? 0.3 : q === 'medium' ? 0.6 : 1;
    this.crowd.count = Math.floor(this.crowdTotal * frac);
  }

  cheer(amount = 1) {
    this.excite = Math.min(1, this.excite + amount);
  }

  update(dt) {
    this.time += dt;
    this.excite += (0.15 - this.excite) * Math.min(1, dt * 0.35);
    this.crowdUniforms.uTime.value = this.time;
    this.crowdUniforms.uExcite.value = this.excite;
  }
}
