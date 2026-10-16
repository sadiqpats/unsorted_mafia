import { expect, test } from '@playwright/test';
import { setupTable } from './helpers';

test('Bollywood Mafia Night: cards, lists and the TV show the Bollywood names and portraits', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 }, async (host) => {
    await host.getByLabel('Bollywood Mafia Night').click();
    await expect(host.getByLabel('Bollywood Mafia Night')).toBeChecked();
    await expect(host.getByRole('group', { name: 'Mafia count' })).toBeVisible();
    await expect(host.getByText('Gabbar (Mafia)').first()).toBeVisible(); // the role picker
  });
  const mafia = t.byRole('Mafia')[0];
  await mafia.page.getByLabel(/Tap instead of hold/).check();
  await mafia.page.getByRole('button', { name: /reveal/i }).first().click();
  const card = mafia.page.locator('.flip-back');
  await expect(card).toContainText('Gabbar');
  await expect(card).toContainText('(Mafia)');
  const doc = t.byRole('Doctor')[0];
  await doc.page.getByLabel(/Tap instead of hold/).check();
  await doc.page.getByRole('button', { name: /reveal/i }).first().click();
  await expect(doc.page.locator('.flip-back')).toContainText('Munna MBBS');
  await expect(doc.page.locator('.flip-back')).toContainText('(Doctor)');
});

test('the short break before Dawn/Night: everyone sees “begins in…”, then the panel opens', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 }, async (host) => {
    const brk = host.getByLabel('Break before Dawn & Night (seconds)');
    await brk.fill('4');
    await brk.press('Enter');
    await expect(brk).toHaveValue('4');
  });
  for (const s of t.seats) {
    await s.page.getByLabel(/Tap instead of hold/).check();
    await s.page.getByRole('button', { name: /reveal/i }).first().click();
    await s.page.getByRole('button', { name: /Your secret card/ }).click();
    await s.page.getByRole('button', { name: 'I’ve seen my role' }).click();
  }
  const p = t.seats[0].page;
  await expect(p.getByTestId('get-ready')).toContainText('Night begins in');
  await expect(t.host.getByRole('timer')).toContainText('Starts in');
  await expect(p.getByRole('button', { name: /Open your night panel/ })).toBeVisible({ timeout: 10_000 });
  await expect(p.getByTestId('get-ready')).toHaveCount(0);
});
