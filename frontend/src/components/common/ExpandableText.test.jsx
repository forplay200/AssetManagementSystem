import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpandableText from './ExpandableText';
import { saveDownload } from '../../services/assetService';
jest.mock('../../services/assetService', () => ({ saveDownload: jest.fn() }));

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

test('text reader defaults to no export while copying remains available', async () => {
  render(<ExpandableText value="Full transcript" label="Transcript" reader />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Read full text' }));
  expect(screen.getByRole('button', { name: 'Copy full text' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Download TXT' })).not.toBeInTheDocument();
});
test('explicit download capability preserves TXT export and responds to a permission downgrade', async () => {
  const user = userEvent.setup(); const view = render(<ExpandableText value="Full transcript" label="Transcript" reader canDownload />);
  await user.click(screen.getByRole('button', { name: 'Read full text' }));
  await user.click(screen.getByRole('button', { name: 'Download TXT' }));
  expect(saveDownload).toHaveBeenCalledWith({ blob: expect.any(Blob), filename: 'transcript.txt' });
  view.rerender(<ExpandableText value="Full transcript" label="Transcript" reader canDownload={false} />);
  expect(screen.queryByRole('button', { name: 'Download TXT' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy full text' })).toBeEnabled();
});
