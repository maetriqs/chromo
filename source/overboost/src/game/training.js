// By The_headphones
// Shooting drills. The player is blue and shoots at the orange (+Z) goal.
import { BALL } from './constants.js';

const r = BALL.radius;
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

export const TRAINING_SHOTS = [
  { name: 'Open Net', car: { x: 0, z: 6, yaw: Math.PI }, ball: { p: [0, r, 24], v: [0, 0, 0] } },
  { name: 'Rolling Across', car: { x: -4, z: 12, yaw: Math.PI }, ball: { p: [-18, r, 32], v: [6.5, 0, 0] } },
  { name: 'Pass Back', car: { x: 0, z: 10, yaw: Math.PI }, ball: { p: [8, r, 40], v: [-2.2, 0, -8.5] } },
  { name: 'Tight Angle', car: { x: 12, z: 8, yaw: face(12, 8, 20, 30) }, ball: { p: [20, r, 30], v: [0, 0, 0] } },
  { name: 'Bouncing Lob', car: { x: 0, z: 12, yaw: Math.PI }, ball: { p: [0, 6, 34], v: [0, 3.5, -7] } },
  { name: 'Corner Cross', car: { x: 4, z: 18, yaw: Math.PI }, ball: { p: [30, r, 40], v: [-8.5, 0, -2] } },
  { name: 'Header', car: { x: 0, z: 20, yaw: Math.PI }, ball: { p: [-3, 8.5, 38], v: [0, 0, 0] } },
  { name: 'Long Range', car: { x: 0, z: -15, yaw: Math.PI }, ball: { p: [0, r, 0], v: [2, 0, 6] } },
  { name: 'Wall Roll', car: { x: -26, z: 4, yaw: face(-26, 4, -34, 22) }, ball: { p: [-37, 2.4, 18], v: [0, 2.5, 9.5] } },
  { name: 'Pop-up', car: { x: 0, z: 14, yaw: Math.PI }, ball: { p: [5, 3, 32], v: [0, 7.5, -2.5] } },
];

export const SHOT_TIME = 10;
