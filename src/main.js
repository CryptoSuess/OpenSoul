// main.js — bootstrap.
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const overlay = document.getElementById('overlay');
  const game = new Game(canvas, ui, overlay);

  // Audio + sound toggle button.
  const sndBtn = document.getElementById('sound');
  sndBtn.addEventListener('click', () => {
    game.audio.resume();
    const on = game.audio.toggle();
    sndBtn.textContent = on ? '♪' : '♪̸';
    sndBtn.classList.toggle('off', !on);
  });

  // First gesture anywhere unlocks audio.
  window.addEventListener('pointerdown', () => game.audio.resume(), { once: true });
  window.addEventListener('keydown', () => game.audio.resume(), { once: true });

  game.run();

  // expose for debugging
  window.__opensoul = game;
});
