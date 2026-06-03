// input.js — unified input state for keyboard AND touch. Both feed the same
// `down` set + edge-triggered `pressedQueue`, so the rest of the game doesn't
// care how an action was triggered. Touch also supplies an analog move vector.

const down = new Set();
const pressedQueue = [];

// Analog stick from the touch joystick. When active it overrides the digital
// (keyboard) movement axis. x/y are in [-1, 1].
const touch = { x: 0, y: 0, active: false };

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

// Core press/release — shared by keyboard handlers and the touch UI.
export function pressAction(action) {
  if (!action) return;
  if (!down.has(action)) pressedQueue.push(action);
  down.add(action);
}
export function releaseAction(action) {
  if (action) down.delete(action);
}

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    const a = MAP[e.code];
    if (!a) return;
    e.preventDefault(); // stop scrolling / default browser behavior
    pressAction(a);
  });
  target.addEventListener('keyup', (e) => {
    releaseAction(MAP[e.code]);
  });
  // Lose focus -> release everything so the ghost doesn't drift forever.
  window.addEventListener('blur', () => {
    down.clear();
    touch.active = false; touch.x = touch.y = 0;
  });
}

// Called by the touch joystick. (x, y) already clamped to the unit circle.
export function setTouchAxis(x, y, active) {
  touch.x = x;
  touch.y = y;
  touch.active = !!active;
}

export function isDown(action) {
  return down.has(action);
}

// Returns true once per discrete press of `action` (keyboard or touch tap).
export function consumePressed(action) {
  const i = pressedQueue.indexOf(action);
  if (i === -1) return false;
  pressedQueue.splice(i, 1);
  return true;
}

// Movement axis. Touch joystick (analog) wins when engaged; otherwise the
// keyboard provides a normalized digital vector.
export function moveAxis() {
  if (touch.active && (touch.x !== 0 || touch.y !== 0)) {
    return { x: touch.x, y: touch.y };
  }
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
