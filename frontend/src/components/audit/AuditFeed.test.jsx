import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AuditFeed from './AuditFeed';
import AuditEvent from './AuditEvent';
import { auditService } from '../../services/auditService';
jest.mock('../../services/auditService', () => ({ auditService: { workspace: jest.fn(), asset: jest.fn() } }));
const event = { id: 'one', action: 'member.role_changed', result: 'success', actorName: 'Alice', actorRole: 'workspaceOwner', occurredAt: '2026-11-04T12:00:00Z', targetName: 'Studio', before: { userId: 2, role: 'workspaceManager' }, after: { userId: 2, role: 'collaborator' }, details: { memberName: 'Ben' } };
const mount = jsx => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{jsx}</MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); auditService.workspace.mockResolvedValue({ events: [], nextCursor: null }); auditService.asset.mockResolvedValue({ events: [], nextCursor: null }); });
test('role history displays the affected member and old and new role alongside the acting Owner', () => {
  mount(<AuditEvent event={event} />);
  expect(screen.getByText('Alice · Owner')).toBeInTheDocument();
  expect(screen.getByText('Ben : Manager → Collaborator')).toBeInTheDocument();
});
test('Workspace feed applies human-readable filters and paginates without duplicate events', async () => {
  const user = userEvent.setup();
  auditService.workspace.mockResolvedValueOnce({ events: [event], nextCursor: 'next-page' }).mockResolvedValueOnce({ events: [event, { ...event, id: 'two', actorName: 'Other' }], nextCursor: null });
  mount(<AuditFeed />);
  await user.click(await screen.findByRole('button', { name: 'Load older activity' }));
  expect(auditService.workspace).toHaveBeenLastCalledWith({ cursor: 'next-page' });
  expect(await screen.findByText('Other · Owner')).toBeInTheDocument(); expect(screen.getAllByText('Alice · Owner')).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText('Action type'), 'workspace');
  await user.type(screen.getByLabelText('Person'), 'Alice');
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(auditService.workspace).toHaveBeenLastCalledWith({ category: 'workspace', actorName: 'Alice' }));
});
test('Asset feed uses its own endpoint and retains the ability to retry a failed request', async () => {
  const user = userEvent.setup(); auditService.asset.mockRejectedValueOnce({ response: { data: { message: 'Temporarily unavailable' } } }).mockResolvedValue({ events: [event], nextCursor: null });
  mount(<AuditFeed assetId={7} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Temporarily unavailable');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Alice · Owner')).toBeInTheDocument();
  expect(auditService.asset).toHaveBeenCalledWith(7, {}); expect(auditService.workspace).not.toHaveBeenCalled();
});
test('deleted assets do not link to inaccessible pages and download status never claims local saving', () => {
  mount(<AuditEvent event={{ ...event, action: 'asset.download', result: 'completed', assetId: 7, assetAvailable: false, targetName: 'Deleted image' }} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Server finished sending the download')).toBeInTheDocument();
  expect(screen.getByText(/does not confirm the file was saved/)).toBeInTheDocument();
});
