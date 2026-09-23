// Shared Three.js setup for the 3D games. By The_headphones

const Kit = (() => {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(`--${name}`).trim();

  function color(name) {
    return new THREE.Color(token(name));
  }

  function fail(stageEl, message) {
    const note = document.createElement("div");
    note.className = "stage-overlay";
    note.innerHTML = "<h2>No 3D</h2><p></p>";
    note.querySelector("p").textContent = message;
    stageEl.querySelectorAll(".stage-overlay").forEach((el) => { el.hidden = true; });
    stageEl.appendChild(note);
  }

  // Returns null (and explains why on the stage) when 3D can't run here.
  function createStage(stageEl, camera) {
    if (!window.THREE) {
      fail(stageEl, "The 3D engine didn't load. Reload the page to try again.");
      return null;
    }
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      fail(stageEl, "This browser can't show 3D graphics. WebGL is turned off or not supported.");
      return null;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stageEl.prepend(renderer.domElement);

    const scene = new THREE.Scene();

    function resize() {
      const w = stageEl.clientWidth;
      const h = stageEl.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
      } else {
        const f = camera.userData.frustum;
        camera.left = (-f * aspect) / 2;
        camera.right = (f * aspect) / 2;
        camera.top = f / 2;
        camera.bottom = -f / 2;
      }
      camera.updateProjectionMatrix();
    }

    new ResizeObserver(resize).observe(stageEl);
    resize();
    return { renderer, scene, camera };
  }

  function addLights(scene, shadowSize) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b5, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(6, 12, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = shadowSize;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 60 });
    sun.shadow.bias = -0.0015;
    scene.add(sun);
    scene.add(sun.target);
    return sun;
  }

  function box(w, h, d, colorValue) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: colorValue }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function dispose(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    if (object.parent) object.parent.remove(object);
  }

  function loop(tick) {
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(dt, now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function readNumber(key, fallback = 0) {
    try {
      return Number(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function writeNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Storage unavailable; the value lasts for this visit only.
    }
  }

  function overlay(stageEl) {
    const el = stageEl.querySelector(".stage-overlay");
    const title = el.querySelector("h2");
    const text = el.querySelector("p");
    return {
      show(heading, detail) {
        title.textContent = heading;
        text.textContent = detail;
        el.hidden = false;
      },
      hide() {
        el.hidden = true;
      },
    };
  }

  return { token, color, createStage, addLights, box, dispose, loop, readNumber, writeNumber, overlay };
})();
