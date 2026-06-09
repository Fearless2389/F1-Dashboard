// Smoke check for the driver-page season comparison work.
// Visits /driver/VER for 2024 (single season), then ?season=2024&vs=2023 (compare mode).
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const CODE = process.argv[3] ?? "VER";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/driver_shots`;
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
  page.on("pageerror", err => {
    errors.push(err.message);
    console.log("PAGE.ERR", err.message);
  });

  // 1) Single-season view at 2024
  console.log(`→ /driver/${CODE}?season=2024`);
  await page.goto(`http://localhost:${PORT}/driver/${CODE}?season=2024`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: join(OUT, "01_single_2024.png"), fullPage: true });

  // 2) Compare mode: 2024 vs 2023
  console.log(`→ /driver/${CODE}?season=2024&vs=2023`);
  await page.goto(`http://localhost:${PORT}/driver/${CODE}?season=2024&vs=2023`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: join(OUT, "02_compare_2024_vs_2023.png"), fullPage: true });

  // 3) List view with season picker
  console.log("→ /driver?season=2024");
  await page.goto(`http://localhost:${PORT}/driver?season=2024`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(OUT, "03_list_2024.png"), fullPage: true });

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
