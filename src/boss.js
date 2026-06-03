// boss.js — the Guardians. One per era, hovering at its Anchor. Combat reuses
// the ghost's verbs: the player strikes with HAUNT and dodges with PHASE, while
// the boss circles, telegraphs, and looses patterns of soul-fire. Pure-ish: the
// AI mutates the boss + a shared projectile array; the game wires up the
// audiovisual/SOUL consequences.

import { BOSSES, COMBAT } from './constants.js';

const PREF_DIST = 210; // distance the boss tries to hold from the player

// Build a guardian for an era id, positioned at (x, y) — its Anchor.
export function makeBoss(eraId, x, y) {
  const cfg = BOSSES[eraId];
  if (!cfg) return null;
  return {
    ...cfg,
    eraId,
    x, y, hx: x, hy: y,        // current + home position
    maxHp: cfg.hp,
    state: 'dormant',          // 'dormant' | 'active' | 'dead'
    bob: Math.random() * 6.28,
    fireT: 1.0,
    telegraphing: false,
    teleT: 0,
    patternI: 0,
    lunge: null,
    hitFlash: 0,
    enraged: false,
  };
}

function spawnProj(arr, x, y, ang, speed, color) {
  arr.push({
    kind: 'bolt', x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r: 7, life: 4.5, color,
  });
}

// Loose one attack pattern toward the player. Patterns marked as "signatures"
// give each Guardian its own identity.
function firePattern(b, pat, ghost, arr) {
  const base = Math.atan2(ghost.y - b.y, ghost.x - b.x);
  const sp = b.projSpeed * (b.enraged ? 1.2 : 1);
  switch (pat) {
    case 'aim':
      spawnProj(arr, b.x, b.y, base, sp, b.color);
      break;
    case 'spread3':
      for (let i = -1; i <= 1; i++) spawnProj(arr, b.x, b.y, base + i * 0.28, sp, b.color);
      break;
    case 'spread5':
      for (let i = -2; i <= 2; i++) spawnProj(arr, b.x, b.y, base + i * 0.24, sp, b.color);
      break;
    case 'ring': {
      const n = b.enraged ? 16 : 11;
      for (let i = 0; i < n; i++) spawnProj(arr, b.x, b.y, (i / n) * 6.2832, sp * 0.9, b.color);
      break;
    }
    case 'slam':
      // a telegraphed lunge toward the player; damage is by body contact
      b.lunge = { vx: Math.cos(base) * 430, vy: Math.sin(base) * 430, t: 0.36 };
      break;

    // ---- signature attacks ----
    case 'roots': {
      // Grove-Warden: ground-zones erupt where you stand (+ a couple around it).
      const n = b.enraged ? 5 : 3;
      arr.push(makeZone(ghost.x, ghost.y, 46, b.color));
      for (let i = 1; i < n; i++) {
        const a = base + (Math.random() - 0.5) * 3;
        const rad = 70 + Math.random() * 150;
        arr.push(makeZone(ghost.x + Math.cos(a) * rad, ghost.y + Math.sin(a) * rad, 42, b.color));
      }
      break;
    }
    case 'beam':
      // Ember-Smith: a fire-line that sweeps through the arena, starting to one
      // side of the player and rotating across them.
      arr.push({
        kind: 'beam', x: b.x, y: b.y,
        ang: base - 0.75, angVel: 1.0 + (b.enraged ? 0.5 : 0),
        len: 600, width: 22, life: 1.6, color: b.color,
      });
      break;
    case 'expand':
      // Pyre-Wraith: an expanding ember ring with a gap to weave through.
      arr.push({
        kind: 'ring', x: b.x, y: b.y, r: b.size * 0.7, speed: 150 + (b.enraged ? 60 : 0),
        maxR: 520, band: 14, gapC: base + Math.PI + (Math.random() - 0.5), gapHalf: 0.5,
        color: b.color, hitGhost: false,
      });
      break;
    case 'homing': {
      // Gravekeeper: grave-shades that curve toward you.
      const n = b.enraged ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.5;
        arr.push({
          kind: 'homing', x: b.x, y: b.y,
          vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp * 0.7,
          speed: sp * 0.7, turn: 2.0, r: 8, life: 4.0, color: b.color,
        });
      }
      break;
    }
  }
}

function makeZone(x, y, r, color) {
  return { kind: 'zone', x, y, r, warn: 0.75, flash: 0, done: false, color };
}

// Advance an active boss one frame. Mutates `b` and pushes into `projectiles`.
export function bossStep(b, dt, ghost, projectiles, world) {
  b.bob += dt;
  if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 3);

  if (b.lunge) {
    b.x += b.lunge.vx * dt;
    b.y += b.lunge.vy * dt;
    b.lunge.t -= dt;
    if (b.lunge.t <= 0) b.lunge = null;
  } else {
    // Hold a medium distance and strafe; nearly freeze while winding up.
    const dx = ghost.x - b.x;
    const dy = ghost.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = b.speed * (b.enraged ? 1.35 : 1);
    const radial = Math.sign(d - PREF_DIST);
    let mx = (dx / d) * radial * spd + (-dy / d) * spd * 0.5;
    let my = (dy / d) * radial * spd + (dx / d) * spd * 0.5;
    if (b.telegraphing) { mx *= 0.12; my *= 0.12; }
    b.x += mx * dt;
    b.y += my * dt;
  }
  // keep inside the world
  const w = world.pixelWidth(), h = world.pixelHeight();
  if (b.x < b.size) b.x = b.size; else if (b.x > w - b.size) b.x = w - b.size;
  if (b.y < b.size) b.y = b.size; else if (b.y > h - b.size) b.y = h - b.size;

  // fire / telegraph cycle
  if (!b.telegraphing) {
    b.fireT -= dt;
    if (b.fireT <= 0) { b.telegraphing = true; b.teleT = 0; }
  } else {
    b.teleT += dt;
    if (b.teleT >= COMBAT.teleTime) {
      firePattern(b, b.patterns[b.patternI % b.patterns.length], ghost, projectiles);
      b.patternI++;
      // enraged final boss looses a second pattern — a bullet-storm
      if (b.enraged && b.final) {
        firePattern(b, b.patterns[b.patternI % b.patterns.length], ghost, projectiles);
        b.patternI++;
      }
      b.telegraphing = false;
      b.fireT = b.fireEvery * (b.enraged ? 0.6 : 1);
    }
  }
}

// Distance from point (px,py) to segment (ax,ay)-(bx,by).
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Advance every hazard and return the SOUL damage the ghost takes this frame
// (0 if `immune`, e.g. phasing / dashing / freshly respawned). Removes spent,
// out-of-bounds or connecting hazards. `dmg` carries the per-kind damage values.
export function stepHazards(arr, dt, ghost, world, immune, dmg) {
  const w = world.pixelWidth(), h = world.pixelHeight();
  const gr = ghost.radius;
  let soul = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    switch (p.kind) {
      case 'beam': {
        p.ang += p.angVel * dt;
        p.life -= dt;
        if (p.life <= 0) { arr.splice(i, 1); break; }
        if (!immune) {
          const ex = p.x + Math.cos(p.ang) * p.len;
          const ey = p.y + Math.sin(p.ang) * p.len;
          if (segDist(ghost.x, ghost.y, p.x, p.y, ex, ey) < p.width * 0.5 + gr) soul += dmg.beamDps * dt;
        }
        break;
      }
      case 'ring': {
        p.r += p.speed * dt;
        if (p.r > p.maxR) { arr.splice(i, 1); break; }
        if (!immune && !p.hitGhost) {
          const d = Math.hypot(ghost.x - p.x, ghost.y - p.y);
          if (Math.abs(d - p.r) < p.band + gr) {
            let a = Math.atan2(ghost.y - p.y, ghost.x - p.x) - p.gapC;
            a = Math.atan2(Math.sin(a), Math.cos(a)); // wrap to [-pi,pi]
            if (Math.abs(a) > p.gapHalf) { soul += dmg.ringDmg; p.hitGhost = true; }
          }
        }
        break;
      }
      case 'zone': {
        if (!p.done) {
          p.warn -= dt;
          if (p.warn <= 0) {
            p.done = true;
            p.flash = 0.22;
            if (!immune && Math.hypot(ghost.x - p.x, ghost.y - p.y) < p.r) soul += dmg.zoneDmg;
          }
        } else {
          p.flash -= dt;
          if (p.flash <= 0) arr.splice(i, 1);
        }
        break;
      }
      case 'homing': {
        // steer velocity toward the ghost (limited turn rate)
        const desired = Math.atan2(ghost.y - p.y, ghost.x - p.x);
        let cur = Math.atan2(p.vy, p.vx);
        let diff = Math.atan2(Math.sin(desired - cur), Math.cos(desired - cur));
        const max = p.turn * dt;
        cur += diff > max ? max : diff < -max ? -max : diff;
        p.vx = Math.cos(cur) * p.speed;
        p.vy = Math.sin(cur) * p.speed;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > w || p.y > h) { arr.splice(i, 1); break; }
        if (!immune && Math.hypot(p.x - ghost.x, p.y - ghost.y) < p.r + gr) { soul += dmg.projDmg; arr.splice(i, 1); }
        break;
      }
      default: { // 'bolt'
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > w || p.y > h) { arr.splice(i, 1); break; }
        if (!immune && Math.hypot(p.x - ghost.x, p.y - ghost.y) < p.r + gr) { soul += dmg.projDmg; arr.splice(i, 1); }
      }
    }
  }
  return soul;
}
