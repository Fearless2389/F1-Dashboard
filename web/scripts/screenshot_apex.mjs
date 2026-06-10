// Smoke check the new Apex page — default (next race), then past race with lap-by-lap.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/apex_shots`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1300 } });
  const page = await ctx.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      errors.push(t);
      console.log("CONSOLE.ERR", t);
    }
  });
  page.on("pageerror", err => { errors.push(err.message); console.log("PAGE.ERR", err.message); });

  console.log("→ /apex (next race)");
  await page.goto(`http://localhost:${PORT}/apex`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(OUT, "01_apex_default.png"), fullPage: true });

  console.log("→ /apex?season=2025&round=4 (past race, should show lap-by-lap)");
  await page.goto(`http://localhost:${PORT}/apex?season=2025&round=4`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(20000); // lap-by-lap involves multiple predict_race calls
  await page.screenshot({ path: join(OUT, "02_apex_past_2025_R4.png"), fullPage: true });

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
