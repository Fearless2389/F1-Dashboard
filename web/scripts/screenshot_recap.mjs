// Smoke check for the auto race-recap feature across its three surfaces.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/recap_shots`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      errors.push(t);
      console.log("CONSOLE.ERR", t);
    }
  });
  page.on("pageerror", err => { errors.push(err.message); console.log("PAGE.ERR", err.message); });

  // 1) Replay page — scroll to find the recap below the canvas
  console.log("→ /replay/2024/24");
  await page.goto(`http://localhost:${PORT}/replay/2024/24`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "01_replay_recap.png"), fullPage: true });

  // 2) Standings page — recap sits below the hero
  console.log("→ /standings?season=2024");
  await page.goto(`http://localhost:${PORT}/standings?season=2024`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: join(OUT, "02_standings_recap.png"), fullPage: true });

  // 3) Calendar — expand a past race
  console.log("→ /calendar (2024, expand a past race)");
  await page.goto(`http://localhost:${PORT}/calendar?season=2024`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  // Click the first past race card (they're all past in 2024 by now)
  const firstCard = page.locator('button:has-text("Round 1")').first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(OUT, "03_calendar_recap.png"), fullPage: true });
  } else {
    console.log("could not find Round 1 button");
    await page.screenshot({ path: join(OUT, "03_calendar_no_click.png"), fullPage: true });
  }

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
