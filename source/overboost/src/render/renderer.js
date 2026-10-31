// By The_headphones
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY_PRESETS = {
  low: { maxDpr: 1, scale: 0.8, shadows: 0, bloom: false, msaa: 0 },
  medium: { maxDpr: 1, scale: 1, shadows: 1024, bloom: true, msaa: 0 },
  high: { maxDpr: 1.5, scale: 1, shadows: 2048, bloom: true, msaa: 4 },
  ultra: { maxDpr: 2, scale: 1, shadows: 4096, bloom: true, msaa: 4 },
};

export class GameRenderer {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1500);
    this.preset = QUALITY_PRESETS.high;
    this.composer = null;
    this.bloom = null;
    this.keyLight = null;
    this.onResize = null;
    this.width = 1;
    this.height = 1;
  }

  setKeyLight(light) {
    this.keyLight = light;
  }

  setQuality(name) {
    const p = QUALITY_PRESETS[name] || QUALITY_PRESETS.high;
    this.preset = p;
    this.qualityName = name;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.maxDpr) * p.scale);
    if (this.keyLight) {
      const L = this.keyLight;
      L.castShadow = p.shadows > 0;
      if (p.shadows > 0 && L.shadow.mapSize.x !== p.shadows) {
        L.shadow.mapSize.set(p.shadows, p.shadows);
        if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
      }
    }
    this.buildComposer();
    this.resize();
  }

  buildComposer() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.bloom?.dispose();
      this.composer = null;
      this.bloom = null;
    }
    if (!this.preset.bloom) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType, samples: this.preset.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.42, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.onResize?.();
  }

  get drawingHeight() {
    return this.height * this.renderer.getPixelRatio();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
