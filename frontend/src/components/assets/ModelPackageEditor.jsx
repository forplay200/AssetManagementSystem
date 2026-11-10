import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Box, CheckCircle2, FilePlus2, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import ExpandableList from '../common/ExpandableList';
import { formatBytes } from '../../utils/formatters';
import { extension, inspectPackage } from '../../utils/modelReferences';

const ThreeModelPreview = lazy(() => import('./ThreeModelPreview'));
const MB = 1024 * 1024;
function invalidPath(path) {
  return !path || path.length > 240 || /^[a-z]:|^\//i.test(path) || Array.from(path).some(character => character.charCodeAt(0) < 32) || /[<>:"|?*\\]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..');
}

export default function ModelPackageEditor({ file, onChange, initialAttachments = [], initialBindings = {}, disabled = false }) {
  const [attachments, setAttachments] = useState(initialAttachments);
  const [bindings, setBindings] = useState(initialBindings);
  const [geometryOnly, setGeometryOnly] = useState(false);
  const [state, setState] = useState({ loading: true, diagnostics: null, errors: [] });
  const [selectionError, setSelectionError] = useState('');
  const [preview, setPreview] = useState(null);
  const format = extension(file.name);
  const info = useMemo(() => ({ originalname: file.name }), [file]);

  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true }));
    onChange({ ready: false, canUpload: false });
    const inspect = async () => {
      const errors = [];
      if (file.size > 50 * MB) errors.push('The main model exceeds 50 MB.');
      if (attachments.length > 32) errors.push('Select no more than 32 companion files.');
      if (file.size + attachments.reduce((sum, resource) => sum + resource.file.size, 0) > 100 * MB) errors.push('The complete package exceeds 100 MB.');
      const paths = new Set([file.name.toLowerCase()]);
      for (const resource of attachments) {
        if (resource.kind === 'material' && format !== 'obj') errors.push('MTL files are used with OBJ, not FBX.');
        if (!['mtl', 'png', 'jpg', 'jpeg'].includes(extension(resource.path))) errors.push('Unsupported companion file: ' + resource.path);
        if (invalidPath(resource.path)) errors.push('Invalid relative path: ' + resource.path);
        if (paths.has(resource.path.toLowerCase())) errors.push('Duplicate path: ' + resource.path + '. Change its relative path.');
        paths.add(resource.path.toLowerCase());
        if (resource.file.size > (resource.kind === 'material' ? 2 : 10) * MB) errors.push(resource.path + ' exceeds its ' + (resource.kind === 'material' ? '2' : '10') + ' MB limit.');
      }
      const main = { id: 'main', kind: 'source', path: file.name, bytes: await file.arrayBuffer() };
      if (format === 'obj') main.text = new TextDecoder().decode(main.bytes);
      const resources = await Promise.all(attachments.map(async resource => ({ ...resource, ...(resource.kind === 'material' ? { text: await resource.file.text() } : {}) })));
      const diagnostics = inspectPackage([main, ...resources], bindings);
      const canUpload = !errors.length && !diagnostics.issues.some(issue => issue.code === 'fbx') && (geometryOnly || !diagnostics.issues.length);
      if (active) {
        setState({ loading: false, diagnostics, errors });
        onChange({ attachments, bindings, geometryOnly, diagnostics, ready: true, canUpload });
      }
    };
    inspect().catch(error => {
      if (active) { setState({ loading: false, diagnostics: null, errors: [error.message || 'The model could not be inspected.'] }); onChange({ ready: true, canUpload: false }); }
    });
    return () => { active = false; };
  }, [file, attachments, bindings, geometryOnly, format, onChange]);

  const updateAttachments = next => { setAttachments(next); setPreview(null); };
  const addFiles = candidates => {
    setSelectionError('');
    const additions = [];
    const rejected = [];
    for (const candidate of Array.from(candidates || [])) {
      const ext = extension(candidate.name);
      if (!['png', 'jpg', 'jpeg', ...(format === 'obj' ? ['mtl'] : [])].includes(ext)) { rejected.push(candidate.name); continue; }
      additions.push({ id: crypto.randomUUID(), path: candidate.webkitRelativePath || candidate.name, kind: ext === 'mtl' ? 'material' : 'texture', file: candidate });
    }
    if (rejected.length) setSelectionError('Not added: ' + rejected.join(', ') + '. Use ' + (format === 'obj' ? 'MTL, ' : '') + 'PNG or JPEG files.');
    updateAttachments([...attachments, ...additions]);
  };
  const diagnostics = state.diagnostics;
  const problems = diagnostics?.issues || [];
  const canPreview = !state.loading && !state.errors.length;

  return (
    <section className="mt-5 rounded-lg border border-white/[0.08] bg-zinc-950/40 p-4" aria-label="Model materials and textures">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><Box size={16} className="text-aether-primary" /> Materials and textures</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{format === 'obj' ? 'Add the MTL file referenced by your OBJ and its PNG/JPEG textures. The model needs UV coordinates to display textures.' : 'Embedded PNG/JPEG textures are read from the FBX. Add any external images referenced by the model.'} All files belong to one asset.</p>
      <label className={`secondary-button mt-3 w-fit cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}><FilePlus2 size={15} /> Add companion files<input type="file" multiple className="sr-only" disabled={disabled} accept={format === 'obj' ? '.mtl,.png,.jpg,.jpeg' : '.png,.jpg,.jpeg'} onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /></label>
      <div className="mt-3 rounded border border-dashed border-white/10 px-3 py-3 text-center text-xs text-zinc-400" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) addFiles(event.dataTransfer.files); }}>Drop companion files here</div>
      {attachments.length > 0 && <div className="mt-4"><h3 className="mb-3 text-sm font-medium text-zinc-300">Companion files ({attachments.length})</h3><ExpandableList items={attachments} limit={4} label="files" renderItem={resource => <div key={resource.id} className="rounded border border-white/[0.06] p-3">
        <div className="flex items-center justify-between gap-2"><span className="min-w-0 break-words text-sm text-zinc-300">{resource.file.name} <span className="text-zinc-400">· {resource.kind} · {formatBytes(resource.file.size)}</span></span><div className="flex shrink-0 items-center gap-3"><label className={`cursor-pointer text-xs text-violet-300 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>Replace<input type="file" className="sr-only" disabled={disabled} accept={resource.kind === 'material' ? '.mtl' : '.png,.jpg,.jpeg'} onChange={event => { const replacement = event.target.files?.[0]; if (!replacement) return; const directory = resource.path.includes('/') ? resource.path.slice(0, resource.path.lastIndexOf('/') + 1) : ''; setBindings(current => ({ ...current, ...Object.fromEntries((state.diagnostics?.references || []).filter(reference => reference.resourceId === resource.id).map(reference => [reference.id, resource.id])) })); updateAttachments(attachments.map(item => item.id === resource.id ? { ...item, file: replacement, path: directory + replacement.name } : item)); event.target.value = ''; }} /></label><button type="button" disabled={disabled} className="tag-action hover:text-zinc-200" aria-label={'Remove ' + resource.path} onClick={() => updateAttachments(attachments.filter(item => item.id !== resource.id))}><X size={14} /></button></div></div>
        <label className="mt-2 block"><span className="text-xs text-zinc-400">Relative path · use a folder path to distinguish files with the same name</span><input className="input mt-1 w-full text-xs" value={resource.path} disabled={disabled} onChange={event => updateAttachments(attachments.map(item => item.id === resource.id ? { ...item, path: event.target.value } : item))} /></label>
      </div>} /></div>}
      {selectionError && <p className="mt-3 text-xs text-amber-200" role="alert">{selectionError}</p>}
      {state.loading ? <p className="mt-4 flex items-center gap-2 text-xs text-zinc-400"><LoaderCircle size={13} className="animate-spin" /> Checking model references…</p> : <>
        {state.errors.map((error, index) => <p key={index} className="mt-3 text-xs text-red-200" role="alert">{error}</p>)}
        {!!diagnostics?.references.length && <div className="mt-4"><h3 className="mb-3 text-sm font-medium text-zinc-300">File references ({diagnostics.references.length})</h3><ExpandableList items={[...diagnostics.references].sort((a, b) => Number(["linked", "embedded"].includes(a.status)) - Number(["linked", "embedded"].includes(b.status)))} limit={4} label="references" renderItem={reference => <div key={reference.id} className="rounded border border-white/[0.06] p-3">
          <div className="flex items-start gap-2">{['linked', 'embedded'].includes(reference.status) ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-300" /> : <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-300" />}<span className="min-w-0 break-all text-xs text-zinc-300">{reference.reference}<span className="ml-2 text-zinc-400">{reference.status === 'embedded' ? 'Embedded image detected' : reference.status}</span></span></div>
          {!reference.embedded && reference.status !== 'unsupported' && <select className="input mt-2 w-full text-xs" disabled={disabled} aria-label={'File for ' + reference.reference} value={bindings[reference.id] || reference.resourceId || ''} onChange={event => { setBindings(current => ({ ...current, [reference.id]: event.target.value })); setPreview(null); }}><option value="">Choose a matching file</option>{attachments.filter(resource => resource.kind === reference.kind).map(resource => <option key={resource.id} value={resource.id}>{resource.path}</option>)}</select>}
        </div>} /></div>}
        {!!problems.length && <div className="mt-3 rounded border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-200"><p className="font-medium">Materials need attention</p><ul className="mt-2 space-y-1">{problems.map((problem, index) => <li key={index}>{problem.message}</li>)}</ul></div>}
        {!!diagnostics?.warnings.length && <details className="mt-3 text-xs text-zinc-400"><summary className="cursor-pointer">{diagnostics.warnings.length} file notices</summary><ul className="mt-2 space-y-1">{diagnostics.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        {diagnostics && !problems.length && !state.errors.length && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={13} />{diagnostics.references.length ? 'Referenced files are ready. Preview to confirm the appearance.' : 'No external texture references detected.'}</p>}
      </>}
      <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-zinc-400"><input type="checkbox" className="mt-1 accent-violet-500" disabled={disabled} checked={geometryOnly} onChange={event => { setGeometryOnly(event.target.checked); setPreview(null); }} /><span>Upload geometry only. Companion files are kept for download, but material and texture display is disabled for this version.</span></label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-zinc-400">Main ≤ 50 MB · Texture ≤ 10 MB · Package ≤ 100 MB · 32 companion files</span><button type="button" className="secondary-button" disabled={disabled || !canPreview} onClick={() => setPreview({ source: file, attachments, bindings, geometryOnly, diagnostics })}><Box size={14} /> Preview model</button></div>
      {preview && <div className="mt-4 overflow-hidden rounded border border-white/[0.08]"><Suspense fallback={<div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" size={20} /></div>}><ThreeModelPreview localPackage={preview} info={info} /></Suspense></div>}
    </section>
  );
}
