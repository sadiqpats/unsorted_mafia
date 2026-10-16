import { expect, test, type Browser, type Page } from '@playwright/test';
import { newPhone } from './helpers';

const SHOTS = process.env.SHOTS; // folder for review screenshots (optional)
const shot = async (p: Page, name: string) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
};

async function table(browser: Browser, setup?: (host: Page) => Promise<void>) {
  const host = await newPhone(browser);
  await host.goto('/charades/host');
  await host.getByLabel('Host code').fill('e2e-host-code');
  await host.getByLabel('Your name').fill('Judge');
  await host.getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/c\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;
  await expect(host.getByText('Invite the captains')).toBeVisible();
  await expect(host.getByTestId('tv-link')).toContainText(`/ctv/${code}`);

  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`/ctv/${code}`);
  await expect(tv.getByText('Captains, scan to join!')).toBeVisible();

  const join = async (team: 1 | 2, name: string) => {
    const p = await newPhone(browser);
    await p.goto(`/charades/join/${code}?team=${team}`);
    await expect(p.getByText(/Judge’s room/)).toBeVisible();
    await p.getByLabel('Your name').fill(name);
    await p.getByRole('button', { name: 'Join as captain' }).click();
    await p.waitForURL(new RegExp(`/c/${code}$`));
    await expect(p.getByText(`You’re in, ${name}!`)).toBeVisible();
    return p;
  };
  const a = await join(1, 'Asha');
  const b = await join(2, 'Ravi');
  await expect(host.getByTestId('captain-0')).toContainText('Asha');
  await expect(host.getByTestId('captain-1')).toContainText('Ravi');
  await host.getByLabel('Team name').first().fill('Rockstars');
  await host.getByLabel('Team name').first().blur();
  await host.getByLabel('Who goes first?').selectOption('0');
  await host.getByLabel('Rounds (each team acts once per round)').selectOption('3');
  if (setup) await setup(host);
  await shot(host, 'host-lobby');
  await shot(a, 'captain-lobby');
  await shot(tv, 'tv-lobby');
  await host.getByRole('button', { name: /Start the show/ }).click();
  return { host, tv, a, b, code };
}

const title = (p: Page) => p.getByTestId('movie-title').first().innerText();

test('Dumb Charades from the deck: only the acting captain and the host see the movie; correct = +1, the TV reveals it after', async ({ browser }) => {
  const { host, tv, a, b } = await table(browser);
  await expect(tv.getByText('Rockstars, get ready!')).toBeVisible();
  await expect(a.getByTestId('round-line')).toHaveText(/Round 1 of 3 · Rockstars acting/);

  // Team 1's captain flips the card: the clock starts everywhere.
  await a.getByTestId('card-back').click();
  await expect(a.getByTestId('movie-card')).toBeVisible();
  await expect(a.getByRole('timer')).toBeVisible();
  await expect(tv.getByRole('timer')).toBeVisible();
  await expect(tv.getByTestId('word-blanks')).toBeVisible();
  const first = await title(a);
  // Nobody else sees it — not even the host, who is playing too (the default).
  await expect(host.getByTestId('movie-hidden')).toBeVisible();
  await expect(host.getByTestId('movie-card')).toHaveCount(0);
  await expect(b.getByTestId('movie-card')).toHaveCount(0);
  await expect(tv.getByTestId('movie-card')).toHaveCount(0);
  await shot(host, 'host-acting');
  await shot(tv, 'tv-acting');

  // New cards (10 allowed): each is different, and the captain can flip back to an earlier one.
  await a.getByRole('button', { name: /New card \(10\)/ }).click();
  await expect(a.getByTestId('movie-title')).not.toHaveText(first);
  await a.getByRole('button', { name: /New card \(9\)/ }).click();
  await expect(a.getByText('Card 3 of 3')).toBeVisible();
  await a.getByRole('button', { name: 'Previous card' }).click();
  await a.getByRole('button', { name: 'Previous card' }).click();
  await expect(a.getByText('Card 1 of 3')).toBeVisible();
  await expect(a.getByTestId('movie-title')).toHaveText(first);
  await shot(a, 'captain-acting');
  await expect(host.getByText(/card 1 of 3/)).toBeVisible();
  const second = first;

  // The acting captain confirms the guess (the host is playing and can't see it).
  await a.getByRole('button', { name: '✅ They got it!' }).click();
  await a.getByRole('button', { name: 'Yes — +1 point' }).click();
  for (const p of [a, b, host]) await expect(p.getByTestId('result')).toContainText('Sahi Jawab!');
  await expect(tv.getByTestId('tv-result')).toContainText('Sahi Jawab!');
  await expect(tv.getByTestId('movie-title')).toHaveText(second);
  await expect(tv.getByTestId('score-0')).toHaveText('1');
  await expect(tv.getByText('Now showing')).toBeVisible();
  await shot(tv, 'tv-result');
  await shot(host, 'host-result');

  // Turn 2: team 2 acts and gives up.
  await host.getByRole('button', { name: /Next: Team 2/ }).click();
  await expect(b.getByTestId('card-back')).toBeVisible();
  await expect(a.getByTestId('card-back')).toHaveCount(0);
  await b.getByTestId('card-back').click();
  await expect(b.getByTestId('movie-card')).toBeVisible();
  await b.getByRole('button', { name: /Pass/ }).click();
  await b.getByRole('button', { name: 'Pass' }).last().click(); // confirm dialog
  await expect(tv.getByTestId('tv-result')).toContainText('Arre Yaar!');
  await expect(tv.getByTestId('score-1')).toHaveText('0');

  // Host can fix a wrong call.
  await host.getByRole('button', { name: /mark as guessed/ }).click();
  await expect(tv.getByTestId('score-1')).toHaveText('1');

  // End early → winner on every screen.
  await host.getByRole('button', { name: /End game/ }).click();
  await host.getByRole('button', { name: 'End game' }).last().click();
  await expect(tv.getByTestId('tv-winner')).toContainText('It’s a tie!');
  await expect(a.getByTestId('winner')).toBeVisible();
  await shot(tv, 'tv-winner');
  await host.getByRole('button', { name: /Tie-breaker round/ }).click();
  await expect(tv.getByText(/Round 3 of 3|Round 2 of/)).toBeVisible();
});

test('Dumb Charades, rival picks: the other captain types a movie (checked) or sends a random card', async ({ browser }) => {
  const { host, tv, a, b } = await table(browser, async (h) => {
    await h.getByLabel('Who picks the movie?').selectOption('rival');
    await h.getByLabel('I’m playing too').click(); // this host only judges, so they see the movies
    await expect(h.getByLabel('I’m playing too')).not.toBeChecked();
  });
  // Team 1 acts, so Team 2's captain picks.
  await expect(b.getByTestId('rival-picker')).toBeVisible();
  await expect(a.getByText(/is choosing your movie/)).toBeVisible();
  const input = b.getByPlaceholder('Type a movie…');
  await input.fill('Rab Ne Bana Di Jodi');
  await expect(b.getByText('5 words — too long!')).toBeVisible();
  await expect(b.getByRole('button', { name: 'Send this movie' })).toBeDisabled();
  await input.fill('jab we m');
  await b.getByRole('button', { name: 'Jab We Met', exact: true }).click(); // suggestion chip
  await shot(b, 'rival-picker');
  await b.getByRole('button', { name: 'Send this movie' }).click();
  // The rival sees what they sent; the actor's captain only sees a face-down card.
  await expect(b.getByTestId('movie-title')).toHaveText('Jab We Met');
  await expect(a.getByTestId('card-back')).toContainText('picked your movie');
  await expect(a.getByTestId('movie-card')).toHaveCount(0);
  await expect(tv.getByText(/Waiting for the captain to flip/)).toBeVisible();
  await a.getByTestId('card-back').click();
  await expect(a.getByTestId('movie-title')).toHaveText('Jab We Met');
  await expect(a.getByRole('button', { name: /New card/ })).toBeDisabled(); // no swapping a rival's pick
  await host.getByRole('button', { name: '❌ Pass' }).click();
  await expect(tv.getByTestId('movie-title')).toHaveText('Jab We Met');

  // Team 2 acts: Team 1's captain tries a few things.
  await host.getByRole('button', { name: /Next: Team 2/ }).click();
  await shot(b, 'captain-waiting-rival');
  const pickA = a.getByPlaceholder('Type a movie…');
  // A real film, looked up online, but from 1975 → refused with the reason.
  await pickA.fill('Sholay');
  await a.getByRole('button', { name: 'Send this movie' }).click();
  await expect(a.getByRole('alert')).toContainText(/1975/, { timeout: 20_000 });
  // Something nobody can find → the host decides.
  await pickA.fill('Qwzx Blorp Filmy');
  await a.getByRole('button', { name: 'Send this movie' }).click();
  await expect(host.getByText(/“Qwzx Blorp Filmy”/)).toBeVisible({ timeout: 20_000 });
  await shot(host, 'host-approval');
  await host.getByRole('button', { name: '❌ Refuse' }).click();
  await expect(a.getByRole('alert')).toContainText('didn’t accept');
  await a.getByRole('button', { name: /Surprise them/ }).click();
  await expect(b.getByTestId('card-back')).toBeVisible();
  await shot(b, 'captain-ready');
  await b.getByTestId('card-back').click();
  await expect(b.getByTestId('movie-card')).toBeVisible();
  await shot(a, 'captain-their-turn');
  await host.getByRole('button', { name: '✅ Guessed it!' }).click();
  await expect(tv.getByTestId('score-1')).toHaveText('1');
  await shot(b, 'captain-result');
});

test('Dumb Charades: a captain whose phone dies can be replaced, and the host can flip the card meanwhile', async ({ browser }) => {
  const { host, tv, a, code } = await table(browser);
  await a.context().close(); // Team 1's captain phone is gone
  await host.getByRole('button', { name: /Flip it here/ }).click();
  await host.getByRole('button', { name: 'Flip it here' }).last().click();
  await expect(host.getByTestId('movie-card')).toBeVisible();
  await expect(tv.getByRole('timer')).toBeVisible();
  await host.getByRole('button', { name: '✅ Guessed it!' }).click();
  await expect(tv.getByTestId('score-0')).toHaveText('1');
  // Free the seat; a new captain joins mid-game.
  await host.getByRole('button', { name: /Next: Team 2/ }).click();
  await host.getByRole('list', { name: 'Captains' }).getByRole('button', { name: 'Free seat' }).first().click();
  await host.getByRole('button', { name: 'Free the seat' }).click();
  const fresh = await newPhone(browser);
  await fresh.goto(`/charades/join/${code}?team=1`);
  await expect(fresh.getByText('Seat free')).toBeVisible();
  await fresh.getByLabel('Your name').fill('Neha');
  await fresh.getByRole('button', { name: 'Join as captain' }).click();
  await expect(fresh.getByTestId('scoreboard')).toContainText('Captain Neha');
  // Home menu: back to the game's menu or to the main menu with both games.
  await fresh.getByRole('button', { name: 'Home menu' }).click();
  await fresh.getByRole('menuitem', { name: /Main menu/ }).click();
  await expect(fresh.getByRole('heading', { name: 'Pick tonight’s game' })).toBeVisible();
  await expect(tv.getByTestId('scoreboard')).toContainText('Captain Neha');
});

test('Dumb Charades: the captain’s movie hides itself when the phone is left alone (no peeking)', async ({ browser }) => {
  const { a } = await table(browser);
  await a.evaluate(() => ((window as any).__CARD_HIDE_MS = 1500));
  await a.getByTestId('card-back').click();
  await expect(a.getByTestId('movie-card')).toBeVisible();
  await expect(a.getByTestId('card-cover')).toBeVisible({ timeout: 5000 });
  await expect(a.getByTestId('movie-card')).toHaveCount(0);
  await a.getByTestId('card-cover').click();
  await expect(a.getByTestId('movie-card')).toBeVisible();
  await a.getByRole('button', { name: '🙈 Hide' }).click();
  await expect(a.getByTestId('movie-card')).toHaveCount(0);
});
