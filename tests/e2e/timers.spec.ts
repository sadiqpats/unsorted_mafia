import { expect, test } from '@playwright/test';
import { advanceTo, setupTable } from './helpers';

test('host timer settings: defaults, discussion length, "No timer for discussion" and "No timers at all"', async ({ browser }) => {
  const t = await setupTable(
    browser,
    5,
    { mafia: 1, doctor: 1, villager: 3 },
    async (host) => {
      // The defaults people asked for: Dawn 30 s, a 5 s break, Night 30 s, a 4-minute discussion, a 30 s vote.
      await expect(host.getByLabel(/^Dawn \(seconds\)/)).toHaveValue('30');
      await expect(host.getByLabel(/^Night \(seconds\)/)).toHaveValue('30');
      await expect(host.getByLabel(/^Vote \(seconds\)/)).toHaveValue('30');
      await expect(host.getByLabel(/^Discussion/)).toHaveValue('240');
      await host.getByLabel(/^Discussion/).selectOption('210');
      await expect(host.getByLabel(/^Discussion/)).toHaveValue('210');
      // Then: no clocks at all for this table.
      await host.getByText('No timers at all', { exact: true }).click();
      await expect(host.getByLabel(/No timers at all/)).toBeChecked();
    },
    { realClock: true },
  );
  for (const s of t.seats) {
    await s.page.getByLabel(/Tap instead of hold/).check();
    await s.page.getByRole('button', { name: /reveal/i }).first().click();
    await s.page.getByRole('button', { name: /Your secret card/ }).click();
    await s.page.getByRole('button', { name: 'I’ve seen my role' }).click();
  }
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  await t.host.waitForTimeout(6000); // past the break
  await expect(t.host.getByRole('timer')).toHaveCount(0); // no clock
  await advanceTo(t, 'Day');
  await expect(t.host.getByRole('timer')).toHaveCount(0);
  await advanceTo(t, 'Vote');
  await expect(t.host.getByRole('timer')).toHaveCount(0);
});

test('the discussion clock: shows 3:30 when set, and the vote opens when the host starts it early', async ({ browser }) => {
  const t = await setupTable(
    browser,
    5,
    { mafia: 1, doctor: 1, villager: 3 },
    async (host) => {
      await host.getByLabel(/^Discussion/).selectOption('210');
      const brk = host.getByLabel('Break before Dawn & Night (seconds)');
      await brk.fill('0');
      await brk.press('Enter');
    },
    { realClock: true },
  );
  await advanceTo(t, 'Day');
  await expect(t.host.getByRole('timer')).toContainText(/^3:[0-3]\d$/);
  await expect(t.seats[0].page.getByTestId('discussion')).toContainText('3½ minutes');
  await t.host.getByRole('button', { name: 'Start voting' }).click();
  await expect(t.host.getByTestId('host-phase')).toHaveText('Vote');
  await expect(t.host.getByRole('timer')).toContainText(/^0:[0-3]\d$/);
});
