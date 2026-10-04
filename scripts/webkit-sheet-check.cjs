// Measures the real bottom-sheet DOM (dumped by e2e/mobile.spec.ts into
// test-results/sheet-dom/) in one WebKit build. Run inside the official
// Playwright image by scripts/web-e2e.sh (E2E_WEBKIT_LEGACY=1). Exit 1 when
// the scrollable body is collapsed or an option is covered / off screen.
const fs = require('node:fs');
const { webkit } = require('playwright');

const VIEWPORTS = [
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [428, 746],
  [428, 926],
  [430, 932],
];

(async () => {
  const files = fs.readdirSync('/work').filter((f) => f.endsWith('.html'));
  if (!files.length) throw new Error('no sheet-dom/*.html');
  const browser = await webkit.launch();
  let failed = 0;
  let checks = 0;
  for (const f of files) {
    for (const [width, height] of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      await page.goto(`file:///work/${f}`);
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const d = document.querySelector('dialog');
        const body = d.querySelector('[data-sheet-body]');
        const box = (e) => e.getBoundingClientRect();
        const covered = [...body.querySelectorAll('button')].map((o) => {
          const b = box(o);
          return [0.2, 0.5, 0.8].every((k) => {
            const y = b.top + b.height * k;
            const hit =
              y >= 0 &&
              y < innerHeight &&
              document.elementFromPoint(b.left + b.width / 2, y);
            return hit && o.contains(hit);
          });
        });
        return {
          sheet: Math.round(box(d).height),
          bodyClient: body.clientHeight,
          bodyScroll: body.scrollHeight,
          options: covered,
        };
      });
      const fits = r.bodyClient >= r.bodyScroll - 1;
      // Too short to fit: the body must scroll instead (options reachable by scrolling).
      const ok =
        r.options.length >= 2 &&
        (fits ? r.options.every(Boolean) : r.bodyClient > 0);
      checks++;
      if (!ok) {
        failed++;
        console.log(
          `FAIL webkit ${browser.version()} ${f} ${width}x${height} sheet=${r.sheet} body=${r.bodyClient}/${r.bodyScroll} options=${r.options.join(',')}`,
        );
      }
      await page.close();
    }
  }
  console.log(
    `${failed ? 'FAIL' : 'PASS'} webkit ${browser.version()}: ${checks - failed}/${checks} (sheet DOM files × viewports)`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
