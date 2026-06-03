// particles.js — a tiny pooled particle system for ghost trails, wisp sparkles,
// haunt bursts and ambient drift. Kept allocation-light for smooth 60fps.

export class Particles {
  constructor(max = 1200) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.r = new Uint8Array(max);
    this.g = new Uint8Array(max);
    this.b = new Uint8Array(max);
    this.alive = new Uint8Array(max);
    this.cursor = 0;
  }

  spawn(x, y, vx, vy, life, size, color) {
    // color is [r,g,b]
    let i = this.cursor;
    // find a free slot (linear probe, cheap at our scale)
    for (let k = 0; k < this.max; k++) {
      const j = (i + k) % this.max;
      if (!this.alive[j]) {
        i = j;
        break;
      }
    }
    this.cursor = (i + 1) % this.max;
    this.alive[i] = 1;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    this.r[i] = color[0]; this.g[i] = color[1]; this.b[i] = color[2];
  }

  burst(x, y, n, color, opts = {}) {
    const spd = opts.speed ?? 90;
    const life = opts.life ?? 0.8;
    const size = opts.size ?? 3;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.7);
      this.spawn(
        x, y,
        Math.cos(a) * s, Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        color
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        continue;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.vx[i] *= 1 - 1.6 * dt;
      this.vy[i] *= 1 - 1.6 * dt;
    }
  }

  draw(ctx, cam) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const t = this.life[i] / this.maxLife[i];
      const sx = this.x[i] - cam.x;
      const sy = this.y[i] - cam.y;
      const s = this.size[i] * (0.4 + t * 0.6);
      ctx.globalAlpha = Math.min(1, t) * 0.9;
      ctx.fillStyle = `rgb(${this.r[i]},${this.g[i]},${this.b[i]})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
