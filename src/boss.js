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
    x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r: 7, life: 4.5, color,
  });
}

// Loose one attack pattern toward the player.
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
  }
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
      const pat = b.patterns[b.patternI % b.patterns.length];
      b.patternI++;
      firePattern(b, pat, ghost, projectiles);
      b.telegraphing = false;
      b.fireT = b.fireEvery * (b.enraged ? 0.6 : 1);
    }
  }
}

// Advance every projectile. Returns the number of times the ghost was hit
// (0 if `immune`, e.g. phasing or freshly respawned). Removes spent/out-of-
// bounds projectiles and any that connect.
export function stepProjectiles(arr, dt, ghost, world, immune) {
  const w = world.pixelWidth(), h = world.pixelHeight();
  let hits = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > w || p.y > h) {
      arr.splice(i, 1);
      continue;
    }
    if (!immune) {
      const d = Math.hypot(p.x - ghost.x, p.y - ghost.y);
      if (d < p.r + ghost.radius) { hits++; arr.splice(i, 1); }
    }
  }
  return hits;
}
