// By The_headphones
// Units are metres / seconds. Dimensions follow the classic car-soccer field
// proportions (1 m = 100 "unreal units"), so tuning numbers stay familiar.

export const PHYSICS_HZ = 120;
export const FIXED_DT = 1 / PHYSICS_HZ;
export const GRAVITY = 6.5;

export const ARENA = Object.freeze({
  halfWidth: 40.96, // x
  halfLength: 51.2, // z, the goal line
  height: 20.44,
  cornerCut: 11.52, // 45-degree corner bevel size
  floorRadius: 3.2, // floor -> wall transition
  ceilRadius: 3.2, // wall -> ceiling transition
  rampSegments: 16, // physics facets per curved transition
  goalHalfWidth: 8.93,
  goalHeight: 6.43,
  goalDepth: 8.8,
});

export const BALL = Object.freeze({
  radius: 0.9275,
  mass: 30,
  restitution: 0.6,
  friction: 0.3,
  maxSpeed: 60,
  maxAngSpeed: 12,
  linearDamping: 0.03,
});

export const CAR = Object.freeze({
  half: Object.freeze({ x: 0.421, y: 0.181, z: 0.59 }),
  mass: 180,
  maxSpeed: 23,
  supersonicSpeed: 21.9,
  throttleTopSpeed: 14.1,
  boostAccel: 9.9167,
  boostPerSecond: 33.3,
  brakeAccel: 35,
  coastAccel: 5.25,
  airThrottleAccel: 0.667,
  maxAngSpeed: 5.5,

  // Suspension (raycast wheels against the analytic arena surface)
  wheelRadius: 0.16,
  rayLength: 0.38, // anchor -> ground at zero compression
  anchorY: -0.09,
  wheelX: 0.34,
  wheelFrontZ: -0.37, // forward is -Z in car space
  wheelBackZ: 0.36,
  springK: 5000, // per wheel, N/m
  springC: 900, // per wheel, N*s/m (about critically damped)
  bumpCompression: 0.22,
  stickAccel: 3.25,

  gripNormal: 26,
  gripSlide: 2.2,
  slideYawBoost: 1.3,
  alignRate: 22,

  jumpImpulse: 2.92,
  jumpHoldAccel: 14.58,
  jumpHoldTime: 0.2,
  jumpMinTime: 0.03,
  flipWindow: 1.45,
  dodgeImpulse: 5.0,
  dodgeBackImpulse: 5.33,
  dodgeDuration: 0.72,

  airTorque: Object.freeze({ pitch: 12.146, yaw: 8.92, roll: 36.08 }),
  airDamp: Object.freeze({ pitch: 2.798, yaw: 1.886, roll: 4.472 }),
});

export const TEAM_BLUE = 0;
export const TEAM_ORANGE = 1;
export const TEAM_NAMES = ['BLUE', 'ORANGE'];
export const TEAM_COLORS = [0x2f86ff, 0xff8a1f];

// Collision groups: (membership << 16) | filter
export const GROUP_ARENA = 0x1;
export const GROUP_BALL = 0x2;
export const GROUP_CAR = 0x4;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

// Classic kickoff spots for the blue team (orange is mirrored through the origin).
export const KICKOFF_SPOTS = [
  { x: -20.48, z: -25.6, name: 'diag-left' },
  { x: 20.48, z: -25.6, name: 'diag-right' },
  { x: -2.56, z: -38.4, name: 'off-left' },
  { x: 2.56, z: -38.4, name: 'off-right' },
  { x: 0, z: -46.08, name: 'center' },
];

export const RESPAWN_SPOTS = [
  { x: -23.04, z: -46.08 },
  { x: -26.88, z: -46.08 },
  { x: 23.04, z: -46.08 },
  { x: 26.88, z: -46.08 },
];

export const BIG_PADS = [
  [-35.84, 0], [35.84, 0], [-30.72, 40.96], [30.72, 40.96], [-30.72, -40.96], [30.72, -40.96],
];

export const SMALL_PADS = [
  [0, -42.4], [-17.92, -41.84], [17.92, -41.84], [-9.4, -33.08], [9.4, -33.08], [0, -28.16],
  [-35.84, -24.84], [35.84, -24.84], [-17.88, -23.0], [17.88, -23.0], [-20.48, -10.36], [0, -10.24],
  [20.48, -10.36], [-10.24, 0], [10.24, 0], [-20.48, 10.36], [0, 10.24], [20.48, 10.36],
  [-17.88, 23.0], [17.88, 23.0], [-35.84, 24.84], [35.84, 24.84], [0, 28.16], [-9.4, 33.1],
  [9.4, 33.08], [-17.92, 41.84], [17.92, 41.84], [0, 42.4],
];
