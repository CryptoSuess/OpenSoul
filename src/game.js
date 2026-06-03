// game.js — the conductor. Owns the world, the per-era entity layers, the
// ghost, the loop and the state machine (title / playing / paused / won).

import { ERAS, GHOST, MEMORY_LINES, ANCHORS_TO_WIN, TILE } from './constants.js';
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

const STATE = { TITLE: 0, PLAY: 1, PAUSE: 2, WIN: 3 };

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
    this.lore = [];
    initInput(window);
    this._reset();
    this._showTitle();
    this._bindOverlayClicks(overlayEl);
  }

  _reset() {
    this.world = new World();
    this.eraIndex = 2; // start in "The Long Quiet" — you wake in the ruins
    this.layers = ERAS.map((_, i) => buildEraLayer(this.world, i));
    this.fragments = buildFragments(this.world);
    const sp = this.world.findSpawn();
    this.ghost = new Ghost(sp.x, sp.y);
    this.lore = [];
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

  win() {
    this.state = STATE.WIN;
    this.audio.win();
    this.ui.setHidden(true);
    this.overlay.show(winHTML(this.ghost.fragments, this.lore.slice(-4)));
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
        setTimeout(() => this.win(), 1600);
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
      else if (this.state === STATE.WIN) { this._reset(); this.start(); }
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
    r.postFx(this.eraIndex, this.ghost, this.shiftFx);
    if (this.mapOpen) {
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
