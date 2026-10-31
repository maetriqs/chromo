// By The_headphones
// Procedurally drawn textures: nothing is downloaded, everything is generated at load.
import * as THREE from 'three';
import { ARENA, BIG_PADS, SMALL_PADS } from '../game/constants.js';
import { WALLS, insetVertex } from '../game/arenaShape.js';

const { halfWidth: W, halfLength: L, goalDepth: GD, goalHalfWidth: GW, floorRadius: RF } = ARENA;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

/** Field turf with markings. Canvas top = -Z (blue end), left = -X. */
export function makeFieldTexture(maxAniso) {
  const c = canvas(1024, 1536);
  const ctx = c.getContext('2d');
  const ZE = L + GD;
  const sx = c.width / (2 * W), sz = c.height / (2 * ZE);
  ctx.setTransform(sx, 0, 0, sz, W * sx, ZE * sz);

  // Base and mowing stripes across the width
  ctx.fillStyle = '#1d5527';
  ctx.fillRect(-W, -ZE, 2 * W, 2 * ZE);
  const stripe = 6.4;
  for (let z = -ZE, i = 0; z < ZE; z += stripe, i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(-W, z, 2 * W, stripe);
  }
  // Grain
  const r = rng(11);
  for (let i = 0; i < 26000; i++) {
    const x = -W + r() * 2 * W, z = -ZE + r() * 2 * ZE;
    const g = 70 + r() * 60;
    ctx.fillStyle = `rgba(${g * 0.35 | 0},${g | 0},${g * 0.4 | 0},0.09)`;
    ctx.fillRect(x, z, 0.12 + r() * 0.2, 0.12 + r() * 0.25);
  }
  // Team wash toward each end
  const wash = (z0, z1, rgb) => {
    const g = ctx.createLinearGradient(0, z0, 0, z1);
    g.addColorStop(0, `rgba(${rgb},0.30)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-W, Math.min(z0, z1), 2 * W, Math.abs(z1 - z0));
  };
  wash(-L, -L * 0.45, '40,120,255');
  wash(L, L * 0.45, '255,130,30');

  // Goal floors
  for (const s of [-1, 1]) {
    ctx.fillStyle = s < 0 ? 'rgba(10,40,90,0.85)' : 'rgba(90,40,10,0.85)';
    const z0 = s < 0 ? -ZE : L;
    ctx.fillRect(-GW, z0, 2 * GW, GD + 2);
    ctx.strokeStyle = s < 0 ? 'rgba(120,180,255,0.35)' : 'rgba(255,170,90,0.35)';
    ctx.lineWidth = 0.18;
    for (let x = -GW - GD; x < GW; x += 1.2) {
      ctx.beginPath();
      ctx.moveTo(x, s < 0 ? -L : L);
      ctx.lineTo(x + GD, s < 0 ? -L - GD : L + GD);
      ctx.stroke();
    }
  }

  // Lines
  ctx.strokeStyle = 'rgba(240,244,248,0.82)';
  ctx.lineWidth = 0.32;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const v = insetVertex(WALLS[(i + 7) % 8], WALLS[i], RF + 0.45);
    if (i === 0) ctx.moveTo(v.x, v.z); else ctx.lineTo(v.x, v.z);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-W + RF, 0);
  ctx.lineTo(W - RF, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, 12.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,244,248,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.32;
  for (const s of [-1, 1]) {
    const gz = s * L;
    ctx.beginPath();
    ctx.arc(0, gz, 19, s < 0 ? 0 : Math.PI, s < 0 ? Math.PI : Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(-GW - 4, Math.min(gz, gz - s * 7), 2 * GW + 8, 7);
    // goal line
    ctx.beginPath();
    ctx.moveTo(-GW, gz);
    ctx.lineTo(GW, gz);
    ctx.stroke();
  }
  // Kickoff marks
  for (const [x, z] of [[-20.48, -25.6], [20.48, -25.6], [0, -46.08]]) {
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.arc(x * s, z * s, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Boost pad footprints
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const [x, z] of SMALL_PADS) {
    ctx.beginPath();
    ctx.arc(x, z, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, z] of BIG_PADS) {
    ctx.beginPath();
    ctx.arc(x, z, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/** Small tiling grain used as a bump map on the turf. */
export function makeGrassBump() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(5);
  for (let i = 0; i < 9000; i++) {
    const v = (r() * 255) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 2 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 60);
  return tex;
}

/**
 * Lower wall panels. U spans 16 m of wall (tiles), V spans the curved ramp plus
 * the vertical band up to the goal crossbar height (`vSplit` metres of profile).
 */
export function makeWallTexture(vSplit, vRamp, maxAniso) {
  const c = canvas(1024, 512);
  const ctx = c.getContext('2d');
  const h = c.height;
  const bandTop = 0;
  const bandBottom = Math.round((1 - vRamp / vSplit) * h);
  // Ramp panels
  const g = ctx.createLinearGradient(0, bandBottom, 0, h);
  g.addColorStop(0, '#5d6670');
  g.addColorStop(1, '#2c3239');
  ctx.fillStyle = g;
  ctx.fillRect(0, bandBottom, 1024, h - bandBottom);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  for (let x = 0; x <= 1024; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x, bandBottom);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let x = 2; x <= 1024; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x, bandBottom);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // Ad band
  ctx.fillStyle = '#1a1e24';
  ctx.fillRect(0, bandTop, 1024, bandBottom - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, bandBottom - 6, 1024, 4);
  ctx.font = `italic 800 ${Math.round((bandBottom - bandTop) * 0.62)}px ${DISPLAY_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9eef4';
  const mid = (bandTop + bandBottom) / 2;
  ctx.fillText('OVERBOOST', 40, mid + 4);
  ctx.fillStyle = 'rgba(233,238,244,0.55)';
  ctx.font = `600 ${Math.round((bandBottom - bandTop) * 0.22)}px ${DISPLAY_FONT}`;
  ctx.fillText('ROCKET CAR FOOTBALL', 600, mid - 20);
  ctx.fillText('SEASON ONE  ·  ARENA', 600, mid + 26);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.12 + i * 0.05})`;
    ctx.beginPath();
    const x0 = 520 + i * 10;
    ctx.moveTo(x0, bandTop + 18);
    ctx.lineTo(x0 + 6, bandTop + 18);
    ctx.lineTo(x0 - 14, bandBottom - 18);
    ctx.lineTo(x0 - 20, bandBottom - 18);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

/** Seamless hexagon lattice used for the glass walls and ceiling (grayscale mask). */
export function makeHexTexture() {
  const R = 42.67;
  const w = Math.round(Math.sqrt(3) * R * 8), h = Math.round(3 * R * 4);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const hx = Math.sqrt(3) * R;
  for (let j = -1; j <= 9; j++) {
    for (let i = -1; i <= 9; i++) {
      const cx = i * hx + (j % 2 ? hx / 2 : 0), cy = j * 1.5 * R;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const x = cx + Math.cos(a) * (R - 3), y = cy + Math.sin(a) * (R - 3);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Thin grid lines for the goal nets (used as an emissive mask). */
export function makeNetTexture() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft round sprite for particles and light glows. */
export function makeGlowTexture(hard = 0.0) {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.max(0.05, hard), 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Blob used for cheap contact shadows when shadow maps are off. */
export function makeBlobTexture() {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
