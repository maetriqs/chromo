// By The_headphones
// Thin wrapper around a Rapier world holding the arena, ball and car bodies.
import {
  BALL, CAR, FIXED_DT, GRAVITY, GROUP_ARENA, GROUP_BALL, GROUP_CAR, groups,
} from './constants.js';
import { buildColliderSpecs } from './arenaShape.js';

let arenaSpecsCache = null;

export class PhysicsWorld {
  constructor(RAPIER) {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    this.owners = new Map(); // collider handle -> game entity
    this.buildArena();
  }

  buildArena() {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    if (!arenaSpecsCache) arenaSpecsCache = buildColliderSpecs();
    const g = groups(GROUP_ARENA, GROUP_BALL | GROUP_CAR);
    for (const s of arenaSpecsCache) {
      const desc = R.ColliderDesc.cuboid(s.hx, s.hy, s.hz)
        .setTranslation(s.cx, s.cy, s.cz)
        .setRotation({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] })
        .setFriction(0.3)
        .setRestitution(BALL.restitution)
        .setCollisionGroups(g);
      this.world.createCollider(desc, body);
    }
  }

  createBall(owner) {
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL.radius, 0)
        .setLinearDamping(BALL.linearDamping)
        .setAngularDamping(0.02)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      R.ColliderDesc.ball(BALL.radius)
        .setMass(BALL.mass)
        .setFriction(BALL.friction)
        .setRestitution(BALL.restitution)
        .setCollisionGroups(groups(GROUP_BALL, GROUP_ARENA | GROUP_CAR))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    this.owners.set(collider.handle, owner);
    return { body, collider };
  }

  createCar(owner) {
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(0, 1, 0).setCanSleep(false).setCcdEnabled(true),
    );
    const { x: hx, y: hy, z: hz } = CAR.half;
    const m = CAR.mass;
    // Box inertia doubled: cars should not spin wildly from every ball touch.
    const ix = (m / 12) * (4 * hy * hy + 4 * hz * hz) * 2;
    const iy = (m / 12) * (4 * hx * hx + 4 * hz * hz) * 2;
    const iz = (m / 12) * (4 * hx * hx + 4 * hy * hy) * 2;
    const collider = this.world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setMassProperties(m, { x: 0, y: 0, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.4)
        .setRestitution(0)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply)
        .setCollisionGroups(groups(GROUP_CAR, GROUP_ARENA | GROUP_BALL | GROUP_CAR))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    this.owners.set(collider.handle, owner);
    return { body, collider };
  }

  /** Advances one fixed step; `onContact(a, b)` fires for newly started contacts. */
  step(onContact) {
    this.world.step(this.events);
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      onContact(this.owners.get(h1) || null, this.owners.get(h2) || null);
    });
  }

  free() {
    this.events.free();
    this.world.free();
    this.owners.clear();
  }
}
