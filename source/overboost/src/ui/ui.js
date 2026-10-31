// By The_headphones
// DOM menus + HUD. Pure presentation: the App decides what happens on each action.
import { ACTIONS, keyLabel, resetBindings } from '../settings.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const DIFF_HELP = {
  rookie: 'Slow and forgiving. Good for learning to drive.',
  pro: 'Uses boost, flips and jump shots.',
  allstar: 'Fast reactions, accurate shots and aerials.',
};

export class UI {
  constructor({ settings, input, audio, onAction, onSettingsChange }) {
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.onAction = onAction;
    this.onSettingsChange = onSettingsChange;
    this.stack = [];
    this.current = 'loading';
    this.playConfig = { teamSize: 1, difficulty: 'pro', matchSeconds: 300 };
    this.feedItems = [];
    this.tags = new Map();
    this.hudCache = {};
    this.announceTimer = 0;

    this.wireMenus();
    this.wirePlaySetup();
    this.wireSettings();
    this.renderHelp();
    window.addEventListener('keydown', (e) => this.onMenuKey(e));
    const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches;
    $('#touch-note').hidden = !touchOnly;
  }

  // ------------------------------------------------------------ screens

  show(id, { push = false, keepStack = false } = {}) {
    if (push && this.current) this.stack.push(this.current);
    else if (!keepStack) this.stack = [];
    for (const s of $$('.screen')) s.classList.toggle('active', s.id === `screen-${id}`);
    this.current = id;
    const screen = $(`#screen-${id}`);
    if (screen) {
      const first = $('.menu-item, .btn-primary, .back', screen);
      requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    }
    if (id === 'settings') this.syncSettings();
    if (id === 'controls') this.renderHelp();
  }

  back() {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.audio.menuBack();
    this.show(prev, { keepStack: true });
    return true;
  }

  hideScreens() {
    for (const s of $$('.screen')) s.classList.remove('active');
    this.current = null;
    this.stack = [];
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  setLoading(p, text) {
    $('#loadbar-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('#load-status').textContent = text;
  }

  toast(text, ms = 3500) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  setGamepadStatus(on) {
    $('#pad-status').hidden = !on;
  }

  wireMenus() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      this.audio.unlock();
      const action = el.dataset.action;
      if (action === 'back') { this.back(); return; }
      this.audio.menuSelect();
      if (action === 'settings' || action === 'controls' || action === 'credits' || action === 'play') {
        this.show(action, { push: true });
        return;
      }
      this.onAction(action);
    });
    // Hover moves keyboard focus so mouse and keyboard share one highlight.
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.menu-item');
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    });
    document.addEventListener('focusin', (e) => {
      if (e.target.closest?.('.screen.active') && e.target.matches('button, input')) this.audio.menuMove();
    });
  }

  onMenuKey(e) {
    if (!this.current || this.current === 'loading' || this.input.rebindHandler) return;
    const screen = $(`#screen-${this.current}`);
    if (!screen) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      const items = $$('.menu-item, .seg button.on, .btn-primary, .btn-ghost, .back, .tabs button.on', screen).filter((b) => b.offsetParent !== null);
      if (!items.length) return;
      e.preventDefault();
      let i = items.indexOf(document.activeElement);
      i = i < 0 ? 0 : (i + (e.code === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[i].focus();
    } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement?.closest('.seg, .tabs')) {
      const group = document.activeElement.closest('.seg, .tabs');
      const btns = $$('button', group);
      let i = btns.indexOf(document.activeElement);
      i = (i + (e.code === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
      e.preventDefault();
      btns[i].focus();
      btns[i].click();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (this.current === 'main' || this.current === 'results' || this.current === 'training-results') return;
      e.preventDefault();
      if (this.current === 'pause') {
        if (e.code === 'Escape') this.onAction('resume');
        return;
      }
      this.back();
    }
  }

  // ------------------------------------------------------------ play setup

  wirePlaySetup() {
    for (const seg of $$('#screen-play [data-seg]')) {
      const key = seg.dataset.seg;
      const sync = () => {
        for (const b of $$('button', seg)) b.classList.toggle('on', String(this.playConfig[key]) === b.dataset.value);
        $('#mode-help').textContent = this.playConfig.teamSize === 1 ? 'You against one bot.' : 'You and a bot teammate against two bots.';
        $('#diff-help').textContent = DIFF_HELP[this.playConfig.difficulty];
      };
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const v = b.dataset.value;
        this.playConfig[key] = key === 'difficulty' ? v : Number(v);
        sync();
      });
      sync();
    }
  }

  // ------------------------------------------------------------ settings

  wireSettings() {
    const root = $('#screen-settings');
    for (const tab of $$('.tabs button', root)) {
      tab.addEventListener('click', () => {
        for (const t of $$('.tabs button', root)) t.classList.toggle('on', t === tab);
        for (const p of $$('[data-tabpane]', root)) p.hidden = p.dataset.tabpane !== tab.dataset.tab;
      });
    }
    for (const seg of $$('[data-setting-seg]', root)) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.settings[seg.dataset.settingSeg] = b.dataset.value;
        this.syncSettings();
        this.onSettingsChange(seg.dataset.settingSeg);
      });
    }
    for (const input of $$('[data-setting-range]', root)) {
      input.addEventListener('input', () => {
        this.settings[input.dataset.settingRange] = Number(input.value);
        this.syncRange(input);
        this.onSettingsChange(input.dataset.settingRange);
      });
    }
    for (const input of $$('[data-setting-check]', root)) {
      input.addEventListener('change', () => {
        this.settings[input.dataset.settingCheck] = input.checked;
        this.onSettingsChange(input.dataset.settingCheck);
      });
    }
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="reset-binds"]')) {
        e.stopPropagation();
        resetBindings(this.settings);
        this.renderBinds();
        this.onSettingsChange('bindings');
        this.toast('Controls reset to defaults');
      }
    }, true);
  }

  syncRange(input) {
    const min = Number(input.min), max = Number(input.max), v = Number(input.value);
    input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
    const out = input.parentElement.querySelector('output');
    const key = input.dataset.settingRange;
    if (out) {
      out.textContent = key.endsWith('Volume') || key === 'cameraStiffness' ? `${Math.round(v * 100)}`
        : key === 'fov' ? `${v}°` : key === 'mouseSensitivity' ? `${v.toFixed(1)}×` : `${v.toFixed(2)}`;
    }
  }

  syncSettings() {
    const root = $('#screen-settings');
    for (const seg of $$('[data-setting-seg]', root)) {
      for (const b of $$('button', seg)) b.classList.toggle('on', this.settings[seg.dataset.settingSeg] === b.dataset.value);
    }
    for (const input of $$('[data-setting-range]', root)) {
      input.value = this.settings[input.dataset.settingRange];
      this.syncRange(input);
    }
    for (const input of $$('[data-setting-check]', root)) input.checked = !!this.settings[input.dataset.settingCheck];
    this.renderBinds();
  }

  renderBinds() {
    const body = $('#binds tbody');
    body.innerHTML = '';
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = a.label;
      if (a.hint) {
        const s = document.createElement('small');
        s.textContent = a.hint;
        name.appendChild(s);
      }
      tr.appendChild(name);
      for (let slot = 0; slot < 2; slot++) {
        const td = document.createElement('td');
        const b = document.createElement('button');
        const code = this.settings.bindings[a.id][slot];
        b.className = `keycap${code ? '' : ' empty'}`;
        b.textContent = keyLabel(code);
        b.setAttribute('aria-label', `${a.label} ${slot ? 'secondary' : 'primary'} key: ${keyLabel(code)}`);
        b.addEventListener('click', () => this.beginRebind(a.id, slot, b));
        td.appendChild(b);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  beginRebind(action, slot, btn) {
    btn.classList.add('listening');
    btn.textContent = 'Press a key…';
    this.input.rebindHandler = (code) => {
      if (code === 'Escape') { this.renderBinds(); return; }
      const binds = this.settings.bindings;
      if (code === 'Backspace' || code === 'Delete') {
        binds[action][slot] = '';
      } else {
        // A key can only do one thing: take it away from any other action.
        let moved = null;
        for (const a of ACTIONS) {
          const arr = binds[a.id];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] === code && !(a.id === action && i === slot)) { arr[i] = ''; moved = a.label; }
          }
        }
        binds[action][slot] = code;
        if (moved) this.toast(`${keyLabel(code)} moved from “${moved}”`);
      }
      this.renderBinds();
      this.renderHelp();
      this.onSettingsChange('bindings');
    };
  }

  renderHelp() {
    const b = this.settings.bindings;
    const keys = (id) => b[id].filter(Boolean).map((c) => `<kbd>${escapeHtml(keyLabel(c))}</kbd>`).join(' ') || '<kbd>—</kbd>';
    const rows = (list) => list.map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('');
    $('#help-ground').innerHTML = rows([
      [keys('throttle'), 'Accelerate'],
      [keys('reverse'), 'Brake / reverse'],
      [`${keys('steerLeft')} ${keys('steerRight')}`, 'Steer'],
      [keys('jump'), 'Jump (hold for higher)'],
      [keys('boost'), 'Rocket boost'],
      [keys('powerslide'), 'Powerslide'],
    ]);
    $('#help-air').innerHTML = rows([
      [`${keys('throttle')} ${keys('reverse')}`, 'Pitch nose down / up'],
      [`${keys('steerLeft')} ${keys('steerRight')}`, 'Yaw left / right'],
      [`${keys('powerslide')} + steer`, 'Air roll'],
      [`${keys('airRollLeft')} ${keys('airRollRight')}`, 'Air roll left / right'],
      [keys('jump'), 'Double jump, or flip with a direction held'],
      [keys('boost'), 'Boost (works in the air)'],
    ]);
    $('#help-other').innerHTML = rows([
      [keys('ballCam'), 'Toggle ball cam'],
      [keys('reset'), 'Reset car (free play resets the ball too)'],
      ['<kbd>Esc</kbd> <kbd>P</kbd>', 'Pause menu'],
      ['Right mouse', 'Hold and drag to look around'],
    ]);
  }

  // ------------------------------------------------------------ HUD

  showHud(on, mode) {
    $('#hud').hidden = !on;
    if (!on) {
      this.clearAnnounce();
      $('#feed').innerHTML = '';
      this.feedItems = [];
      for (const el of this.tags.values()) el.remove();
      this.tags.clear();
      return;
    }
    this.hudCache = {};
    $('#scorebug').classList.toggle('single', mode === 'freeplay' || mode === 'training');
    $('#hud-tag').hidden = true;
  }

  setText(id, text) {
    if (this.hudCache[id] === text) return;
    this.hudCache[id] = text;
    document.getElementById(id).textContent = text;
  }

  updateHud(d) {
    this.setText('score-blue', String(d.score[0]));
    this.setText('score-orange', String(d.score[1]));
    this.setText('clock', d.clock);
    this.setText('clock-sub', d.clockSub);
    const boost = Math.round(d.boost);
    if (this.hudCache.boost !== boost) {
      this.hudCache.boost = boost;
      document.getElementById('boost-num').textContent = String(boost);
      document.getElementById('boost-arc').style.strokeDasharray = `${(boost / 100) * 235.6} 314.16`;
      document.getElementById('gauge').classList.toggle('full', boost >= 100);
    }
    const kmh = Math.round(d.speed * 3.6);
    if (this.hudCache.kmh !== kmh) {
      this.hudCache.kmh = kmh;
      document.getElementById('speed-num').textContent = String(kmh);
    }
    if (this.hudCache.ss !== d.supersonic) {
      this.hudCache.ss = d.supersonic;
      document.getElementById('speed').classList.toggle('ss', d.supersonic);
    }
    if (this.hudCache.cam !== d.ballCam) {
      this.hudCache.cam = d.ballCam;
      document.getElementById('cam-chip').classList.toggle('on', d.ballCam);
      document.getElementById('cam-chip').textContent = d.ballCam ? 'BALL CAM' : 'CAR CAM';
    }
    this.setText('hud-hint', d.hint || '');
    const fps = document.getElementById('fps');
    fps.hidden = !d.showFps;
    if (d.showFps) this.setText('fps', `${d.fps} FPS`);
  }

  setTag(text) {
    const el = $('#hud-tag');
    el.hidden = !text;
    if (text) el.textContent = text;
  }

  announce(big, small = '', cls = '', ms = 2200) {
    const el = $('#announce');
    el.innerHTML = `<span class="big ${cls}">${escapeHtml(big)}</span>${small ? `<span class="small">${escapeHtml(small)}</span>` : ''}`;
    clearTimeout(this.announceTimer);
    if (ms > 0) this.announceTimer = setTimeout(() => this.clearAnnounce(), ms);
  }

  countdown(n) {
    const el = $('#announce');
    el.innerHTML = `<span class="big count">${n}</span>`;
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => this.clearAnnounce(), 1000);
  }

  clearAnnounce() {
    $('#announce').innerHTML = '';
  }

  feed(text, team = -1) {
    const ul = $('#feed');
    const li = document.createElement('li');
    li.textContent = text;
    if (team >= 0) li.className = `t${team}`;
    ul.appendChild(li);
    this.feedItems.push(li);
    while (this.feedItems.length > 4) this.feedItems.shift().remove();
    setTimeout(() => li.classList.add('out'), 4200);
    setTimeout(() => { li.remove(); this.feedItems = this.feedItems.filter((x) => x !== li); }, 4700);
  }

  /** tags: [{ id, name, team, x, y, visible, scale }] in CSS pixels. */
  updateTags(list) {
    const root = $('#nametags');
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let el = this.tags.get(t.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `nametag t${t.team}`;
        el.innerHTML = `${escapeHtml(t.name)}<i></i>`;
        root.appendChild(el);
        this.tags.set(t.id, el);
      }
      el.style.display = t.visible ? '' : 'none';
      if (t.visible) el.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%) scale(${t.scale.toFixed(2)})`;
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
  }

  // ------------------------------------------------------------ results

  showResults(sim, humanTeam) {
    const won = sim.winner === humanTeam;
    const title = $('#res-title');
    title.textContent = won ? 'Victory' : 'Defeat';
    title.className = `res-title ${won ? 'win' : 'loss'}`;
    $('#res-kicker').textContent = sim.overtime ? 'Full time · Overtime' : 'Full time';
    $('#res-blue').textContent = sim.score[0];
    $('#res-orange').textContent = sim.score[1];
    const pts = (c) => c.stats.goals * 100 + c.stats.saves * 50 + c.stats.shots * 20 + c.stats.touches * 2 + c.stats.demos * 15;
    const cars = sim.cars.slice().sort((a, b) => a.team - b.team || pts(b) - pts(a));
    const winners = sim.cars.filter((c) => c.team === sim.winner);
    const mvp = winners.reduce((best, c) => (!best || pts(c) > pts(best) ? c : best), null);
    const body = $('#res-stats tbody');
    body.innerHTML = '';
    for (const c of cars) {
      const tr = document.createElement('tr');
      tr.className = `t${c.team}${c.isHuman ? ' me' : ''}${c === mvp ? ' mvp' : ''}`;
      const cells = [c.isHuman ? 'You' : c.name, c.stats.goals, c.stats.shots, c.stats.saves, c.stats.touches, c.stats.demos];
      for (const v of cells) {
        const td = document.createElement('td');
        td.textContent = String(v);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    this.show('results');
  }

  showTrainingResults(results, shots) {
    const made = results.filter(Boolean).length;
    $('#tr-title').textContent = `${made} / ${results.length}`;
    const ol = $('#tr-shots');
    ol.innerHTML = '';
    results.forEach((ok, i) => {
      const li = document.createElement('li');
      li.className = ok ? 'ok' : 'miss';
      li.innerHTML = `<span>${escapeHtml(shots[i].name)}</span><b>${ok ? 'GOAL' : 'MISS'}</b>`;
      ol.appendChild(li);
    });
    this.show('training-results');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
