// Log every network request the page makes after clicking a driver.
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));
  page.on("console", m => { if (m.type() === "error") console.log("CONSOLE.ERR", m.text()); });
  page.on("request", r => {
    const u = r.url();
    if (u.includes("/api/")) console.log("REQ", r.method(), u);
  });
  page.on("response", async r => {
    const u = r.url();
    if (u.includes("/api/replay") && u.includes("telemetry")) {
      console.log("RESP", r.status(), u);
      if (r.status() === 200) {
        const body = await r.text();
        console.log("  body keys:", Object.keys(JSON.parse(body)).join(","));
        console.log("  body samples:", JSON.parse(body).t?.length);
      }
    }
  });

  await page.goto("http://localhost:5180/replay/2025/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  console.log("=== about to play ===");
  await page.locator('button:has-text("Play")').first().click();
  await page.waitForTimeout(12000);

  console.log("=== clicking driver ===");
  const code = await page.evaluate(() => {
    for (const g of document.querySelectorAll('g[transform^="translate"]')) {
      const c = g.querySelector('circle[fill]:not([fill="none"])');
      if (!c) continue;
      const fill = c.getAttribute("fill") ?? "";
      if (fill === "#ffa64d" || fill === "#ff8000") continue;
      const code = g.querySelector("text")?.textContent?.split(" ")[0] ?? "";
      if (!/^[A-Z]{3}$/.test(code)) continue;
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return code;
    }
    return null;
  });
  console.log("clicked", code);

  await page.waitForTimeout(6000);
  console.log("=== done ===");
  await browser.close();
})();
