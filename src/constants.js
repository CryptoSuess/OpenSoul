// constants.js — global tuning and the definition of each timeline (era).
// Tweak these to reshape the feel of the game.

export const TILE = 32;            // pixel size of a tile at zoom 1
export const WORLD_W = 96;         // world width in tiles
export const WORLD_H = 96;         // world height in tiles
export const SEED = 0xC0FFEE;      // master world seed

// Tile categories derived from the shared heightmap.
export const T = {
  DEEP: 0,
  WATER: 1,
  SHORE: 2,
  LAND: 3,
  HILL: 4,
  PEAK: 5, // solid — needs phasing to cross
};

// A tile is "solid" (blocks a non-phasing ghost) if it's a PEAK or, in some
// eras, a structure placed on top. Structures are handled per-entity.
export function isSolidTile(t) {
  return t === T.PEAK;
}

// Player / ghost tuning.
export const GHOST = {
  accel: 2400,        // px/s^2
  maxSpeed: 260,      // px/s normal drift
  phaseSpeed: 420,    // px/s while phasing
  dashSpeedCap: 720,  // px/s ceiling during a dash burst
  friction: 6.5,      // velocity damping per second
  radius: 11,
  maxEnergy: 100,
  energyRegen: 7,     // per second when not phasing/shifting
  phaseDrain: 22,     // per second while phasing through matter
  shiftCost: 18,      // cost to jump one era
  shiftCooldown: 0.55,// seconds between shifts
  hauntRadius: 70,    // interaction reach
};

// The eras. Index order == flow of time. Q goes earlier, E goes later.
// Each era shares the same heightmap but renders + populates it differently.
export const ERAS = [
  {
    id: 'verdant',
    name: 'The Verdant Dawn',
    blurb: 'Before names, before grief — the world breathing green.',
    // color grading
    sky: '#0e2c22',
    fogColor: '20, 70, 48',
    fogStrength: 0.22,
    vignette: 0.35,
    palette: {
      deep: '#0b2f3a', water: '#15596b', shore: '#7d8a4e',
      land: '#2f6b3d', land2: '#27592f', hill: '#3f5a3a', peak: '#5b6b52',
    },
    accent: '#8fffb0',     // wisp / glow accent
    treeDensity: 0.16,
    treeColor: '#1f7a3a',
    propDensity: 0.010,   // ancient standing stones
    villagerCount: 0,
    spirits: 26,          // wandering nature spirits
    mood: 'lush',
  },
  {
    id: 'stone',
    name: 'The Age of Hearths',
    blurb: 'Smoke and laughter. People built, and called it home.',
    sky: '#241a10',
    fogColor: '90, 70, 40',
    fogStrength: 0.16,
    vignette: 0.32,
    palette: {
      deep: '#13313a', water: '#1c5566', shore: '#8a7a4a',
      land: '#5a6b3a', land2: '#4d5d31', hill: '#6b5f3f', peak: '#73685a',
    },
    accent: '#ffd27f',
    treeDensity: 0.07,
    treeColor: '#2f6b34',
    propDensity: 0.0,
    village: true,        // generates a settlement of huts + paths
    villagerCount: 22,
    spirits: 4,
    mood: 'living',
  },
  {
    id: 'sundering',
    name: 'The Sundering',
    blurb: 'The night the hearths went out. Smoke, and running feet.',
    sky: '#1a0d08',
    fogColor: '120, 50, 25',
    fogStrength: 0.30,
    vignette: 0.46,
    palette: {
      deep: '#1a1410', water: '#3a2418', shore: '#5a4030',
      land: '#4a3327', land2: '#3d2a1f', hill: '#5a3a28', peak: '#6b4636',
    },
    accent: '#ff9a5a',        // ember glow
    treeDensity: 0.09,
    treeColor: '#3a2418',     // charred
    propDensity: 0.016,       // smouldering rubble
    village: 'ruined',        // huts caught mid-collapse
    villagerCount: 8,         // a few souls still fleeing
    spirits: 12,
    mood: 'falling',
  },
  {
    id: 'ruin',
    name: 'The Long Quiet',
    blurb: 'The hearths went cold. Moss took the walls. You woke here.',
    sky: '#11161c',
    fogColor: '60, 70, 80',
    fogStrength: 0.26,
    vignette: 0.42,
    palette: {
      deep: '#0c222b', water: '#184452', shore: '#5f6450',
      land: '#3a4a36', land2: '#33402f', hill: '#444a40', peak: '#54584f',
    },
    accent: '#9fe8ff',
    treeDensity: 0.13,
    treeColor: '#33533a',
    propDensity: 0.012,   // gravestones / broken walls
    village: 'ruined',
    villagerCount: 0,
    spirits: 14,
    mood: 'haunted',
  },
  {
    id: 'hollow',
    name: 'The Hollow To-Come',
    blurb: 'If nothing is remembered, this is what remains.',
    sky: '#05060a',
    fogColor: '40, 20, 60',
    fogStrength: 0.34,
    vignette: 0.5,
    palette: {
      deep: '#070512', water: '#1a1140', shore: '#2a2440',
      land: '#171528', land2: '#12101f', hill: '#221a36', peak: '#2e2444',
    },
    accent: '#d59bff',
    treeDensity: 0.04,
    treeColor: '#3a2a55',
    propDensity: 0.018,   // void shards
    villagerCount: 0,
    spirits: 18,          // wraiths
    mood: 'void',
    corrupt: true,
  },
];

// Memory fragments — each carries one line, revealed in order of collection so
// the tale assembles itself. At least TOTAL_FRAGMENTS lines so none repeat.
export const MEMORY_LINES = [
  'A child laughed by the river. The sound has no face anymore.',
  'You carved two names into a standing stone. Only one weathered away.',
  'The hearth-fire smelled of pine. Someone waited up for you.',
  'You planted a tree the day she was born. It outlived the village.',
  'There was a quarrel. You meant to take it back. You never did.',
  'They came at harvest, with torches instead of lanterns.',
  'You carried two children to the treeline. You went back for a third.',
  'The smoke had a weight to it. It is still on your hands.',
  'You did not see the roof fall. You only heard it stop the screaming.',
  'The river ran orange that night, and then it ran cold.',
  'Moss took the walls so gently it seemed like forgiveness.',
  'You looked for graves with the right names and found only your own footprints.',
  'The Long Quiet is not silence. It is everyone listening for you.',
  'Even the wraiths in the dark were once someone you failed to save.',
  'What is not remembered does not rest. It only waits.',
];

// Resolution beats — played only during the ending cutscene, after the last
// Anchor is awakened.
export const ENDING_LINES = [
  'You are not lost. You were only unfinished.',
  'To move on, you had to remember enough to forgive what you forgot.',
  'The hearths are cold, the names are dust — and still, you were loved.',
  'Let the smoke settle. Let the river warm. Let go.',
];

export const TOTAL_FRAGMENTS = 15; // 3 per era × 5 eras
export const ANCHORS_TO_WIN = 5;   // one per era

// ---- Combat tuning ------------------------------------------------------
// The ghost's verbs double as combat: HAUNT strikes, PHASE dodges, SOUL is
// both your resource and your life. Reclaimed memories make you stronger.
export const COMBAT = {
  hauntDmg: 13,        // base damage per haunt strike
  hauntCost: 5,        // SOUL spent per strike
  hauntCd: 0.30,       // seconds between strikes
  hauntRange: 110,     // strike reach (centre-to-centre, before boss radius)
  projDmg: 11,         // SOUL lost per bolt / homing hit
  ringDmg: 12,         // SOUL lost crossing an expanding ring
  zoneDmg: 16,         // SOUL lost caught in an erupting ground-zone
  beamDps: 34,         // SOUL/sec while inside a sweeping beam
  contactDps: 26,      // SOUL/sec while overlapping an active boss body
  respawnSoul: 55,     // SOUL restored after dissipating
  respawnInvuln: 1.7,  // seconds of invulnerability after respawning
  fragSoulBonus: 6,    // +max SOUL per reclaimed memory
  fragDmgBonus: 0.9,   // +haunt damage per reclaimed memory
  teleTime: 0.5,       // attack wind-up (telegraph) duration
  // heavy strike (hold HAUNT to charge)
  chargeTime: 0.55,    // hold duration for a full heavy
  heavyMult: 2.6,      // heavy damage multiplier
  heavyCost: 12,       // SOUL spent on a heavy
  heavyCd: 0.5,        // cooldown after a heavy
  heavyKnockback: 280, // how hard a heavy shoves the boss
  // dash (double-tap PHASE)
  dashSpeed: 660,      // burst velocity
  dashCost: 10,        // SOUL spent
  dashCd: 0.55,        // cooldown between dashes
  dashIFrames: 0.26,   // invulnerable window (also the over-speed window)
  dashWindow: 0.28,    // max gap between PHASE taps to trigger a dash
};

// One Guardian per era, keyed by era id. They gate each Anchor and escalate
// in difficulty; THE FORGETTING is the multi-phase final boss.
export const BOSSES = {
  verdant:  { name: 'The Grove-Warden', hp: 80,  size: 44, color: '#8fffb0', speed: 36, fireEvery: 2.1, projSpeed: 150, patterns: ['slam', 'roots', 'spread3'],       wake: 270 },
  stone:    { name: 'The Ember-Smith',  hp: 115, size: 40, color: '#ffd27f', speed: 48, fireEvery: 1.9, projSpeed: 195, patterns: ['aim', 'beam', 'spread3'],         wake: 270 },
  sundering:{ name: 'The Pyre-Wraith',  hp: 150, size: 44, color: '#ff9a5a', speed: 60, fireEvery: 1.7, projSpeed: 205, patterns: ['ring', 'expand', 'aim'],          wake: 290 },
  ruin:     { name: 'The Gravekeeper',  hp: 185, size: 46, color: '#9fe8ff', speed: 56, fireEvery: 1.6, projSpeed: 215, patterns: ['aim', 'homing', 'spread5'],       wake: 290 },
  hollow:   { name: 'THE FORGETTING',   hp: 300, size: 58, color: '#d59bff', speed: 64, fireEvery: 1.35,projSpeed: 230, patterns: ['spread5', 'expand', 'homing', 'ring'], wake: 330, final: true, enrageAt: 0.5 },
};
