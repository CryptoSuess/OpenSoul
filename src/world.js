// world.js — the shared terrain. One heightmap; every era paints it and
// populates it differently, but the bones of the land never change. That
// shared geography is what makes timeline-shifting feel like the *same place*.

import { fbm, clamp } from './rng.js';
import { TILE, WORLD_W, WORLD_H, SEED, T, isSolidTile } from './constants.js';

export class World {
  constructor() {
    this.w = WORLD_W;
    this.h = WORLD_H;
    this.height = new Float32Array(WORLD_W * WORLD_H);
    this.tiles = new Uint8Array(WORLD_W * WORLD_H);
    this._generate();
  }

  _generate() {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        // Continent shape: low-frequency fbm + a radial falloff so the world is
        // an island ringed by water (a natural boundary for an open world).
        const cont = fbm(x / 22, y / 22, SEED, 5, 2.0, 0.55);
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const island = clamp(1 - Math.pow(d, 2.0) * 1.5, 0, 1);
        const land = cont * 0.45 + island * 0.72; // >~0.5 == above the waterline

        // Mountains come from a SEPARATE higher-frequency ridge noise so they
        // form scattered ranges rather than one massif piled on the center.
        const ridge = fbm(x / 8 + 100, y / 8 + 100, SEED + 7, 4, 2.0, 0.5);

        const i = y * WORLD_W + x;
        this.height[i] = land;
        this.tiles[i] = this._classify(land, ridge);
      }
    }
  }

  _classify(land, ridge) {
    if (land < 0.42) return T.DEEP;
    if (land < 0.47) return T.WATER;
    if (land < 0.52) return T.SHORE;
    // On land: ridge noise decides where mountains rise.
    if (ridge > 0.70 && land > 0.58) return T.PEAK;
    if (ridge > 0.58) return T.HILL;
    return T.LAND;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H;
  }

  tileAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return T.PEAK; // out-of-world reads as solid
    return this.tiles[ty * WORLD_W + tx];
  }

  heightAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return 1;
    return this.height[ty * WORLD_W + tx];
  }

  // World pixel -> tile.
  tileAtPx(px, py) {
    return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  isSolidPx(px, py) {
    return isSolidTile(this.tileAtPx(px, py));
  }

  isWaterPx(px, py) {
    const t = this.tileAtPx(px, py);
    return t === T.DEEP || t === T.WATER;
  }

  pixelWidth() {
    return WORLD_W * TILE;
  }
  pixelHeight() {
    return WORLD_H * TILE;
  }

  // Find a pleasant spawn near the island center that is solid land.
  findSpawn() {
    const cx = Math.floor(WORLD_W / 2);
    const cy = Math.floor(WORLD_H / 2);
    for (let r = 0; r < 30; r++) {
      for (let a = 0; a < 16; a++) {
        const tx = cx + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const ty = cy + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        const t = this.tileAt(tx, ty);
        if (t === T.LAND || t === T.HILL) {
          return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        }
      }
    }
    return { x: cx * TILE, y: cy * TILE };
  }
}
