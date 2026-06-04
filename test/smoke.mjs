// Smoke test: boot the real game and assert the core loop still holds together
// end-to-end — boots clean, fights resolve, boons apply, eras shift, phases
// trigger, and nothing ever goes NaN. Run by CI on every PR. Exits non-zero on
// any failure so a regression blocks the merge.
import { withGame, makeChecker } from './harness.mjs';

const STATE = { TITLE: 0, PLAY: 1, PAUSE: 2, WIN: 3, ENDING: 4, BOON: 5 };
const { check, report } = makeChecker();

const { errors } = await withGame(async (page) => {
  // 1. boots into the title with a full-SOUL ghost
  const boot = await page.evaluate(() => {
    const g = window.__opensoul;
    return { state: g.state, hasGhost: !!g.ghost, energy: g.ghost.energy, max: g.ghost.maxEnergy };
  });
  check('boots into TITLE', boot.state === STATE.TITLE, `state=${boot.state}`);
  check('ghost starts at full SOUL', boot.hasGhost && boot.energy === boot.max);

  // 2. start → PLAY
  const playing = await page.evaluate(() => {
    window.__opensoul.start();
    return window.__opensoul.state;
  });
  check('start() enters PLAY', playing === STATE.PLAY, `state=${playing}`);

  // 3. a guardian can be woken and defeated by striking
  const fight = await page.evaluate(() => {
    const g = window.__opensoul, b = g.boss;
    g._wakeBoss(b);
    const woke = b.state === 'active';
    // stand on the boss, clear cooldowns, and hammer it down. Keep SOUL/invuln
    // topped each swing so the test fight can't dissipate mid-way (we're probing
    // boss defeat here, not the player's SOUL economy).
    g.ghost.x = b.x; g.ghost.y = b.y;
    let guard = 0;
    while (b.hp > 0 && guard++ < 400) {
      g.ghost.hauntCd = 0; g.respawnT = 0; g.ghost.energy = g.ghost.maxEnergy; g.ghost.invuln = 1;
      b.phaseShift = 0; // the rally beat can't elapse in a synchronous loop; skip it here
      g._strike(true);
    }
    return { woke, dead: b.state === 'dead', anchors: g.ghost.anchors, hp: b.hp };
  });
  check('boss wakes', fight.woke);
  check('boss can be defeated', fight.dead && fight.hp <= 0, `hp=${fight.hp}`);
  check('defeat awakens an anchor', fight.anchors === 1, `anchors=${fight.anchors}`);

  // 4. the post-defeat boon is queued and opens once back in play (the bugfix path)
  await page.waitForTimeout(1100); // let the 900ms timer fire, then a frame to open
  const boonState = await page.evaluate(() => {
    const g = window.__opensoul;
    return { state: g.state, pending: g._boonPending, respawnT: g.respawnT, choices: g.boonChoices.length };
  });
  check('post-defeat boon picker opens', boonState.state === STATE.BOON, JSON.stringify(boonState));

  const boon = await page.evaluate(() => {
    const g = window.__opensoul;
    if (g.state !== 5 || !g.boonChoices.length) return { grew: false, state: g.state };
    const before = g.takenBoons.length;
    g.chooseBoon(g.boonChoices[0].id);
    return { grew: g.takenBoons.length === before + 1, state: g.state };
  });
  check('choosing a boon records it and resumes play', boon.grew && boon.state === STATE.PLAY);

  // 5. shifting era changes the timeline index (with SOUL to spend)
  const shift = await page.evaluate(() => {
    const g = window.__opensoul;
    g.ghost.energy = g.ghost.maxEnergy;
    const from = g.eraIndex;
    g.shiftEra(1);
    return { from, to: g.eraIndex };
  });
  check('shiftEra moves through time', shift.to !== shift.from, `${shift.from}→${shift.to}`);

  // 6. every guardian rallies at half health (mid-boss phase) — test a NON-final one
  const phase = await page.evaluate(() => {
    const g = window.__opensoul;
    g.eraIndex = g.layers.findIndex((l) => l.boss && !l.boss.final);
    const b = g.boss;
    g._wakeBoss(b); b.hp = b.maxHp * 0.5 + 1; b.phaseShift = 0;
    g.ghost.x = b.x; g.ghost.y = b.y; g.ghost.hauntCd = 0; g.respawnT = 0;
    g.ghost.energy = g.ghost.maxEnergy;
    g._strike(false); // crosses 50%
    return { final: !!b.final, enraged: b.enraged, beat: b.phaseShift > 0 };
  });
  check('non-final guardian rallies at 50%', !phase.final && phase.enraged && phase.beat);

  // 7. nothing went NaN through all of that
  const finite = await page.evaluate(() => {
    const g = window.__opensoul.ghost;
    return [g.x, g.y, g.vx, g.vy, g.energy, g.maxEnergy].every(Number.isFinite);
  });
  check('ghost state stays finite (no NaN)', finite);
}, { start: false });

check('no console / page errors', errors.length === 0, errors.join(' | '));

const failed = report();
process.exit(failed > 0 ? 1 : 0);
