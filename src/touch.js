// touch.js — on-screen controls for phones/tablets. An analog thumbstick (left)
// drives the ghost; action buttons (right + top) map to the same actions as the
// keyboard. Everything routes through input.js, so gameplay code is unchanged.
//
// Uses Pointer Events with per-control pointer capture, so the joystick and a
// button (e.g. drift + haunt) can be held at the same time with separate fingers.

import { pressAction, releaseAction, setTouchAxis } from './input.js';

const MAX_TRAVEL = 48; // px the thumb can move from center == full tilt

function isTouchDevice() {
  return (
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export class TouchControls {
  constructor() {
    this.root = null;
    this.enabled = false;
    if (isTouchDevice()) this._build();
    // Some devices report no coarse pointer until the first touch — reveal then.
    window.addEventListener('touchstart', () => this._reveal(), { once: true });
  }

  _reveal() {
    if (!this.root) this._build();
    document.body.classList.add('touch');
    this.enabled = true;
  }

  _build() {
    if (this.root) return;
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div id="stick" class="ctl-stick">
        <div class="stick-base"></div>
        <div class="stick-thumb"></div>
      </div>
      <div class="ctl-actions">
        <button class="tbtn time" data-tap="past"    aria-label="Earlier era">◀<small>time</small></button>
        <button class="tbtn time" data-tap="future"  aria-label="Later era"><small>time</small>▶</button>
        <button class="tbtn phase" data-hold="phase" aria-label="Phase">PHASE</button>
        <button class="tbtn haunt" data-tap="haunt"  aria-label="Haunt">HAUNT</button>
      </div>
      <div class="ctl-top">
        <button class="tbtn mini" data-tap="map"   aria-label="Map">MAP</button>
        <button class="tbtn mini" data-tap="pause" aria-label="Pause">II</button>
      </div>
    `;
    document.body.appendChild(el);
    this.root = el;

    this._wireStick(el.querySelector('#stick'));
    el.querySelectorAll('[data-tap]').forEach((b) => this._wireTap(b, b.dataset.tap));
    el.querySelectorAll('[data-hold]').forEach((b) => this._wireHold(b, b.dataset.hold));

    if (isTouchDevice()) this._reveal();
  }

  _wireStick(stick) {
    const thumb = stick.querySelector('.stick-thumb');
    let pid = null;
    let cx = 0, cy = 0;

    const start = (e) => {
      pid = e.pointerId;
      stick.setPointerCapture(pid);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      stick.classList.add('active');
      move(e);
    };
    const move = (e) => {
      if (e.pointerId !== pid) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const clamp = Math.min(dist, MAX_TRAVEL);
      const ang = Math.atan2(dy, dx);
      const tx = Math.cos(ang) * clamp;
      const ty = Math.sin(ang) * clamp;
      thumb.style.transform = `translate(${tx}px, ${ty}px)`;
      // analog vector in [-1,1]
      setTouchAxis(tx / MAX_TRAVEL, ty / MAX_TRAVEL, true);
    };
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      thumb.style.transform = 'translate(0,0)';
      stick.classList.remove('active');
      setTouchAxis(0, 0, false);
    };

    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); start(e); });
    stick.addEventListener('pointermove', (e) => { e.preventDefault(); move(e); });
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  // Tap button: fire the action once per press. Release on up so the action can
  // be re-triggered on the next tap (e.g. haunting an Anchor repeatedly).
  _wireTap(btn, action) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('active');
      pressAction(action);
    });
    const up = () => { btn.classList.remove('active'); releaseAction(action); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  // Hold button (phase): stays "down" while pressed.
  _wireHold(btn, action) {
    const down = (e) => { e.preventDefault(); btn.classList.add('active'); pressAction(action); };
    const up = () => { btn.classList.remove('active'); releaseAction(action); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
}
