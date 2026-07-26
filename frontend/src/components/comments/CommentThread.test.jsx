import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread, { canManageComment, wasEdited } from './CommentThread';
import { assetService } from '../../services/assetService';

let mockUser = { id: 7, username: 'owner', teamRole: 'owner' };

jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../services/assetService', () => ({
  assetService: {
    getComments: jest.fn(),
    createComment: jest.fn(),
    updateComment: jest.fn(),
    deleteComment: jest.fn(),
  },
}));

const baseComment = {
  id: 11,
  assetId: 42,
  userId: 8,
  content: 'This asset should be optimized.',
  isDeleted: false,
  parentId: null,
  author: { id: 8, username: 'John Doe' },
  createdAt: '2026-07-12T06:00:00.000Z',
  updatedAt: '2026-07-12T06:32:00.000Z',
};

function history(comments) {
  return { comments, totalItems: comments.length, currentPage: 1, totalPages: 1 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 7, username: 'owner', teamRole: 'owner' };
  assetService.getComments.mockResolvedValue(history([baseComment]));
  assetService.updateComment.mockResolvedValue({});
  assetService.deleteComment.mockResolvedValue({});
});

test('authorization allows Owners or authors and edited state uses timestamps', () => {
  expect(canManageComment(mockUser, baseComment)).toBe(true);
  expect(canManageComment({ id: 8, teamRole: 'manager' }, baseComment)).toBe(true);
  expect(canManageComment({ id: 9, teamRole: 'manager' }, baseComment)).toBe(false);
  expect(canManageComment({ id: 8, teamRole: 'collaborator' }, baseComment)).toBe(true);
  expect(canManageComment({ id: 9, teamRole: 'collaborator' }, baseComment)).toBe(false);
  expect(wasEdited(baseComment)).toBe(true);
  expect(wasEdited({ ...baseComment, updatedAt: baseComment.createdAt })).toBe(false);
});

test('Owner can edit another user comment and sees the Edited indicator', async () => {
  const user = userEvent.setup();
  render(<CommentThread assetId="42" />);

  expect(await screen.findByText(/Edited/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  const editor = screen.getByRole('textbox', { name: 'Edit comment' });
  await user.clear(editor);
  await user.type(editor, 'Optimized copy.');
  await user.click(screen.getByRole('button', { name: 'Save edit' }));

  await waitFor(() => expect(assetService.updateComment).toHaveBeenCalledWith(11, 'Optimized copy.'));
});

test('delete requires confirmation before calling the API', async () => {
  const user = userEvent.setup();
  render(<CommentThread assetId="42" />);

  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('dialog', { name: 'Delete this comment?' })).toBeInTheDocument();
  expect(assetService.deleteComment).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Delete comment' }));
  await waitFor(() => expect(assetService.deleteComment).toHaveBeenCalledWith(11));
});

test('deleted placeholder appears while replies remain visible', async () => {
  const deleted = { ...baseComment, isDeleted: true, content: 'Comment deleted by author.' };
  const reply = { ...baseComment, id: 12, userId: 9, parentId: 11, content: 'Reply remains visible.', isDeleted: false, updatedAt: baseComment.createdAt, parent: { id: 11, content: 'Comment deleted by author.', isDeleted: true }, author: { id: 9, username: 'Jane' } };
  assetService.getComments.mockResolvedValue(history([deleted, reply]));
  render(<CommentThread assetId="42" />);

  expect(await screen.findAllByText('Comment deleted by author.')).not.toHaveLength(0);
  expect(screen.getByText('Reply remains visible.')).toBeInTheDocument();
  expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
});
