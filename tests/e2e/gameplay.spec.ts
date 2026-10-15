import { expect, test } from '@playwright/test';
import { advanceTo, nightAct, revealAndAck, setupTable, skipRest, vote, waitPhase } from './helpers';

test('5 players: full match — Mafia kill, Detective result, refresh, Town wins', async ({ browser }) => {
  const t = await setupTable(browser, 5); // suggested: Mafia, Detective, Doctor, 2 Villagers
  // Each phone privately shows exactly the role the server dealt.
  for (const s of t.seats) expect(await revealAndAck(s)).toBe(s.role);
  await advanceTo(t, 'Night');

  const mafia = t.byRole('Mafia')[0];
  const det = t.byRole('Detective')[0];
  const doc = t.byRole('Doctor')[0];
  const [victim, other] = t.byRole('Villager');
  await nightAct(mafia, 'mafia_kill', victim.name);
  await nightAct(det, 'investigate', mafia.name);
  await nightAct(doc, 'protect', other.name);
  await nightAct(other, 'decoy', mafia.name);
  await nightAct(victim, 'decoy', null);

  // Night resolves the moment everyone has locked in; all phones see the same announcement.
  await expect(t.host.getByTestId('host-phase')).toHaveText('Morning');
  for (const s of t.seats) await expect(s.page.getByText(`${victim.name} was found dead at dawn.`, { exact: true }).first()).toBeVisible();
  // Roles stay secret until the game is over.
  for (const s of t.seats.filter((x) => x !== victim)) expect(await s.page.locator('body').innerText()).not.toMatch(/They were the/);
  await expect(victim.page.getByText('You have been eliminated')).toBeVisible();

  // Detective's result is private.
  await det.page.getByRole('button', { name: 'You have a private message' }).click();
  await expect(det.page.getByText(`${mafia.name} is SUSPICIOUS`)).toBeVisible();
  await other.page.getByRole('button', { name: 'You have a private message' }).click();
  await expect(other.page.getByText('Nothing new for you this morning.')).toBeVisible();
  expect(await other.page.content()).not.toContain('SUSPICIOUS');

  // A player refreshes mid-game and gets the same seat, role and phase back.
  await other.page.reload();
  await waitPhase(other.page, 'Morning');
  await other.page.getByRole('button', { name: /My role/ }).click();
  await other.page.getByLabel(/Tap instead of hold/).check();
  await other.page.getByRole('dialog').getByRole('button', { name: /reveal/i }).click();
  await expect(other.page.getByRole('dialog').locator('.flip-back h3')).toHaveText('Villager');
  await other.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await advanceTo(t, 'Voting');
  await expect(victim.page.getByText('Dead players cannot vote.')).toBeVisible();
  for (const s of [det, doc, other]) await vote(s, mafia.name);
  await vote(mafia, det.name);
  await t.host.getByRole('button', { name: /Next phase/ }).click();

  for (const s of t.seats) await expect(s.page.getByText('The Town Prevails')).toBeVisible();
  await expect(det.page.getByText('🏆 You won!')).toBeVisible();
  await expect(mafia.page.getByText('You did not win this time.')).toBeVisible();
  await expect(t.host.getByRole('button', { name: 'Play again (same players)' })).toBeVisible();
});

test('Doctor protection saves the Mafia target', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 });
  await advanceTo(t, 'Night');
  const target = t.byRole('Villager')[0];
  await nightAct(t.byRole('Mafia')[0], 'mafia_kill', target.name);
  await nightAct(t.byRole('Doctor')[0], 'protect', target.name);
  await skipRest(t, new Set([t.byRole('Mafia')[0].name, t.byRole('Doctor')[0].name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Morning');
  await expect(target.page.getByText('The town wakes. Nobody died tonight.').first()).toBeVisible();
  await expect(target.page.getByText('You have been eliminated')).toHaveCount(0);
});

test('Godfather silences a player, who is then blocked from voting', async ({ browser }) => {
  const t = await setupTable(browser, 6); // suggested: Godfather, Mafia, Detective, Doctor, 2 Villagers
  await advanceTo(t, 'Night');
  const gf = t.byRole('Godfather')[0];
  const silenced = t.byRole('Villager')[0];
  await nightAct(gf, 'silence', silenced.name);
  await skipRest(t, new Set());
  await expect(t.host.getByTestId('host-phase')).toHaveText('Morning');
  await expect(silenced.page.getByText(`${silenced.name} has been silenced and cannot speak or vote today.`).first()).toBeVisible();
  await expect(silenced.page.getByText('You have been silenced.')).toBeVisible();
  await advanceTo(t, 'Voting');
  await expect(silenced.page.getByText('You are silenced today and cannot vote.')).toBeVisible();
  await expect(silenced.page.getByRole('button', { name: /Open your ballot/ })).toHaveCount(0);
});

test('Judge’s double vote changes the outcome', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, judge: 1, villager: 3 });
  await advanceTo(t, 'Voting');
  const m = t.byRole('Mafia')[0];
  const judge = t.byRole('Judge')[0];
  const [v1, v2] = t.byRole('Villager');
  await vote(judge, m.name); // weight 2
  await vote(v1, v2.name);
  await vote(m, v2.name);
  await vote(v2, m.name);
  // Unweighted this would be 2–2 (no elimination). Weighted it is 3–2.
  await expect(t.host.getByText(`${judge.name} → ${m.name} (×2)`)).toBeVisible();
  await t.host.getByRole('button', { name: /Next phase/ }).click();
  await expect(v1.page.getByText(new RegExp(`The town has eliminated ${m.name}\\.$`)).first()).toBeVisible();
  await expect(v1.page.getByText('The Town Prevails')).toBeVisible();
});

test('Priest revives an eliminated player', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, priest: 1, villager: 4 });
  await advanceTo(t, 'Night');
  const mafia = t.byRole('Mafia')[0];
  const priest = t.byRole('Priest')[0];
  const victim = t.byRole('Villager')[0];
  await nightAct(mafia, 'mafia_kill', victim.name);
  await skipRest(t, new Set([mafia.name]));
  await expect(victim.page.getByText('You have been eliminated')).toBeVisible();
  await advanceTo(t, 'Voting');
  await advanceTo(t, 'Night'); // nobody votes → no elimination → night 2
  await nightAct(priest, 'revive', victim.name);
  await skipRest(t, new Set([priest.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Morning');
  await expect(victim.page.getByText(`${victim.name} has returned to the game!`).first()).toBeVisible();
  await expect(victim.page.getByText('You have been eliminated')).toHaveCount(0);
});

test('Jester wins by being voted out', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, jester: 1, villager: 3 });
  await advanceTo(t, 'Voting');
  const jester = t.byRole('Jester')[0];
  for (const s of t.seats) await vote(s, s === jester ? t.byRole('Mafia')[0].name : jester.name);
  await t.host.getByRole('button', { name: /Next phase/ }).click();
  for (const s of t.seats) await expect(s.page.getByText('The Jester Laughs Last')).toBeVisible();
  await expect(jester.page.getByText('🏆 You won!')).toBeVisible();
});
