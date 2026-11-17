const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to sign-in
  await page.goto('http://localhost:3000/sign-in');
  console.log('On sign-in page');

  // Click "Sign in with Google"
  const googleBtn = page.locator('button:has-text("Google"), a:has-text("Google")').first();
  if (await googleBtn.isVisible({ timeout: 5000 })) {
    await googleBtn.click();
    console.log('Clicked Google sign-in');
  }

  // Wait for user to complete Google OAuth (up to 2 minutes)
  console.log('Waiting for redirect to dashboard (complete Google login in the browser)...');
  await page.waitForURL('**/dashboard**', { timeout: 120000 });
  console.log('Signed in! URL:', page.url());

  // Navigate to diagrams page
  await page.goto('http://localhost:3000/dashboard/diagrams');
  await page.waitForLoadState('networkidle');
  console.log('On diagrams page');

  // Take screenshot
  await page.screenshot({ path: '/tmp/diagrams-page.png' });
  console.log('Screenshot saved');

  // Check if there are diagrams
  const diagramCount = await page.locator('[data-diagram], .diagram-card, [class*="diagram"]').count();
  console.log('Diagram elements found:', diagramCount);

  await browser.close();
})();
