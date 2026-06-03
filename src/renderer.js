// renderer.js — all drawing. Top-down tiles + vector entities, with per-era
// color grading, fog, vignette and a ghostly bloom. Only visible tiles are
// drawn so large worlds stay smooth.

import { TILE, WORLD_W, WORLD_H, T, ERAS } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.shake = 0;
    // cached minimap terrain (rebuilt only when the era changes — see drawMinimap)
    this._mmCanvas = null;
    this._mmCtx = null;
    this._mmEra = -1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = this.vw * dpr;
    this.canvas.height = this.vh * dpr;
    this.canvas.style.width = this.vw + 'px';
    this.canvas.style.height = this.vh + 'px';
    this.dpr = dpr;
  }

  centerOn(x, y, world) {
    let cx = x - this.vw / 2;
    let cy = y - this.vh / 2;
    cx = Math.max(0, Math.min(cx, world.pixelWidth() - this.vw));
    cy = Math.max(0, Math.min(cy, world.pixelHeight() - this.vh));
    // worlds smaller than viewport: center them
    if (world.pixelWidth() < this.vw) cx = (world.pixelWidth() - this.vw) / 2;
    if (world.pixelHeight() < this.vh) cy = (world.pixelHeight() - this.vh) / 2;
    this.cam.x = cx;
    this.cam.y = cy;
  }

  addShake(a) {
    this.shake = Math.min(this.shake + a, 18);
  }

  begin(eraIndex, time) {
    const ctx = this.ctx;
    this.time = time; // available to draw helpers (e.g. ember flicker)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const era = ERAS[eraIndex];
    ctx.fillStyle = era.sky;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // camera shake decay
    if (this.shake > 0) {
      this._sx = (Math.random() - 0.5) * this.shake;
      this._sy = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.86;
      if (this.shake < 0.3) this.shake = 0;
    } else {
      this._sx = this._sy = 0;
    }
  }

  // Draw terrain for the given era.
  drawWorld(world, eraIndex, time) {
    const ctx = this.ctx;
    const era = ERAS[eraIndex];
    const pal = era.palette;
    const camx = this.cam.x + this._sx;
    const camy = this.cam.y + this._sy;

    const x0 = Math.max(0, Math.floor(camx / TILE));
    const y0 = Math.max(0, Math.floor(camy / TILE));
    const x1 = Math.min(WORLD_W, Math.ceil((camx + this.vw) / TILE) + 1);
    const y1 = Math.min(WORLD_H, Math.ceil((camy + this.vh) / TILE) + 1);

    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const t = world.tileAt(tx, ty);
        const h = world.heightAt(tx, ty);
        let col = pal.land;
        if (t === T.DEEP) col = pal.deep;
        else if (t === T.WATER) col = pal.water;
        else if (t === T.SHORE) col = pal.shore;
        else if (t === T.HILL) col = pal.hill;
        else if (t === T.PEAK) col = pal.solid; // impassable rock — distinct color
        else {
          // alternate land shades using height for texture
          col = (Math.floor(h * 40) & 1) ? pal.land : pal.land2;
        }
        const sx = Math.floor(tx * TILE - camx);
        const sy = Math.floor(ty * TILE - camy);
        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, TILE + 1, TILE + 1);

        // PEAK (impassable): cheap raised-block edges so it clearly reads as a wall
        if (t === T.PEAK) {
          ctx.fillStyle = pal.solidHi;
          ctx.fillRect(sx, sy, TILE + 1, 3);
          ctx.fillStyle = pal.solidLo;
          ctx.fillRect(sx, sy + TILE - 2, TILE + 1, 3);
        }

        // animated water shimmer
        if (t === T.DEEP || t === T.WATER) {
          const sh = Math.sin((tx + ty) * 0.6 + time * 1.6) * 0.5 + 0.5;
          ctx.globalAlpha = 0.10 + sh * 0.10;
          ctx.fillStyle = era.accent;
          ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  drawEntities(layer, fragments, eraIndex, time, player) {
    const ctx = this.ctx;
    const era = ERAS[eraIndex];
    const cam = { x: this.cam.x + this._sx, y: this.cam.y + this._sy };
    const onScreen = (x, y, m = 60) =>
      x - cam.x > -m && x - cam.x < this.vw + m &&
      y - cam.y > -m && y - cam.y < this.vh + m;

    // Props (behind trees/spirits) — drawn back-to-front by y handled loosely.
    for (const p of layer.props) {
      if (!onScreen(p.x, p.y)) continue;
      this._drawProp(p, cam, era);
    }

    // Trees
    for (const tr of layer.trees) {
      if (!onScreen(tr.x, tr.y)) continue;
      this._drawTree(tr, cam, time);
    }

    // Wisps (energy pickups) with bloom
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of layer.wisps) {
      if (w.gone || !onScreen(w.x, w.y)) continue;
      const sx = w.x - cam.x;
      const sy = w.y - cam.y + Math.sin(time * 2 + w.phase) * 3;
      const pulse = 0.6 + Math.sin(time * 4 + w.phase) * 0.4;
      this._glow(sx, sy, 16 * pulse, era.accent, 0.5);
      ctx.fillStyle = era.accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Spirits / villagers / wraiths
    for (const sp of layer.spirits) {
      if (!onScreen(sp.x, sp.y)) continue;
      this._drawSpirit(sp, cam, time);
    }

    // Fragments for this era only
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of fragments) {
      if (f.collected || f.era !== eraIndex || !onScreen(f.x, f.y)) continue;
      const sx = f.x - cam.x;
      const sy = f.y - cam.y + Math.sin(time * 1.5 + f.phase) * 4;
      const pulse = 0.7 + Math.sin(time * 3 + f.phase) * 0.3;
      this._glow(sx, sy, 26 * pulse, '#fff2c0', 0.6);
      // diamond shard
      ctx.fillStyle = '#fff7d6';
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(time + f.phase);
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Anchor
    if (layer.anchor) this._drawAnchor(layer.anchor, cam, time);
  }

  _drawTree(tr, cam, time) {
    const ctx = this.ctx;
    const sx = tr.x - cam.x;
    const sy = tr.y - cam.y;
    const s = tr.scale;
    const sway = Math.sin(time * 1.3 + tr.sway) * 2 * s;
    // trunk shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 10 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // trunk
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(sx - 2 * s, sy - 10 * s, 4 * s, 12 * s);
    // canopy
    ctx.fillStyle = tr.color;
    ctx.beginPath();
    ctx.ellipse(sx + sway, sy - 16 * s, 13 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(sx + sway - 4 * s, sy - 20 * s, 6 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawProp(p, cam, era) {
    const ctx = this.ctx;
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.type === 'stone') {
      ctx.fillStyle = '#7c8a72';
      ctx.fillRect(sx - 6, sy - 22, 12, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx - 6, sy - 22, 4, 24);
    } else if (p.type === 'grave') {
      ctx.fillStyle = '#6b7078';
      ctx.beginPath();
      ctx.moveTo(sx - 7, sy);
      ctx.lineTo(sx - 7, sy - 14);
      ctx.arc(sx, sy - 14, 7, Math.PI, 0);
      ctx.lineTo(sx + 7, sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.moveTo(sx, sy - 18); ctx.lineTo(sx, sy - 8);
      ctx.moveTo(sx - 4, sy - 14); ctx.lineTo(sx + 4, sy - 14); ctx.stroke();
    } else if (p.type === 'shard') {
      ctx.fillStyle = era.peak || '#2e2444';
      ctx.save();
      ctx.translate(sx, sy - 12);
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(7, 6); ctx.lineTo(-6, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = era.accent;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-1, -16, 2, 22);
      ctx.restore();
    } else if (p.type === 'hut') {
      ctx.fillStyle = '#7a5536';
      ctx.fillRect(sx - 13, sy - 14, 26, 18);
      ctx.fillStyle = '#caa26a';
      ctx.beginPath();
      ctx.moveTo(sx - 16, sy - 12);
      ctx.lineTo(sx, sy - 28);
      ctx.lineTo(sx + 16, sy - 12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1c10';
      ctx.fillRect(sx - 4, sy - 8, 8, 12);
    } else if (p.type === 'ruinwall') {
      ctx.fillStyle = '#4a4f48';
      ctx.fillRect(sx - 13, sy - 12, 9, 14);
      ctx.fillRect(sx + 2, sy - 16, 9, 18);
      ctx.fillStyle = 'rgba(60,110,70,0.5)'; // moss
      ctx.fillRect(sx - 13, sy - 4, 9, 6);
      ctx.fillRect(sx + 2, sy - 4, 9, 6);
    } else if (p.type === 'ember') {
      // charred, broken rubble with a smouldering glow
      ctx.fillStyle = '#2a1c14';
      ctx.fillRect(sx - 10, sy - 8, 11, 10);
      ctx.fillRect(sx + 1, sy - 12, 9, 14);
      // glowing embers
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flick = 0.55 + Math.sin(this.time * 9 + p.x) * 0.25;
      this._glow(sx, sy - 4, 12 * flick, '#ff7a2a', 0.5);
      ctx.fillStyle = '#ffb15a';
      ctx.globalAlpha = flick;
      ctx.fillRect(sx - 7, sy - 2, 3, 3);
      ctx.fillRect(sx + 4, sy - 6, 2, 2);
      ctx.restore();
    }
  }

  _drawSpirit(sp, cam, time) {
    const ctx = this.ctx;
    const sx = sp.x - cam.x;
    const sy = sp.y - cam.y + Math.sin(time * 2 + sp.phase) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 10, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (sp.villager) {
      // little robed person
      ctx.fillStyle = sp.scared > 0 ? '#ffd0d0' : '#caa06a';
      ctx.beginPath();
      ctx.moveTo(sx - 7, sy + 8);
      ctx.lineTo(sx - 4, sy - 6);
      ctx.lineTo(sx + 4, sy - 6);
      ctx.lineTo(sx + 7, sy + 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0d6a8';
      ctx.beginPath(); ctx.arc(sx, sy - 9, 4, 0, Math.PI * 2); ctx.fill();
      if (sp.scared > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = '12px serif';
        ctx.fillText('!', sx + 6, sy - 12);
      }
    } else {
      // floating spirit / wraith
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this._glow(sx, sy, sp.hostile ? 16 : 12, sp.color, 0.4);
      ctx.restore();
      ctx.fillStyle = sp.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(sx, sy - 2, 6, Math.PI, 0);
      const wig = Math.sin(time * 6 + sp.phase);
      ctx.lineTo(sx + 6, sy + 6 + wig);
      ctx.lineTo(sx + 2, sy + 3);
      ctx.lineTo(sx - 2, sy + 6 - wig);
      ctx.lineTo(sx - 6, sy + 3);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath(); ctx.arc(sx - 2, sy - 2, 1.4, 0, 6.28);
      ctx.arc(sx + 2, sy - 2, 1.4, 0, 6.28); ctx.fill();
    }
  }

  _drawAnchor(a, cam, time) {
    const ctx = this.ctx;
    const sx = a.x - cam.x;
    const sy = a.y - cam.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const col = a.active ? '#fff2c0' : '#88aaff';
    const ring = a.active ? 40 : 24 + Math.sin(time * 2) * 4;
    this._glow(sx, sy, ring, col, a.active ? 0.8 : 0.4);
    ctx.restore();
    // pedestal
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(sx - 12, sy - 6, 24, 14);
    // floating crystal
    const fy = sy - 24 + Math.sin(time * 1.5) * 4;
    ctx.save();
    ctx.translate(sx, fy);
    ctx.rotate(time * (a.active ? 1.2 : 0.4));
    ctx.fillStyle = a.active ? '#fff7d6' : '#9fc0ff';
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // charge ring
    if (!a.active && a.charge > 0) {
      ctx.strokeStyle = '#fff2c0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy - 2, 30, -Math.PI / 2, -Math.PI / 2 + a.charge * Math.PI * 2);
      ctx.stroke();
    }
  }

  // A guardian boss: a large, menacing spectral form that flares as it winds
  // up an attack and whitens when struck.
  drawBoss(b, time) {
    const ctx = this.ctx;
    const cam = { x: this.cam.x + this._sx, y: this.cam.y + this._sy };
    const sx = b.x - cam.x;
    const sy = b.y - cam.y + Math.sin(b.bob * 1.5) * 4;
    const dormant = b.state === 'dormant';
    const tele = b.telegraphing ? Math.min(1, b.teleT / 0.5) : 0;
    const R = b.size * (dormant ? 0.8 : 1) * (1 + tele * 0.18);

    // outer aura (telegraph flares it brighter/larger)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this._glow(sx, sy, R * (1.6 + tele * 0.8), b.color, dormant ? 0.25 : 0.45 + tele * 0.4);
    if (b.enraged) this._glow(sx, sy, R * 2.2, '#ff5a7a', 0.3);
    ctx.restore();

    // body
    ctx.save();
    ctx.translate(sx, sy);
    // drifting tendrils
    ctx.globalAlpha = dormant ? 0.5 : 0.85;
    ctx.fillStyle = this._withAlpha(b.color, 0.5);
    const tn = 7;
    for (let i = 0; i < tn; i++) {
      const a = (i / tn) * 6.2832 + time * 0.6;
      const len = R * (0.9 + Math.sin(time * 3 + i) * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len + R * 0.4);
      ctx.lineTo(Math.cos(a + 0.5) * len * 0.7, Math.sin(a + 0.5) * len * 0.7 + R * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    // core orb
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    core.addColorStop(0, b.hitFlash > 0 ? '#ffffff' : this._withAlpha(b.color, 0.95));
    core.addColorStop(1, this._withAlpha(b.color, 0.15));
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = b.enraged ? '#ff3a5a' : '#1a1020';
    const eyes = b.final ? 3 : 2;
    for (let i = 0; i < eyes; i++) {
      const ex = (i - (eyes - 1) / 2) * R * 0.34;
      ctx.beginPath();
      ctx.ellipse(ex, -R * 0.12, R * 0.09, R * 0.16, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  // Boss soul-fire hazards — bolts, homing shades, sweeping beams, expanding
  // rings and erupting ground-zones.
  drawHazards(arr, time) {
    if (!arr || !arr.length) return;
    const ctx = this.ctx;
    const cam = { x: this.cam.x + this._sx, y: this.cam.y + this._sy };
    for (const p of arr) {
      const sx = p.x - cam.x;
      const sy = p.y - cam.y;
      if (p.kind === 'zone') {
        ctx.save();
        if (!p.done) {
          // telegraph: outline + a filling glow that completes as it erupts
          const fill = 1 - Math.max(0, p.warn) / 0.75;
          ctx.strokeStyle = this._withAlpha(p.color, 0.85);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, 6.2832); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          this._glow(sx, sy, p.r * fill, p.color, 0.45);
        } else {
          // detonation flash
          const a = Math.max(0, p.flash) / 0.22;
          ctx.globalCompositeOperation = 'lighter';
          this._glow(sx, sy, p.r * 1.25, '#ffffff', a * 0.8);
          this._glow(sx, sy, p.r, p.color, a * 0.9);
        }
        ctx.restore();
      } else if (p.kind === 'beam') {
        const ex = sx + Math.cos(p.ang) * p.len;
        const ey = sy + Math.sin(p.ang) * p.len;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = this._withAlpha(p.color, 0.8);
        ctx.lineWidth = p.width;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = p.width * 0.4;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = this._withAlpha(p.color, 0.8);
        ctx.lineWidth = p.band * 1.7;
        ctx.beginPath(); // the arc, leaving the gap open to weave through
        ctx.arc(sx, sy, p.r, p.gapC + p.gapHalf, p.gapC - p.gapHalf + 6.2832);
        ctx.stroke();
        ctx.restore();
      } else {
        // bolt / homing — glowing orb
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this._glow(sx, sy, p.r * 2.6, p.color, 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(sx, sy, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // Charge ring around the ghost while a heavy strike is winding up.
  drawCharge(ghost, charge, time) {
    if (charge <= 0) return;
    const ctx = this.ctx;
    const sx = ghost.x - (this.cam.x + this._sx);
    const sy = ghost.y - (this.cam.y + this._sy) + Math.sin(ghost.bob) * 3;
    const full = charge >= 1;
    const col = full ? '#ffec9a' : '#bfe0ff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (full) this._glow(sx, sy, 26 + Math.sin(time * 20) * 3, col, 0.5);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawGhost(p, time, accent) {
    const ctx = this.ctx;
    const sx = p.x - (this.cam.x + this._sx);
    const sy = p.y - (this.cam.y + this._sy) + Math.sin(p.bob) * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this._glow(sx, sy, p.phasing ? 34 : 22, p.phasing ? '#bfe0ff' : accent, p.phasing ? 0.6 : 0.4);
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(p.facing, 1);
    ctx.globalAlpha = p.phasing ? 0.6 : 0.92;
    // body
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(0, -4, 11, Math.PI, 0);
    // wavy tail
    const n = 4;
    ctx.lineTo(11, 8);
    for (let i = 0; i < n; i++) {
      const fx = 11 - (i + 0.5) * (22 / n);
      const fy = 8 + Math.sin(time * 7 + i) * 3;
      ctx.lineTo(fx, fy + 4);
      ctx.lineTo(11 - (i + 1) * (22 / n), 8);
    }
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#243';
    ctx.beginPath();
    ctx.arc(-3, -6, 1.8, 0, 6.28);
    ctx.arc(4, -6, 1.8, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }

  _glow(x, y, r, color, alpha) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, this._withAlpha(color, alpha));
    g.addColorStop(1, this._withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _withAlpha(hex, a) {
    let v = hex.replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2]; // #rgb -> #rrggbb
    const r = parseInt(v.substr(0, 2), 16);
    const g = parseInt(v.substr(2, 2), 16);
    const b = parseInt(v.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Fog + vignette + optional time-shift ripple + ending wash + hurt flash.
  postFx(eraIndex, ghost, shiftFx, endingFx = 0, hurtFx = 0) {
    const ctx = this.ctx;
    const era = ERAS[eraIndex];
    // colored fog (fades away as the ending light takes over)
    ctx.save();
    ctx.fillStyle = `rgba(${era.fogColor},${era.fogStrength * (1 - endingFx)})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();

    // vignette focused on the ghost
    const cx = ghost.x - (this.cam.x + this._sx);
    const cy = ghost.y - (this.cam.y + this._sy);
    const maxR = Math.hypot(this.vw, this.vh) * 0.6;
    const g = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${era.vignette * (1 - endingFx)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // ending: a warm light rises from the ghost and floods the world to white
    if (endingFx > 0) {
      ctx.save();
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * (1.1 - endingFx * 0.4));
      const core = Math.min(1, endingFx * 1.2);
      eg.addColorStop(0, `rgba(255,248,224,${core})`);
      eg.addColorStop(0.6, `rgba(255,236,200,${endingFx * 0.6})`);
      eg.addColorStop(1, `rgba(255,230,190,0)`);
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, this.vw, this.vh);
      // final flat wash to pure light at the very end
      if (endingFx > 0.7) {
        ctx.fillStyle = `rgba(255,250,238,${(endingFx - 0.7) / 0.3})`;
        ctx.fillRect(0, 0, this.vw, this.vh);
      }
      ctx.restore();
    }

    // hurt flash — red pulse from the edges when SOUL is struck
    if (hurtFx > 0) {
      const hg = ctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, maxR);
      hg.addColorStop(0, 'rgba(255,30,50,0)');
      hg.addColorStop(1, `rgba(220,20,40,${hurtFx * 0.5})`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }

    // time-shift ripple flash
    if (shiftFx > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = (1 - shiftFx) * Math.hypot(this.vw, this.vh);
      const rg = ctx.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0)');
      rg.addColorStop(0.85, `rgba(200,225,255,${shiftFx * 0.5})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.fillStyle = `rgba(220,235,255,${shiftFx * 0.18})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
    }
  }

  // Force the cached minimap terrain to rebuild (e.g. after a new world).
  invalidateMinimap() {
    this._mmEra = -1;
  }

  // Bake the static per-era terrain into a 1px-per-tile offscreen canvas so the
  // minimap is a single scaled blit per frame instead of 9k fillRects.
  _buildMinimapTerrain(world, eraIndex) {
    if (!this._mmCanvas) {
      this._mmCanvas = document.createElement('canvas');
      this._mmCanvas.width = WORLD_W;
      this._mmCanvas.height = WORLD_H;
      this._mmCtx = this._mmCanvas.getContext('2d');
    }
    const mc = this._mmCtx;
    const pal = ERAS[eraIndex].palette;
    for (let ty = 0; ty < WORLD_H; ty += 1) {
      for (let tx = 0; tx < WORLD_W; tx += 1) {
        const t = world.tileAt(tx, ty);
        let c;
        if (t === T.DEEP || t === T.WATER) c = pal.water;
        else if (t === T.PEAK) c = pal.solid; // impassable rock — distinct on the map too
        else if (t === T.SHORE) c = pal.shore;
        else c = pal.land;
        mc.fillStyle = c;
        mc.fillRect(tx, ty, 1, 1);
      }
    }
    this._mmEra = eraIndex;
  }

  drawMinimap(world, layer, fragments, ghost, eraIndex) {
    const ctx = this.ctx;
    const size = 150;
    const pad = 16;
    const ox = this.vw - size - pad;
    const oy = pad;
    const sc = size / WORLD_W;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(8,10,16,0.7)';
    ctx.fillRect(ox - 4, oy - 4, size + 8, size + 8);
    // terrain — cached offscreen, rebuilt only when the era changes
    if (this._mmEra !== eraIndex) this._buildMinimapTerrain(world, eraIndex);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._mmCanvas, 0, 0, WORLD_W, WORLD_H, ox, oy, size, size);
    ctx.imageSmoothingEnabled = true;
    // anchor
    if (layer.anchor) {
      ctx.fillStyle = layer.anchor.active ? '#fff2c0' : '#88aaff';
      ctx.fillRect(ox + (layer.anchor.x / TILE) * sc - 2, oy + (layer.anchor.y / TILE) * sc - 2, 4, 4);
    }
    // fragments in this era
    ctx.fillStyle = '#fff7d6';
    for (const f of fragments) {
      if (f.collected || f.era !== eraIndex) continue;
      ctx.fillRect(ox + (f.x / TILE) * sc - 1, oy + (f.y / TILE) * sc - 1, 2.5, 2.5);
    }
    // ghost
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(ox + (ghost.x / TILE) * sc, oy + (ghost.y / TILE) * sc, 2.5, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }
}
