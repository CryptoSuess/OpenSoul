// ui.js — HUD + screens rendered as DOM over the canvas. Keeps the canvas loop
// focused on the world while crisp text/UI lives in HTML.

import { ERAS, TOTAL_FRAGMENTS, ANCHORS_TO_WIN } from './constants.js';
import { BOONS } from './boons.js';

export class UI {
  constructor(root) {
    this.root = root;
    this.toastTimer = 0;
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div id="hud">
        <div id="era-banner"><span id="era-name"></span><small id="era-blurb"></small></div>
        <div id="stats">
          <div class="stat"><label>SOUL</label>
            <div class="bar"><div id="energy-fill"></div></div>
          </div>
          <div class="stat-row">
            <span id="frag-count">✦ 0 / ${TOTAL_FRAGMENTS}</span>
            <span id="anchor-count">◆ 0 / ${ANCHORS_TO_WIN}</span>
          </div>
          <div id="boon-tray" aria-label="boons gained"></div>
        </div>
        <div id="timeline"></div>
      </div>
      <div id="boss-bar">
        <span id="boss-name"></span>
        <div class="bbar"><div id="boss-fill"></div></div>
      </div>
      <div id="toast"></div>
      <div id="narrative"><p id="narrative-text"></p></div>
      <div id="ending-line"><p></p></div>
      <div id="hint">Q/E shift · SHIFT phase (2× = dash) · SPACE strike (hold = heavy) · M map</div>
    `;
    this.energyFill = this.root.querySelector('#energy-fill');
    this.eraName = this.root.querySelector('#era-name');
    this.eraBlurb = this.root.querySelector('#era-blurb');
    this.fragCount = this.root.querySelector('#frag-count');
    this.anchorCount = this.root.querySelector('#anchor-count');
    this.boonTray = this.root.querySelector('#boon-tray');
    this.timeline = this.root.querySelector('#timeline');
    this.toast = this.root.querySelector('#toast');
    this.narrative = this.root.querySelector('#narrative');
    this.narrativeText = this.root.querySelector('#narrative-text');
    this.endingLine = this.root.querySelector('#ending-line');
    this.endingLineText = this.root.querySelector('#ending-line p');
    this.bossBar = this.root.querySelector('#boss-bar');
    this.bossName = this.root.querySelector('#boss-name');
    this.bossFill = this.root.querySelector('#boss-fill');
    this.hint = this.root.querySelector('#hint');

    // build timeline pips
    this.timeline.innerHTML = ERAS.map((e, i) =>
      `<div class="pip" data-i="${i}"><span></span><label>${e.name}</label></div>`).join(
      '<div class="pip-link"></div>');
    this.pips = [...this.timeline.querySelectorAll('.pip')];
  }

  setEra(eraIndex) {
    const e = ERAS[eraIndex];
    this.eraName.textContent = e.name;
    this.eraBlurb.textContent = e.blurb;
    this.pips.forEach((p, i) => p.classList.toggle('active', i === eraIndex));
    // flash banner
    const b = this.root.querySelector('#era-banner');
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }

  markAnchor(eraIndex) {
    const pip = this.pips[eraIndex];
    if (pip) pip.classList.add('anchored');
  }

  // Persistent record of the build: one badge per distinct boon, with ×N when
  // stacked. `taken` is the run's list of boon ids (as game.takenBoons). The
  // last badge pulses briefly so a freshly-gained boon reads as "new".
  setBoons(taken = []) {
    if (!this.boonTray) return;
    const order = BOONS.filter((b) => taken.includes(b.id));
    this.boonTray.innerHTML = order.map((b) => {
      const n = taken.filter((t) => t === b.id).length;
      const stack = n > 1 ? `<i>×${n}</i>` : '';
      return `<span class="boon-badge" title="${b.name} — ${b.desc.replace(/"/g, '')}">` +
        `<b>${b.icon}</b>${stack}</span>`;
    }).join('');
    const last = this.boonTray.lastElementChild;
    if (last) { void last.offsetWidth; last.classList.add('new'); }
  }

  // Boss health bar (top-centre) — shown only while a guardian is awake.
  showBoss(name, frac = 1) {
    this.bossName.textContent = name;
    this.bossFill.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
    this.bossBar.classList.add('show');
  }
  updateBoss(frac) {
    this.bossFill.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  hideBoss() {
    this.bossBar.classList.remove('show');
  }

  update(dt, ghost) {
    // measure against the ghost's CURRENT max (grows with Deeper Soul + reclaimed
    // memories), not the base constant — otherwise the bar clips and the "low"
    // warning is wrong once the pool grows.
    this.energyFill.style.width = (ghost.energy / ghost.maxEnergy * 100) + '%';
    this.energyFill.classList.toggle('low', ghost.energy < ghost.maxEnergy * 0.25);
    this.fragCount.textContent = `✦ ${ghost.fragments} / ${TOTAL_FRAGMENTS}`;
    this.anchorCount.textContent = `◆ ${ghost.anchors} / ${ANCHORS_TO_WIN}`;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }

  toastMsg(msg, dur = 2.2) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    this.toastTimer = dur;
  }

  showNarrative(text) {
    this.narrativeText.textContent = text;
    this.narrative.classList.add('show');
    clearTimeout(this._narrTimer);
    this._narrTimer = setTimeout(() => this.narrative.classList.remove('show'), 6000);
  }

  // Cinematic ending line — larger, centered, slow cross-fade. The game's
  // sequencer calls this once per beat; each new line replaces the last.
  showEndingLine(text) {
    // also clear any lingering in-world narrative popup
    this.narrative.classList.remove('show');
    this.endingLine.classList.add('show');
    const p = this.endingLineText;
    p.textContent = text;
    // restart the per-line fade animation (it lives on the <p>)
    p.classList.remove('play');
    void p.offsetWidth;
    p.classList.add('play');
  }
  hideEndingLine() {
    this.endingLine.classList.remove('show');
    this.endingLineText.classList.remove('play');
  }

  setHidden(hidden) {
    this.root.querySelector('#hud').style.opacity = hidden ? '0' : '1';
    this.hint.style.opacity = hidden ? '0' : '0.7';
  }
}

// Full-screen overlays (title / pause / win) as a separate manager.
export class Overlay {
  constructor(el) {
    this.el = el;
  }
  show(html) {
    this.el.innerHTML = html;
    this.el.classList.add('show');
  }
  hide() {
    this.el.classList.remove('show');
    this.el.innerHTML = '';
  }
  get visible() {
    return this.el.classList.contains('show');
  }
}

export function titleHTML() {
  return `
    <div class="panel">
      <h1>OPEN<span>SOUL</span></h1>
      <p class="tag">An open world adrift in time. You are a ghost who forgot how to rest.</p>
      <div class="cols">
        <div>
          <h3>Drift</h3>
          <p><kbd>W A S D</kbd> / arrows to float</p>
          <p><kbd>Shift</kbd> phase through stone & walls</p>
        </div>
        <div>
          <h3>Bend time</h3>
          <p><kbd>Q</kbd> earlier era · <kbd>E</kbd> later era</p>
          <p>The same island across five ages</p>
        </div>
        <div>
          <h3>Fight &amp; remember</h3>
          <p><kbd>Space</kbd> strike — <b>hold</b> for a heavy blow</p>
          <p>Double-tap <kbd>Shift</kbd> to <b>dash</b> through attacks</p>
          <p>Beat each age's <b>◆ Guardian</b> to free its Anchor</p>
        </div>
      </div>
      <button id="start-btn">ENTER THE WORLD</button>
      <p class="fine">SOUL is your life and your power: it fuels phasing/time-shifts and drains when you're struck. Drink wisps to refill, and reclaim <b>✦ memories</b> to grow stronger.</p>
    </div>`;
}

export function pauseHTML() {
  return `
    <div class="panel">
      <h2>Paused</h2>
      <p class="tag">The world holds its breath.</p>
      <button id="resume-btn">RESUME</button>
      <p class="fine"><kbd>P</kbd> or <kbd>Esc</kbd> to resume · <kbd>M</kbd> map · drink wisps to refill SOUL</p>
    </div>`;
}

// Between-fights boon picker. `choices` is an array of {id, name, desc}; each
// card is a button whose id encodes the boon so the delegated click handler in
// game.js can route it (ids like "boon-fierce").
export function boonHTML(choices) {
  return `
    <div class="panel">
      <h2>A piece of you returns</h2>
      <p class="tag">Choose how the memory reshapes you.</p>
      <div class="boons">
        ${choices.map((b, i) => `
          <button class="boon-card" id="boon-${b.id}">
            <span class="boon-key">${i + 1}</span>
            <strong>${b.name}</strong>
            <span class="boon-desc">${b.desc}</span>
          </button>`).join('')}
      </div>
      <p class="fine">Click a boon — or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></p>
    </div>`;
}

export function winHTML(fragments, lore, taken = []) {
  // recap the build you chose this run, mirroring the HUD badges
  const order = BOONS.filter((b) => taken.includes(b.id));
  const recap = order.length ? `
      <div class="boon-recap">${order.map((b) => {
        const n = taken.filter((t) => t === b.id).length;
        return `<span class="boon-badge"><b>${b.icon}</b> ${b.name}${n > 1 ? `<i> ×${n}</i>` : ''}</span>`;
      }).join('')}</div>` : '';
  return `
    <div class="panel win">
      <h1>AT REST</h1>
      <p class="tag">You gathered enough of yourself to forgive the rest.</p>
      <div class="lore">${lore.map(l => `<p>“${l}”</p>`).join('')}</div>
      <p class="score">Memories reclaimed: <b>${fragments} / ${TOTAL_FRAGMENTS}</b></p>
      ${recap}
      <button id="restart-btn">WAKE AGAIN</button>
    </div>`;
}
