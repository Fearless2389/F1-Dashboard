// Smoke check the new /forecast page.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/forecast_shots`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1400 } });
  const page = await ctx.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") { const t = msg.text(); errors.push(t); console.log("CONSOLE.ERR", t); }
  });
  page.on("pageerror", err => { errors.push(err.message); console.log("PAGE.ERR", err.message); });

  console.log("→ /forecast (next race)");
  await page.goto(`http://localhost:${PORT}/forecast`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(20000); // 10K MC sims + apex predictions = ~10s
  await page.screenshot({ path: join(OUT, "01_forecast_default.png"), fullPage: true });

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
