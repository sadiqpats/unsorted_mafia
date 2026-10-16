import { expect, test } from '@playwright/test';
import { advanceTo, nextIfStill, nightAct, revealAndAck, setupTable, skipRest, vote, waitPhase } from './helpers';

test('5 players: full match — Mafia kill, Detective result, refresh, open discussion, timed vote, Town wins', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, detective: 1, doctor: 1, villager: 2 });
  // Each phone privately shows exactly the role the server dealt; when all have seen it, Night starts by itself.
  for (const s of t.seats) expect(await revealAndAck(s)).toBe(s.role);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  await expect(t.host.getByRole('timer')).toHaveCount(1); // the clock is always on (Night: 60 s)

  const mafia = t.byRole('Mafia')[0];
  const det = t.byRole('Detective')[0];
  const doc = t.byRole('Doctor')[0];
  const [victim, other] = t.byRole('Villager');
  await nightAct(mafia, 'mafia_kill', victim.name);
  await nightAct(det, 'investigate', mafia.name);
  await nightAct(doc, 'protect', other.name);
  // Players without a power see a clearly labelled dummy round.
  await other.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(other.page.getByTestId('dummy-round')).toContainText('DUMMY ROUND');
  await expect(other.page.getByText('Whom do you suspect most?')).toBeVisible();
  await nightAct(other, 'decoy', mafia.name);
  await nightAct(victim, 'decoy', null);
  // No pop-up duplicating the on-screen ✓ confirmation.
  expect(await det.page.getByText('Choice locked in.').count()).toBe(0);

  // Night → Day the moment everyone has acted; every phone sees the same news, with no role revealed.
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  for (const s of t.seats) await expect(s.page.getByTestId('phase-news')).toContainText(`${victim.name} was killed during the night.`);
  await expect(victim.page.getByText('You have been eliminated')).toBeVisible();
  expect(await other.page.locator('body').innerText()).not.toMatch(/They were the/);

  // The Detective's result is private (inside their ballot panel).
  await det.page.getByRole('button', { name: 'You have a private message' }).click();
  await expect(det.page.getByTestId('private-note')).toContainText(`${mafia.name} is SUSPICIOUS`);
  expect(await other.page.content()).not.toContain('SUSPICIOUS');

  // Refresh mid-game: same seat, role and phase.
  await other.page.reload();
  await waitPhase(other.page, 'Day');
  await other.page.getByRole('button', { name: /My role/ }).click();
  await other.page.getByLabel(/Tap instead of hold/).check();
  await other.page.getByRole('dialog').getByRole('button', { name: /reveal/i }).click();
  await expect(other.page.getByRole('dialog').locator('.flip-back h3')).toHaveText('Villager');
  await other.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Day is an open discussion; the host opens the 60-second vote.
  await expect(det.page.getByTestId('discussion')).toBeVisible();
  await advanceTo(t, 'Vote');
  await expect(victim.page.getByText('Dead players cannot vote.')).toBeVisible();
  for (const s of [det, doc, other]) await vote(s, mafia.name);
  await vote(mafia, det.name); // last vote → the Day ends by itself
  for (const s of t.seats) await expect(s.page.getByText('The Town Prevails')).toBeVisible();
  await expect(det.page.getByText('🏆 You won!')).toBeVisible();
  await expect(mafia.page.getByText('You did not win this time.')).toBeVisible();
});

test('Doctor protection saves the Mafia target', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 });
  await advanceTo(t, 'Night');
  const target = t.byRole('Villager')[0];
  await nightAct(t.byRole('Mafia')[0], 'mafia_kill', target.name);
  await nightAct(t.byRole('Doctor')[0], 'protect', target.name);
  await skipRest(t, new Set([t.byRole('Mafia')[0].name, t.byRole('Doctor')[0].name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  await expect(target.page.getByTestId('phase-news')).toContainText('Nobody died tonight.');
});

test('Godfather knows the Mafia and silences a player, who must stay quiet but can still vote', async ({ browser }) => {
  const t = await setupTable(browser, 9, { godfather: 1, mafia: 2, detective: 1, villager: 5 });
  const gf = t.byRole('Godfather')[0];
  const [mafia, mafia2] = t.byRole('Mafia');
  // The Godfather's card lists the Mafia; the Mafia's card does not list the Godfather.
  await gf.page.getByLabel(/Tap instead of hold/).check();
  await gf.page.getByRole('button', { name: /reveal/i }).first().click();
  await expect(gf.page.getByText('The Mafia (only you know this)')).toBeVisible();
  await expect(gf.page.locator('.flip-back')).toContainText(mafia.name);
  await mafia.page.getByLabel(/Tap instead of hold/).check();
  await mafia.page.getByRole('button', { name: /reveal/i }).first().click();
  await expect(mafia.page.locator('.flip-back')).not.toContainText(gf.name);
  // The two Mafia know each other.
  await expect(mafia.page.locator('.flip-back')).toContainText(mafia2.name);


  // Nothing in the always-visible Town square gives the Mafia away to a neighbour glancing at an awake phone.
  const square = mafia.page.locator('section', { hasText: 'Town square' });
  await expect(square).toContainText(mafia2.name);
  await expect(square).not.toContainText('Your family');
  await advanceTo(t, 'Night');
  const silenced = t.byRole('Villager')[0];
  const target = t.byRole('Detective')[0];
  // At night the Godfather is reminded who the Mafia are…
  await gf.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(gf.page.getByText('The Mafia (only you know this)')).toBeVisible();
  await expect(gf.page.locator('[data-option="silence"]').locator('..')).toContainText(mafia2.name);
  await nightAct(gf, 'silence', silenced.name);
  // …and each Mafia sees what the other wants, live, without a word.
  await nightAct(mafia, 'mafia_kill', target.name);
  await mafia2.page.getByRole('button', { name: /Open your night panel/ }).click();
  // The plan is anonymous ("Mafia 1/2"), and the reminder lists the family by name + photo.
  await expect(mafia2.page.getByTestId('family-plan')).toContainText(new RegExp(`Mafia \\d wants to kill ${target.name}`));
  await expect(mafia2.page.getByTestId('family-plan')).not.toContainText(mafia.name);
  await expect(mafia2.page.getByTestId('mafia-family')).toContainText(mafia.name);
  await expect(mafia2.page.locator('[data-option="mafia_kill"]').getByRole('radio', { name: new RegExp(`^${target.name}`) })).toContainText(/🗡 Mafia \d/);
  await expect(gf.page.getByTestId('family-plan')).toHaveCount(0);
  await nightAct(mafia2, 'mafia_kill', target.name);
  await expect(mafia.page.getByTestId('family-plan')).toContainText(`You all agree: ${target.name}`);
  await skipRest(t, new Set([gf.name, mafia.name, mafia2.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  await expect(silenced.page.getByTestId('phase-news')).toContainText(`${silenced.name} has been silenced`);
  await expect(silenced.page.getByText('You have been silenced.')).toBeVisible();
  await expect(silenced.page.getByText('You can still vote.')).toBeVisible();
  // Announced once — not repeated in a second line.
  expect(await silenced.page.getByText(/has been silenced/).count()).toBe(1);
  await advanceTo(t, 'Vote');
  await vote(silenced, gf.name); // the ballot works for a silenced player
});

test('Judge’s double vote changes the outcome', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, judge: 1, villager: 3 });
  await advanceTo(t, 'Vote');
  const m = t.byRole('Mafia')[0];
  const judge = t.byRole('Judge')[0];
  const [v1, v2] = t.byRole('Villager');
  await vote(judge, m.name); // weight 2
  await vote(v1, v2.name);
  await vote(m, v2.name);
  await vote(v2, m.name);
  await expect(t.host.getByText(`${judge.name} → ${m.name} (×2)`)).toBeVisible();
  await nextIfStill(t, 'Vote'); // one player hasn't voted; the host closes the vote
  await expect(v1.page.getByText(new RegExp(`The town has eliminated ${m.name}\\.$`)).first()).toBeVisible();
  await expect(v1.page.getByText('The Town Prevails')).toBeVisible();
});

test('Joker wins by being voted out', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, jester: 1, villager: 3 });
  await advanceTo(t, 'Vote');
  const jester = t.byRole('Joker')[0];
  for (const s of t.seats) await vote(s, s === jester ? t.byRole('Mafia')[0].name : jester.name);
  for (const s of t.seats) await expect(s.page.getByText('The Joker Laughs Last')).toBeVisible();
  await expect(jester.page.getByText('🏆 You won!')).toBeVisible();
});

test('Dawn: the Thief steals a power for the round without learning whose; the robbed player is told', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, thief: 1, detective: 1, villager: 3 });
  await advanceTo(t, 'Dawn');
  const thief = t.byRole('Thief')[0];
  const det = t.byRole('Detective')[0];
  const mafia = t.byRole('Mafia')[0];
  await nightAct(thief, 'steal', 'Investigate'); // a power, not a player
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  for (const s of t.seats) await expect(s.page.getByTestId('phase-news')).toContainText('someone’s power was stolen');
  await det.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(det.page.getByTestId('private-note')).toContainText('Your Investigate power has been stolen for this round');
  await thief.page.getByRole('button', { name: /Open your night panel/ }).click();
  await expect(thief.page.getByTestId('private-note')).toContainText('You don’t know whose it was.');
  await expect(thief.page.getByTestId('private-note')).not.toContainText(det.name);
  await expect(thief.page.getByText('Town square')).toHaveCount(0);
  await nightAct(thief, 'investigate', mafia.name);
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  await thief.page.getByRole('button', { name: 'You have a private message' }).click();
  await expect(thief.page.getByTestId('private-note').filter({ hasText: 'SUSPICIOUS' })).toContainText(`${mafia.name} is SUSPICIOUS`);
});

test('Dawn: the Thief steals the Mafia Hit and votes with the Mafia as an anonymous member — nobody learns anybody', async ({ browser }) => {
  const t = await setupTable(browser, 7, { mafia: 2, thief: 1, detective: 1, villager: 3 });
  await advanceTo(t, 'Dawn');
  const thief = t.byRole('Thief')[0];
  const [m1, m2] = t.byRole('Mafia');
  const target = t.byRole('Villager')[0];
  await nightAct(thief, 'steal', 'Mafia Hit');
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  // The Thief votes in tonight's hit as "Mafia N" — and sees no Mafia names.
  await nightAct(thief, 'mafia_kill', target.name);
  // (The secret panel closes itself after 15 s; reopen it like a player would.)
  const review = thief.page.getByRole('button', { name: /Review your choice/ });
  if (await review.isVisible()) await review.click();
  await expect(thief.page.getByTestId('family-plan')).toContainText(/you are Mafia \d/);
  for (const m of [m1, m2]) await expect(thief.page.getByTestId('family-plan')).not.toContainText(m.name);
  await expect(thief.page.getByTestId('mafia-family')).toHaveCount(0);
  // Whichever Mafia still holds the hit sees an anonymous member wanting the same target, never the Thief's name.
  for (const m of [m1, m2]) {
    await m.page.getByRole('button', { name: /Open your night panel/ }).click();
    await expect(m.page.getByTestId('family-plan')).toContainText(new RegExp(`Mafia \\d wants to kill ${target.name}`));
    await expect(m.page.getByTestId('family-plan')).not.toContainText(thief.name);
  }
  await skipRest(t, new Set([thief.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  for (const s of t.seats) await expect(s.page.getByTestId('phase-news')).toContainText(`${target.name} was killed during the night.`);
});

test('Dawn: the Imposter revives a dead player in round 2 and every phone is told', async ({ browser }) => {
  const t = await setupTable(browser, 6, { mafia: 1, imposter: 1, villager: 4 });
  await advanceTo(t, 'Night'); // round 1 Dawn passes (nobody to revive yet)
  const mafia = t.byRole('Mafia')[0];
  const victim = t.byRole('Villager')[0];
  await nightAct(mafia, 'mafia_kill', victim.name);
  await skipRest(t, new Set([mafia.name]));
  await expect(victim.page.getByText('You have been eliminated')).toBeVisible();
  await advanceTo(t, 'Dawn'); // host closes Day 1 with no votes → Dawn 2
  const imp = t.byRole('Imposter')[0];
  await nightAct(imp, 'imposter_revive', victim.name);
  await skipRest(t, new Set([imp.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  for (const s of t.seats) await expect(s.page.getByTestId('phase-news')).toContainText(`${victim.name} has been revived`);
  await expect(victim.page.getByText('You have been eliminated')).toHaveCount(0);
});
