import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet, RouterProvider, useNavigate } from 'react-router-dom';
import { NavigationGuard, UnsavedChangesProvider, useLeaveGuard, useUnsavedChanges } from './UnsavedChangesContext';

function Editor({ switchWorkspace }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const markClean = useUnsavedChanges(Boolean(draft), 'Comment draft', pending);
  const requestLeave = useLeaveGuard();
  const navigate = useNavigate();
  return <><input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /><Link to="/next">Next page</Link><button onClick={() => requestLeave(() => { switchWorkspace(); navigate('/next'); })}>Switch workspace</button><button onClick={() => { markClean(); navigate('/next'); }}>Save and leave</button><button onClick={() => setPending(true)}>Start upload</button></>;
}

function setup() {
  const switchWorkspace = jest.fn();
  const router = createMemoryRouter([{ element: <UnsavedChangesProvider><NavigationGuard /><Outlet /></UnsavedChangesProvider>, children: [{ path: '/', element: <Editor switchWorkspace={switchWorkspace} /> }, { path: '/next', element: <h1>Next screen</h1> }] }]);
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return { user: userEvent.setup(), router, switchWorkspace };
}

test('route navigation preserves drafts on cancel and proceeds after discard', async () => {
  const { user } = setup();
  await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Keep this draft');
  await user.click(screen.getByRole('link', { name: 'Next page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  await user.click(screen.getByRole('link', { name: 'Next page' }));
  await user.click(screen.getByRole('button', { name: 'Discard and leave' }));
  expect(await screen.findByRole('heading', { name: 'Next screen' })).toBeInTheDocument();
});

test('workspace side effects wait for discard approval', async () => {
  const { user, switchWorkspace } = setup();
  await user.type(screen.getByRole('textbox'), 'Draft');
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(switchWorkspace).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(switchWorkspace).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  await user.click(screen.getByRole('button', { name: 'Discard and leave' }));
  expect(switchWorkspace).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('heading', { name: 'Next screen' })).toBeInTheDocument();
});

test('successful saves clear the guard synchronously before navigation', async () => {
  const { user } = setup();
  await user.type(screen.getByRole('textbox'), 'Saved draft');
  await user.click(screen.getByRole('button', { name: 'Save and leave' }));
  expect(await screen.findByRole('heading', { name: 'Next screen' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('pending saves block routing and workspace changes', async () => {
  const { user, router, switchWorkspace } = setup();
  await user.click(screen.getByRole('button', { name: 'Start upload' }));
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(screen.getByRole('dialog', { name: 'An action is still in progress' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep waiting' }));
  expect(switchWorkspace).not.toHaveBeenCalled();
  await act(async () => { await router.navigate('/next'); });
  await user.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(router.state.location.pathname).toBe('/');
});
