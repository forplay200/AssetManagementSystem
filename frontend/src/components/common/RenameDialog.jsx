import { useId, useRef, useState } from 'react';
import Dialog from './Dialog';
import useConfirmation from '../../hooks/useConfirmation';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import { getApiError } from '../../services/api';

export default function RenameDialog({ title, initialName, minLength = 1, maxLength, sourceName, onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const id = useId();
  const { confirm, confirmation } = useConfirmation();
  const normalized = name.trim();
  const dirty = normalized !== initialName.trim();
  // Explicitly reject controls to match the API, including raw leading/trailing newlines.
  // eslint-disable-next-line no-control-regex
  const valid = normalized.length >= minLength && normalized.length <= maxLength && !/[\u0000-\u001f\u007f-\u009f]/.test(name);
  const clearSelf = useUnsavedChanges(dirty, title, pending);
  const close = async () => {
    if (running.current) return;
    if (dirty && !await confirm({ title: 'Discard name changes?', description: 'Your unsaved name will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' })) return;
    clearSelf(); onClose();
  };
  const save = async event => {
    event.preventDefault();
    if (running.current || !dirty || !valid) return;
    running.current = true; setPending(true); setError('');
    try { await onSave(normalized); clearSelf(); onClose(); }
    catch (failure) { setError(failure.response?.data?.errors?.[0]?.message || getApiError(failure, 'The name could not be saved. Please try again.')); }
    finally { running.current = false; setPending(false); }
  };
  return <><Dialog open title={title} busy={pending} onClose={close} description={sourceName ? 'Change the display name used in the library and search.' : 'Change the name shown to workspace members.'} footer={<><button type="button" className="secondary-button" disabled={pending} onClick={close}>Cancel</button><button type="submit" form={id} className="primary-button" disabled={pending || !dirty || !valid}>{pending ? 'Saving…' : 'Save'}</button></>}>
    <form id={id} aria-label={title} onSubmit={save}>
      <label htmlFor={`${id}-name`} className="label">Name</label>
      <input id={`${id}-name`} data-autofocus className="input mt-2 w-full" value={name} maxLength={maxLength} disabled={pending} onChange={event => { setName(event.target.value); setError(''); }} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="mt-2 text-xs text-zinc-400">{normalized.length} / {maxLength} characters · minimum {minLength}</p>
      {sourceName && <p className="mt-4 text-sm text-zinc-400 [overflow-wrap:anywhere]">Source file: {sourceName}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
    </form>
  </Dialog>{confirmation}</>;
}
