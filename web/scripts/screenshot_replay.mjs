// Drives the replay route, presses Play, captures a dense sequence of
// screenshots so I can actually inspect how the simulation looks.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";
const URL    = `http://localhost:${PORT}/replay/${SEASON}/${ROUND}`;

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_shots_${SEASON}_${ROUND}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") console.log("CONSOLE.ERR", msg.text());
  });
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  console.log("→", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // Wait for the trajectory to load (path element appears once SVG is parsed)
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "01_loaded.png") });

  // Helper to dump the current dot positions + driver state
  async function dumpDots(label) {
    const info = await page.evaluate(() => {
      const dots = Array.from(document.querySelectorAll("svg g[transform] circle"))
        .filter(c => c.getAttribute("r") && parseFloat(c.getAttribute("r")) >= 5);
      const labels = Array.from(document.querySelectorAll("svg g[transform] text"))
        .map(t => t.textContent);
      const lap = (document.querySelector("[class*='ReplayLapTicker'], [class*='Lap']") || {}).innerText
        ?? document.body.innerText.match(/Lap\s*\d+\s*\/\s*\d+/)?.[0];
      return {
        dotCount: dots.length,
        labels: labels.slice(0, 20),
        lap: lap ?? null,
      };
    });
    console.log(`[${label}]`, JSON.stringify(info));
  }

  await dumpDots("loaded");

  const playBtn = page.locator('button:has-text("Play")').first();
  await playBtn.click();
  console.log("→ play");
  await page.waitForTimeout(300);
  await dumpDots("just-pressed-play");
  await page.screenshot({ path: join(OUT, "02_play_start.png") });

  // Capture every second for 12 seconds
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(OUT, `03_t${String(i).padStart(2,"0")}s.png`) });
    if (i === 4 || i === 8 || i === 12) await dumpDots(`t=${i}s`);
  }

  // Switch to 8x for the second half
  const sp8 = page.locator('button:has-text("8×")').first();
  if (await sp8.count()) {
    await sp8.click();
    console.log("→ speed 8x");
    await dumpDots("speed-8x-just-set");
  }
  for (let i = 13; i <= 18; i++) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(OUT, `04_t${String(i).padStart(2,"0")}s.png`) });
    if (i === 15 || i === 18) await dumpDots(`t=${i}s 8x`);
  }

  await browser.close();
  console.log("done", OUT);
})();
