// Captures a tight 30-frame burst at 1× to verify per-frame dot motion.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_motion_${SEASON}_${ROUND}`;
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

  // Set to 1× so motion is human-readable
  const sp1 = page.locator('button:has-text("1×")').first();
  if (await sp1.count()) await sp1.click();
  await page.waitForTimeout(200);

  // Press play
  const playBtn = page.locator('button:has-text("Play")').first();
  await playBtn.click();
  console.log("→ play @ 1×");

  // Sample dot positions at 200 ms intervals for 6 seconds
  const samples = [];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      // Driver dots are <g transform="translate(x,y)"> wrapping a circle
      const gs = Array.from(document.querySelectorAll('g[transform^="translate"]'));
      const dots = [];
      for (const g of gs) {
        const circle = g.querySelector("circle:not([fill='none'])");
        if (!circle) continue;
        const r = parseFloat(circle.getAttribute("r") ?? "0");
        if (r < 5) continue;
        const m = g.getAttribute("transform")?.match(/translate\(([-\d.]+)[, ]+([-\d.]+)/);
        if (!m) continue;
        const label = g.querySelector("text")?.textContent ?? "?";
        dots.push({ label, x: Math.round(+m[1]), y: Math.round(+m[2]) });
      }
      const lapMatch = document.body.innerText.match(/(\d+)\s*\/\s*\d+/);
      return { lap: lapMatch ? lapMatch[1] : null, count: dots.length, dots };
    });
    samples.push(info);
    if (i % 5 === 0) await page.screenshot({ path: join(OUT, `t_${String(i*200).padStart(4,'0')}ms.png`) });
  }

  // Print motion table
  console.log("\nMOTION TABLE (label → x positions over 6s @ 200ms):");
  const labels = new Set();
  samples.forEach(s => s.dots.forEach(d => labels.add(d.label)));
  for (const lbl of Array.from(labels).slice(0, 10)) {
    const xs = samples.map(s => {
      const d = s.dots.find(d => d.label === lbl);
      return d ? d.x : "—";
    });
    console.log(lbl.padEnd(5), xs.join(" "));
  }
  console.log("\nDot count over time:", samples.map(s => s.count).join(" "));
  console.log("Lap over time:", samples.map(s => s.lap).join(" "));

  await browser.close();
  console.log("done", OUT);
})();
