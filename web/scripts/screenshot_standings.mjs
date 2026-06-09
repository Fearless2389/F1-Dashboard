// Smoke check for the Standings polish — visits /standings?season=2025
// (so the progression chart + position deltas have something to show)
// and screenshots the full page.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const SEASON = process.argv[3] ?? "2025";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/standings_shots`;
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

  console.log("→ /standings");
  await page.goto(`http://localhost:${PORT}/standings?season=${SEASON}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(20000);  // give recharts + paginated Jolpica time to settle
  await page.screenshot({ path: join(OUT, "01_loaded.png"), fullPage: true });

  // Click the Ferrari constructors row to engage the team filter
  const ferrariBtn = page.locator('button[title*="Ferrari"]').first();
  if (await ferrariBtn.count()) {
    await ferrariBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "02_filtered_ferrari.png"), fullPage: true });
    console.log("→ filtered to Ferrari");
  } else {
    console.log("could not find Ferrari row button");
  }

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
