// By The_headphones
// Procedural car body. Car space matches physics: forward -Z, up +Y, right +X.
import * as THREE from 'three';
import { CAR, TEAM_COLORS } from '../game/constants.js';

const WHEEL_CENTER_REST_Y = CAR.anchorY - (0.292 - CAR.wheelRadius);

function bodyShape() {
  // Side silhouette in (x = forward, y = up) metres, car centre at origin.
  const s = new THREE.Shape();
  const arch = (cx, from) => {
    const r = 0.205, cy = WHEEL_CENTER_REST_Y;
    const dy = -0.15 - cy;
    const dx = Math.sqrt(r * r - dy * dy);
    s.lineTo(cx - dx * from, -0.15);
    const a0 = Math.atan2(dy, -dx), a1 = Math.atan2(dy, dx);
    s.absarc(cx, cy, r, a0, a1, true);
  };
  s.moveTo(-0.6, -0.15);
  arch(-CAR.wheelBackZ, 1);
  arch(-CAR.wheelFrontZ, 1);
  s.lineTo(0.6, -0.15);
  s.quadraticCurveTo(0.68, -0.13, 0.67, -0.04);
  s.lineTo(0.64, 0.02);
  s.quadraticCurveTo(0.58, 0.055, 0.46, 0.065);
  s.lineTo(0.12, 0.105);
  s.lineTo(-0.5, 0.13);
  s.lineTo(-0.62, 0.12);
  s.quadraticCurveTo(-0.665, 0.06, -0.655, -0.03);
  s.lineTo(-0.63, -0.12);
  s.lineTo(-0.6, -0.15);
  return s;
}

function cabinShape() {
  const s = new THREE.Shape();
  s.moveTo(0.16, 0.085);
  s.quadraticCurveTo(0.02, 0.2, -0.06, 0.255);
  s.lineTo(-0.3, 0.265);
  s.quadraticCurveTo(-0.44, 0.2, -0.5, 0.11);
  s.lineTo(0.16, 0.085);
  return s;
}

function extrude(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 3, curveSegments: 10, steps: 1,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // shape +X (nose) -> car -Z
  g.computeVertexNormals();
  return g;
}

const shared = {};

function sharedGeometry() {
  if (shared.body) return shared;
  shared.body = extrude(bodyShape(), 0.74, 0.04);
  shared.cabin = extrude(cabinShape(), 0.6, 0.03);
  shared.tire = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.13, 22).rotateZ(Math.PI / 2);
  shared.rim = new THREE.CylinderGeometry(0.105, 0.105, 0.138, 14).rotateZ(Math.PI / 2);
  shared.hub = new THREE.TorusGeometry(0.075, 0.012, 6, 18).rotateY(Math.PI / 2);
  shared.spoiler = new THREE.BoxGeometry(0.76, 0.025, 0.15);
  shared.roof = new THREE.BoxGeometry(0.5, 0.022, 0.25);
  shared.strut = new THREE.BoxGeometry(0.03, 0.12, 0.05);
  shared.light = new THREE.BoxGeometry(0.16, 0.035, 0.03);
  shared.skirt = new THREE.BoxGeometry(0.05, 0.05, 0.62);
  shared.nozzle = new THREE.CylinderGeometry(0.075, 0.09, 0.08, 14).rotateX(Math.PI / 2);
  shared.nozzleCore = new THREE.CircleGeometry(0.05, 14);
  shared.tailBar = new THREE.BoxGeometry(0.6, 0.035, 0.02);
  shared.diffuser = new THREE.BoxGeometry(0.66, 0.11, 0.05);
  const flame = new THREE.ConeGeometry(0.085, 0.7, 14, 1, true);
  flame.translate(0, 0.35, 0);
  flame.rotateX(Math.PI / 2); // wide end at the nozzle, tip trailing toward +Z
  shared.flame = flame;
  return shared;
}

const materialCache = new Map();

function teamMaterials(team) {
  if (materialCache.has(team)) return materialCache.get(team);
  const base = new THREE.Color(TEAM_COLORS[team]);
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({
      color: base, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
    }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0f15, metalness: 0.85, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.4, roughness: 0.55 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0e0f11, metalness: 0, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.25 }),
    hub: new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(2.5), toneMapped: false }),
    head: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.0), toneMapped: false }),
    flame: new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: team === 0 ? new THREE.Color(0.35, 0.75, 1.6) : new THREE.Color(1.8, 0.75, 0.18) }, uTime: { value: 0 }, uPower: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main(){ float along = 1.0 - vUv.y; float flick = 0.75 + 0.25 * sin(uTime * 60.0 + along * 20.0);
          float core = pow(along, 1.6);
          vec3 c = mix(uColor, vec3(3.0, 2.8, 2.4), core * 0.7) * flick * uPower;
          gl_FragColor = vec4(c, core * 0.95);
          #include <colorspace_fragment>
        }`,
    }),
  };
  materialCache.set(team, mats);
  return mats;
}

/** Builds a car mesh hierarchy. Returns { root, body, wheels[], flame, tail (material) }. */
export function createCarModel(team) {
  const g = sharedGeometry();
  const m = teamMaterials(team);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shell = new THREE.Mesh(g.body, m.paint);
  shell.castShadow = true;
  body.add(shell);
  const cabin = new THREE.Mesh(g.cabin, m.glass);
  cabin.castShadow = true;
  body.add(cabin);

  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(g.skirt, m.dark);
    skirt.position.set(sx * 0.4, -0.13, 0);
    body.add(skirt);
    const strut = new THREE.Mesh(g.strut, m.dark);
    strut.position.set(sx * 0.26, 0.17, 0.5);
    body.add(strut);
    const head = new THREE.Mesh(g.light, m.head);
    head.position.set(sx * 0.24, 0.01, -0.665);
    body.add(head);
  }
  const roof = new THREE.Mesh(g.roof, m.paint);
  roof.position.set(0, 0.268, 0.175);
  roof.rotation.x = 0.03;
  roof.castShadow = true;
  body.add(roof);
  const spoiler = new THREE.Mesh(g.spoiler, m.paint);
  spoiler.position.set(0, 0.235, 0.53);
  spoiler.rotation.x = -0.12;
  spoiler.castShadow = true;
  body.add(spoiler);

  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.08, 0.06), toneMapped: false });
  const tail = new THREE.Mesh(g.tailBar, tailMat);
  tail.position.set(0, 0.075, 0.664);
  body.add(tail);
  const diffuser = new THREE.Mesh(g.diffuser, m.dark);
  diffuser.position.set(0, -0.085, 0.652);
  body.add(diffuser);
  const nozzle = new THREE.Mesh(g.nozzle, m.rim);
  nozzle.position.set(0, -0.045, 0.675);
  body.add(nozzle);
  const nozzleCore = new THREE.Mesh(g.nozzleCore, m.hub);
  nozzleCore.position.set(0, -0.045, 0.715);
  body.add(nozzleCore);
  const flameMat = m.flame.clone();
  const flame = new THREE.Mesh(g.flame, flameMat);
  flame.position.set(0, -0.045, 0.72);
  flame.visible = false;
  body.add(flame);

  const wheels = [];
  const locals = [
    [-CAR.wheelX - 0.03, CAR.wheelFrontZ, true],
    [CAR.wheelX + 0.03, CAR.wheelFrontZ, true],
    [-CAR.wheelX - 0.03, CAR.wheelBackZ, false],
    [CAR.wheelX + 0.03, CAR.wheelBackZ, false],
  ];
  for (const [x, z, front] of locals) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_CENTER_REST_Y, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    const tire = new THREE.Mesh(g.tire, m.tire);
    tire.castShadow = true;
    spin.add(tire);
    const rim = new THREE.Mesh(g.rim, m.rim);
    spin.add(rim);
    const hub = new THREE.Mesh(g.hub, m.hub);
    hub.position.x = Math.sign(x) * 0.07;
    spin.add(hub);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  return { root, body, wheels, flame, flameMat, tailMat };
}

export function disposeCarModel(model) {
  model.flameMat.dispose();
  model.tailMat.dispose();
}
