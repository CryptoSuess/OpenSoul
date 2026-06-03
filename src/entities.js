// entities.js — everything that lives on top of the terrain. Each era builds
// its own populated layer from the shared world + a deterministic per-era RNG,
// so the Verdant Dawn's forest, the village's huts, the ruins' gravestones and
// the Hollow's shards all occupy the same coordinates of the same island.

import { makeRng, hash2 } from './rng.js';
import { TILE, WORLD_W, WORLD_H, SEED, T, ERAS, TOTAL_FRAGMENTS } from './constants.js';

let _id = 1;
const nextId = () => _id++;

// ---- Entity factory helpers ---------------------------------------------

function makeTree(x, y, color, scale = 1) {
  return { id: nextId(), kind: 'tree', x, y, color, scale, solid: false, sway: Math.random() * 6.28 };
}
function makeProp(x, y, type) {
  // type: 'stone' | 'grave' | 'shard' | 'hut' | 'ruinwall'
  const solid = type === 'hut' || type === 'ruinwall';
  return { id: nextId(), kind: 'prop', type, x, y, solid };
}
function makeWisp(x, y, color) {
  return { id: nextId(), kind: 'wisp', x, y, color, phase: Math.random() * 6.28, gone: false };
}
function makeFragment(x, y, index) {
  return { id: nextId(), kind: 'fragment', x, y, index, collected: false, phase: Math.random() * 6.28 };
}
function makeAnchor(x, y) {
  return { id: nextId(), kind: 'anchor', x, y, active: false, charge: 0, phase: 0 };
}
function makeSpirit(x, y, color, era) {
  return {
    id: nextId(), kind: 'spirit', x, y, color, era,
    // wandering target
    tx: x, ty: y, t: Math.random() * 3, scared: 0, phase: Math.random() * 6.28,
    hostile: era === 'hollow',
  };
}

// ---- Per-era population ---------------------------------------------------

// Returns a layer { trees, props, wisps, spirits, anchor } for one era.
export function buildEraLayer(world, eraIndex) {
  const era = ERAS[eraIndex];
  const rng = makeRng(SEED ^ (eraIndex * 0x9e3779b1));
  const layer = { trees: [], props: [], wisps: [], spirits: [], anchor: null };

  const land = (tx, ty) => {
    const t = world.tileAt(tx, ty);
    return t === T.LAND || t === T.HILL || t === T.SHORE;
  };

  // Trees / vegetation — denser on LAND, sparse on hills, none on water.
  for (let ty = 1; ty < WORLD_H - 1; ty++) {
    for (let tx = 1; tx < WORLD_W - 1; tx++) {
      const tt = world.tileAt(tx, ty);
      if (tt !== T.LAND && tt !== T.HILL) continue;
      const r = hash2(tx, ty, SEED + eraIndex * 77);
      if (r < era.treeDensity) {
        const px = (tx + 0.25 + hash2(tx, ty, 9) * 0.5) * TILE;
        const py = (ty + 0.25 + hash2(ty, tx, 13) * 0.5) * TILE;
        const scale = 0.7 + hash2(tx, ty, 3) * 0.8;
        layer.trees.push(makeTree(px, py, era.treeColor, scale));
      }
    }
  }

  // Ambient props specific to the era (stones / graves / shards).
  if (era.propDensity > 0) {
    const propType = era.id === 'verdant' ? 'stone'
      : era.id === 'ruin' ? 'grave'
      : era.id === 'hollow' ? 'shard' : 'stone';
    for (let ty = 2; ty < WORLD_H - 2; ty++) {
      for (let tx = 2; tx < WORLD_W - 2; tx++) {
        if (!land(tx, ty)) continue;
        if (hash2(tx, ty, SEED + 500 + eraIndex) < era.propDensity) {
          layer.props.push(makeProp((tx + 0.5) * TILE, (ty + 0.5) * TILE, propType));
        }
      }
    }
  }

  // Village (Age of Hearths) or its ruins (Long Quiet): a cluster of huts.
  if (era.village) {
    const ruined = era.village === 'ruined';
    const cx = Math.floor(WORLD_W * 0.5);
    const cy = Math.floor(WORLD_H * 0.5);
    const huts = ruined ? 14 : 20;
    let placed = 0, tries = 0;
    while (placed < huts && tries < 400) {
      tries++;
      const ang = rng() * Math.PI * 2;
      const rad = 2 + rng() * 12;
      const tx = Math.round(cx + Math.cos(ang) * rad);
      const ty = Math.round(cy + Math.sin(ang) * rad);
      if (!land(tx, ty)) continue;
      const px = (tx + 0.5) * TILE;
      const py = (ty + 0.5) * TILE;
      layer.props.push(makeProp(px, py, ruined ? 'ruinwall' : 'hut'));
      placed++;
    }
  }

  // Spirits / villagers / wraiths.
  const spiritCount = (era.villagerCount || 0) + (era.spirits || 0);
  let s = 0, st = 0;
  while (s < spiritCount && st < spiritCount * 30) {
    st++;
    const tx = 1 + Math.floor(rng() * (WORLD_W - 2));
    const ty = 1 + Math.floor(rng() * (WORLD_H - 2));
    if (!land(tx, ty)) continue;
    const isVillager = s < (era.villagerCount || 0);
    // Hex (not rgb()) so the renderer's glow helper can parse it.
    const color = isVillager ? '#ffe6b0' : era.accent;
    const sp = makeSpirit((tx + 0.5) * TILE, (ty + 0.5) * TILE, color, era.id);
    sp.villager = isVillager;
    layer.spirits.push(sp);
    s++;
  }

  // Soul wisps — energy pickups. Each era gets a generous scattering.
  let w = 0, wt = 0;
  const wispCount = 30;
  while (w < wispCount && wt < wispCount * 30) {
    wt++;
    const tx = 1 + Math.floor(rng() * (WORLD_W - 2));
    const ty = 1 + Math.floor(rng() * (WORLD_H - 2));
    const tt = world.tileAt(tx, ty);
    if (tt === T.DEEP || tt === T.PEAK) continue;
    layer.wisps.push(makeWisp((tx + 0.5) * TILE, (ty + 0.5) * TILE, era.accent));
    w++;
  }

  // One Anchor per era, placed at a distinctive spot (rotates around the isle).
  const aAng = (eraIndex / ERAS.length) * Math.PI * 2 + 0.6;
  const aRad = 22;
  let atx = Math.round(WORLD_W / 2 + Math.cos(aAng) * aRad);
  let aty = Math.round(WORLD_H / 2 + Math.sin(aAng) * aRad);
  // nudge onto land
  for (let k = 0; k < 40 && !land(atx, aty); k++) {
    atx = Math.round(WORLD_W / 2 + Math.cos(aAng) * (aRad - k));
    aty = Math.round(WORLD_H / 2 + Math.sin(aAng) * (aRad - k));
  }
  layer.anchor = makeAnchor((atx + 0.5) * TILE, (aty + 0.5) * TILE);

  return layer;
}

// Fragments are global (not per-era duplicated): we scatter TOTAL_FRAGMENTS
// across the world and assign each to a *specific* era so the player must
// shift time to find them all. Some sit inside solid matter (need phasing).
export function buildFragments(world) {
  const rng = makeRng(SEED ^ 0xBADF00D);
  const frags = [];
  let i = 0, tries = 0;
  while (i < TOTAL_FRAGMENTS && tries < 5000) {
    tries++;
    const tx = 2 + Math.floor(rng() * (WORLD_W - 4));
    const ty = 2 + Math.floor(rng() * (WORLD_H - 4));
    const tt = world.tileAt(tx, ty);
    if (tt === T.DEEP || tt === T.WATER) continue;
    const era = i % ERAS.length; // spread evenly across eras
    const f = makeFragment((tx + 0.5) * TILE, (ty + 0.5) * TILE, i);
    f.era = era;
    f.eraId = ERAS[era].id;
    frags.push(f);
    i++;
  }
  return frags;
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [
    parseInt(v.substr(0, 2), 16),
    parseInt(v.substr(2, 2), 16),
    parseInt(v.substr(4, 2), 16),
  ];
}

// Simple wandering AI for spirits/villagers. Hostile wraiths drift toward the
// player; villagers flee when haunted (scared > 0).
export function updateSpirits(layer, dt, player) {
  for (const sp of layer.spirits) {
    sp.phase += dt * 2;
    if (sp.scared > 0) {
      sp.scared -= dt;
      const dx = sp.x - player.x;
      const dy = sp.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      sp.x += (dx / d) * 120 * dt;
      sp.y += (dy / d) * 120 * dt;
      continue;
    }
    if (sp.hostile) {
      const dx = player.x - sp.x;
      const dy = player.y - sp.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 360) {
        sp.x += (dx / d) * 46 * dt;
        sp.y += (dy / d) * 46 * dt;
        continue;
      }
    }
    // idle wander
    sp.t -= dt;
    if (sp.t <= 0) {
      sp.t = 1.5 + Math.random() * 3;
      sp.tx = sp.x + (Math.random() - 0.5) * 120;
      sp.ty = sp.y + (Math.random() - 0.5) * 120;
    }
    const dx = sp.tx - sp.x;
    const dy = sp.ty - sp.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      sp.x += (dx / d) * 34 * dt;
      sp.y += (dy / d) * 34 * dt;
    }
  }
}
