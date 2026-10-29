import { expect, test } from '@playwright/test';
import { newPhone } from './helpers';

test('Draw the Imposter: host code, host picks the imposters, hint, pass the phone round, reveal, everyone round, add a player, stop', async ({ browser }) => {
  const p = await newPhone(browser);
  await p.goto('/');
  await p.getByRole('link', { name: /Draw the Imposter/ }).click();
  await p.getByPlaceholder('Only the host knows it').fill('wrong');
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByText('That host code is not correct.')).toBeVisible();
  await p.getByPlaceholder('Only the host knows it').fill('e2e-host-code');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('button', { name: 'One fewer' }).click();
  await p.getByRole('button', { name: 'One fewer' }).click();
  await expect(p.getByTestId('draw-count')).toHaveText('4');
  await p.getByRole('radio', { name: /Quirky/ }).click();
  // The host only runs this game, so they choose how many imposters (1 to start).
  await p.getByText('I’m playing too', { exact: true }).click();
  await expect(p.getByRole('radio', { name: /I choose/ })).toHaveAttribute('aria-checked', 'true');
  await expect(p.getByRole('radio', { name: '1', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(p.getByRole('radio', { name: '4', exact: true })).toBeDisabled(); // 4 of 4 would be everyone
  await p.getByRole('button', { name: 'Start round 1' }).click();
  // Round 1: exactly one imposter, who gets a hint; the other three see the same word.
  const words: string[] = [];
  let imposters = 0;
  for (let i = 1; i <= 4; i++) {
    await expect(p.getByTestId('draw-pass')).toContainText(`Player ${i}`);
    await p.getByRole('button', { name: /show my word/ }).click();
    if (await p.getByText('You are the IMPOSTER').isVisible()) {
      imposters++;
      await expect(p.getByTestId('draw-hint')).toContainText('Hint:');
    } else words.push((await p.getByTestId('draw-word').innerText()).trim());
    await p.getByRole('button', { name: /hide & pass/ }).click();
  }
  expect(imposters).toBe(1);
  expect(new Set(words).size).toBe(1);
  await p.getByRole('button', { name: 'Reveal the imposter' }).click();
  await expect(p.getByTestId('draw-reveal')).toContainText(words[0]);
  await expect(p.getByTestId('draw-reveal')).toContainText('The imposter was');
  // A late arrival joins, and round 2 has five players — all of them imposters.
  await p.getByLabel('New player’s name').fill('Zoya');
  await p.getByRole('button', { name: '+ Add a player' }).click();
  await p.getByRole('radio', { name: 'Everyone' }).click();
  await p.getByRole('button', { name: 'Next round →' }).click();
  await expect(p.getByText('Round 2')).toBeVisible();
  await expect(p.getByText('👥 5')).toBeVisible();
  for (let i = 1; i <= 5; i++) {
    await expect(p.getByTestId('draw-pass')).toContainText(i === 5 ? 'Zoya' : `Player ${i}`);
    await p.getByRole('button', { name: /show my word/ }).click();
    await expect(p.getByText('You are the IMPOSTER')).toBeVisible();
    await p.getByRole('button', { name: /hide & pass/ }).click();
  }
  await p.getByRole('button', { name: 'Reveal the imposter' }).click();
  await expect(p.getByTestId('draw-reveal')).toContainText('Everyone was the imposter!');
  await p.getByRole('button', { name: 'Next round →' }).click();
  await expect(p.getByText('Round 3')).toBeVisible();
  // A reload keeps the game going.
  await p.reload();
  await expect(p.getByText('Round 3')).toBeVisible();
  await p.getByRole('button', { name: 'Stop game' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Stop' }).click();
  await expect(p.getByRole('button', { name: 'Start round 1' })).toBeVisible();
});
