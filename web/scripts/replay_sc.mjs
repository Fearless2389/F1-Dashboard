// Captures replay specifically during a Safety Car window. Aus 2025 has SC
// from t=4329 to t=5270. Starting at race_start_t=4285 at 8× takes ~5s.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_sc_${SEASON}_${ROUND}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  await page.goto(`http://localhost:${PORT}/replay/${SEASON}/${ROUND}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Click Play
  await page.locator('button:has-text("Play")').first().click();
  console.log("→ play @ 8×");

  // Track SC dot visibility
  async function probe(tag) {
    const info = await page.evaluate(() => {
      // SC dot is the only orange-filled stroked circle (fill="#ffa64d")
      const scDot = document.querySelector('circle[fill="#ffa64d"]');
      const scText = Array.from(document.querySelectorAll("text"))
        .find(t => t.textContent === "SC" || t.textContent?.includes("DEPLOYING") || t.textContent === "SC IN");
      const banner = document.body.innerText.match(/SAFETY CAR DEPLOYED|VIRTUAL SAFETY CAR|YELLOW FLAG|RED FLAG/);
      const lap = document.body.innerText.match(/(\d+)\s*\/\s*\d+/);
      return {
        lap: lap ? lap[0] : null,
        scDotVisible: !!scDot,
        scLabel: scText?.textContent ?? null,
        banner: banner ? banner[0] : null,
      };
    });
    console.log(`[${tag}]`, JSON.stringify(info));
    return info;
  }

  // Sample every 800ms for 15s — should capture deploy / on-track / return
  for (let i = 1; i <= 18; i++) {
    await page.waitForTimeout(800);
    const info = await probe(`+${(i*0.8).toFixed(1)}s`);
    if (info.scDotVisible) {
      await page.screenshot({ path: join(OUT, `sc_${String(i).padStart(2,'0')}.png`) });
    }
  }

  await browser.close();
  console.log("done", OUT);
})();
