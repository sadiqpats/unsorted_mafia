import { expect, test } from '@playwright/test';
import { newPhone } from './helpers';

test('welcome intro: shows on first open, tap to enter opens the site, not shown again this visit', async ({ browser }) => {
  const p = await newPhone(browser, { intro: true });
  await p.goto('/mafia');
  const intro = p.getByRole('dialog', { name: 'Welcome to Mafia Night' });
  await expect(intro).toBeVisible();
  // Act one: the Unsorted Plans logo, then the Mafia Night gate.
  await expect(intro.getByRole('img', { name: /Unsorted/ })).toBeVisible();
  await expect(intro.getByText('Mafia Night')).toBeVisible({ timeout: 8000 });
  await intro.getByRole('button', { name: 'Tap to enter' }).click();
  await expect(intro).toHaveCount(0, { timeout: 15000 });
  await expect(p.getByRole('link', { name: 'Host a Game' })).toBeVisible();
  await p.reload();
  await expect(p.getByRole('dialog', { name: 'Welcome to Mafia Night' })).toHaveCount(0);
});

test('welcome intro never interrupts a game room or the TV display', async ({ browser }) => {
  const p = await newPhone(browser, { intro: true });
  for (const path of ['/tv/ABCDE', '/ctv/ABCDE', '/c/ABCDE', '/r/ABCDE', '/join/ABCDE', '/charades/join/ABCDE?team=1']) {
    await p.goto(path);
    await expect(p.getByRole('dialog')).toHaveCount(0);
  }
});

test('the front door is Unsorted: both games are one tap away', async ({ browser }) => {
  const p = await newPhone(browser, { intro: true });
  await p.goto('/');
  const intro = p.getByRole('dialog', { name: 'Welcome to Unsorted' });
  await expect(intro.getByText('Game Night')).toBeVisible({ timeout: 8000 });
  await intro.getByRole('button', { name: 'Tap to enter' }).click();
  await expect(intro).toHaveCount(0, { timeout: 15000 });
  await expect(p).toHaveTitle('Unsorted');
  await p.getByRole('link', { name: /Mafia Night/ }).click();
  await expect(p).toHaveURL(/\/mafia$/);
  // Every Mafia page has a Home menu back to the main menu.
  await p.goto('/guide');
  await p.getByRole('button', { name: 'Home menu' }).click();
  await p.getByRole('menuitem', { name: /Mafia Night menu/ }).click();
  await expect(p).toHaveURL(/\/mafia$/);
  await p.getByRole('button', { name: 'Home menu' }).click();
  await p.getByRole('menuitem', { name: /Main menu/ }).click();
  await expect(p).toHaveURL(/\/$/);
  await p.goto('/');
  await p.getByRole('link', { name: /Bollywood Dumb Charades/ }).click();
  await expect(p).toHaveURL(/\/charades$/);
  // Each game's page: a Main menu button, the Unsorted logo, and a jump to the other game.
  await p.getByRole('link', { name: /Main menu · all games/ }).first().click();
  await expect(p).toHaveURL(/\/$/);
  await p.goto('/charades');
  await p.getByTestId('other-game').click();
  await expect(p).toHaveURL(/\/mafia$/);
  await p.getByTestId('other-game').click();
  await expect(p).toHaveURL(/\/charades$/);
  await p.goto('/mafia');
  await p.getByRole('link', { name: 'Unsorted — main menu (all games)' }).click();
  await expect(p).toHaveURL(/\/$/);
});
