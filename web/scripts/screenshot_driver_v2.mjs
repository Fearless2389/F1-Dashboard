// Smoke check for the driver-page polish:
//  1) VER hero — verify the giant number is centred and fully visible
//  2) ANT (Antonelli) compared with 2018 — verify the rookie empty-state banner
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/driver_shots_v2`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      errors.push(t);
      console.log("CONSOLE.ERR", t);
    }
  });
  page.on("pageerror", err => {
    errors.push(err.message);
    console.log("PAGE.ERR", err.message);
  });

  // 1) VER hero — single-season
  console.log("→ /driver/VER?season=2024");
  await page.goto(`http://localhost:${PORT}/driver/VER?season=2024`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  // Hero crop — first 600px (after header) to inspect the number watermark
  await page.screenshot({ path: join(OUT, "01_VER_hero.png"), clip: { x: 0, y: 80, width: 1600, height: 560 } });

  // 2) Antonelli (rookie) vs 2018 — should show banner + skip race-by-race chart
  console.log("→ /driver/ANT?season=2025&vs=2018");
  await page.goto(`http://localhost:${PORT}/driver/ANT?season=2025&vs=2018`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: join(OUT, "02_ANT_compare_no_data.png"), fullPage: true });

  // 3) Same but Bearman
  console.log("→ /driver/BEA?season=2024&vs=2018");
  await page.goto(`http://localhost:${PORT}/driver/BEA?season=2024&vs=2018`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: join(OUT, "03_BEA_compare_no_data.png"), fullPage: true });

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
