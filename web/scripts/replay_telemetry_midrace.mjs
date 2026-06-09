// Scrub to mid-race and verify lap-time chart populates + we can see DNF + pit dim.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = `C:/Users/ruthv/AppData/Local/Temp/replay_telem_mid`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  await page.goto("http://localhost:5180/replay/2025/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Bump speed to 32x then play — fastest skim
  await page.locator('button:has-text("32×")').first().click();
  await page.locator('button:has-text("Play")').first().click();
  console.log("→ playing @ 32×");

  // Play until ~lap 40 (most of the race)
  await page.waitForTimeout(30000);
  await page.locator('button:has-text("Pause")').first().click();
  console.log("→ paused");

  // Click a non-leader to grab a richer chart
  const clicked = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('g[transform^="translate"]'));
    for (const g of dots) {
      const circle = g.querySelector('circle[fill]:not([fill="none"])');
      if (!circle) continue;
      const fill = circle.getAttribute("fill") ?? "";
      if (fill === "#ffa64d") continue;
      const label = (g.querySelector("text")?.textContent ?? "").split(" ")[0];
      // Click someone we know pitted — pick PIA, VER, LEC
      if (["PIA", "VER", "LEC", "ALB", "RUS"].includes(label)) {
        g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return label;
      }
    }
    return null;
  });
  console.log("→ clicked:", clicked);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "01_midrace_with_panel.png") });

  // Now log panel + pit + dnf state
  const info = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("text"))
      .map(t => t.textContent)
      .filter(Boolean);
    const pittingTags = labels.filter(t => t?.includes(" · PIT"));
    const dimmed = document.querySelectorAll('g[transform^="translate"][opacity="0.3"]').length;
    const chartSvgs = document.querySelectorAll("svg.recharts-surface").length;
    const dnfBadge = !!Array.from(document.querySelectorAll("*"))
      .find(e => e.textContent?.trim() === "DNF");
    const pitBadge = !!Array.from(document.querySelectorAll("*"))
      .find(e => e.textContent?.trim() === "IN PIT");
    const lap = document.body.innerText.match(/Lap (\d+)/);
    return {
      lapDisplayed: lap ? lap[1] : null,
      pittingLabels: pittingTags.length,
      dimmedDots: dimmed,
      hasRechartsSvg: chartSvgs,
      hasDnfBadge: dnfBadge,
      hasPitBadge: pitBadge,
    };
  });
  console.log("midrace state:", JSON.stringify(info));

  await browser.close();
  console.log("done");
})();
