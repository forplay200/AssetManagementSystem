import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpandableText from './ExpandableText';

test('collapsing changes presentation without truncating the transcript or clipboard text', async () => {
  const user = userEvent.setup();
  const copy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const height = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
  const text = 'First paragraph.\n\n' + 'Long transcript sentence. '.repeat(80) + '\nFinal words.';
  render(<ExpandableText value={text} label="Audio transcript" reader />);
  const paragraph = screen.getByText(text.replace(/\s+/g, ' ').trim());
  expect(paragraph.textContent).toBe(text);
  await user.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Show less' }));
  expect(paragraph.textContent).toBe(text);
  await user.click(screen.getByRole('button', { name: 'Read full text' }));
  const dialog = screen.getByRole('dialog', { name: 'Audio transcript' });
  expect(within(dialog).getByText(text.replace(/\s+/g, ' ').trim()).textContent).toBe(text);
  await user.click(within(dialog).getByRole('button', { name: 'Copy full text' }));
  expect(copy).toHaveBeenCalledWith(text);
  await user.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'Read full text' })).toHaveFocus();
  height.mockRestore();
  copy.mockRestore();
});
