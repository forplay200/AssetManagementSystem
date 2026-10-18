import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import RenameDialog from './RenameDialog';
import { UnsavedChangesProvider, useLeaveGuard, useUnsavedChanges } from '../../context/UnsavedChangesContext';

function OtherDraft() {
  useUnsavedChanges(true, 'Metadata draft');
  const leave = useLeaveGuard();
  return <button onClick={() => leave(() => {})}>Leave</button>;
}
function Harness({ save, otherDraft = false }) {
  const [open, setOpen] = useState(false);
  return <UnsavedChangesProvider><button onClick={() => setOpen(true)}>Rename</button>{otherDraft && <OtherDraft />}{open && <RenameDialog title="Rename asset" initialName="hero.obj" maxLength={200} sourceName="hero.obj" onSave={save} onClose={() => setOpen(false)} />}</UnsavedChangesProvider>;
}
test('prefills and focuses input, disables normalized no-op and restores focus after Escape', async () => {
  const user = userEvent.setup(); const save = jest.fn(); render(<Harness save={save} />);
  await user.click(screen.getByText('Rename'));
  expect(screen.getByLabelText('Name')).toHaveFocus();
  expect(screen.getByText('Source file: hero.obj')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' hero.obj ' } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Rename')).toHaveFocus(); expect(save).not.toHaveBeenCalled();
});
test.each(['cancel', 'save'])('closing rename by %s clears only its own draft', async mode => {
  const user = userEvent.setup(); const save = jest.fn().mockResolvedValue(); render(<Harness save={save} otherDraft />);
  await user.click(screen.getByText('Rename')); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New hero' } });
  if (mode === 'cancel') {
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' })); await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  } else await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByText('Leave'));
  expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toHaveTextContent('Metadata draft');
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Rename asset');
  expect(save).toHaveBeenCalledTimes(mode === 'save' ? 1 : 0);
});
test('pending blocks closing and duplicate submission; failure retains input and permits retry', async () => {
  let reject; const save = jest.fn(() => new Promise((_, r) => { reject = r; }));
  const user = userEvent.setup(); render(<Harness save={save} />);
  await user.click(screen.getByText('Rename')); fireEvent.change(screen.getByLabelText('Name'), { target: { value: '企鹅 🐧' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Rename asset' }));
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => reject({ response: { data: { message: 'Forbidden' } } }));
  expect(screen.getByRole('alert')).toHaveTextContent('Forbidden'); expect(screen.getByLabelText('Name')).toHaveValue('企鹅 🐧');
  save.mockResolvedValueOnce(); await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(save).toHaveBeenLastCalledWith('企鹅 🐧');
});
test.each(['', '   ', 'abc\n', 'ab\u0085', 'a'.repeat(201)])('invalid raw names cannot submit (%s)', async name => {
  const user = userEvent.setup(); render(<Harness save={jest.fn()} />); await user.click(screen.getByText('Rename'));
  // Single-line browser inputs strip newlines; insert controls that remain in input values.
  if (name.includes('\n')) name = 'ab\u0001';
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
