import { expect, test } from '@playwright/test';
import { advanceTo, newPhone, revealAndAck, setupTable, skipRest } from './helpers';

test("the Godfather's Superpower: switched on at Dawn, two kills at night, the Mafia sit out, a big reveal in the morning", async ({ browser }) => {
  test.setTimeout(400_000);
  const t = await setupTable(browser, 8, { mafia: 1, godfather: 1, doctor: 1, villager: 5 });
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${t.code}`);
  for (const s of t.seats) await revealAndAck(s);
  const gf = t.byRole('Godfather')[0];
  const m = t.byRole('Mafia')[0];
  const [a, b] = t.byRole('Villager');

  // Dawn: the Godfather's card offers the Superpower (everyone else has a dummy round).
  await advanceTo(t, 'Dawn');
  await gf.page.getByRole('button', { name: /Open your dawn panel/ }).click();
  const sp = gf.page.locator('[data-option="superpower"]');
  await sp.getByRole('radio', { name: 'Use my Superpower' }).click();
  await sp.getByRole('button', { name: 'Lock in' }).click();
  await skipRest(t, new Set([gf.name]));

  // Night: the Mafia are told the Godfather made his move; he picks two people.
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night', { timeout: 60_000 });
  await m.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(m.page.locator('[data-option="decoy"]')).toContainText('The Godfather has made his move');
  await gf.page.getByRole('button', { name: /Open your night panel/ }).click();
  for (const [id, who] of [['gf_strike', a], ['gf_strike_2', b]] as const) {
    const card = gf.page.locator(`[data-option="${id}"]`);
    await card.getByRole('radio', { name: new RegExp(`^${who.name}$`) }).click();
    await card.getByRole('button', { name: 'Lock in' }).click();
  }
  await gf.page.locator('[data-option="silence"]').getByRole('button', { name: 'Skip' }).click();
  await skipRest(t, new Set([gf.name]));

  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await expect(tv.getByTestId('tv-spotlight')).toContainText('The Godfather used his Superpower!');
  await expect(tv.getByTestId('moment-card')).toHaveCount(2);
  await expect(t.byRole('Doctor')[0].page.getByTestId('phone-moment')).toContainText('Superpower');
  if (process.env.SHOTS) {
    await tv.waitForTimeout(1500);
    await tv.screenshot({ path: `${process.env.SHOTS}/super-tv.png` });
    await t.byRole('Doctor')[0].page.screenshot({ path: `${process.env.SHOTS}/super-phone.png` });
  }
});
