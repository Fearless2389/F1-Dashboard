// Default-experience capture: open URL, immediately press play (uses default 8x),
// take screenshots every second for 25 seconds → simulates a full race watch.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_default_${SEASON}_${ROUND}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  await page.goto(`http://localhost:${PORT}/replay/${SEASON}/${ROUND}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const playBtn = page.locator('button:has-text("Play")').first();
  await playBtn.click();
  console.log("→ play @ default speed (should be 8×)");

  for (let i = 1; i <= 25; i++) {
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
      const lap = document.body.innerText.match(/(\d+)\s*\/\s*\d+/);
      const dots = document.querySelectorAll('g[transform^="translate"] circle[fill]:not([fill="none"])').length;
      return { lap: lap ? lap[0] : null, dots };
    });
    process.stdout.write(`t=${String(i).padStart(2,'0')}s lap=${info.lap} dots=${info.dots}  `);
    if (i % 4 === 0) {
      await page.screenshot({ path: join(OUT, `t${String(i).padStart(2,'0')}.png`) });
      process.stdout.write("(shot)\n");
    } else {
      process.stdout.write("\n");
    }
  }

  await browser.close();
  console.log("done", OUT);
})();
