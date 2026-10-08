// Quarry: sky dome, sun and moon, stars, drifting clouds and the day/night colour cycle. By The_headphones
(function (QY) {
  const { smoothstep } = QY.MathX;

  const DOME_VERTEX = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const DOME_FRAGMENT = `
    uniform vec3 zenith;
    uniform vec3 horizon;
    uniform vec3 ground;
    uniform vec3 glow;
    uniform vec3 sunDir;
    uniform float glowAmount;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 c = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
      if (h < 0.0) c = mix(horizon, ground, clamp(-h * 4.0, 0.0, 1.0));
      float s = max(dot(d, sunDir), 0.0);
      c += glow * glowAmount * pow(s, 5.0) * (1.0 - clamp(abs(h) * 2.2, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  const CLOUD_VERTEX = `
    varying vec2 vWorld;
    varying float vDist;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xz;
      vec4 mv = viewMatrix * w;
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `;
  const CLOUD_FRAGMENT = `
    uniform sampler2D map;
    uniform vec2 offset;
    uniform vec3 color;
    uniform float opacity;
    uniform float fadeFar;
    varying vec2 vWorld;
    varying float vDist;
    void main() {
      vec4 c = texture2D(map, (vWorld + offset) / 768.0);
      if (c.a < 0.5) discard;
      float fade = 1.0 - smoothstep(fadeFar * 0.35, fadeFar, vDist);
      gl_FragColor = vec4(color, opacity * fade);
    }
  `;

  const C = (r, g, b) => new THREE.Color(r, g, b);
  const PALETTE = {
    dayZenith: C(0.4, 0.6, 0.95),
    dayHorizon: C(0.72, 0.84, 0.98),
    nightZenith: C(0.01, 0.015, 0.04),
    nightHorizon: C(0.04, 0.055, 0.11),
    duskHorizon: C(0.96, 0.56, 0.32),
    duskZenith: C(0.27, 0.32, 0.58),
    glow: C(1, 0.55, 0.25),
    skyDay: C(1, 1, 1),
    skyNight: C(0.55, 0.64, 1),
    skyDusk: C(1, 0.82, 0.68),
  };

  const state = {
    time: 0.1,
    daylight: 1,
    night: 0,
    sunDir: new THREE.Vector3(1, 0, 0),
    horizon: new THREE.Color(),
    zenith: new THREE.Color(),
    skyLight: new THREE.Color(),
    cloudColor: new THREE.Color(),
  };

  let dome;
  let domeMat;
  let sun;
  let moon;
  let stars;
  let clouds;
  let cloudMat;
  let cloudDrift = 0;
  let override = null;

  function spriteTexture(draw) {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    draw(c.getContext("2d"));
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  function cloudTexture() {
    const N = 64;
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const cx = c.getContext("2d");
    const img = cx.createImageData(N, N);
    const r = QY.Noise.rng(0xc10d);
    // Tileable blobs: random discs wrapped around the edges, thresholded into hard pixels.
    const field = new Float32Array(N * N);
    for (let i = 0; i < 70; i++) {
      const px = r() * N;
      const py = r() * N;
      const rad = 2 + r() * 5;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          let dx = Math.abs(x - px);
          let dy = Math.abs(y - py) * 1.6;
          dx = Math.min(dx, N - dx);
          dy = Math.min(dy, N * 1.6 - dy);
          const d = Math.hypot(dx, dy) / rad;
          if (d < 1) field[y * N + x] += 1 - d;
        }
      }
    }
    for (let i = 0; i < N * N; i++) {
      const on = field[i] > 0.55;
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = on ? 255 : 0;
    }
    cx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function init(scene) {
    domeMat = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        ground: { value: new THREE.Color() },
        glow: { value: PALETTE.glow.clone() },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        glowAmount: { value: 0 },
      },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    });
    dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);

    const sunTex = spriteTexture((cx) => {
      cx.fillStyle = "rgba(255, 236, 170, 0.18)";
      cx.fillRect(4, 4, 24, 24);
      cx.fillStyle = "rgba(255, 240, 190, 0.35)";
      cx.fillRect(7, 7, 18, 18);
      cx.fillStyle = "#fff6d8";
      cx.fillRect(10, 10, 12, 12);
      cx.fillStyle = "#ffffff";
      cx.fillRect(12, 12, 8, 8);
    });
    const moonTex = spriteTexture((cx) => {
      cx.fillStyle = "rgba(200, 214, 255, 0.12)";
      cx.fillRect(7, 7, 18, 18);
      cx.fillStyle = "#e4e8f4";
      cx.fillRect(10, 10, 12, 12);
      cx.fillStyle = "#b8bfd2";
      [[12, 12, 3, 2], [17, 14, 2, 3], [13, 18, 2, 2], [18, 19, 2, 1]].forEach(([x, y, w, h]) => cx.fillRect(x, y, w, h));
    });
    const sprite = (tex) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
    sun = sprite(sunTex);
    moon = sprite(moonTex);
    sun.renderOrder = -8;
    moon.renderOrder = -8;
    sun.frustumCulled = false;
    moon.frustumCulled = false;
    scene.add(sun, moon);

    const starPos = [];
    const r = QY.Noise.rng(0x57a5);
    for (let i = 0; i < 900; i++) {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      starPos.push(Math.cos(a) * s * 700, u * 700, Math.sin(a) * s * 700);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    scene.add(stars);

    cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudTexture() },
        offset: { value: new THREE.Vector2() },
        color: { value: new THREE.Color(1, 1, 1) },
        opacity: { value: 0.82 },
        fadeFar: { value: 600 },
      },
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.PlaneGeometry(1600, 1600);
    plane.rotateX(-Math.PI / 2);
    clouds = new THREE.Mesh(plane, cloudMat);
    clouds.position.y = 108;
    clouds.renderOrder = 5;
    clouds.frustumCulled = false;
    scene.add(clouds);
  }

  const tmp = new THREE.Color();

  // time: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight.
  function update(dt, camera, time) {
    state.time = time;
    const angle = time * Math.PI * 2;
    const e = Math.sin(angle);
    state.sunDir.set(Math.cos(angle), e, 0.28).normalize();
    const dayF = smoothstep(-0.2, 0.25, e);
    const dusk = 1 - smoothstep(0, 0.38, Math.abs(e + 0.03));
    state.daylight = 0.2 + 0.8 * smoothstep(-0.18, 0.2, e);
    state.night = 1 - smoothstep(-0.28, 0.04, e);

    state.zenith.copy(PALETTE.nightZenith).lerp(PALETTE.dayZenith, dayF).lerp(PALETTE.duskZenith, dusk * 0.45);
    state.horizon.copy(PALETTE.nightHorizon).lerp(PALETTE.dayHorizon, dayF).lerp(PALETTE.duskHorizon, dusk * 0.42);
    state.skyLight.copy(PALETTE.skyNight).lerp(PALETTE.skyDay, dayF).lerp(PALETTE.skyDusk, dusk * 0.5);
    state.cloudColor.setRGB(0.1, 0.11, 0.16).lerp(tmp.setRGB(1, 1, 1), dayF).lerp(tmp.setRGB(1, 0.78, 0.66), dusk * 0.4);

    const u = domeMat.uniforms;
    u.zenith.value.copy(state.zenith);
    u.horizon.value.copy(state.horizon);
    // Below the horizon the sky matches the fog, so terrain fading out at the view edge is seamless.
    u.ground.value.copy(state.horizon);
    u.sunDir.value.copy(state.sunDir);
    u.glowAmount.value = dusk * 0.85;
    // Underwater the whole sky takes the water colour so distant fog has nothing to show through.
    if (override) {
      u.zenith.value.copy(override);
      u.horizon.value.copy(override);
      u.ground.value.copy(override);
      u.glowAmount.value = 0;
    }

    const p = camera.position;
    dome.position.copy(p);
    stars.position.copy(p);
    stars.rotation.set(0, 0, angle);
    stars.material.opacity = state.night * 0.9;
    stars.visible = state.night > 0.01;

    sun.position.copy(p).addScaledVector(state.sunDir, 520);
    sun.lookAt(p);
    moon.position.copy(p).addScaledVector(state.sunDir, -520);
    moon.lookAt(p);

    cloudDrift += dt * 1.6;
    clouds.position.x = p.x;
    clouds.position.z = p.z;
    cloudMat.uniforms.offset.value.set(cloudDrift, 0);
    cloudMat.uniforms.color.value.copy(state.cloudColor);
  }

  function setCloudFade(far) {
    if (cloudMat) cloudMat.uniforms.fadeFar.value = far;
  }

  function setCloudsVisible(v) {
    if (clouds) clouds.visible = v;
  }

  function setOverride(color) {
    override = color;
  }

  QY.Sky = { init, update, state, setCloudFade, setCloudsVisible, setOverride };
})(window.QY = window.QY || {});
