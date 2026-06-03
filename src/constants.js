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

// Story beats — each memory fragment carries a line. There are more lines than
// fragments; we pick them in order of collection so the tale assembles itself.
export const MEMORY_LINES = [
  'A child laughed by the river. The sound has no face anymore.',
  'You carved two names into a standing stone. Only one weathered away.',
  'The hearth-fire smelled of pine. Someone waited up for you.',
  'There was a quarrel. You meant to take it back. You never did.',
  'You planted a tree the day she was born. It outlived the village.',
  'The Long Quiet is not silence. It is everyone listening for you.',
  'You are not lost. You are unfinished.',
  'To move on, you must remember enough to forgive what you forgot.',
];

export const TOTAL_FRAGMENTS = 12; // scattered across all eras
export const ANCHORS_TO_WIN = 4;   // one per era
