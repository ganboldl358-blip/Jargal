// Browser smoke test: opens every page of ORD on the synthetic demo project and
// fails on any uncaught error. Needs Playwright + Chromium.
//
//   python3 -m http.server 8765        (from the repository root)
//   node app/tests/e2e/smoke.mjs [http://127.0.0.1:8765/app/index.html]
//
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
}
const { chromium } = playwright;

const base = process.argv[2] || 'http://127.0.0.1:8765/app/index.html';
const routes = ['#/', '#/projects', '#/holes', '#/hole/DEMO-02/lith', '#/hole/DEMO-02/samples', '#/hole/DEMO-02/assays', '#/hole/DEMO-02/photos', '#/hole/DEMO-02/issues', '#/hole/DEMO-02/header', '#/striplog/DEMO-03', '#/map', '#/3d', '#/sampling', '#/qaqc', '#/intercepts', '#/validation', '#/import', '#/export', '#/codes', '#/history', '#/settings', '#/compare'];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(base);
await page.waitForTimeout(3000);
for (const r of routes) {
  await page.evaluate((h) => (location.hash = h), r);
  await page.waitForTimeout(1200);
  const broken = await page.evaluate(() => document.body.innerText.match(/could not load|Something went wrong|ачаалагдсангүй|алдаа гарлаа/i)?.[0] || null);
  console.log(`${broken ? 'FAIL' : 'ok  '} ${r}${broken ? ' — ' + broken : ''}`);
  if (broken) errors.push(`${r}: ${broken}`);
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('all pages rendered');
