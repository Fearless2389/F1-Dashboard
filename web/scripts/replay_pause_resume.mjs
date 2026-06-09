// Tests the pause-at-start bug: load → press Play → sample dots over 4s →
// pause → sample → resume → sample. Captures screenshots throughout.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_pause_${SEASON}_${ROUND}`;
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

  async function sample(tag) {
    const info = await page.evaluate(() => {
      const lap = document.body.innerText.match(/(\d+)\s*\/\s*\d+/);
      const dots = Array.from(document.querySelectorAll('g[transform^="translate"]'))
        .filter(g => g.querySelector('circle[fill]:not([fill="none"])'));
      const codes = dots.map(g => g.querySelector("text")?.textContent).filter(Boolean);
      const xs = dots.slice(0, 5).map(g => {
        const m = g.getAttribute("transform")?.match(/translate\(([-\d.]+)/);
        return m ? Math.round(+m[1]) : null;
      });
      return { lap: lap ? lap[0] : null, dotCount: dots.length, codes: codes.slice(0,5), firstFiveX: xs };
    });
    console.log(`[${tag}]`, JSON.stringify(info));
    return info;
  }

  await sample("after-load");
  await page.screenshot({ path: join(OUT, "01_loaded.png") });

  // Press Play at race start
  const playBtn = page.locator('button:has-text("Play")').first();
  await playBtn.click();
  console.log("→ PLAY clicked at race start");
  await page.waitForTimeout(200);
  await sample("just-after-play");
  await page.screenshot({ path: join(OUT, "02_just_after_play.png") });

  // Sample every 1s for 4 seconds — dots should move
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(1000);
    await sample(`+${i}s after play`);
  }
  await page.screenshot({ path: join(OUT, "03_4s_into_play.png") });

  // Click Pause
  const pauseBtn = page.locator('button:has-text("Pause")').first();
  if (await pauseBtn.count()) {
    await pauseBtn.click();
    console.log("→ PAUSE clicked");
    await sample("just-after-pause");
  }
  await page.screenshot({ path: join(OUT, "04_paused.png") });

  await page.waitForTimeout(1500);
  await sample("1.5s after pause (should be stationary)");

  // Click Play again
  const playBtn2 = page.locator('button:has-text("Play")').first();
  await playBtn2.click();
  console.log("→ PLAY again");
  await page.waitForTimeout(200);
  await sample("just-after-resume");
  await page.waitForTimeout(1500);
  await sample("1.5s after resume (should be moving)");
  await page.screenshot({ path: join(OUT, "05_resumed.png") });

  // Check speed buttons present
  const speedBtns = await page.locator('button').evaluateAll(els =>
    els.map(e => e.textContent).filter(t => t && /^\d+×$/.test(t))
  );
  console.log("\nspeed buttons present:", speedBtns);

  await browser.close();
})();
