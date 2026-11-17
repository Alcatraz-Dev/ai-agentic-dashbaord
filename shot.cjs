const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000/shot", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const aside = await page.$("[data-slot='sidebar']");
  if (aside) {
    await aside.screenshot({ path: "/private/tmp/claude-501/-Users-haythem-dhahri-Desktop-projects-website-ai-agentic-dashboard/6d3f660f-c2d7-495d-9d32-360c04bdc15b/scratchpad/sidebar-after.png" });
    console.log("saved sidebar-after.png");
  } else {
    console.log("NO SIDEBAR", (await page.textContent("body")).slice(0, 300));
  }
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
