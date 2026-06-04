// player.js — the ghost. Floaty, momentum-based movement. Can phase through
// solid matter while holding Shift (drains soul energy), and can scare the
// living by haunting.

import { GHOST } from './constants.js';
import { moveAxis, isDown } from './input.js';
import { clamp } from './rng.js';

export class Ghost {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;          // -1 left, 1 right
    this.radius = GHOST.radius; // collision radius (used by combat hit-tests)
    this.maxEnergy = GHOST.maxEnergy; // grows as memories are reclaimed
    this.energy = GHOST.maxEnergy;
    this.phasing = false;
    this.shiftCd = 0;
    this.hauntCd = 0;         // cooldown between haunt strikes
    this.invuln = 0;          // i-frames (after respawn / dash)
    this.dashCd = 0;          // cooldown between dashes
    this.dashT = 0;           // active dash window (over-speed allowed)
    this.bob = 0;
    this.fragments = 0;       // memory fragments collected
    this.anchors = 0;         // anchors awakened
    this.trailTimer = 0;
    this.phaseFade = 0;       // 0..1 — eases the phase "shift" gauge in/out
    // per-run boon modifiers (neutral by default; set by chosen boons). These
    // live on the instance — a fresh Ghost each run resets them, so upgrades
    // never leak between runs.
    this.dmgMult = 1;
    this.speedMult = 1;
    this.phaseDrainMult = 1;
    this.regenMult = 1;
    this.dashCdMult = 1;
    this.resistMult = 1; // <1 reduces SOUL lost to harm (Iron Will boon)
  }

  update(dt, world, particles, accentRgb) {
    this.shiftCd = Math.max(0, this.shiftCd - dt);
    this.hauntCd = Math.max(0, this.hauntCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.bob += dt * 3;

    const ax = moveAxis();
    const wantPhase = isDown('phase') && this.energy > 0;
    this.phasing = wantPhase && (ax.x !== 0 || ax.y !== 0);

    // a dash briefly allows over-speed (it sets velocity directly in game.js);
    // every ceiling scales with speedMult so a dash always out-paces phase drift
    const maxSpeed = this.dashT > 0 ? GHOST.dashSpeedCap * this.speedMult
      : this.phasing ? GHOST.phaseSpeed * this.speedMult : GHOST.maxSpeed * this.speedMult;
    this.vx += ax.x * GHOST.accel * dt;
    this.vy += ax.y * GHOST.accel * dt;

    // friction
    const f = clamp(1 - GHOST.friction * dt, 0, 1);
    this.vx *= f;
    this.vy *= f;

    // clamp speed
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxSpeed) {
      this.vx = (this.vx / sp) * maxSpeed;
      this.vy = (this.vy / sp) * maxSpeed;
    }
    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;

    // integrate with collision (axis-separated so we slide along walls)
    this._move(this.vx * dt, this.vy * dt, world);

    // energy economy (boons soften phase drain / boost regen)
    if (this.phasing) {
      this.energy = clamp(this.energy - GHOST.phaseDrain * this.phaseDrainMult * dt, 0, this.maxEnergy);
    } else {
      this.energy = clamp(this.energy + GHOST.energyRegen * this.regenMult * dt, 0, this.maxEnergy);
    }
    // gauge fades in while phasing, lingers briefly after release
    this.phaseFade = clamp(this.phaseFade + (this.phasing ? dt * 6 : -dt * 4), 0, 1);

    // trail particles
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && (sp > 30 || this.phasing)) {
      this.trailTimer = 0.03;
      const c = this.phasing ? [180, 220, 255] : accentRgb;
      particles.spawn(
        this.x + (Math.random() - 0.5) * 8,
        this.y + (Math.random() - 0.5) * 8 + 4,
        -this.vx * 0.1, -this.vy * 0.1 + 6,
        0.7, 3.2, c
      );
    }
  }

  _move(dx, dy, world) {
    const r = GHOST.radius;
    const solid = (px, py) => !this.phasing && world.isSolidPx(px, py);

    // X axis
    let nx = this.x + dx;
    if (!solid(nx + Math.sign(dx) * r, this.y)) {
      this.x = nx;
    } else {
      this.vx = 0;
    }
    // Y axis
    let ny = this.y + dy;
    if (!solid(this.x, ny + Math.sign(dy) * r)) {
      this.y = ny;
    } else {
      this.vy = 0;
    }

    // Keep inside the world rectangle.
    this.x = clamp(this.x, r, world.pixelWidth() - r);
    this.y = clamp(this.y, r, world.pixelHeight() - r);
  }

  canShift() {
    return this.shiftCd <= 0 && this.energy >= GHOST.shiftCost;
  }

  spendShift() {
    this.energy = clamp(this.energy - GHOST.shiftCost, 0, GHOST.maxEnergy);
    this.shiftCd = GHOST.shiftCooldown;
  }
}
