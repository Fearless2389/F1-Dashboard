// Click a driver during the SC window → assert the 3-panel telemetry shows.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = "C:/Users/ruthv/AppData/Local/Temp/replay_telem_v2";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));
  page.on("console", m => { if (m.type() === "error") console.log("CONSOLE.ERR", m.text()); });

  await page.goto("http://localhost:5180/replay/2025/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 8× default — play for 12 real seconds → SC window
  await page.locator('button:has-text("Play")').first().click();
  await page.waitForTimeout(12000);

  // Click on a driver dot specifically — avoid SC (label "SC"/"SC DEPLOYING"/etc.).
  const clicked = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('g[transform^="translate"]'));
    for (const g of dots) {
      const circle = g.querySelector('circle[fill]:not([fill="none"])');
      if (!circle) continue;
      const fill = circle.getAttribute("fill") ?? "";
      // Skip SC fill colours
      if (fill === "#ffa64d" || fill === "#ff8000") continue;
      const code = g.querySelector("text")?.textContent?.split(" ")[0] ?? "";
      // Must be a 3-letter driver code (NOR, VER, etc.) — not "SC" / "SC IN" / etc.
      if (!/^[A-Z]{3}$/.test(code)) continue;
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return code;
    }
    return null;
  });
  console.log("→ clicked:", clicked);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "01_panel.png") });

  // Inspect the panel content
  const info = await page.evaluate(() => {
    const panel = document.querySelector('div[class*="rounded-xl"][class*="border-f1-edge"][class*="bg-f1-dark"]');
    const labelText = document.body.innerText;
    const speedKmh = labelText.match(/(\d+)\s*km\/h/);
    const gearMatch = labelText.match(/G(\d)/);
    const throttleMatch = labelText.match(/Throttle/);
    const brakeMatch = labelText.match(/Telemetry · last 30 s/);
    const notAvail = labelText.match(/Telemetry not cached/);
    const drsBadge = !!Array.from(document.querySelectorAll("*")).find(e => e.textContent?.trim() === "DRS");
    const linesInChart = document.querySelectorAll('.recharts-line path').length;
    const areasInChart = document.querySelectorAll('.recharts-area path').length;
    return {
      panelPresent: !!panel,
      speedReadout: speedKmh ? speedKmh[0] : null,
      gearReadout: gearMatch ? gearMatch[0] : null,
      hasTelemetryHeader: !!brakeMatch,
      notAvailable: !!notAvail,
      drsBadge,
      rechartsLines: linesInChart,
      rechartsAreas: areasInChart,
    };
  });
  console.log("PANEL STATE:", JSON.stringify(info, null, 2));

  // Let it play a bit more so the charts update
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, "02_panel_later.png") });

  await browser.close();
  console.log("done", OUT);
})();
