import { expect, test } from '@playwright/test';

type Api = {
  violations: unknown[];
  setMode(m: '外観' | 'X線' | '断面'): void;
  info(): { calls: number; triangles: number };
  setCamera(name: string): void;
};

test('ブロックアウトが表示され、作業姿勢で干渉 0 件', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/exterior.png' });

  const budget = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.info());
  expect(budget.calls).toBeLessThanOrEqual(250); // design §9.4
  expect(budget.triangles).toBeLessThanOrEqual(300_000);

  for (const [mode, file] of [['X線', 'xray'], ['断面', 'section']] as const) {
    await page.evaluate((m) => (window as unknown as { __combine: Api }).__combine.setMode(m), mode);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/${file}.png` });
  }
  await page.evaluate(() => { const c = (window as unknown as { __combine: Api }).__combine; c.setMode('外観'); c.setCamera('真横左'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/side-left.png' });
  expect(errors).toEqual([]);
});
