// Squall: boot sequence with a real loading screen. By The_headphones
(function (SQ) {
  const G = SQ.Game;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 16));

  const steps = [
    ["Raising Kestrel Isle", () => SQ.Terrain.build(G.scene)],
    ["Building Millbrook and Rustworks", () => SQ.World.build(G.scene)],
    ["Hiding loot and stacking crates", () => {
      SQ.Effects.init(G.scene, G.camera, document.getElementById("dmg-layer"));
      SQ.Loot.init(G.scene);
      SQ.Building.init(G.scene);
      SQ.Storm.init(G.scene);
      SQ.Storm.reset();
    }],
    ["Drawing the map", () => {
      G.player = SQ.Player.create();
      G.characters = [G.player];
      SQ.CameraRig.init(G.camera);
      SQ.Input.setTarget(document.getElementById("stage"));
      SQ.HUD.init();
      SQ.Menus.init();
    }],
    ["Waking the bots", () => {
      SQ.CameraRig.orbit(0, 0);
      G.renderer.compile(G.scene, G.camera);
    }],
  ];

  async function boot() {
    try {
      G.createRenderer(document.getElementById("stage"));
    } catch (err) {
      SQ.Menus.setLoading(0, "Squall needs WebGL, which this browser has turned off or doesn't support.");
      return;
    }
    G.start();
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      SQ.Menus.setLoading(i / steps.length, label);
      await wait();
      try {
        fn();
      } catch (err) {
        SQ.Menus.setLoading(i / steps.length, `Couldn't finish "${label}": ${err.message}`);
        throw err;
      }
    }
    SQ.Menus.setLoading(1, "Ready");
    await wait();
    G.state = "menu";
    SQ.Menus.show("menu");
  }

  if (!window.THREE) {
    document.getElementById("loading-step").textContent = "The 3D engine didn't load. Reload the page to try again.";
  } else {
    boot();
  }
})(window.SQ = window.SQ || {});
