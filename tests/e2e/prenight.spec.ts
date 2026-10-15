import { expect, test } from '@playwright/test';
import { advanceTo, nightAct, setupTable, skipRest } from './helpers';

test('Before Nightfall: the Thief steals the Detective’s job, every phone sees it happened (no names)', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, thief: 1, detective: 1, villager: 3 });
  await advanceTo(t, 'Before Nightfall');
  const thief = t.byRole('Thief')[0];
  const det = t.byRole('Detective')[0];
  const mafia = t.byRole('Mafia')[0];
  // Everyone gets the same-looking panel; the Thief's has a real power.
  await nightAct(thief, 'steal', det.name);
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  for (const s of t.seats) {
    await expect(s.page.getByText('Before nightfall, the Thief struck — someone’s power was stolen.').first()).toBeVisible();
  }
  // The victim is told privately; the Thief now does the Detective's job tonight.
  await det.page.getByRole('button', { name: /My role/ }).click();
  await det.page.getByLabel(/Tap instead of hold/).check();
  await det.page.getByRole('dialog').getByRole('button', { name: /reveal/i }).click();
  await expect(det.page.getByRole('dialog').getByText(/you play as a Villager/)).toBeVisible();
  await det.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await nightAct(thief, 'investigate', mafia.name);
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Morning');
  await thief.page.getByRole('button', { name: 'You have a private message' }).click();
  await expect(thief.page.getByText(`${mafia.name} is SUSPICIOUS`)).toBeVisible();
});

test('Before Nightfall: the Imposter revives a dead player before night 2', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, imposter: 1, villager: 4 });
  await advanceTo(t, 'Night');
  const victim = t.byRole('Villager')[0];
  await nightAct(t.byRole('Mafia')[0], 'mafia_kill', victim.name);
  await skipRest(t, new Set([t.byRole('Mafia')[0].name]));
  await expect(victim.page.getByText('You have been eliminated')).toBeVisible();
  await advanceTo(t, 'Voting');
  await advanceTo(t, 'Before Nightfall');
  const imp = t.byRole('Imposter')[0];
  await nightAct(imp, 'imposter_revive', victim.name);
  await skipRest(t, new Set([imp.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  await expect(victim.page.getByText(`${victim.name} has returned to the game!`).first()).toBeVisible();
  await expect(victim.page.getByText('You have been eliminated')).toHaveCount(0);
});
