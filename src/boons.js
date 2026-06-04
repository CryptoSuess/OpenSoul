// boons.js — the between-fights upgrade pool. After defeating a guardian you
// choose one of three. Each boon's apply() mutates the PER-RUN Ghost instance
// (never the shared GHOST/COMBAT constants), so upgrades reset cleanly each run
// and stack across a single run.
//
// `max` caps how many times a boon can be taken in one run, so no single stat
// runs away (a run grants ~4 boons). The picker (pickBoons) also stops offering
// a boon once it's maxed, so late choices stay meaningful instead of dealing you
// a card you can't use. `icon` is the glyph shown on the HUD boon tray.

export const BOONS = [
  {
    id: 'deepsoul',
    name: 'Deeper Soul',
    desc: '+30 maximum SOUL.',
    icon: '◈',
    max: 3,
    apply(g) { g.maxEnergy += 30; g.energy = Math.min(g.maxEnergy, g.energy + 30); },
  },
  {
    id: 'fierce',
    name: 'Fiercer Haunt',
    desc: '+20% haunt damage.',
    icon: '✶',
    max: 2,
    apply(g) { g.dmgMult *= 1.2; },
  },
  {
    id: 'quick',
    name: 'Quicker Spirit',
    desc: '+20% drift & phase speed.',
    icon: '➤',
    max: 2,
    apply(g) { g.speedMult *= 1.2; },
  },
  {
    id: 'efficient',
    name: 'Efficient Phase',
    desc: '−30% SOUL drained while phasing.',
    icon: '❖',
    max: 2,
    apply(g) { g.phaseDrainMult *= 0.7; },
  },
  {
    id: 'welling',
    name: 'Welling Soul',
    desc: '+50% SOUL regeneration.',
    icon: '♻',
    max: 2,
    apply(g) { g.regenMult *= 1.5; },
  },
  {
    id: 'nimble',
    name: 'Nimble',
    desc: '−25% dash cooldown.',
    icon: '⚡',
    max: 2,
    apply(g) { g.dashCdMult *= 0.75; },
  },
  {
    id: 'iron',
    name: 'Iron Will',
    desc: '−18% SOUL lost to harm.',
    icon: '⛉',
    max: 2,
    apply(g) { g.resistMult *= 0.82; },
  },
  {
    id: 'leech',
    name: 'Vampiric Haunt',
    desc: '+120% SOUL leeched when you strike.',
    icon: '❥',
    max: 1, // a single decisive pick — stacking it with big heavies got degenerate
    apply(g) { g.lifestealMult *= 2.2; },
  },
];

// Pick `n` distinct random boons to offer. `taken` is the run's list of chosen
// boon ids; any boon already at its `max` is dropped from the pool so the offer
// is always something you can still benefit from.
export function pickBoons(n = 3, taken = []) {
  const count = (id) => taken.filter((t) => t === id).length;
  const pool = BOONS.filter((b) => count(b.id) < b.max);
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
