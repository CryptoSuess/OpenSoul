// boons.js — the between-fights upgrade pool. After defeating a guardian you
// choose one of three. Each boon's apply() mutates the PER-RUN Ghost instance
// (never the shared GHOST/COMBAT constants), so upgrades reset cleanly each run
// and stack across a single run.

export const BOONS = [
  {
    id: 'deepsoul',
    name: 'Deeper Soul',
    desc: '+30 maximum SOUL.',
    apply(g) { g.maxEnergy += 30; g.energy = Math.min(g.maxEnergy, g.energy + 30); },
  },
  {
    id: 'fierce',
    name: 'Fiercer Haunt',
    desc: '+25% haunt damage.',
    apply(g) { g.dmgMult *= 1.25; },
  },
  {
    id: 'quick',
    name: 'Quicker Spirit',
    desc: '+20% drift & phase speed.',
    apply(g) { g.speedMult *= 1.2; },
  },
  {
    id: 'efficient',
    name: 'Efficient Phase',
    desc: '−30% SOUL drained while phasing.',
    apply(g) { g.phaseDrainMult *= 0.7; },
  },
  {
    id: 'welling',
    name: 'Welling Soul',
    desc: '+50% SOUL regeneration.',
    apply(g) { g.regenMult *= 1.5; },
  },
  {
    id: 'nimble',
    name: 'Nimble',
    desc: '−25% dash cooldown.',
    apply(g) { g.dashCdMult *= 0.75; },
  },
];

// Pick `n` distinct random boons to offer.
export function pickBoons(n = 3) {
  const pool = [...BOONS];
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
