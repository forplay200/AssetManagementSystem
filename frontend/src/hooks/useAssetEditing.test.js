import { act, renderHook, waitFor } from '@testing-library/react';
import useAssetEditing from './useAssetEditing';
import { assetService } from '../services/assetService';
import { editContextKey, forgetEditContext, getEditContext, clearEditContext } from '../services/assetEditContext';
import { writeStoredSession, clearStoredSession } from '../auth/authStorage';
jest.mock('../services/assetService', () => ({ assetService: { editStatus: jest.fn(), startEditing: jest.fn(), renewEditing: jest.fn(), endEditing: jest.fn() } }));
let remote;
const session = { sessionId: 'one', token: 'secret', revision: 0, baseContentVersionId: 'base' };
beforeEach(() => {
  jest.clearAllMocks(); remote = { locked: false };
  writeStoredSession({ token: 'login', user: { team: { id: 8 } } });
  assetService.editStatus.mockImplementation(async () => remote);
  assetService.startEditing.mockImplementation(async () => { remote = { locked: true, sessionId: 'one', holderName: 'Ben' }; return session; });
  assetService.renewEditing.mockResolvedValue({}); assetService.endEditing.mockResolvedValue({ released: true });
});
afterEach(() => { forgetEditContext(editContextKey(7)); clearStoredSession(); jest.useRealTimers(); });
test('viewing never acquires a lock; explicit start registers this tab and cancel releases it', async () => {
  const { result } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await waitFor(() => expect(result.current.status).toEqual({ locked: false }));
  expect(assetService.startEditing).not.toHaveBeenCalled();
  await act(async () => { await result.current.start(); });
  expect(result.current.session).toEqual(session); expect(getEditContext(7).token).toBe('secret');
  await act(async () => { await result.current.cancel(); });
  expect(assetService.endEditing).toHaveBeenCalledWith(7, session);
  expect(result.current.session).toBeNull(); expect(getEditContext(7)).toBeUndefined();
});
test('server status detecting a replaced lease clears local authority without reacquiring', async () => {
  const { result } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await act(async () => { await result.current.start(); });
  remote = { locked: true, sessionId: 'another', holderName: 'Alice' };
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(result.current.session).toBeNull());
  expect(result.current.error).toMatch(/review the latest version/i);
  expect(assetService.startEditing).toHaveBeenCalledTimes(1);
});
test('successful submission ends the matching session', async () => {
  const { result } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await act(async () => { await result.current.start(); });
  await act(async () => { clearEditContext(7, 'secret'); });
  expect(result.current.session).toBeNull();
  expect(getEditContext(7)).toBeUndefined();
});
test('returning to the asset in the same tab restores the lease and allows cancellation', async () => {
  const { result, unmount } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await act(async () => { await result.current.start(); });
  unmount();
  const reopened = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await waitFor(() => expect(reopened.result.current.session).toEqual(session));
  expect(assetService.startEditing).toHaveBeenCalledTimes(1);
  await act(async () => { await reopened.result.current.cancel(); });
  expect(assetService.endEditing).toHaveBeenCalledWith(7, session);
  expect(getEditContext(7)).toBeUndefined();
});
test('returning to the asset does not restore an expired lease that another editor replaced', async () => {
  const { result, unmount } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await act(async () => { await result.current.start(); });
  unmount();
  remote = { locked: true, sessionId: 'another', holderName: 'Alice' };
  const reopened = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await waitFor(() => expect(reopened.result.current.status).toEqual(remote));
  expect(reopened.result.current.session).toBeNull();
  expect(getEditContext(7)).toBeUndefined();
});
test('disabled rollout makes no status or acquisition requests', async () => {
  renderHook(() => useAssetEditing(7, false, 'login:8'));
  expect(assetService.editStatus).not.toHaveBeenCalled(); expect(assetService.startEditing).not.toHaveBeenCalled();
});
test('an old status response cannot clear a newly acquired editing session', async () => {
  let resolveOld;
  assetService.editStatus.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const { result } = renderHook(() => useAssetEditing(7, true, 'login:8'));
  await act(async () => { await result.current.start(); });
  await act(async () => { resolveOld({ locked: false }); });
  expect(result.current.session).toEqual(session); expect(getEditContext(7).token).toBe('secret');
});
