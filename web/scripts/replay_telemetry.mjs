// Click a driver dot → assert telemetry panel renders; play forward into the
// SC window to confirm pit-dim and DNF behavior visually.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SEASON = process.argv[2] ?? "2025";
const ROUND  = process.argv[3] ?? "1";
const PORT   = process.argv[4] ?? "5180";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_telem_${SEASON}_${ROUND}`;
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

  // Press Play and let it run for 8 seconds (gets us past the SC window start)
  await page.locator('button:has-text("Play")').first().click();
  console.log("→ playing");
  await page.waitForTimeout(8000);

  // Click a driver dot — find a circle in the dots layer (skip the safety car)
  const clicked = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('g[transform^="translate"]'));
    for (const g of dots) {
      const circle = g.querySelector('circle[fill]:not([fill="none"])');
      if (!circle) continue;
      const fill = circle.getAttribute("fill") ?? "";
      // skip SC dot
      if (fill === "#ffa64d") continue;
      const label = g.querySelector("text")?.textContent ?? "";
      if (!label) continue;
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return label;
    }
    return null;
  });
  console.log("→ clicked driver:", clicked);

  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "01_telemetry_panel.png") });

  // Verify telemetry panel rendered
  const panelInfo = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("*"))
      .map(e => e.textContent ?? "")
      .filter(t => /^(?:Pos|Gap|Int|Pits|Pace ·)/.test(t.trim()));
    const hasChart = !!document.querySelector("svg.recharts-surface");
    const dnfBadge = Array.from(document.querySelectorAll("*"))
      .some(e => e.textContent?.trim() === "DNF");
    return { headings: headings.slice(0, 10), hasChart, dnfBadge };
  });
  console.log("panel:", JSON.stringify(panelInfo));

  // Play forward 10 more seconds to see lap chart fill in
  await page.waitForTimeout(10000);
  await page.screenshot({ path: join(OUT, "02_after_more_play.png") });

  // Try to find a pitting dot
  const pittingCount = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('g[transform^="translate"][opacity="0.3"]')).length;
  });
  console.log("dimmed (pitting) dots seen so far:", pittingCount);

  await browser.close();
  console.log("done", OUT);
})();
