// Smoke check after the layout overhaul — visit /live and /replay/2025/1,
// screenshot each, and report any console errors.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/layout_shots`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
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

  for (const path of ["/live", "/replay/2025/1"]) {
    const slug = path.replace(/\//g, "_") || "_root";
    console.log("→", path);
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: false });
  }

  // Specific layout assertions
  await page.goto(`http://localhost:${PORT}/live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const hasRail = await page.locator("text=RACE CONTROL").count();
  const hasModels = await page.locator("nav >> text=Models").count();
  const hasSearch = await page.locator('input[placeholder*="Search Data"]').count();
  console.log("rail_remaining:", hasRail, "models_in_nav:", hasModels, "search_present:", hasSearch);

  // Confirm /predict and /explore redirect to /live
  for (const path of ["/predict", "/explore"]) {
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    console.log(`${path} → ${page.url()}`);
  }

  await browser.close();
  console.log("done", OUT, "errors:", errors.length);
  process.exit(errors.length > 0 ? 1 : 0);
})();
