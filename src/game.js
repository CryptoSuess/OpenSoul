// game.js — the conductor. Owns the world, the per-era entity layers, the
// ghost, the loop and the state machine (title / playing / paused / won).

import { ERAS, GHOST, MEMORY_LINES, ENDING_LINES, ANCHORS_TO_WIN, TILE } from './constants.js';
import { World } from './world.js';
import { Ghost } from './player.js';
import { Renderer } from './renderer.js';
import { Particles } from './particles.js';
import { Audio } from './audio.js';
import { UI, Overlay, titleHTML, pauseHTML, winHTML } from './ui.js';
import {
  buildEraLayer, buildFragments, updateSpirits, hexToRgb,
} from './entities.js';
import { initInput, consumePressed, isDown } from './input.js';

const STATE = { TITLE: 0, PLAY: 1, PAUSE: 2, ENDING: 4, WIN: 3 };

export class Game {
  constructor(canvas, uiRoot, overlayEl) {
    this.renderer = new Renderer(canvas);
    this.particles = new Particles(1400);
    this.audio = new Audio();
    this.ui = new UI(uiRoot);
    this.overlay = new Overlay(overlayEl);
    this.state = STATE.TITLE;
    this.time = 0;
    this.shiftFx = 0;
    this.endingFx = 0;
    this.lore = [];
    initInput(window);
    this._reset();
    this._showTitle();
    this._bindOverlayClicks(overlayEl);
  }

  _reset() {
    this.world = new World();
    // You wake in The Long Quiet (the ruins). Look it up by id so the start
    // survives any reordering of the eras.
    this.eraIndex = Math.max(0, ERAS.findIndex((e) => e.id === 'ruin'));
    this.layers = ERAS.map((_, i) => buildEraLayer(this.world, i));
    this.fragments = buildFragments(this.world);
    const sp = this.world.findSpawn();
    this.ghost = new Ghost(sp.x, sp.y);
    this.lore = [];
    this.endingFx = 0;
    this._ending = null;
    this.mapOpen = false;
    this.audio.setEra(this.eraIndex);
    this.ui.setEra(this.eraIndex);
    this.ui.update(0, this.ghost);
  }

  get layer() {
    return this.layers[this.eraIndex];
  }
  get era() {
    return ERAS[this.eraIndex];
  }
  get accentRgb() {
    return hexToRgb(this.era.accent);
  }

  // ---- state transitions --------------------------------------------------

  _showTitle() {
    this.state = STATE.TITLE;
    this.ui.setHidden(true);
    this.overlay.show(titleHTML());
  }

  start() {
    this.audio.resume();
    this.overlay.hide();
    this.ui.setHidden(false);
    this.state = STATE.PLAY;
    this.ui.toastMsg('You wake in ' + this.era.name);
    this.ui.showNarrative('You do not remember dying. You remember… almost everything else is gone.');
  }

  pause() {
    if (this.state !== STATE.PLAY) return;
    this.state = STATE.PAUSE;
    this.overlay.show(pauseHTML());
  }
  resume() {
    if (this.state !== STATE.PAUSE) return;
    this.overlay.hide();
    this.state = STATE.PLAY;
  }

  // Begin the cinematic ending: build the script of lines to play (the memories
  // you actually reclaimed, then the resolution beats), then let update() drive
  // it. The ghost ascends, the world floods with warm light, and it resolves on
  // the "AT REST" panel.
  _beginEnding() {
    if (this.state === STATE.ENDING || this.state === STATE.WIN) return;
    this.state = STATE.ENDING;
    this.ui.setHidden(true);
    this.audio.ending();
    const lines = [...this.lore, ...ENDING_LINES];
    this._ending = {
      t: 0,
      lines,
      idx: -1,
      lineEvery: 2.7,    // seconds per line
      startDelay: 1.2,   // let the light begin before the first line
      done: false,
    };
  }

  // Per-frame ending logic (called from update while state === ENDING).
  _updateEnding(dt) {
    const e = this._ending;
    if (!e) return;
    e.t += dt;

    // warm light swells in over ~3.5s
    this.endingFx = Math.min(1, this.endingFx + dt / 3.5);

    // the ghost drifts upward, shedding light
    this.ghost.vy -= 60 * dt;
    this.ghost.x += this.ghost.vx * dt;
    this.ghost.y += this.ghost.vy * dt;
    this.ghost.vx *= 1 - 0.8 * dt;
    if (Math.random() < 0.6) {
      this.particles.spawn(
        this.ghost.x + (Math.random() - 0.5) * 24,
        this.ghost.y + (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 20, -40 - Math.random() * 40,
        1.4, 3.5, [255, 244, 210]
      );
    }

    // reveal the script one line at a time
    const due = Math.floor((e.t - e.startDelay) / e.lineEvery);
    if (due > e.idx && e.idx < e.lines.length - 1) {
      e.idx = Math.min(due, e.lines.length - 1);
      this.ui.showEndingLine(e.lines[e.idx]);
    }

    // once the last line has had its moment, fade to the AT REST panel
    const finishAt = e.startDelay + e.lines.length * e.lineEvery + 1.4;
    if (!e.done && e.t >= finishAt) {
      e.done = true;
      this.win();
    }
  }

  win() {
    this.state = STATE.WIN;
    this.endingFx = 1;
    this.audio.win();
    this.ui.setHidden(true);
    this.ui.hideEndingLine();
    this.overlay.show(winHTML(this.ghost.fragments, ENDING_LINES));
  }

  _bindOverlayClicks(el) {
    el.addEventListener('click', (e) => {
      if (e.target.id === 'start-btn') this.start();
      else if (e.target.id === 'resume-btn') this.resume();
      else if (e.target.id === 'restart-btn') { this._reset(); this.start(); }
    });
  }

  // ---- timeline shifting --------------------------------------------------

  shiftEra(dir) {
    const ni = this.eraIndex + dir;
    if (ni < 0 || ni >= ERAS.length) {
      this.ui.toastMsg(dir < 0 ? 'There is nothing before the Dawn.' : 'Time has not yet written what comes next.');
      return;
    }
    if (!this.ghost.canShift()) {
      this.ui.toastMsg('Not enough soul to bend time. Find a wisp.');
      return;
    }
    // If the destination tile is solid for the ghost and we'd be stuck, allow
    // it anyway — phasing-on-arrival nudge.
    this.ghost.spendShift();
    this.eraIndex = ni;
    this.shiftFx = 1;
    this.renderer.addShake(6);
    this.audio.shift();
    this.audio.setEra(this.eraIndex);
    this.ui.setEra(this.eraIndex);
    this.particles.burst(this.ghost.x, this.ghost.y, 28, [200, 225, 255], { speed: 160, life: 0.9, size: 3 });
    // nudge ghost out of any solid it now sits inside
    this._unstick();
  }

  _unstick() {
    if (!this.world.isSolidPx(this.ghost.x, this.ghost.y)) return;
    for (let r = TILE; r < TILE * 8; r += TILE) {
      for (let a = 0; a < 8; a++) {
        const nx = this.ghost.x + Math.cos((a / 8) * 6.28) * r;
        const ny = this.ghost.y + Math.sin((a / 8) * 6.28) * r;
        if (!this.world.isSolidPx(nx, ny)) {
          this.ghost.x = nx; this.ghost.y = ny;
          return;
        }
      }
    }
  }

  // ---- interaction --------------------------------------------------------

  haunt() {
    const g = this.ghost;
    let did = false;
    // scare nearby villagers / spirits
    for (const sp of this.layer.spirits) {
      const d = Math.hypot(sp.x - g.x, sp.y - g.y);
      if (d < GHOST.hauntRadius) {
        if (sp.villager) { sp.scared = 2.5; did = true; }
        else { sp.scared = 1.2; did = true; }
      }
    }
    // try to charge the era's anchor if standing on it
    const a = this.layer.anchor;
    if (a && !a.active) {
      const d = Math.hypot(a.x - g.x, a.y - g.y);
      if (d < GHOST.hauntRadius + 10) {
        this._chargeAnchor(a);
        did = true;
      }
    }
    if (did) {
      this.audio.haunt();
      this.particles.burst(g.x, g.y, 16, [180, 210, 255], { speed: 130, life: 0.6 });
      this.renderer.addShake(3);
    } else {
      this.ui.toastMsg('Nothing here answers your haunting.');
    }
  }

  _chargeAnchor(a) {
    // Requires having collected at least one fragment from THIS era to awaken.
    const eraFragsCollected = this.fragments.some(f => f.era === this.eraIndex && f.collected);
    if (!eraFragsCollected) {
      this.ui.toastMsg('This Anchor needs a memory from this age first. (✦)');
      return;
    }
    a.charge += 0.34;
    if (a.charge >= 1) {
      a.active = true;
      a.charge = 1;
      this.ghost.anchors++;
      this.audio.anchor();
      this.renderer.addShake(10);
      this.particles.burst(a.x, a.y, 50, [255, 240, 190], { speed: 220, life: 1.3, size: 4 });
      this.ui.markAnchor(this.eraIndex);
      this.ui.toastMsg('Anchor awakened in ' + this.era.name + '  ◆');
      this.ui.showNarrative('A piece of you settles into place, like a held breath finally let go.');
      if (this.ghost.anchors >= ANCHORS_TO_WIN) {
        setTimeout(() => this._beginEnding(), 1600);
      }
    } else {
      this.ui.toastMsg('The Anchor stirs… (haunt again)');
    }
  }

  // ---- per-frame ----------------------------------------------------------

  _collisions() {
    const g = this.ghost;
    // wisps
    for (const w of this.layer.wisps) {
      if (w.gone) continue;
      const d = Math.hypot(w.x - g.x, w.y - g.y);
      if (d < 22) {
        w.gone = true;
        g.energy = Math.min(GHOST.maxEnergy, g.energy + 18);
        this.audio.pickup();
        this.particles.burst(w.x, w.y, 12, this.accentRgb, { speed: 110, life: 0.6 });
      }
    }
    // fragments (only this era's)
    for (const f of this.fragments) {
      if (f.collected || f.era !== this.eraIndex) continue;
      const d = Math.hypot(f.x - g.x, f.y - g.y);
      if (d < 24) {
        f.collected = true;
        g.fragments++;
        this.audio.fragment();
        this.renderer.addShake(4);
        this.particles.burst(f.x, f.y, 30, [255, 245, 200], { speed: 150, life: 1.1, size: 3.5 });
        const line = MEMORY_LINES[Math.min(this.lore.length, MEMORY_LINES.length - 1)];
        this.lore.push(line);
        this.ui.showNarrative(line);
        this.ui.toastMsg('Memory fragment reclaimed ✦');
      }
    }
    // hostile wraith contact drains soul
    if (this.era.corrupt) {
      for (const sp of this.layer.spirits) {
        if (!sp.hostile || sp.scared > 0) continue;
        const d = Math.hypot(sp.x - g.x, sp.y - g.y);
        if (d < 20) {
          g.energy = Math.max(0, g.energy - 26 * (1 / 60));
        }
      }
    }
  }

  update(dt) {
    this.time += dt;
    if (this.shiftFx > 0) this.shiftFx = Math.max(0, this.shiftFx - dt * 1.6);

    // global hotkeys
    if (consumePressed('pause')) {
      if (this.state === STATE.PLAY) this.pause();
      else if (this.state === STATE.PAUSE) this.resume();
    }
    if (consumePressed('confirm')) {
      if (this.state === STATE.TITLE) this.start();
      else if (this.state === STATE.ENDING) this.win(); // skip to the panel
      else if (this.state === STATE.WIN) { this._reset(); this.start(); }
    }

    // The ending cutscene drives itself; a tap/space/haunt skips to the panel.
    if (this.state === STATE.ENDING) {
      if (consumePressed('haunt')) { this.win(); }
      else this._updateEnding(dt);
      this.particles.update(dt);
      this.renderer.centerOn(this.ghost.x, this.ghost.y, this.world);
      return;
    }

    if (this.state !== STATE.PLAY) {
      // still animate particles softly on menus
      this.particles.update(dt);
      return;
    }

    if (consumePressed('map')) this.mapOpen = !this.mapOpen;
    if (consumePressed('past')) this.shiftEra(-1);
    if (consumePressed('future')) this.shiftEra(1);
    if (consumePressed('haunt')) this.haunt();

    this.ghost.update(dt, this.world, this.particles, this.accentRgb);
    updateSpirits(this.layer, dt, this.ghost);
    this.particles.update(dt);
    this._collisions();
    this.ui.update(dt, this.ghost);

    this.renderer.centerOn(this.ghost.x, this.ghost.y, this.world);
  }

  render() {
    const r = this.renderer;
    r.begin(this.eraIndex, this.time);
    if (this.state === STATE.TITLE) {
      // gentle drifting world behind the title
      r.drawWorld(this.world, 0, this.time);
      r.postFx(0, this.ghost, 0);
      this.particles.draw(r.ctx, r.cam);
      return;
    }
    r.drawWorld(this.world, this.eraIndex, this.time);
    r.drawEntities(this.layer, this.fragments, this.eraIndex, this.time, this.ghost);
    this.particles.draw(r.ctx, r.cam);
    r.drawGhost(this.ghost, this.time, this.era.accent);
    r.postFx(this.eraIndex, this.ghost, this.shiftFx, this.endingFx);
    if (this.mapOpen && this.state === STATE.PLAY) {
      r.drawMinimap(this.world, this.layer, this.fragments, this.ghost, this.eraIndex);
    }
  }

  loop = (now) => {
    if (!this._last) this._last = now;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps (tab switches)
    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  };

  run() {
    requestAnimationFrame(this.loop);
  }
}
