import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dialog from './Dialog';

function NestedDialogs() {
  const [inner, setInner] = useState(false);
  return <Dialog open title="Account details"><button onClick={() => setInner(true)}>Deactivate</button><Dialog open={inner} title="Confirm deactivation" onClose={() => setInner(false)}><button onClick={() => setInner(false)}>Cancel</button></Dialog></Dialog>;
}

test('nested dialogs restore their parent and release the page when unmounted together', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<NestedDialogs />);
  await user.click(screen.getByRole('button', { name: 'Deactivate' }));
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Confirm deactivation');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Account details');
  expect(screen.getByRole('button', { name: 'Deactivate' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Deactivate' }));
  unmount();
  expect(document.body.style.overflow).not.toBe('hidden');
  render(<button>Background action</button>);
  expect(screen.getByRole('button', { name: 'Background action' })).toBeInTheDocument();
});
