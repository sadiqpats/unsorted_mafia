import { expect, test } from '@playwright/test';
import { setupTable } from './helpers';

test('role reveal: the card and “I’ve seen my role” fit one phone screen (no scrolling)', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 2, godfather: 1, villager: 2 });
  for (const [w, h] of [[360, 640], [375, 667], [390, 844], [412, 915]]) {
    for (const s of [t.byRole('Godfather')[0], t.byRole('Villager')[0]]) {
      await s.page.setViewportSize({ width: w, height: h });
      await s.page.evaluate(() => window.scrollTo(0, 0));
      const btn = s.page.getByRole('button', { name: 'I’ve seen my role' });
      const box = await btn.boundingBox();
      expect(box, `${s.role} at ${w}×${h}`).not.toBeNull();
      expect(box!.y + box!.height, `${s.role} at ${w}×${h}: button below the fold`).toBeLessThanOrEqual(h);
    }
  }
});
