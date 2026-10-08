// Quarry: the first-person arm and held block, drawn in their own pass over the world. By The_headphones
(function (QY) {
  let scene;
  let camera;
  let holder;
  let mesh = null;
  let arm;
  let armMat;
  let currentId = -1;
  let swingT = 1;
  let phase = 0;
  let raise = 1;
  let lastSky = -1;
  let lastBlock = -1;
  let baseX = 0.58;
  const SKIN = new THREE.Color(0xc79a74);

  function init(aspect) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, aspect, 0.01, 10);
    holder = new THREE.Group();
    scene.add(holder);
    armMat = new THREE.MeshBasicMaterial({ color: SKIN.clone() });
    // The arm runs from the fist (at the holder) back toward the bottom-right corner and off screen.
    const armGeo = new THREE.BoxGeometry(0.25, 0.25, 1.1);
    armGeo.translate(0, 0, 0.55);
    arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0.02, 0.02, 0);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.36, -0.52, 0.5).normalize());
    // Light the box faces like blocks: top bright, sides darker, so it reads as 3D.
    const shades = [0.72, 0.72, 1, 0.55, 0.86, 0.86];
    const colors = [];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) colors.push(shades[f], shades[f], shades[f]);
    armGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    armMat.vertexColors = true;
  }

  function setItem(id) {
    if (id === currentId) return;
    currentId = id;
    if (mesh) {
      holder.remove(mesh);
      if (mesh !== arm) mesh.geometry.dispose();
    }
    lastSky = -1;
    if (id) {
      mesh = new THREE.Mesh(QY.Mesher.litItem(id, 1, 0), QY.Chunks.materials.hand);
      if (QY.BLOCKS[id].kind === "plant") {
        mesh.scale.setScalar(0.62);
        mesh.rotation.set(0, -0.35, 0);
        mesh.position.set(0, 0.05, 0);
      } else {
        mesh.scale.setScalar(0.3);
        mesh.rotation.set(0.12, Math.PI / 4 + 0.32, 0);
        mesh.position.set(0.04, 0.07, 0.02);
      }
    } else {
      mesh = arm;
    }
    holder.add(mesh);
    raise = 0;
  }

  function swing() {
    if (swingT > 0.6) swingT = 0;
  }

  // speed: horizontal speed for bobbing; sky 0-1 and blockLevel 0-15 light the held item.
  function update(dt, speed, onGround, sky, blockLevel, bobbing) {
    swingT = Math.min(1, swingT + dt / 0.3);
    raise = Math.min(1, raise + dt * 6);
    if (onGround && speed > 0.5) phase += dt * speed * 2.1;
    const k = bobbing ? Math.min(1, speed / 4.3) : 0;
    const bx = Math.sin(phase) * 0.03 * k;
    const by = -Math.abs(Math.cos(phase)) * 0.035 * k;
    const s = Math.sin(swingT * Math.PI);
    const s2 = Math.sin(Math.sqrt(swingT) * Math.PI);
    holder.position.set(baseX + bx - s2 * 0.22, -0.56 + by + s2 * 0.1 - (1 - raise) * 0.5, -0.95 - s * 0.08);
    holder.rotation.set(-s * 0.75, -s2 * 0.35, s * 0.2);

    if (mesh === arm) {
      const b = Math.max(sky * QY.Chunks.uniforms.daylight.value, QY.Mesher.blockBright(blockLevel), 0.06);
      armMat.color.copy(SKIN).multiplyScalar(b);
    } else if (mesh && (Math.abs(sky - lastSky) > 0.01 || blockLevel !== lastBlock)) {
      lastSky = sky;
      lastBlock = blockLevel;
      QY.Mesher.litItem(currentId, sky, blockLevel, mesh.geometry);
    }
  }

  // Drawn on top of the finished frame: keep the colour buffer, clear only depth.
  function render(renderer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = auto;
  }

  // Keep the held item inside the right edge on narrow (portrait) screens.
  function resize(aspect) {
    if (!camera) return;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    baseX = Math.min(0.58, 0.95 * Math.tan((35 * Math.PI) / 180) * aspect * 0.62);
  }

  QY.Hand = { init, setItem, swing, update, render, resize };
})(window.QY = window.QY || {});
