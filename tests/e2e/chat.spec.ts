import { expect, test } from '@playwright/test';
import { setupTable } from './helpers';

test("the Mafia's chat: a quiet bar from the role reveal, Mafia members only (not the Godfather), with a typing line", async ({ browser }) => {
  test.setTimeout(300_000);
  const t = await setupTable(browser, 8, { mafia: 2, godfather: 1, villager: 5 });
  const [m1, m2] = t.byRole('Mafia');
  const gf = t.byRole('Godfather')[0];
  const vill = t.byRole('Villager')[0];

  // Right from the role reveal: one bar, closed — only on the Mafia members' phones.
  for (const s of [m1, m2]) await expect(s.page.getByTestId('mafia-chat-bar')).toBeVisible();
  for (const s of [gf, vill]) await expect(s.page.getByTestId('mafia-chat-bar')).toHaveCount(0);

  await m1.page.getByTestId('mafia-chat-bar').click();
  await m2.page.getByTestId('mafia-chat-bar').click();
  await m1.page.getByLabel('Message').fill('Doctor first?');
  await expect(m2.page.getByTestId('mafia-typing')).toHaveText(`${m1.name} is typing…`);
  await m1.page.getByRole('button', { name: 'Send' }).click();
  const msgs = m2.page.getByTestId('mafia-chat-msg');
  await expect(msgs).toHaveCount(1);
  await expect(msgs.first()).toContainText(m1.name);
  if (process.env.SHOTS) await m2.page.screenshot({ path: `${process.env.SHOTS}/chat-open.png` });
  await m2.page.getByRole('button', { name: 'Close the chat' }).click();
  await expect(m2.page.getByTestId('mafia-chat-bar')).toHaveText(/Family chat\s*tap to open/);
  await expect(gf.page.getByText('Doctor first?')).toHaveCount(0);
});
