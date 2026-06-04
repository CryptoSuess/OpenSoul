// Boots OpenSoul in a real headless browser (it needs Canvas, Web Audio, rAF and
// the DOM, so a real browser is the honest way to test it) and hands your
// callback the Playwright `page` plus a live array of any console/page errors.
// Shared by smoke.mjs (invariants) and sim.mjs (balance metrics).
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

export async function withGame(fn, { start = true } = {}) {
  const server = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(server.url, { waitUntil: 'networkidle' });
    // wait for the game to construct and publish itself
    await page.waitForFunction(() => !!window.__opensoul, null, { timeout: 8000 });
    if (start) {
      await page.evaluate(() => window.__opensoul.start());
      await page.waitForTimeout(120);
    }
    const result = await fn(page, errors);
    return { result, errors };
  } finally {
    await browser.close();
    server.close();
  }
}

// Tiny assertion collector so test files read as a checklist and exit non-zero
// (failing CI) on the first broken invariant while still reporting them all.
export function makeChecker() {
  const rows = [];
  const check = (name, ok, detail = '') => { rows.push({ name, ok: !!ok, detail }); };
  const report = () => {
    let failed = 0;
    for (const r of rows) {
      console.log(`${r.ok ? '  PASS' : '  FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
      if (!r.ok) failed++;
    }
    console.log(`\n${rows.length - failed}/${rows.length} checks passed`);
    return failed;
  };
  return { check, report };
}
