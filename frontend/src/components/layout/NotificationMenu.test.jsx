import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationMenu from './NotificationMenu';
import { recycleBinService } from '../../services/recycleBinService';
jest.mock('../../services/recycleBinService', () => ({ recycleBinService: { notifications: jest.fn(), markRead: jest.fn() } }));
test('notification links to its deletion cycle; marking read does not approve deletion', async () => {
  const user = userEvent.setup();
  const notification = { id: 'notice', cycleId: 'cycle', type: 'asset.trashed', createdAt: new Date().toISOString(), content: { name: 'city.png', purgeAfter: new Date().toISOString() } };
  recycleBinService.notifications.mockResolvedValue({ notifications: [notification], unread: 1, total: 1, pageSize: 30 }); recycleBinService.markRead.mockResolvedValue({});
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NotificationMenu /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
  expect(screen.getByRole('link', { name: 'Review deletion' })).toHaveAttribute('href', '/recycle-bin?cycle=cycle');
  await user.click(screen.getByRole('button', { name: 'Mark read' }));
  await waitFor(() => expect(recycleBinService.markRead).toHaveBeenCalledWith('notice'));
  expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
});
