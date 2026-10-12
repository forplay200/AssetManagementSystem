import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useConfirmation from './useConfirmation';

function Harness({ action }) {
  const { confirm, confirmation } = useConfirmation();
  return <><button onClick={() => confirm({ title: 'Delete asset?', confirmLabel: 'Delete asset', onConfirm: action })}>Open</button>{confirmation}</>;
}

test('cancellation restores focus and never runs the action', async () => {
  const user = userEvent.setup();
  const action = jest.fn();
  render(<Harness action={action} />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Delete asset?' });
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.tab();
  expect(within(dialog).getByRole('button', { name: 'Delete asset' })).toHaveFocus();
  await user.tab();
  expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(action).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe('hidden');
});

test('pending actions cannot be repeated or dismissed and failures allow retry', async () => {
  const user = userEvent.setup();
  let fail;
  const action = jest.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; })).mockResolvedValueOnce({});
  render(<Harness action={action} />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.dblClick(screen.getByRole('button', { name: 'Delete asset' }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => fail(new Error('Request failed')));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete asset' }));
  expect(action).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
