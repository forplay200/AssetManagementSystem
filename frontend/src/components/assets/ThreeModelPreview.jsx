import { useEffect, useRef, useState } from 'react';
import { Box, LoaderCircle, Move3D, TriangleAlert } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { loadModelPackage } from '../../utils/loadModelPackage';

export function modelFormat(info = {}) {
  const extension = (info.originalname || '').split('.').pop()?.toLowerCase();
  return ['obj', 'fbx'].includes(extension) ? extension : '';
}

export function parseModelBuffer(buffer, format) {
  if (format === 'obj') return new OBJLoader().parse(new TextDecoder().decode(buffer));
  if (format === 'fbx') return new FBXLoader().parse(buffer, '');
  throw new Error('Unsupported 3D model format.');
}

function prepareModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
  });

  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const largestDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) throw new Error('The model contains no visible geometry.');

  const scale = 4 / largestDimension;
  model.scale.multiplyScalar(scale);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  return size;
}

export default function ThreeModelPreview({ assetId, info, localPackage, versionId }) {
  const containerRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: '', warnings: [], geometryOnly: false });
  const [viewMode, setViewMode] = useState('materials');
  const applyModeRef = useRef(null);
  const format = modelFormat(info);

  useEffect(() => {
    let active = true;
    let animationFrame;
    let resizeObserver;
    let renderer;
    let controls;
    let model;
    let loaded;
    let grid;
    let geometryMaterial;
    const originalMaterials = [];
    const releaseModel = () => { originalMaterials.forEach(([mesh, material]) => { mesh.material = material; }); loaded?.dispose(); geometryMaterial?.dispose(); grid?.geometry.dispose(); grid?.material.dispose(); };

    const initialize = async () => {
      setState({ loading: true, error: '', warnings: [], geometryOnly: false });
      setViewMode('materials');
      try {
        loaded = await loadModelPackage({ assetId, info, localPackage, versionId });
        model = loaded.model;
        if (!active || !containerRef.current) { loaded.dispose(); return; }

        const container = containerRef.current;
        const width = Math.max(container.clientWidth, 320);
        const height = Math.max(container.clientHeight, 360);
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        renderer.setClearColor(0x09090b, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute('aria-label', `Interactive 3D preview of ${info.originalname}`);
        renderer.domElement.tabIndex = 0;
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x09090b, 12, 28);
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.screenSpacePanning = true;
        controls.minDistance = 2.5;
        controls.maxDistance = 24;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.3));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
        keyLight.position.set(4, 7, 5);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(-5, 2, -4);
        scene.add(fillLight);
        geometryMaterial = new THREE.MeshPhongMaterial({ color: 0xb8bec7 });
        model.traverse(mesh => { if (mesh.isMesh) originalMaterials.push([mesh, mesh.material]); });
        applyModeRef.current = mode => originalMaterials.forEach(([mesh, material]) => { mesh.material = mode === 'geometry' ? geometryMaterial : material; });
        const size = prepareModel(model);
        scene.add(model);
        grid = new THREE.GridHelper(12, 24, 0x52525b, 0x27272a);
        grid.position.y = -(size.y / 2) - 0.03;
        scene.add(grid);

        camera.position.set(5.6, 3.8, 6.8);
        controls.target.set(0, 0, 0);
        controls.update();

        resizeObserver = new ResizeObserver(() => {
          if (!active || !container.clientWidth || !container.clientHeight) return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight, false);
        });
        resizeObserver.observe(container);

        const renderFrame = () => {
          if (!active) return;
          controls.update();
          renderer.render(scene, camera);
          animationFrame = requestAnimationFrame(renderFrame);
        };
        renderFrame();
        setState({ loading: false, error: '', warnings: loaded.warnings, geometryOnly: loaded.geometryOnly });
      } catch (error) {
        controls?.dispose();
        releaseModel();
        renderer?.dispose();
        renderer?.domElement?.remove();
        if (active) setState({ loading: false, error: error.message || 'This model could not be rendered.', warnings: [], geometryOnly: false });
      }
    };

    initialize();
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      controls?.dispose();
      applyModeRef.current = null;
      releaseModel();
      renderer?.dispose();
      renderer?.domElement?.remove();
    };
  }, [assetId, format, info.originalname, info.filename, info.package?.packageId, localPackage, versionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-[360px] overflow-hidden bg-zinc-950 sm:min-h-[460px]" aria-label={`${format.toUpperCase()} 3D model viewer`}>
      <div ref={containerRef} className="absolute inset-0" />
      {state.loading && <div className="absolute inset-0 grid place-items-center bg-zinc-950"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" size={23} /><p className="mt-3 text-xs text-zinc-400">Loading 3D model…</p></div></div>}
      {state.error && <div className="absolute inset-0 grid place-items-center bg-zinc-950 p-6"><div className="max-w-sm text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-lg border border-amber-400/15 bg-amber-400/[0.06] text-amber-200/70"><TriangleAlert size={28} /></div><h3 className="mt-4 font-display text-sm font-semibold text-zinc-200">3D preview unavailable</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{state.error}</p></div></div>}
      {!state.loading && !state.error && <div className="absolute left-3 right-3 top-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-white/10 bg-black/70 px-2 py-1 text-xs text-zinc-300">{state.geometryOnly ? 'Geometry-only package' : state.warnings.length ? 'Materials need attention' : 'Materials ready'}</span>
          {!state.geometryOnly && <button type="button" className="rounded border border-white/10 bg-black/70 px-2 py-1 text-xs text-zinc-300" onClick={() => { const next = viewMode === 'materials' ? 'geometry' : 'materials'; applyModeRef.current?.(next); setViewMode(next); }}>{viewMode === 'materials' ? 'Show geometry' : 'Show materials'}</button>}
        </div>
        {state.warnings.length > 0 && <details className="rounded border border-amber-400/20 bg-black/80 px-3 py-2 text-xs text-amber-200"><summary className="cursor-pointer">{state.warnings.length} material / resource notices</summary><ul className="mt-2 max-h-28 space-y-1 overflow-auto">{state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      </div>}
      {!state.loading && !state.error && <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2"><span className="rounded border border-white/[0.08] bg-black/60 px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-400 backdrop-blur"><Box size={11} className="mr-1.5 inline" />{format}</span><span className="rounded border border-white/[0.08] bg-black/60 px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-400 backdrop-blur"><Move3D size={11} className="mr-1.5 inline" />Drag rotate · Shift-drag pan · Scroll zoom</span></div>}
    </div>
  );
}
