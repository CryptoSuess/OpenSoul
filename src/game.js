// game.js — the conductor. Owns the world, the per-era entity layers, the
// ghost, the loop and the state machine (title / playing / paused / won).

import { ERAS, GHOST, MEMORY_LINES, ENDING_LINES, ANCHORS_TO_WIN, TILE, COMBAT } from './constants.js';
import { World } from './world.js';
import { Ghost } from './player.js';
import { Renderer } from './renderer.js';
import { Particles } from './particles.js';
import { Audio } from './audio.js';
import { UI, Overlay, titleHTML, pauseHTML, winHTML, boonHTML } from './ui.js';
import { pickBoons, BOONS } from './boons.js';
import {
  buildEraLayer, buildFragments, updateSpirits, hexToRgb,
} from './entities.js';
import { bossStep, stepHazards } from './boss.js';
import { initInput, consumePressed, isDown, moveAxis } from './input.js';

const STATE = { TITLE: 0, PLAY: 1, PAUSE: 2, ENDING: 4, WIN: 3, BOON: 5 };

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
    this.hurtFx = 0;
    this.projectiles = [];
    this.respawnT = 0;
    this.hitstop = 0;
    this.charge = 0;
    this.charging = false;
    this._lastPhaseTap = -1;
    this._taughtCombat = false;
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
    this.hurtFx = 0;
    this.projectiles = [];
    this.respawnT = 0;
    this.hitstop = 0;
    this.charge = 0;
    this.charging = false;
    this._ending = null;
    this.mapOpen = false;
    this.takenBoons = [];
    this.boonChoices = [];
    this._boonPending = false;
    this.renderer.invalidateMinimap();
    this.ui.hideBoss();
    this.ui.setBoons(this.takenBoons); // clears the tray on a fresh run
    this.audio.stopBossMusic(); // a restart must not leak the prior run's combat bed
    this.audio.setEra(this.eraIndex);
    this.ui.setEra(this.eraIndex);
    this.ui.update(0, this.ghost);
  }

  get layer() {
    return this.layers[this.eraIndex];
  }
  get boss() {
    return this.layer.boss;
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
    this.audio.suspendBossMusic(); // don't let the combat bed play under the menu
    this.overlay.show(pauseHTML());
  }
  resume() {
    if (this.state !== STATE.PAUSE) return;
    this.overlay.hide();
    this.audio.resumeBossMusic();
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
    this.audio.stopBossMusic(); // never let a combat bed bleed into the ending
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
    this.overlay.show(winHTML(this.ghost.fragments, ENDING_LINES, this.takenBoons));
  }

  _bindOverlayClicks(el) {
    el.addEventListener('click', (e) => {
      // boon cards are buttons; the click can land on a child span, so walk up
      const boonBtn = e.target.closest && e.target.closest('.boon-card');
      if (boonBtn) { this.chooseBoon(boonBtn.id.slice(5)); return; }
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
    // projectiles belong to the era you just left
    this.projectiles.length = 0;
    // show / hide the boss bar + combat music for the destination era's guardian
    const b = this.boss;
    if (b && b.state === 'active') {
      this.ui.showBoss(b.name, b.hp / b.maxHp);
      this.audio.startBossMusic(this.eraIndex);
      if (b.enraged) this.audio.enrageBossMusic(); // resume the escalated bed, not the calm one
    } else {
      this.ui.hideBoss();
      this.audio.stopBossMusic();
    }
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

  // HAUNT is your attack. A quick tap is a normal strike; holding it charges a
  // heavy blow that hits harder, reaches further and knocks the guardian back.
  _strike(heavy) {
    const g = this.ghost;
    if (g.hauntCd > 0 || this.respawnT > 0) return;
    g.hauntCd = heavy ? COMBAT.heavyCd : COMBAT.hauntCd;
    g.energy = Math.max(0, g.energy - (heavy ? COMBAT.heavyCost : COMBAT.hauntCost));
    heavy ? this.audio.heavy() : this.audio.haunt();
    const col = heavy ? [255, 235, 180] : [180, 210, 255];
    this.particles.burst(g.x, g.y, heavy ? 28 : 14, col, { speed: heavy ? 220 : 130, life: heavy ? 0.7 : 0.5, size: heavy ? 4 : 3 });

    // strike the era's guardian if it's awake and within reach
    const b = this.boss;
    let hitBoss = false;
    const range = COMBAT.hauntRange + (heavy ? 40 : 0);
    if (b && b.state === 'active' && b.phaseShift <= 0) { // invulnerable mid phase-change
      const d = Math.hypot(b.x - g.x, b.y - g.y);
      if (d < range + b.size * 0.5) {
        let dmg = (COMBAT.hauntDmg + g.fragments * COMBAT.fragDmgBonus) * g.dmgMult;
        if (heavy) dmg *= COMBAT.heavyMult;
        b.hp -= dmg;
        b.hitFlash = 1;
        hitBoss = true;
        // lifesteal: a landed strike leeches a little SOUL back, so leaning into
        // the fight (more so with Fiercer/Vampiric Haunt + reclaimed memories)
        // pays for itself and pulls you out of a death-spiral
        // …but a single hit can never refill more than a quarter of the pool,
        // so even a fully-invested build can't facetank on huge heavies
        const leech = Math.min(dmg * COMBAT.hauntLifesteal * g.lifestealMult, g.maxEnergy * 0.25);
        if (leech > 0 && g.energy < g.maxEnergy) {
          g.energy = Math.min(g.maxEnergy, g.energy + leech);
          this.particles.burst(g.x, g.y, 5, [150, 240, 205], { speed: 70, life: 0.4, size: 2 });
        }
        if (heavy) {
          const k = COMBAT.heavyKnockback / (d || 1);
          b.x += (b.x - g.x) * k * (1 / 60) * 6;
          b.y += (b.y - g.y) * k * (1 / 60) * 6;
        }
        this.particles.burst(b.x, b.y, heavy ? 22 : 12, hexToRgb(b.color), { speed: heavy ? 220 : 140, life: 0.45 });
        this.ui.showBoss(b.name, Math.max(0, b.hp / b.maxHp));
        this.hitstop = Math.max(this.hitstop, heavy ? 0.10 : 0.035);
        if (b.hp <= 0) this._defeatBoss(b);
        else if (!b.enraged && b.enrageAt && b.hp / b.maxHp <= b.enrageAt) this._enrage(b);
      }
    }

    // scare nearby villagers / spirits regardless
    for (const sp of this.layer.spirits) {
      const d = Math.hypot(sp.x - g.x, sp.y - g.y);
      if (d < GHOST.hauntRadius) sp.scared = sp.villager ? 2.5 : 1.2;
    }
    this.renderer.addShake(hitBoss ? (heavy ? 8 : 4) : 2);
  }

  // Dash: a burst of speed with brief invulnerability (double-tap PHASE).
  _dash() {
    const g = this.ghost;
    if (g.dashCd > 0 || this.respawnT > 0 || g.energy < COMBAT.dashCost) return;
    const ax = moveAxis();
    let dx = ax.x, dy = ax.y;
    if (dx === 0 && dy === 0) { dx = g.facing; dy = 0; }
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    g.vx = dx * inv * COMBAT.dashSpeed * g.speedMult;
    g.vy = dy * inv * COMBAT.dashSpeed * g.speedMult;
    g.dashT = COMBAT.dashIFrames;
    g.invuln = Math.max(g.invuln, COMBAT.dashIFrames);
    g.dashCd = COMBAT.dashCd * g.dashCdMult;
    g.energy = Math.max(0, g.energy - COMBAT.dashCost);
    this.audio.dash();
    this.particles.burst(g.x, g.y, 18, [190, 225, 255], { speed: 180, life: 0.5, size: 3 });
  }

  _wakeBoss(b) {
    b.state = 'active';
    b.fireT = 1.0;
    b.telegraphing = false;
    this.audio.bossWake();
    this.audio.startBossMusic(this.eraIndex);
    this.renderer.addShake(8);
    this.ui.showBoss(b.name, 1);
    this.ui.toastMsg(b.name + ' rises to bar your way');
    if (!this._taughtCombat) {
      this._taughtCombat = true;
      this.ui.showNarrative('Strike it with your haunting (SPACE / HAUNT). Phase (SHIFT) to slip through its soul-fire.');
    }
  }

  // Phase change at half health: the guardian rallies. A brief invulnerable
  // beat (b.phaseShift) clears the screen of hazards and signals the step up in
  // intensity, then bossStep resumes with enraged cadence/movement. The final
  // boss layers an extra bullet-storm on top (see bossStep), so it still reads
  // as the hardest fight.
  _enrage(b) {
    b.enraged = true;
    b.phaseShift = 0.9;
    this.projectiles.length = 0; // wipe pending soul-fire so the breath is clean
    this.audio.bossWake();
    this.audio.enrageBossMusic();
    this.renderer.addShake(b.final ? 16 : 11);
    this.particles.burst(b.x, b.y, b.final ? 60 : 40, hexToRgb(b.color), { speed: 240, life: 1.1, size: 4 });
    this.ui.toastMsg(b.final ? b.name + ' will not be forgotten quietly…'
                             : b.name + ' rallies — half-remembered and furious');
  }

  _defeatBoss(b) {
    b.state = 'dead';
    b.hp = 0;
    this.projectiles.length = 0;
    this.hitstop = Math.max(this.hitstop, 0.18);
    this.audio.stopBossMusic();
    this.audio.anchor();
    this.renderer.addShake(12);
    this.particles.burst(b.x, b.y, 70, hexToRgb(b.color), { speed: 240, life: 1.4, size: 4 });
    this.ui.hideBoss();
    this.ui.toastMsg(b.name + ' is laid to rest  ◆');
    this._awakenAnchor(this.layer.anchor);
  }

  // Defeating a guardian awakens the Anchor it guarded.
  _awakenAnchor(a) {
    if (!a || a.active) return;
    a.active = true;
    a.charge = 1;
    this.ghost.anchors++;
    this.audio.anchor();
    this.renderer.addShake(10);
    this.particles.burst(a.x, a.y, 50, [255, 240, 190], { speed: 220, life: 1.3, size: 4 });
    this.ui.markAnchor(this.eraIndex);
    this.ui.showNarrative('A piece of you settles into place, like a held breath finally let go.');
    if (this.ghost.anchors >= ANCHORS_TO_WIN) {
      setTimeout(() => this._beginEnding(), 1600);
    } else {
      // otherwise queue a boon — after a beat so the defeat lands first. We set
      // a flag rather than open directly, so a pause / era-shift / death during
      // the delay can't drop the reward: update() opens it once we're safely
      // back in play (see the _boonPending check).
      setTimeout(() => { this._boonPending = true; }, 900);
    }
  }

  // ---- boons (between-fights upgrades) ------------------------------------

  _openBoons() {
    if (this.state !== STATE.PLAY) return; // opened only from the safe-play check
    this._boonPending = false;
    this.boonChoices = pickBoons(3, this.takenBoons);
    this.state = STATE.BOON;
    this.audio.suspendBossMusic(); // quiet any lingering combat bed under the picker
    this.overlay.show(boonHTML(this.boonChoices));
  }

  chooseBoon(id) {
    if (this.state !== STATE.BOON) return;
    const boon = BOONS.find((b) => b.id === id);
    if (!boon) return;
    boon.apply(this.ghost);
    this.takenBoons.push(id);
    this.overlay.hide();
    this.state = STATE.PLAY;
    this.audio.resumeBossMusic();
    this.ui.setBoons(this.takenBoons);
    this.ui.toastMsg('Boon gained — ' + boon.name);
    this.ui.update(0, this.ghost);
  }

  // Take combat damage. Sets the hurt flash and, if SOUL is spent mid-fight,
  // dissipates the ghost.
  _damage(amt) {
    const g = this.ghost;
    if (g.invuln > 0 || this.respawnT > 0) return;
    g.energy = Math.max(0, g.energy - amt * g.resistMult); // Iron Will softens every hit
    this.hurtFx = 1;
    if (g.energy <= 0 && this.boss && this.boss.state === 'active') this._dissipate();
  }

  _dissipate() {
    this.respawnT = 1.5;
    this.charging = false; this.charge = 0;
    this.hitstop = Math.max(this.hitstop, 0.12);
    this.audio.hurt();
    this.renderer.addShake(14);
    this.particles.burst(this.ghost.x, this.ghost.y, 46, this.accentRgb, { speed: 210, life: 1.2, size: 4 });
    this.ui.toastMsg('You scatter into the dark… and gather again.');
  }

  _respawn() {
    const sp = this.world.findSpawn();
    const g = this.ghost;
    g.x = sp.x; g.y = sp.y; g.vx = 0; g.vy = 0;
    g.energy = Math.min(g.maxEnergy, COMBAT.respawnSoul);
    g.invuln = COMBAT.respawnInvuln;
    this.projectiles.length = 0;
    // the guardian recovers and goes dormant until re-approached
    const b = this.boss;
    if (b && b.state === 'active') {
      b.state = 'dormant';
      b.hp = b.maxHp;
      b.x = b.hx; b.y = b.hy;
      b.enraged = false;
      b.telegraphing = false;
      b.phaseShift = 0;
    }
    this.audio.stopBossMusic();
    this.ui.hideBoss();
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
        g.energy = Math.min(g.maxEnergy, g.energy + 18);
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
        // reclaimed memories strengthen you: more SOUL, fiercer haunting
        g.maxEnergy += COMBAT.fragSoulBonus;
        g.energy = Math.min(g.maxEnergy, g.energy + COMBAT.fragSoulBonus);
        this.audio.fragment();
        this.renderer.addShake(4);
        this.particles.burst(f.x, f.y, 30, [255, 245, 200], { speed: 150, life: 1.1, size: 3.5 });
        const line = MEMORY_LINES[Math.min(this.lore.length, MEMORY_LINES.length - 1)];
        this.lore.push(line);
        this.ui.showNarrative(line);
        this.ui.toastMsg('Memory reclaimed — you feel stronger ✦');
      }
    }
    // hostile wraith contact drains soul (phasing / i-frames negate it)
    if (this.era.corrupt && !g.phasing && g.invuln <= 0) {
      for (const sp of this.layer.spirits) {
        if (!sp.hostile || sp.scared > 0) continue;
        const d = Math.hypot(sp.x - g.x, sp.y - g.y);
        if (d < 20) { this._damage(26 * (1 / 60)); break; }
      }
    }
  }

  update(dt) {
    this.time += dt;
    if (this.shiftFx > 0) this.shiftFx = Math.max(0, this.shiftFx - dt * 1.6);
    if (this.hurtFx > 0) this.hurtFx = Math.max(0, this.hurtFx - dt * 2.2);

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

    // boon picker: 1 / 2 / 3 select a card (clicking also works)
    if (this.state === STATE.BOON) {
      for (let i = 0; i < 3; i++) {
        if (consumePressed('boon' + (i + 1)) && this.boonChoices[i]) {
          this.chooseBoon(this.boonChoices[i].id);
          break;
        }
      }
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

    // dissipated: freeze input, count down, then gather again
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this._respawn();
      this.particles.update(dt);
      this.renderer.centerOn(this.ghost.x, this.ghost.y, this.world);
      return;
    }

    // a post-defeat boon waits here until we're safely back in plain play
    // (not paused / respawning / mid-shift), so the reward is never dropped
    if (this._boonPending) { this._openBoons(); return; }

    // hit-stop: freeze the action for a beat so blows land with weight
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.renderer.centerOn(this.ghost.x, this.ghost.y, this.world);
      return;
    }

    if (consumePressed('map')) this.mapOpen = !this.mapOpen;
    if (consumePressed('past')) this.shiftEra(-1);
    if (consumePressed('future')) this.shiftEra(1);

    // double-tap PHASE to dash
    if (consumePressed('phase')) {
      if (this.time - this._lastPhaseTap <= COMBAT.dashWindow) this._dash();
      this._lastPhaseTap = this.time;
    }

    // HAUNT: hold to charge a heavy, release to strike (a quick tap stays light)
    consumePressed('haunt'); // drain the press edge; we drive off the held state
    const holdingHaunt = isDown('haunt');
    if (holdingHaunt && this.ghost.hauntCd <= 0) {
      this.charging = true;
      this.charge = Math.min(1, this.charge + dt / COMBAT.chargeTime);
    } else if (this.charging && !holdingHaunt) {
      this._strike(this.charge >= 1);
      this.charging = false;
      this.charge = 0;
    }

    this.ghost.update(dt, this.world, this.particles, this.accentRgb);
    updateSpirits(this.layer, dt, this.ghost);
    this._updateBoss(dt);
    this.particles.update(dt);
    this._collisions();
    this.ui.update(dt, this.ghost);

    this.renderer.centerOn(this.ghost.x, this.ghost.y, this.world);
  }

  // Guardian + projectile simulation for the current era.
  _updateBoss(dt) {
    const g = this.ghost;
    const b = this.boss;
    if (b && b.state !== 'dead') {
      if (b.state === 'dormant') {
        if (Math.hypot(b.x - g.x, b.y - g.y) < b.wake) this._wakeBoss(b);
      } else {
        bossStep(b, dt, g, this.projectiles, this.world);
        this.ui.updateBoss(Math.max(0, b.hp / b.maxHp));
        // body contact (incl. lunging) drains SOUL
        if (!g.phasing && g.invuln <= 0) {
          const d = Math.hypot(b.x - g.x, b.y - g.y);
          if (d < b.size * 0.6 + g.radius) this._damage(COMBAT.contactDps * dt);
        }
      }
    }
    // hazards always advance; phasing / dashing / i-frames make the ghost immune
    const immune = g.phasing || g.invuln > 0;
    const soul = stepHazards(this.projectiles, dt, g, this.world, immune, COMBAT);
    if (soul > 0) {
      this.audio.hurt();
      // a discrete projectile/zone/ring hit lands with a beat; beam/contact
      // ticks (small per-frame) don't freeze the action
      if (soul >= 6) this.hitstop = Math.max(this.hitstop, 0.05);
      this._damage(soul);
    }
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
    if (this.boss && this.boss.state !== 'dead') r.drawBoss(this.boss, this.time);
    this.particles.draw(r.ctx, r.cam);
    // blink the ghost during post-respawn invulnerability
    const blink = this.ghost.invuln > 0 && Math.floor(this.time * 12) % 2 === 0;
    if (this.respawnT <= 0 && !blink) {
      r.drawPhaseGauge(this.ghost, this.time);
      r.drawCharge(this.ghost, this.charge, this.time);
      r.drawGhost(this.ghost, this.time, this.era.accent);
    }
    r.drawHazards(this.projectiles, this.time);
    r.postFx(this.eraIndex, this.ghost, this.shiftFx, this.endingFx, this.hurtFx);
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
