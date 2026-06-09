// Verify sector dividers render lightly on the track + DRS still works.
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  await page.goto("http://localhost:5180/replay/2025/4", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(7000);

  const info = await page.evaluate(() => {
    const sectorTexts = Array.from(document.querySelectorAll("svg text"))
      .filter(t => /^S[12]$/.test(t.textContent ?? ""));
    const sectors = sectorTexts.map(t => {
      const r = (t).getBoundingClientRect();
      return { label: t.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const drsPaths = Array.from(document.querySelectorAll('svg path[stroke="#22e8c9"]'));
    const drs = drsPaths.map(p => {
      const r = (p).getBoundingClientRect();
      const d = (p.getAttribute("d") ?? "").slice(0, 60);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), d };
    });
    return { sectors, drs };
  });
  console.log("DOM positions:", JSON.stringify(info, null, 2));
  await page.screenshot({ path: "C:/Users/ruthv/AppData/Local/Temp/replay_sectors_bahrain.png" });

  await browser.close();
})();
