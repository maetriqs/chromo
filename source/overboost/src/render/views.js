// By The_headphones
// Visual counterparts of the simulated ball and cars (render interpolation lives here).
import * as THREE from 'three';
import { BALL, CAR } from '../game/constants.js';
import { createCarModel, disposeCarModel } from './carModel.js';
import { makeBlobTexture } from './textures.js';

// Truncated-icosahedron panel centres: 12 pentagons then 20 hexagons.
function panelCenters() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const pts = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    pts.push(new THREE.Vector3(0, a, b * phi), new THREE.Vector3(a, b * phi, 0), new THREE.Vector3(b * phi, 0, a));
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) pts.push(new THREE.Vector3(a, b, c));
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    pts.push(new THREE.Vector3(0, a / phi, b * phi), new THREE.Vector3(a / phi, b * phi, 0), new THREE.Vector3(b * phi, 0, a / phi));
  }
  return pts.map((p) => p.normalize());
}

let blobTex = null;
function blob() {
  if (!blobTex) blobTex = makeBlobTexture();
  return blobTex;
}

function makeBlobShadow(size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false, opacity: 0.8 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export class BallView {
  constructor(scene) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.34, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.25,
    });
    const centers = panelCenters();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCenters = { value: centers };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform vec3 uCenters[32];')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 bdir = normalize(vObjPos);
          float best = -2.0, second = -2.0; int bi = 0;
          for (int i = 0; i < 32; i++) {
            float d = dot(bdir, uCenters[i]);
            if (d > best) { second = best; best = d; bi = i; } else if (d > second) { second = d; }
          }
          float edge = best - second;
          float aa = fwidth(edge) * 1.2 + 1e-4;
          float seam = 1.0 - smoothstep(0.006, 0.006 + aa, edge);
          vec3 panel = bi < 12 ? vec3(0.13, 0.16, 0.21) : vec3(0.88, 0.9, 0.93);
          diffuseColor.rgb = mix(panel, vec3(0.05, 0.06, 0.08), seam);`);
    };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 48, 32), mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'ball';
    scene.add(this.mesh);
    this.blob = makeBlobShadow(BALL.radius * 2.6);
    scene.add(this.blob);
    this.useBlob = false;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
  }

  update(ball, alpha) {
    this.pos.lerpVectors(ball.prevPosition, ball.position, alpha);
    this.quat.slerpQuaternions(ball.prevQuaternion, ball.quaternion, alpha);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    this.mesh.visible = !ball.hidden;
    const h = this.pos.y;
    this.blob.visible = this.useBlob && !ball.hidden && Math.abs(this.pos.x) < 40 && Math.abs(this.pos.z) < 60;
    if (this.blob.visible) {
      this.blob.position.set(this.pos.x, 0.03, this.pos.z);
      const k = Math.max(0.25, 1 - (h - BALL.radius) / 14);
      this.blob.scale.setScalar(0.6 + k * 0.6);
      this.blob.material.opacity = 0.75 * k;
    }
  }

  dispose(scene) {
    scene.remove(this.mesh, this.blob);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.blob.geometry.dispose();
    this.blob.material.dispose();
  }
}

const _nozzle = new THREE.Vector3(0, -0.045, 0.78);
const _back = new THREE.Vector3();
const _w = new THREE.Vector3();
const _wheelL = new THREE.Vector3();

export class CarView {
  constructor(scene, car) {
    this.car = car;
    this.model = createCarModel(car.team);
    this.root = this.model.root;
    this.root.name = `car-${car.id}`;
    scene.add(this.root);
    this.blob = makeBlobShadow(1.8);
    this.blob.scale.set(1, 1.5, 1);
    scene.add(this.blob);
    this.useBlob = false;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.spin = 0;
    this.steer = 0;
    const rest = CAR.anchorY - (0.292 - CAR.wheelRadius);
    this.suspension = [rest, rest, rest, rest];
    this.time = 0;
    this.nozzleWorld = new THREE.Vector3();
    this.backDir = new THREE.Vector3();
  }

  update(alpha, dt, effects) {
    const car = this.car;
    this.time += dt;
    const visible = !car.demolished;
    this.root.visible = visible;
    this.blob.visible = visible && this.useBlob;
    if (!visible) return;
    this.pos.lerpVectors(car.prevPosition, car.position, alpha);
    this.quat.slerpQuaternions(car.prevQuaternion, car.quaternion, alpha);
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);

    // Wheels: suspension travel, spin and steering
    this.spin += (car.forwardSpeed / CAR.wheelRadius) * dt;
    const targetSteer = car.onGround ? car.input.steer : 0;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 12);
    const rest = CAR.anchorY - (0.292 - CAR.wheelRadius);
    car.wheels.forEach((wh, i) => {
      const target = CAR.anchorY - (wh.rayT - CAR.wheelRadius);
      this.suspension[i] += (target - this.suspension[i]) * Math.min(1, dt * 25);
      const vw = this.model.wheels[i];
      vw.pivot.position.y = Number.isFinite(this.suspension[i]) ? this.suspension[i] : rest;
      vw.spin.rotation.x = -this.spin;
      if (vw.front) vw.pivot.rotation.y = -this.steer * 0.42;
    });

    // Boost flame + particles
    const flame = this.model.flame;
    flame.visible = car.boosting;
    if (car.boosting) {
      flame.scale.set(1, 1, 0.8 + Math.random() * 0.45);
      this.model.flameMat.uniforms.uTime.value = this.time;
      this.nozzleWorld.copy(_nozzle).applyQuaternion(this.quat).add(this.pos);
      this.backDir.set(0, 0, 1).applyQuaternion(this.quat);
      effects?.boostTrail(this.nozzleWorld, this.backDir, car.velocity, car.team, dt);
    }
    if (car.supersonic && effects) {
      for (const sx of [-1, 1]) {
        _wheelL.set(sx * 0.37, -0.25, 0.42).applyQuaternion(this.quat).add(this.pos);
        effects.supersonicTrail(_wheelL, car.team);
      }
    }
    const brake = car.braking || car.input.throttle < -0.1;
    this.model.tailMat.color.setRGB(brake ? 4 : 1.4, brake ? 0.2 : 0.07, brake ? 0.15 : 0.05);

    if (this.blob.visible) {
      _back.set(0, 1, 0).applyQuaternion(this.quat);
      const h = this.pos.y;
      this.blob.visible = h < 6 && _back.y > 0.3;
      this.blob.position.set(this.pos.x, 0.025, this.pos.z);
      _w.set(0, 0, -1).applyQuaternion(this.quat);
      this.blob.rotation.z = Math.atan2(_w.x, _w.z);
      this.blob.material.opacity = 0.7 * Math.max(0, 1 - h / 6);
    }
  }

  dispose(scene) {
    scene.remove(this.root, this.blob);
    disposeCarModel(this.model);
    this.blob.geometry.dispose();
    this.blob.material.dispose();
  }
}
