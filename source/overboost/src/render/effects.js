// By The_headphones
// Pooled point-sprite particles plus one-off explosion meshes.
import * as THREE from 'three';
import { TEAM_COLORS } from '../game/constants.js';
import { makeGlowTexture } from './textures.js';

const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  // Particles drifting into the lens would cover the screen: fade them out up close.
  vColor.a *= smoothstep(0.6, 2.6, depth);
  gl_PointSize = min(aSize * uScale / max(0.1, depth), 220.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class ParticlePool {
  constructor(max, texture, blending) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: { value: 500 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, grav = 0) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b;
    this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }

  kill(i) {
    const j = --this.count;
    if (i === j) return;
    this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.rgb.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const i3 = i * 3;
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      const i4 = i * 4;
      this.col[i4] = this.rgb[i3]; this.col[i4 + 1] = this.rgb[i3 + 1]; this.col[i4 + 2] = this.rgb[i3 + 2];
      this.col[i4 + 3] = this.a0[i] * fade;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    if (this.count > 0) {
      this.posAttr.clearUpdateRanges(); this.posAttr.addUpdateRange(0, this.count * 3); this.posAttr.needsUpdate = true;
      this.colAttr.clearUpdateRanges(); this.colAttr.addUpdateRange(0, this.count * 4); this.colAttr.needsUpdate = true;
      this.sizeAttr.clearUpdateRanges(); this.sizeAttr.addUpdateRange(0, this.count); this.sizeAttr.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
  }
}

const SHOCK_FRAG = `
uniform vec3 uColor; uniform float uAlpha;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  gl_FragColor = vec4(uColor * (0.35 + f * 1.6), uAlpha * (0.15 + f));
  #include <colorspace_fragment>
}`;
const SHOCK_VERT = `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const tex = makeGlowTexture(0.1);
    this.glow = new ParticlePool(5000, tex, THREE.AdditiveBlending);
    this.smoke = new ParticlePool(900, makeGlowTexture(0), THREE.NormalBlending);
    this.smoke.points.renderOrder = 4;
    scene.add(this.glow.points, this.smoke.points);
    this.rate = 1;

    this.shocks = [];
    const shockGeo = new THREE.IcosahedronGeometry(1, 3);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: SHOCK_VERT, fragmentShader: SHOCK_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(shockGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.shocks.push({ mesh, mat, t: -1, dur: 0.8, max: 20 });
    }
    this.flash = new THREE.PointLight(0xffffff, 0, 60, 1.4);
    scene.add(this.flash);
    this.flashT = 0;
    this.flashPeak = 0;
  }

  setQuality(q) {
    this.rate = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1;
  }

  setViewport(heightPx, fovYdeg) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovYdeg) / 2));
    this.glow.material.uniforms.uScale.value = s;
    this.smoke.material.uniforms.uScale.value = s;
  }

  /** Boost exhaust for one frame. `p` = nozzle world position, `dir` = car backward unit vector. */
  boostTrail(p, dir, carVel, team, dt) {
    const n = Math.ceil(70 * dt * this.rate * 3);
    const c = team === 0 ? [0.5, 1.1, 2.6] : [2.6, 1.0, 0.25];
    for (let i = 0; i < n; i++) {
      const sp = 4 + Math.random() * 5;
      const j = 0.9;
      this.glow.emit(
        p.x + (Math.random() - 0.5) * 0.08, p.y + (Math.random() - 0.5) * 0.08, p.z + (Math.random() - 0.5) * 0.08,
        carVel.x * 0.5 + dir.x * sp + (Math.random() - 0.5) * j, carVel.y * 0.5 + dir.y * sp + (Math.random() - 0.5) * j,
        carVel.z * 0.5 + dir.z * sp + (Math.random() - 0.5) * j,
        0.22 + Math.random() * 0.18, 0.32, 0.06, c[0], c[1], c[2], 0.9, 3,
      );
    }
    if (Math.random() < 0.5 * this.rate) {
      this.smoke.emit(p.x + dir.x * 0.4, p.y + dir.y * 0.4, p.z + dir.z * 0.4,
        carVel.x * 0.3 + dir.x * 2, carVel.y * 0.3 + 0.4, carVel.z * 0.3 + dir.z * 2,
        0.7, 0.25, 1.1, 0.55, 0.58, 0.62, 0.12, 2, -0.6);
    }
  }

  supersonicTrail(p, team) {
    if (Math.random() > this.rate) return;
    const c = team === 0 ? [1.2, 1.7, 2.6] : [2.6, 1.7, 1.0];
    this.glow.emit(p.x, p.y, p.z, 0, 0.1, 0, 0.35, 0.14, 0.02, c[0], c[1], c[2], 0.7);
  }

  sparks(p, strength, team) {
    const n = Math.min(40, Math.floor(strength * 1.2 * this.rate));
    const c = team === 0 ? [1.4, 2.0, 3.0] : [3.0, 1.8, 0.8];
    for (let i = 0; i < n; i++) {
      const v = randDir(strength * 0.25 + 2);
      this.glow.emit(p.x, p.y, p.z, v.x, v.y, v.z, 0.25 + Math.random() * 0.3, 0.16, 0.02, c[0], c[1], c[2], 1, 2, 6);
    }
  }

  pickup(p, big) {
    const n = Math.floor((big ? 40 : 12) * this.rate);
    for (let i = 0; i < n; i++) {
      const v = randDir(big ? 4 : 2.5);
      this.glow.emit(p.x, (big ? 1.2 : 0.3), p.z, v.x, Math.abs(v.y) + 1.5, v.z, 0.5 + Math.random() * 0.3, big ? 0.45 : 0.3, 0.05, 2.6, 1.6, 0.35, 1, 2.2, 1.5);
    }
  }

  goalExplosion(p, team) {
    const col = new THREE.Color(TEAM_COLORS[team]);
    const n = Math.floor(420 * this.rate);
    for (let i = 0; i < n; i++) {
      const v = randDir(10 + Math.random() * 30);
      if (v.y < 0) v.y *= -0.4;
      const hot = Math.random() < 0.25;
      this.glow.emit(p.x, p.y, p.z, v.x, v.y, v.z, 1 + Math.random() * 1.3, hot ? 0.9 : 1.6, 0.1,
        hot ? 3.5 : col.r * 3.2, hot ? 3.3 : col.g * 3.2, hot ? 3 : col.b * 3.2, 1, 1.4, 4);
    }
    for (let i = 0; i < 70 * this.rate; i++) {
      const v = randDir(3 + Math.random() * 8);
      this.smoke.emit(p.x, p.y, p.z, v.x, Math.abs(v.y) * 0.6 + 1, v.z, 2.2 + Math.random() * 1.5, 2, 6, 0.16, 0.17, 0.2, 0.55, 1.2, -0.4);
    }
    this.shock(p, col, 24, 0.85);
    this.shock(p, new THREE.Color(1, 1, 1), 12, 0.45);
    this.flashAt(p, col, 900);
  }

  demolition(p) {
    for (let i = 0; i < 160 * this.rate; i++) {
      const v = randDir(4 + Math.random() * 14);
      this.glow.emit(p.x, p.y, p.z, v.x, v.y + 3, v.z, 0.6 + Math.random() * 0.6, 0.8, 0.1, 3, 1.4, 0.4, 1, 1.6, 6);
    }
    for (let i = 0; i < 40 * this.rate; i++) {
      const v = randDir(2 + Math.random() * 3);
      this.smoke.emit(p.x, p.y, p.z, v.x, Math.abs(v.y) + 1, v.z, 1.8 + Math.random(), 1, 3.5, 0.08, 0.08, 0.09, 0.7, 1, -0.5);
    }
    this.shock(p, new THREE.Color(1.0, 0.5, 0.15), 7, 0.4);
    this.flashAt(p, new THREE.Color(1, 0.6, 0.3), 400);
  }

  shock(p, color, max, dur) {
    const s = this.shocks.find((x) => x.t < 0) || this.shocks[0];
    s.t = 0;
    s.max = max;
    s.dur = dur;
    s.mesh.position.copy(p);
    s.mat.uniforms.uColor.value.copy(color).multiplyScalar(2);
    s.mesh.visible = true;
  }

  flashAt(p, color, intensity) {
    this.flash.position.copy(p);
    this.flash.color.copy(color);
    this.flashPeak = intensity;
    this.flashT = 0;
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const s of this.shocks) {
      if (s.t < 0) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.t = -1; s.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      s.mesh.scale.setScalar(0.5 + e * s.max);
      s.mat.uniforms.uAlpha.value = (1 - k) * (1 - k);
    }
    if (this.flashPeak > 0) {
      this.flashT += dt;
      this.flash.intensity = this.flashPeak * Math.max(0, 1 - this.flashT / 0.7) ** 2;
      if (this.flashT > 0.7) { this.flashPeak = 0; this.flash.intensity = 0; }
    }
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    for (const s of this.shocks) { s.t = -1; s.mesh.visible = false; }
    this.flash.intensity = 0;
    this.flashPeak = 0;
  }
}

const _rd = new THREE.Vector3();
function randDir(speed) {
  _rd.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  if (_rd.lengthSq() < 1e-4) _rd.set(0, 1, 0);
  return _rd.normalize().multiplyScalar(speed);
}
