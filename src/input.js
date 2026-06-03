// input.js — keyboard state + edge-triggered "pressed this frame" events.

const down = new Set();
const pressedQueue = [];

const MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'phase', ShiftRight: 'phase',
  KeyQ: 'past', KeyE: 'future',
  Space: 'haunt',
  KeyM: 'map',
  KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm',
};

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    const a = MAP[e.code];
    if (!a) return;
    // Prevent scrolling / default browser behavior for game keys.
    e.preventDefault();
    if (!down.has(a)) pressedQueue.push(a);
    down.add(a);
  });
  target.addEventListener('keyup', (e) => {
    const a = MAP[e.code];
    if (a) down.delete(a);
  });
  // Lose focus -> release everything so the ghost doesn't drift forever.
  window.addEventListener('blur', () => down.clear());
}

export function isDown(action) {
  return down.has(action);
}

// Returns true once per physical key press of `action`.
export function consumePressed(action) {
  const i = pressedQueue.indexOf(action);
  if (i === -1) return false;
  pressedQueue.splice(i, 1);
  return true;
}

// Movement axis as a normalized vector.
export function moveAxis() {
  let x = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  let y = (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0);
  if (x !== 0 && y !== 0) {
    const inv = 1 / Math.sqrt(2);
    x *= inv;
    y *= inv;
  }
  return { x, y };
}

export function flushPressed() {
  pressedQueue.length = 0;
}
