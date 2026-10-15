import { expect, test } from '@playwright/test';
import { advanceTo, nightAct, setupTable, skipRest } from './helpers';

test('Before Nightfall: the Thief blindly steals the Investigate power; every phone sees it happened (no names)', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, thief: 1, detective: 1, villager: 3 });
  await advanceTo(t, 'Before Nightfall');
  const thief = t.byRole('Thief')[0];
  const det = t.byRole('Detective')[0];
  const mafia = t.byRole('Mafia')[0];
  // Everyone gets the same-looking panel; the Thief's has a real power.
  await nightAct(thief, 'steal', 'Investigate'); // a power, not a player
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  for (const s of t.seats) {
    await expect(s.page.getByText('Before nightfall, the Thief struck — someone’s power was stolen.').first()).toBeVisible();
  }
  // The victim is told privately (inside their night panel); the Thief never learns whose power it was.
  await det.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(det.page.getByTestId('private-note')).toContainText('you play as a Villager');
  await thief.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(thief.page.getByTestId('private-note')).toContainText('You don’t know whose it was.');
  await expect(thief.page.getByTestId('private-note')).not.toContainText(det.name);
  // The Thief now does the Detective's job tonight; nothing else clutters the screen.
  await expect(thief.page.getByText('Town square')).toHaveCount(0);
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
