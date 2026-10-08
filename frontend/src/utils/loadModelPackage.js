import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { assetService } from '../services/assetService';
import { basename, normalizePath, inspectPackage, rewriteMtl, rewriteFbx, matchingFbxReference } from './modelReferences';

const EMPTY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

export function disposeModel(model) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  model?.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    (Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean).forEach(material => materials.add(material));
  });
  materials.forEach(material => Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); }));
  textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
}

async function previewImage(blob) {
  if (typeof createImageBitmap !== 'function') return blob;
  const image = await createImageBitmap(blob);
  try {
    if (image.width * image.height > 16777216) throw new Error('A texture exceeds the 16 million pixel limit.');
    if (Math.max(image.width, image.height) <= 2048) return blob;
    const scale = 2048 / Math.max(image.width, image.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  } finally { image.close(); }
}

export async function loadModelPackage({ assetId, localPackage, info, versionId }) {
  const urls = new Set(); const warnings = []; const extraMaterials = new Set();
  let model;
  const cleanup = () => { disposeModel(model); extraMaterials.forEach(material => { Object.values(material).forEach(value => value?.isTexture && value.dispose()); material.dispose(); }); urls.forEach(url => URL.revokeObjectURL(url)); };
  try {
    let source; let resources; let manifest;
    if (localPackage) {
      source = localPackage.source;
      resources = [{ id: 'main', path: source.name, kind: 'source', file: source }, ...(localPackage.attachments || [])];
      manifest = { mode: localPackage.geometryOnly ? 'geometry' : 'materials', diagnostics: localPackage.diagnostics, bindings: localPackage.bindings || {} };
    } else {
      const stored = await assetService.getPackage(assetId, versionId);
      if (!stored) {
        source = versionId ? (await assetService.downloadVersion(assetId, versionId, { main: true })).blob : await assetService.getPreview(assetId);
        resources = [{ id: 'main', path: info.originalname, kind: 'source', file: source }];
        manifest = { mode: 'materials', bindings: {} };
      } else {
        manifest = stored;
        resources = [];
        const needed = stored.mode === 'geometry' ? stored.files.filter(file => file.kind === 'source') : stored.files;
        // Limit concurrent protected downloads to four files.
        for (let start = 0; start < needed.length; start += 4) {
          const batch = await Promise.all(needed.slice(start, start + 4).map(async file => ({ ...file, file: await assetService.getResource(assetId, file.id, { versionId, preview: file.kind === 'texture', packageId: stored.packageId }) })));
          resources.push(...batch);
        }
        source = resources.find(resource => resource.kind === 'source').file;
      }
    }
    const main = resources.find(resource => resource.kind === 'source');
    const format = main.path.split('.').pop().toLowerCase();
    const buffer = await source.arrayBuffer();
    main.bytes = buffer;
    if (format === 'obj') main.text = new TextDecoder().decode(buffer);
    for (const material of resources.filter(resource => resource.kind === 'material')) material.text = await material.file.text();
    const diagnostics = manifest.diagnostics || inspectPackage(resources, manifest.bindings);
    warnings.push(...diagnostics.issues.map(issue => issue.message), ...diagnostics.warnings);
    const geometryOnly = manifest.mode === 'geometry';
    const resourceUrls = new Map();
    if (!geometryOnly) {
      for (const resource of resources.filter(resource => resource.kind === 'texture')) {
        const blob = localPackage ? await previewImage(resource.file) : resource.file;
        const url = URL.createObjectURL(blob); urls.add(url); resourceUrls.set(resource.id, url);
      }
    }
    const manager = new THREE.LoadingManager();
    const completed = new Promise(resolve => { manager.onLoad = resolve; });
    manager.onError = url => { const id = [...resourceUrls.entries()].find(([, value]) => value === url)?.[0]; const file = resources.find(resource => resource.id === id); warnings.push('A texture could not be decoded: ' + (file?.path || 'embedded image')); };
    manager.setURLModifier(url => {
      if (url.startsWith('blob:')) { urls.add(url); return geometryOnly ? EMPTY_IMAGE : url; }
      if (url.startsWith('data:')) return geometryOnly ? EMPTY_IMAGE : url;
      if (geometryOnly) return EMPTY_IMAGE;
      const direct = resources.find(resource => url === 'aether-resource/' + resource.id || url.startsWith('aether-resource/' + resource.id + '/'));
      if (direct && resourceUrls.has(direct.id)) return resourceUrls.get(direct.id);
      const normalized = normalizePath(url);
      let entries = diagnostics.references.filter(ref => ref.kind === 'texture' && !ref.embedded && normalizePath(ref.reference) === normalized);
      if (!entries.length) entries = diagnostics.references.filter(ref => ref.kind === 'texture' && !ref.embedded && basename(ref.reference).toLowerCase() === basename(url).toLowerCase());
      const ids = new Set(entries.map(ref => ref.resourceId).filter(Boolean));
      if (ids.size === 1 && resourceUrls.has([...ids][0])) return resourceUrls.get([...ids][0]);
      warnings.push('Texture unavailable: ' + url);
      return EMPTY_IMAGE; // Never fetch model-supplied URLs or local filesystem paths.
    });
    manager.itemStart('aether-package');
    if (format === 'obj') {
      const loader = new OBJLoader(manager);
      if (!geometryOnly) {
        const linked = new Set(diagnostics.references.filter(ref => ref.kind === 'material' && ref.resourceId).map(ref => ref.resourceId));
        const text = resources.filter(resource => linked.has(resource.id)).map(resource => rewriteMtl(resource.text, reference => {
          const entry = diagnostics.references.find(ref => ref.sourceId === resource.id && ref.reference === reference);
          return entry?.resourceId ? 'aether-resource/' + entry.resourceId : null;
        })).join('\n');
        if (text.trim()) {
          const creator = new MTLLoader(manager).parse(text, '');
          creator.preload(); Object.values(creator.materials).forEach(material => extraMaterials.add(material));
          loader.setMaterials(creator);
        }
      }
      model = loader.parse(main.text);
    } else if (format === 'fbx') {
      const rebound = rewriteFbx(buffer, filename => {
        const entry = matchingFbxReference(diagnostics.references, filename);
        const target = entry && resources.find(resource => resource.id === entry.resourceId);
        return target ? 'aether-resource/' + target.id + '/' + basename(target.path) : null;
      });
      model = new FBXLoader(manager).parse(rebound.buffer.slice(rebound.byteOffset, rebound.byteOffset + rebound.byteLength), '');
    }
    else throw new Error('Unsupported model format.');
    manager.itemEnd('aether-package');
    let timer;
    try { await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Texture loading timed out.')), 30000); })]); }
    finally { clearTimeout(timer); }
    const textures = new Set();
    let meshCount = 0;
    model.traverse(child => {
      if (!child.isMesh) return;
      meshCount++;
      if (geometryOnly) {
        const old = Array.isArray(child.material) ? child.material : [child.material]; old.filter(Boolean).forEach(material => extraMaterials.add(material));
        child.material = new THREE.MeshPhongMaterial({ color: 0xb8bec7 });
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach(material => {
        if (material.map && !child.geometry.attributes.uv && !geometryOnly) warnings.push('A textured mesh has no UV coordinates.');
        Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
      });
    });
    if (!meshCount) throw new Error('The file contains no renderable mesh.');
    textures.forEach(texture => {
      const image = texture.image;
      if (!image?.width || !image?.height) return;
      if (Math.max(image.width, image.height) > 2048) {
        const scale = 2048 / Math.max(image.width, image.height);
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); texture.image = canvas; texture.needsUpdate = true;
      }
    });
    return { model, geometryOnly, diagnostics, warnings: [...new Set(warnings)], dispose: cleanup };
  } catch (error) { cleanup(); throw error; }
}
