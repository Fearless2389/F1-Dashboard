// Smoke check for the schedule page sprint chip + lap record expansion.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/schedule_shots`;
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
  page.on("pageerror", err => { errors.push(err.message); console.log("PAGE.ERR", err.message); });

  // Seed zustand-persist localStorage so the calendar opens on 2024 (a
  // completed season with real sprint races + lap records to verify).
  await page.goto(`http://localhost:${PORT}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("f1ml-context", JSON.stringify({
      state: { season: 2024, round: 1, driverFocus: null },
      version: 0,
    }));
  });

  console.log("→ /calendar (2024)");
  await page.goto(`http://localhost:${PORT}/calendar`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(OUT, "01_overview.png"), fullPage: true });

  // Expand the British GP (Silverstone) — known lap record holder
  const britishCard = page.locator('text=British Grand Prix').first();
  if (await britishCard.count()) {
    await britishCard.click();
    await page.waitForTimeout(10000);  // give lap-record endpoint time
    await page.screenshot({ path: join(OUT, "02_british_expanded.png"), fullPage: true });
  } else {
    console.log("could not find British GP card");
  }

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
