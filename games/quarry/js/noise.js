// Quarry: seeded hashes, gradient noise, fractal sums and a small PRNG. By The_headphones
(function (QY) {
  let seed = 0;

  // Integer hash of up to three coordinates, mixed with the world seed.
  function hashInt(x, y, z) {
    let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }

  const hash3 = (x, y, z) => hashInt(x, y, z) / 4294967296;
  const hash2 = (x, z) => hashInt(x, 0x51ed27, z) / 4294967296;

  // Eight gradient directions for 2D Perlin noise.
  const GX = new Float32Array([1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071]);
  const GZ = new Float32Array([0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071]);

  function grad(ix, iz, dx, dz) {
    const g = hashInt(ix, 0x2f6b, iz) & 7;
    return GX[g] * dx + GZ[g] * dz;
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // 2D gradient noise, roughly in [-1, 1].
  function perlin(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const u = fade(fx);
    const v = fade(fz);
    const a = grad(ix, iz, fx, fz);
    const b = grad(ix + 1, iz, fx - 1, fz);
    const c = grad(ix, iz + 1, fx, fz - 1);
    const d = grad(ix + 1, iz + 1, fx - 1, fz - 1);
    const ab = a + (b - a) * u;
    const cd = c + (d - c) * u;
    return (ab + (cd - ab) * v) * 1.41;
  }

  // Fractal sum of octaves, normalised back to roughly [-1, 1].
  function fbm(x, z, octaves) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += perlin(x * freq + i * 17.31, z * freq - i * 9.13) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  // Deterministic PRNG (mulberry32) for anything that is not position-based.
  function rng(s) {
    let a = s >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Numbers are used as-is; any other text is hashed, so "castle" is a valid seed.
  function seedFrom(text) {
    const trimmed = String(text || "").trim();
    if (/^-?\d{1,9}$/.test(trimmed)) return Number(trimmed) | 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < trimmed.length; i++) {
      h ^= trimmed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h | 0;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  QY.Noise = {
    setSeed(s) {
      seed = s | 0;
    },
    getSeed: () => seed,
    hashInt,
    hash2,
    hash3,
    perlin,
    fbm,
    rng,
    seedFrom,
  };
  QY.MathX = { clamp, lerp, smoothstep };
})(window.QY = window.QY || {});
