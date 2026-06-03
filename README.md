# OpenSoul

> *An open world adrift in time. You are a ghost who forgot how to rest.*

OpenSoul is a browser-based, top-down **open-world ghost game**. You drift as a
lost soul across a single island — but that island exists in **five different
ages at once**, and you can phase between them at will. The land stays the
same; everything living on it does not. Gather the fragments of your own memory
scattered across time, awaken an Anchor in each age, and finally move on.

No engine, no build step, no dependencies. Pure HTML5 Canvas + vanilla
JavaScript modules. **Just open `index.html`.**

---

## ▶ Play

Because it uses ES modules, browsers need it served over `http://` (opening the
file directly with `file://` will be blocked by CORS). Any static server works:

```bash
# pick one:
python3 -m http.server 8000
npx serve .
```

Then visit **http://localhost:8000** and press **ENTER THE WORLD**.

## 🎮 Controls

### Desktop (keyboard)

| Keys | Action |
|------|--------|
| `W A S D` / Arrow keys | Drift through the world |
| `Shift` (hold) | **Phase** — slip through stone & walls, dodge attacks (i-frames; drains SOUL) |
| `Shift` (double-tap) | **Dash** — a burst of speed with brief invulnerability |
| `Q` | Shift to an **earlier** age |
| `E` | Shift to a **later** age |
| `Space` (tap) | **Strike** a Guardian / scare the living |
| `Space` (hold) | Charge a **heavy strike** (~2.6× damage + knockback) |
| `M` | Toggle the minimap |
| `P` / `Esc` | Pause |
| `♪` (top-right) | Toggle sound |

### Mobile / touch

On phones and tablets, on-screen controls appear automatically:

| Control | Action |
|---------|--------|
| **Thumbstick** (bottom-left) | Drift — analog, so a small tilt drifts slowly |
| **HAUNT** (bottom-right) | Tap to strike; **hold** to charge a heavy strike |
| **PHASE** (hold) | Phase through solid matter; **double-tap** to dash |
| **◀ time / time ▶** | Shift to an earlier / later age |
| **MAP** / **II** (right edge) | Toggle the minimap / pause |

The thumbstick and a button can be held at once (e.g. drift while phasing), and
the layout respects device safe-areas (notches and the home indicator).

## 🌍 The five ages

You travel the same island across the flow of time:

1. **The Verdant Dawn** — wild, green, full of nature spirits, before any names.
2. **The Age of Hearths** — a living village of huts and people you can haunt.
3. **The Sundering** — the night it all burned. Smoke, embers, and fleeing souls.
4. **The Long Quiet** — the present. Cold hearths, mossy ruins, gravestones.
   *(You wake here.)*
5. **The Hollow To-Come** — a corrupted void of shards and hostile wraiths that
   drain your SOUL on contact.

The terrain (coastlines, hills, mountains) is shared across every era, so a
mountain you phase through in the Dawn is the same rock you climb past in the
Quiet. Shifting eras keeps your position but transforms the world around you.

## ⚔️ The Guardians

Each age's **Anchor (◆)** is barred by a **Guardian** — a spectral boss that
must be defeated before the Anchor will awaken. Each has a *signature attack*,
so every fight is its own duel:

1. **The Grove-Warden** — telegraphed slams + **roots** that erupt where you're
   standing. It teaches the dance.
2. **The Ember-Smith** — a sweeping **fire-beam** that rakes across the arena.
3. **The Pyre-Wraith** — fast **expanding ember-rings** you must weave through a
   gap to survive.
4. **The Gravekeeper** — **homing grave-shades** that curve after you.
5. **THE FORGETTING** — the final boss of the Hollow. Take it below half and it
   *enrages*: faster, denser, loosing **two patterns at once** (a bullet-storm).

Combat reuses your verbs — there are no new buttons:

- **HAUNT (`Space`)** is your strike. A quick tap is a light blow; **hold** to
  charge a **heavy strike** (~2.6× damage) that knocks the Guardian back.
- **PHASE (`Shift`)** is your dodge: while intangible you're immune to soul-fire
  and contact. **Double-tap** it to **dash** — a burst of speed with i-frames,
  for slipping through a wall of fire.
- **SOUL is your life *and* your power.** Attacks drain it; if it empties mid-
  fight you *scatter into the dark* and gather again nearby (the Guardian
  recovers too) — so death is a setback, not an ending.

## ✦ How to win

- **SOUL energy** powers phasing, time-shifting and striking, and is your health
  in a fight. Drink the glowing **wisps** to refill it.
- **Memory fragments (✦)** — 15 in all, three per age, some hidden inside solid
  matter you must *phase* into — are now **optional power**: each memory you
  reclaim raises your max SOUL and sharpens your haunt, and adds a line to the
  story you'll relive at the end. Gather them to make the Guardians easier.
- **Defeat the Guardian** in **all five ages** to awaken every Anchor and trigger
  the ending — the memories you gathered play back as you finally come to rest.

## 🧱 How it's built

Small, focused ES modules under `src/`:

| File | Responsibility |
|------|----------------|
| `main.js` | Bootstraps the game, wires up audio unlock, sound toggle & touch controls |
| `game.js` | The conductor: state machine, main loop, interactions, win logic |
| `world.js` | One seeded heightmap (continent + separate ridge noise for mountains) |
| `entities.js` | Per-era population: trees, props, villagers/spirits, wisps, anchors, Guardians, fragments + simple wandering AI |
| `player.js` | The ghost — momentum movement, phasing, energy economy, combat timers |
| `boss.js` | The Guardians: config-driven AI, telegraphed attack patterns & projectile simulation |
| `renderer.js` | All Canvas drawing: terrain, entities, bosses, projectiles, ghost, fog, vignette, hurt/time-shift/ending FX, minimap |
| `particles.js` | Pooled particle system for trails, sparkles & bursts |
| `audio.js` | Procedural WebAudio: per-era ambient drone + blips (no audio files) |
| `ui.js` | DOM HUD, timeline pips, narrative popups, title/pause/win overlays |
| `input.js` | Unified keyboard + touch input: `down` set, edge-triggered presses, analog move axis |
| `touch.js` | On-screen thumbstick + action buttons for phones/tablets (no-op on desktop) |
| `rng.js` | Seedable PRNG + value/fractal noise so the world is deterministic |
| `constants.js` | All tuning + the definition of each era (palette, mood, density) |

Everything is generated from a single master seed (`constants.js → SEED`), so
the world is identical every reload — change the seed for a brand-new island.

## 🛠 Tinkering

- New era? Add an entry to `ERAS` in `src/constants.js` — palette, fog, tree
  density, whether it has a village, spirit counts, etc. The timeline UI and
  audio adapt automatically.
- Harder game? Raise `GHOST.phaseDrain` / `shiftCost` or lower `energyRegen`.
- Bigger world? Bump `WORLD_W` / `WORLD_H`.
- New story? Edit `MEMORY_LINES`.

---

*OpenSoul — drift, remember, and rest.*
