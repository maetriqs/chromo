// By The_headphones
import './styles.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import * as THREE from 'three';
import { FIXED_DT, TEAM_BLUE } from './game/constants.js';
import { Simulation } from './game/simulation.js';
import { TRAINING_SHOTS } from './game/training.js';
import { GameRenderer } from './render/renderer.js';
import { World } from './render/world.js';
import { Input } from './input.js';
import { keyLabel, loadSettings, saveSettings } from './settings.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();

function fmtClock(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

class App {
  constructor() {
    this.settings = loadSettings();
    this.input = new Input(this.settings);
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.masterVolume, this.settings.musicVolume, this.settings.sfxVolume);
    this.ui = new UI({
      settings: this.settings,
      input: this.input,
      audio: this.audio,
      onAction: (a) => this.onAction(a),
      onSettingsChange: (k) => this.onSettingsChange(k),
    });
    this.input.onGamepadChange = (on) => this.ui.setGamepadStatus(on);
    this.sim = null;
    this.mode = 'boot'; // boot | menu | match | paused
    this.matchConfig = null;
    this.acc = 0;
    this.last = performance.now();
    this.ballCam = this.settings.ballCamDefault;
    this.fps = 60;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.perf = { frames: 0, time: 0, done: !!this.settings.autoQualityDone };
    this.pendingResults = null;
    this.time = 0;
    this.matchTime = 0;

    // Unlock audio on the first interaction anywhere.
    const unlock = () => {
      this.audio.unlock();
      if (this.mode === 'menu') this.audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Guard against Ctrl+W / accidental navigation mid-match.
    window.addEventListener('beforeunload', (e) => {
      if (this.mode === 'match' || this.mode === 'paused') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match') this.pause();
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement && navigator.keyboard?.lock) navigator.keyboard.lock().catch(() => {});
      else navigator.keyboard?.unlock?.();
    });
  }

  async boot() {
    try {
      this.ui.setLoading(0.05, 'Loading fonts');
      await Promise.race([
        Promise.all([
          document.fonts.load('italic 800 40px "Barlow Condensed"'),
          document.fonts.load('600 20px "Barlow Condensed"'),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ]).catch(() => {});

      this.ui.setLoading(0.15, 'Building the arena');
      await nextFrame();
      const canvas = document.getElementById('view');
      if (!canvasSupportsWebGL2()) throw new Error('WebGL2 is not available in this browser.');
      this.gfx = new GameRenderer(canvas);
      this.world = new World(this.gfx, this.settings.quality);
      this.gfx.onResize = () => this.world?.updateViewport();
      window.addEventListener('resize', () => this.gfx.resize());
      this.input.attachMouse(canvas);
      this.applyCameraSettings();

      this.ui.setLoading(0.45, 'Loading physics engine');
      await nextFrame();
      const mod = await import('@dimforge/rapier3d-compat');
      this.RAPIER = mod.default ?? mod;
      await this.RAPIER.init();

      this.ui.setLoading(0.9, 'Warming up');
      await nextFrame();
      this.startMenu();
      // Compile shaders for everything visible before the first real frame.
      this.gfx.renderer.compile(this.gfx.scene, this.gfx.camera);
      this.ui.setLoading(1, 'Ready');
      this.ui.setGamepadStatus(this.input.anyGamepad());
      requestAnimationFrame((t) => this.frame(t));
    } catch (err) {
      console.error(err);
      this.ui.setLoading(1, `Could not start: ${err.message || err}`);
    }
  }

  // ------------------------------------------------------------ modes

  disposeSim() {
    if (!this.sim) return;
    this.world.unbind();
    this.audio.releaseVoices();
    this.sim.dispose();
    this.sim = null;
  }

  startMenu() {
    this.disposeSim();
    this.sim = new Simulation(this.RAPIER, { mode: 'exhibition', matchSeconds: Infinity });
    this.world.bind(this.sim);
    this.mode = 'menu';
    this.input.captureGameKeys = false;
    document.body.classList.remove('playing');
    this.ui.showHud(false);
    this.ui.show('main');
    this.audio.setMusicDuck(1);
    if (this.audio.ready) this.audio.startMusic();
    this.acc = 0;
  }

  startMatch(config) {
    this.disposeSim();
    this.matchConfig = { ...config };
    this.sim = new Simulation(this.RAPIER, config);
    this.world.bind(this.sim);
    this.mode = 'match';
    this.pendingResults = null;
    this.ballCam = this.settings.ballCamDefault;
    this.input.captureGameKeys = true;
    this.input.clear();
    document.body.classList.add('playing');
    this.ui.hideScreens();
    this.ui.showHud(true, config.mode);
    this.ui.setTag(config.mode === 'freeplay' ? 'Free play · unlimited boost' : '');
    this.audio.setMusicDuck(config.mode === 'match' ? 0.35 : 0.5);
    this.acc = 0;
    this.matchTime = 0;
    this.drainEvents();
  }

  pause() {
    if (this.mode !== 'match') return;
    this.mode = 'paused';
    this.input.captureGameKeys = false;
    document.body.classList.remove('playing');
    const c = this.matchConfig;
    const labels = { freeplay: 'Free play', training: 'Training', match: `${c.teamSize}v${c.teamSize} · ${({ rookie: 'Rookie', pro: 'Pro', allstar: 'All-Star' })[c.difficulty]}` };
    document.getElementById('pause-info').textContent = labels[c.mode] || '';
    this.ui.show('pause');
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'match';
    this.input.captureGameKeys = true;
    this.input.clear();
    document.body.classList.add('playing');
    this.ui.hideScreens();
    this.last = performance.now();
  }

  onAction(a) {
    switch (a) {
      case 'start':
        this.startMatch({ mode: 'match', ...this.ui.playConfig });
        break;
      case 'freeplay':
        this.startMatch({ mode: 'freeplay', matchSeconds: Infinity });
        break;
      case 'training':
        this.startMatch({ mode: 'training', matchSeconds: Infinity });
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        if (this.matchConfig) this.startMatch(this.matchConfig);
        break;
      case 'quit':
        this.startMenu();
        break;
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen?.().catch(() => this.ui.toast('Fullscreen was blocked by the browser'));
        break;
      default:
        break;
    }
  }

  onSettingsChange(key) {
    const s = this.settings;
    if (key === 'quality') this.world.setQuality(s.quality);
    if (key.endsWith('Volume')) this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    if (key.startsWith('camera') || key === 'fov') this.applyCameraSettings();
    if (key === 'ballCamDefault') this.ballCam = s.ballCamDefault;
    saveSettings(s);
  }

  applyCameraSettings() {
    if (!this.world) return;
    this.world.rig.applySettings(this.settings);
    this.world.updateViewport();
  }

  // ------------------------------------------------------------ loop

  handleActions() {
    const nav = this.input.takeMenuNav();
    if (this.mode !== 'match' && this.ui.current && this.ui.current !== 'loading') {
      for (const n of nav) {
        this.audio.unlock();
        if (n === 'select') document.activeElement?.closest?.('.screen.active') && document.activeElement.click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { code: n, key: n, bubbles: true }));
      }
    }
    for (const a of this.input.takeActions()) {
      if (a === 'pause') {
        // Keyboard Esc only arrives here while driving; gamepad Start can also resume.
        if (this.mode === 'match') this.pause();
        else if (this.mode === 'paused' && this.ui.current === 'pause') this.resume();
        continue;
      }
      if (this.mode !== 'match') continue;
      if (a === 'ballCam') this.ballCam = !this.ballCam;
      if (a === 'reset') this.sim?.requestReset();
    }
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (this.mode === 'match') this.matchTime += dt;
    this.input.pollGamepad();
    this.handleActions();

    const running = this.sim && (this.mode === 'match' || this.mode === 'menu');
    if (running) {
      this.acc += dt;
      let steps = 0;
      const human = this.sim.human;
      while (this.acc >= FIXED_DT && steps < 8) {
        if (human && this.mode === 'match') this.input.fillCarInput(human.input);
        this.sim.step();
        this.acc -= FIXED_DT;
        steps++;
        this.drainEvents();
      }
      if (steps >= 8) this.acc = 0;
    }
    const alpha = running ? this.acc / FIXED_DT : 1;
    this.world.update(running ? dt : 0, alpha);
    this.updateCamera(running ? dt : 0);
    if (this.sim && (this.mode === 'match' || this.mode === 'paused')) this.updateHud();
    this.updateAudio(dt);
    this.world.render();
    this.trackPerformance(dt);

    if (this.pendingResults && this.time >= this.pendingResults.at) {
      const r = this.pendingResults;
      this.pendingResults = null;
      this.mode = 'paused';
      this.input.captureGameKeys = false;
      document.body.classList.remove('playing');
      this.ui.showHud(false);
      if (r.type === 'match') this.ui.showResults(this.sim, TEAM_BLUE);
      else this.ui.showTrainingResults(r.results, TRAINING_SHOTS);
    }
  }

  updateCamera(dt) {
    const w = this.world, sim = this.sim;
    // Always drain mouse-look deltas so they can't pile up while not driving.
    const [dx, dy] = this.input.takeLook();
    if (!sim) return;
    const rig = w.rig;
    if (this.mode === 'menu') {
      rig.spectate(dt, w.ballView.pos, this.time);
      return;
    }
    const car = sim.human;
    const view = w.viewOf(car);
    if (!car || !view) return;
    if (car.demolished) {
      rig.spectate(dt, w.ballView.pos, this.time);
      return;
    }
    const sens = this.settings.mouseSensitivity;
    if (this.input.lookActive && dt > 0) rig.addFreeLook(dx * 0.004 * sens, dy * 0.003 * sens);
    document.body.classList.toggle('looking', this.input.freeLook);
    rig.ballCam = this.ballCam;
    if (dt > 0) rig.follow(dt, car, view.pos, view.quat, sim.ball, w.ballView.pos);
  }

  /** First bound key for an action, as shown to the player. */
  key(action) {
    return keyLabel(this.settings.bindings[action].find(Boolean) || '');
  }

  updateHud() {
    const sim = this.sim, car = sim.human, cfg = this.matchConfig;
    const k = (a) => this.key(a);
    let clock = '', sub = '', hint = '';
    if (cfg.mode === 'match') {
      if (sim.overtime) { clock = `+${fmtClock(sim.overtimeElapsed)}`; sub = 'OVERTIME'; }
      else { clock = fmtClock(sim.timeLeft); sub = sim.timeLeft <= 0 && sim.state === 'playing' ? 'BALL ON GROUND' : ''; }
    } else if (cfg.mode === 'freeplay') {
      clock = 'FREE PLAY';
      sub = sim.freeplayGoals ? `${sim.freeplayGoals} GOAL${sim.freeplayGoals > 1 ? 'S' : ''}` : '';
      hint = `${k('reset')} reset car + ball · ${k('ballCam')} ball cam · Esc menu`;
    } else if (cfg.mode === 'training') {
      const t = sim.training;
      clock = fmtClock(t.timer);
      sub = `SHOT ${Math.min(t.index + 1, t.total)} / ${t.total}`;
      hint = `Score in the orange goal · ${k('reset')} reset car`;
    }
    if (this.matchTime < 12 && cfg.mode === 'match') {
      hint = `${k('throttle')}/${k('reverse')} drive · ${k('jump')} jump · ${k('boost')} boost · ${k('ballCam')} ball cam · Esc pause`;
    }
    this.ui.updateHud({
      score: sim.score, clock, clockSub: sub, boost: car.boost, speed: car.demolished ? 0 : car.speed,
      supersonic: car.supersonic, ballCam: this.ballCam, hint, showFps: this.settings.showFps, fps: Math.round(this.fps),
    });

    // Name tags above the other cars
    const cam = this.gfx.camera;
    const W = this.gfx.width, H = this.gfx.height;
    const tags = [];
    for (const v of this.world.carViews) {
      const c = v.car;
      if (c === car) continue;
      _v.copy(v.pos).add(_right.set(0, 0.95, 0));
      const dist = _v.distanceTo(cam.position);
      _v.project(cam);
      const visible = !c.demolished && _v.z < 1 && _v.z > -1 && dist < 110;
      tags.push({
        id: c.id, name: c.name, team: c.team, visible,
        x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, scale: Math.max(0.6, Math.min(1.1, 14 / dist)),
      });
    }
    this.ui.updateTags(tags);
  }

  updateAudio(dt) {
    const a = this.audio;
    if (!a.ready) return;
    const sim = this.sim;
    const cam = this.gfx.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    if (sim) {
      const inMenu = this.mode === 'menu';
      const paused = this.mode === 'paused';
      for (const c of sim.cars) {
        const d = c.position.distanceTo(cam.position);
        _v.copy(c.position).sub(cam.position).normalize();
        a.updateVoice(c.id, {
          speed: c.speed, throttle: c.input.throttle, boosting: c.boosting, supersonic: c.supersonic,
          distance: d, pan: _v.dot(_right), player: c === sim.human,
          muted: inMenu || paused || c.demolished,
        });
      }
      a.setCrowd(inMenu ? 0.5 : paused ? 0.3 : 1);
    }
    a.update(dt);
  }

  panOf(pos) {
    const cam = this.gfx.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _v.copy(pos).sub(cam.position);
    const d = _v.length();
    return [d > 0.01 ? _v.normalize().dot(_right) : 0, d];
  }

  drainEvents() {
    const sim = this.sim;
    if (!sim) return;
    const inMatch = this.mode === 'match';
    const human = sim.human;
    for (const e of sim.events) {
      this.world.handleEvent(e);
      if (!inMatch) {
        if (e.type === 'goal' && this.mode === 'menu') this.audio.cheer(0.5);
        continue;
      }
      this.onMatchEvent(e, human);
    }
    sim.events.length = 0;
  }

  onMatchEvent(e, human) {
    const a = this.audio, ui = this.ui;
    switch (e.type) {
      case 'countdown':
        a.countdown(e.value);
        ui.countdown(e.value);
        break;
      case 'go':
        a.go();
        ui.announce('Go!', '', '', 700);
        break;
      case 'goal': {
        const mine = e.team === human.team;
        a.goal(mine);
        if (this.matchConfig.mode === 'match') {
          const who = e.own ? 'Own goal' : e.scorer ? (e.scorer === human ? 'You scored' : `${e.scorer.name} scored`) : '';
          ui.announce('Goal!', `${who}${who ? ' · ' : ''}${Math.round(e.speedKmh)} km/h`, e.team === 0 ? 'blue' : 'orange', 2800);
          ui.feed(`${e.own ? 'Own goal' : (e.scorer?.isHuman ? 'You' : e.scorer?.name || 'Goal')} · ${Math.round(e.speedKmh)} km/h`, e.team);
        } else if (this.matchConfig.mode === 'freeplay') {
          ui.announce('Goal!', `${Math.round(e.speedKmh)} km/h`, e.team === 0 ? 'blue' : 'orange', 1800);
        }
        break;
      }
      case 'hit': {
        const [pan, d] = this.panOf(e.position);
        a.hit(e.strength, pan, d);
        break;
      }
      case 'bounce': {
        const [pan, d] = this.panOf(e.position);
        a.bounce(e.strength, pan, d);
        break;
      }
      case 'jump':
        if (e.car === human) a.jump(e.double);
        break;
      case 'dodge':
        if (e.car === human) a.dodge();
        break;
      case 'land':
        if (e.car === human) a.land(0.8);
        break;
      case 'pickup':
        if (e.car === human) a.pickup(e.big);
        break;
      case 'bump': {
        const [pan] = this.panOf(e.b.position);
        a.bump(e.strength, pan);
        break;
      }
      case 'demolish': {
        const [pan] = this.panOf(e.position);
        a.demolish(pan);
        ui.feed(`${e.attacker.isHuman ? 'You' : e.attacker.name} demolished ${e.victim.isHuman ? 'you' : e.victim.name}`, e.attacker.team);
        if (e.victim === human) ui.announce('Demolished', 'Respawning in 3', '', 2000);
        break;
      }
      case 'respawn':
        if (e.car === human) this.world.rig.reset();
        break;
      case 'save':
        ui.feed(`${e.car.isHuman ? 'You' : e.car.name} · save`, e.car.team);
        break;
      case 'timeUp':
        a.buzzer();
        break;
      case 'overtime':
        ui.announce('Overtime', 'Next goal wins', '', 2400);
        break;
      case 'matchEnd': {
        a.buzzer();
        const won = e.winner === human.team;
        ui.announce(won ? 'Victory' : 'Defeat', `${e.score[0]} – ${e.score[1]}`, won ? 'orange' : '', 0);
        this.pendingResults = { type: 'match', at: this.time + 2.6 };
        break;
      }
      case 'trainingShot':
        ui.setTag(`Shot ${e.index + 1} of ${e.total} · ${e.name}`);
        break;
      case 'trainingResult':
        if (e.success) { a.success(); ui.announce('Nice shot', '', 'orange', 1400); }
        else { a.fail(); ui.announce('Missed', '', '', 1200); }
        break;
      case 'trainingEnd':
        this.pendingResults = { type: 'training', at: this.time + 1.0, results: e.results };
        break;
      default:
        break;
    }
  }

  trackPerformance(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    // First run only: if the default preset is clearly too heavy, step it down once.
    const p = this.perf;
    if (p.done || this.mode !== 'menu') return;
    // Background tabs and hitches would read as a slow GPU: restart the sample.
    if (document.hidden || dt >= 0.1) { p.frames = 0; p.time = 0; return; }
    p.frames++;
    p.time += dt;
    if (p.time < 1.5) { p.frames = 0; return; }
    if (p.time >= 6.5) {
      const fps = p.frames / (p.time - 1.5);
      p.done = true;
      this.settings.autoQualityDone = true;
      const order = ['low', 'medium', 'high', 'ultra'];
      let idx = order.indexOf(this.settings.quality);
      if (fps < 26) idx = 0;
      else if (fps < 42) idx = Math.max(0, idx - 1);
      if (order[idx] !== this.settings.quality) {
        this.settings.quality = order[idx];
        this.world.setQuality(this.settings.quality);
        this.ui.toast(`Graphics set to ${order[idx][0].toUpperCase() + order[idx].slice(1)} for smoother play. You can change this in Settings.`, 5000);
      }
      saveSettings(this.settings);
    }
  }
}

function canvasSupportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const app = new App();
window.__overboost = app;
app.boot();
