// Tight crop on a single sprint-weekend card so we can see the chip clearly.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "5180";
const OUT = `C:/Users/ruthv/AppData/Local/Temp/sprint_chip_shots`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  page.on("console", msg => { if (msg.type() === "error") console.log("CONSOLE.ERR", msg.text()); });
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  // Force season=2024 so we hit confirmed sprint races (China R5, Miami R6)
  await page.goto(`http://localhost:${PORT}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("f1ml-context", JSON.stringify({
      state: { season: 2024, round: 1, driverFocus: null }, version: 0,
    }));
  });

  await page.goto(`http://localhost:${PORT}/calendar`, { waitUntil: "domcontentloaded" });
  // Schedule endpoint includes weather forecast and can take 15-20s on a cold cache.
  await page.waitForSelector('text=Chinese Grand Prix', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Locate the Chinese GP card (R5, sprint)
  const chinese = page.locator('text=Chinese Grand Prix').first();
  if (await chinese.count()) {
    const card = chinese.locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
    const box = await card.boundingBox();
    if (box) {
      // Capture just that card with some padding
      await page.screenshot({
        path: join(OUT, "01_chinese_gp_card.png"),
        clip: {
          x: Math.max(0, box.x - 20),
          y: Math.max(0, box.y - 20),
          width: box.width + 40,
          height: box.height + 40,
        },
      });
      console.log("captured Chinese GP card", box);
    } else {
      console.log("could not get bounding box for Chinese GP card");
    }
  } else {
    console.log("could not find Chinese GP card");
  }

  // Also full-page just in case
  await page.screenshot({ path: join(OUT, "02_full.png"), fullPage: true });

  await browser.close();
  console.log("done", OUT);
})();
