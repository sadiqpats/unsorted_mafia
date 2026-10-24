import { expect, test } from '@playwright/test';
import { advanceTo, revealAndAck, setupTable, skipRest } from './helpers';

/** The Mafia hit must always reach the server: a quick change of mind, a tap during a pause. */
test('Mafia hit: a quick second tap and a tap during a pause both still count', async ({ browser }) => {
  test.setTimeout(300_000);
  const t = await setupTable(browser, 7, { mafia: 1, doctor: 1, villager: 5 });
  for (const s of t.seats) await revealAndAck(s);
  const m = t.byRole('Mafia')[0];
  const [a, b, c] = t.byRole('Villager');
  const card = m.page.locator('[data-option="mafia_kill"]');
  const tile = (name: string) => card.getByRole('radio', { name: new RegExp(`^${name}(\\s*🗡.*)?$`) });

  // Night 1: tap A, then B straight away (while A is still on its way) → B is the hit.
  await advanceTo(t, 'Night');
  await m.page.getByRole('button', { name: /Open your night panel/ }).click();
  await tile(a.name).click();
  await tile(b.name).click();
  await expect(card.getByRole('button', { name: `✓ Locked: ${b.name}` })).toBeVisible();
  await skipRest(t, new Set([m.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await expect(t.host.locator(`li[data-player="${b.name}"]`).first()).toContainText(/Killed/);

  // Night 2: the host pauses; the Mafia taps C (refused while paused) — on resume it is sent.
  await advanceTo(t, 'Night');
  await m.page.getByRole('button', { name: /Open your night panel/ }).click();
  await t.host.getByRole('button', { name: '⏸ Pause' }).click();
  await expect(t.host.getByRole('button', { name: '▶ Resume' })).toBeVisible();
  await tile(c.name).click();
  await m.page.waitForTimeout(800);
  await t.host.getByRole('button', { name: '▶ Resume' }).click();
  await expect(m.page.getByText('Locked in. Put your phone face down.')).toBeVisible({ timeout: 10_000 });
  await skipRest(t, new Set([m.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await expect(t.host.locator(`li[data-player="${c.name}"]`).first()).toContainText(/Killed/);
});
