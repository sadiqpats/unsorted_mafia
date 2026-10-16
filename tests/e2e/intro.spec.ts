import { expect, test } from '@playwright/test';
import { newPhone } from './helpers';

test('welcome intro: shows on first open, tap to enter opens the site, not shown again this visit', async ({ browser }) => {
  const p = await newPhone(browser, { intro: true });
  await p.goto('/');
  const intro = p.getByRole('dialog', { name: 'Welcome to Mafia Night' });
  await expect(intro).toBeVisible();
  await expect(intro.getByText('Mafia Night')).toBeVisible();
  await intro.getByRole('button', { name: 'Tap to enter' }).click();
  await expect(intro).toHaveCount(0, { timeout: 6000 });
  await expect(p.getByRole('link', { name: 'Host a Game' })).toBeVisible();
  await p.reload();
  await expect(p.getByRole('dialog', { name: 'Welcome to Mafia Night' })).toHaveCount(0);
});

test('welcome intro never interrupts a game room or the TV display', async ({ browser }) => {
  const p = await newPhone(browser, { intro: true });
  await p.goto('/tv/ABCDE');
  await expect(p.getByRole('dialog', { name: 'Welcome to Mafia Night' })).toHaveCount(0);
});
