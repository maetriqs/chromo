// Squall: third-person camera rig with collision, ADS zoom, recoil and shake. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const DEG = Math.PI / 180;
  const SHOULDER = 0.62;
  const BACK_HIP = 3.3;
  const BACK_ADS = 1.55;

  let camera;
  let yaw = 0;
  let pitch = -0.1;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let trauma = 0;
  let adsBlend = 0;
  let eyeY = 1.6;
  let initialised = false;
  const pos = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function init(cam) {
    camera = cam;
  }

  function look(dx, dy, adsActive) {
    const s = SQ.Settings.values;
    const sens = 0.0021 * s.sensitivity * (adsActive ? s.adsSensitivity * (camera.fov / s.fov) : 1);
    yaw -= dx * sens;
    pitch -= dy * sens * (s.invertY ? -1 : 1);
    pitch = U.clamp(pitch, -1.35, 1.25);
  }

  function addRecoil(pitchDeg, yawDeg) {
    recoilPitch += pitchDeg * DEG;
    recoilYaw += (Math.random() * 2 - 1) * yawDeg * DEG;
  }

  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function aimYaw() {
    return yaw + recoilYaw;
  }

  function aimPitch() {
    return U.clamp(pitch + recoilPitch, -1.4, 1.35);
  }

  function aimDirection(out) {
    const p = aimPitch();
    const y = aimYaw();
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  // mode: ground | skydive | glide | dead | orbit
  function update(dt, ch, { ads = false, zoom = 1, scoped = false, mode = "ground" } = {}) {
    recoilPitch = U.damp(recoilPitch, 0, 7, dt);
    recoilYaw = U.damp(recoilYaw, 0, 7, dt);
    adsBlend = U.damp(adsBlend, ads ? 1 : 0, 16, dt);
    trauma = Math.max(0, trauma - dt * 1.6);

    const base = SQ.Settings.values.fov;
    let fov = base / U.lerp(1, zoom, adsBlend);
    let back = U.lerp(BACK_HIP, BACK_ADS, adsBlend);
    let shoulder = SHOULDER;
    let up = 0.32;

    if (mode === "skydive" || mode === "glide") {
      back = 6.5;
      shoulder = 0;
      up = 1.4;
      fov = base + (mode === "skydive" ? 8 : 0);
    } else if (mode === "dead") {
      back = 7;
      shoulder = 0;
      up = 2;
    }

    eyeY = U.damp(eyeY, ch.eyeHeight(), 14, dt);
    pivot.set(ch.pos.x, ch.pos.y + eyeY, ch.pos.z);
    const p = aimPitch();
    const y = aimYaw();
    forward.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    const rx = Math.cos(y);
    const rz = -Math.sin(y);

    const firstPerson = scoped && adsBlend > 0.85;
    if (firstPerson) {
      desired.copy(pivot);
    } else {
      desired.copy(pivot).addScaledVector(forward, -back);
      desired.x += rx * shoulder;
      desired.z += rz * shoulder;
      desired.y += up;
      // Pull the camera in front of anything between it and the player's head.
      dir.copy(desired).sub(pivot);
      const dist = dir.length();
      dir.divideScalar(dist || 1);
      const hit = SQ.Physics.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, dist + 0.3);
      if (hit) desired.copy(pivot).addScaledVector(dir, Math.max(0.25, hit.dist - 0.3));
      const minY = SQ.Terrain.height(desired.x, desired.z) + 0.3;
      if (desired.y < minY) desired.y = minY;
    }

    if (!initialised || firstPerson) {
      pos.copy(desired);
      initialised = true;
    } else {
      const want = desired.distanceTo(pivot);
      const have = pos.distanceTo(pivot);
      if (want < have - 0.05) pos.copy(desired);
      else pos.lerp(desired, 1 - Math.exp(-22 * dt));
    }

    const t2 = trauma * trauma;
    camera.position.copy(pos);
    camera.position.x += (Math.random() - 0.5) * t2 * 0.25;
    camera.position.y += (Math.random() - 0.5) * t2 * 0.25;
    camera.rotation.set(p + (Math.random() - 0.5) * t2 * 0.05, y + (Math.random() - 0.5) * t2 * 0.05, (Math.random() - 0.5) * t2 * 0.04, "YXZ");
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = U.damp(camera.fov, fov, 18, dt);
      camera.updateProjectionMatrix();
    }
    ch.model.visible = ch.alive || ch.deathT < 2.5;
    if (ch.isPlayer && ch.alive) ch.model.visible = !firstPerson;
    SQ.Audio.setListener(pos.x, pos.y, pos.z, y);
    return firstPerson;
  }

  // A slow orbit used behind the menus.
  function orbit(dt, t) {
    const r = 170;
    camera.position.set(Math.cos(t * 0.05) * r, 95, Math.sin(t * 0.05) * r);
    camera.lookAt(0, 8, 0);
    if (Math.abs(camera.fov - 55) > 0.01) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
    initialised = false;
  }

  function setAim(newYaw, newPitch) {
    yaw = newYaw;
    pitch = U.clamp(newPitch, -1.35, 1.25);
  }

  function reset(startYaw = 0) {
    yaw = startYaw;
    pitch = -0.35;
    recoilPitch = 0;
    recoilYaw = 0;
    trauma = 0;
    adsBlend = 0;
    initialised = false;
  }

  SQ.CameraRig = {
    init, look, addRecoil, shake, update, orbit, reset, setAim, aimDirection, aimYaw, aimPitch,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get position() {
      return pos;
    },
    get ads() {
      return adsBlend;
    },
  };
})(window.SQ = window.SQ || {});
