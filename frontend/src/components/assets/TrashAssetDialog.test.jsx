import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrashAssetDialog from './TrashAssetDialog';
import { assetService } from '../../services/assetService';
jest.mock('../../services/assetService', () => ({ assetService: { remove: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
test('Owner supplies a reason for another uploader; errors preserve it for retry', async () => {
  const user = userEvent.setup(); const onTrashed = jest.fn();
  assetService.remove.mockRejectedValueOnce({ response: { data: { message: 'Someone is editing this asset.' } } }).mockResolvedValueOnce({});
  render(<TrashAssetDialog asset={{ id: 7, userId: 2, originalname: 'city.png' }} userId={1} onTrashed={onTrashed} onClose={() => {}} />);
  const submit = screen.getByRole('button', { name: 'Move to recycle bin' }); expect(submit).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'Duplicate'); await user.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('Someone is editing');
  expect(screen.getByRole('textbox')).toHaveValue('Duplicate'); expect(onTrashed).not.toHaveBeenCalled();
  await user.click(submit); await waitFor(() => expect(onTrashed).toHaveBeenCalledTimes(1));
  expect(assetService.remove).toHaveBeenCalledWith(7, 'Duplicate');
});
