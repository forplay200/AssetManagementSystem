/* global BigInt */

// Pure JavaScript; mirrored in frontend/src/utils/modelReferences.js so upload
// diagnostics and server validation use the same reference rules.
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const MAP_COMMANDS = /^(map_\w+|bump|norm|disp|decal)$/i;
const decoder = new TextDecoder();

function extension(value) { return String(value || '').split('.').pop().toLowerCase(); }
function basename(value) { return String(value || '').replace(/\\/g, '/').split('/').pop(); }
function unquote(value) { return value.trim().replace(/^(?:"(.*)"|'(.*)')$/, (_, a, b) => a ?? b); }
function stripComment(value) {
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (quote) { if (character === quote) quote = ''; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '#') return value.slice(0, i);
  }
  return value;
}
function normalizePath(value) {
  const parts = [];
  for (const part of String(value || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
function resolvePath(source, reference) {
  if (/^(?:[a-z]:|\/|[a-z]+:\/\/)/i.test(reference)) return normalizePath(reference);
  return normalizePath(source.slice(0, Math.max(0, source.lastIndexOf('/') + 1)) + reference);
}
function materialLibraries(value) {
  const quoted = value.match(/"[^"]+"|'[^']+'|[^\r\n]*?\.mtl(?=\s|$)/gi);
  return (quoted || [value]).map(unquote).map(v => v.trim()).filter(Boolean);
}
function texturePath(value) {
  const tokens = value.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const fixed = { '-mm': 2, '-bm': 1, '-blendu': 1, '-blendv': 1, '-cc': 1, '-clamp': 1, '-texres': 1, '-imfchan': 1, '-type': 1, '-colorspace': 1 };
  let i = 0;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const option = tokens[i++].toLowerCase();
    if (['-s', '-o', '-t'].includes(option)) {
      let count = 0;
      while (count < 3 && i < tokens.length && /^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?$/i.test(tokens[i])) { i++; count++; }
    } else if (fixed[option]) i += fixed[option];
    else throw new Error('Unsupported MTL texture option: ' + option);
  }
  return unquote(tokens.slice(i).join(' '));
}

// Read binary FBX structure without decompressing geometry or embedded images.
function binaryFbxNodes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 27) throw new Error('Invalid FBX header.');
  const version = view.getUint32(23, true);
  const wide = version >= 7500;
  const header = wide ? 25 : 13;
  let count = 0;
  let arrayBytes = 0;
  const integer = offset => {
    if (offset + (wide ? 8 : 4) > bytes.length) throw new Error('Truncated FBX.');
    const value = wide ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true);
    if (!Number.isSafeInteger(value)) throw new Error('Invalid FBX offset.');
    return value;
  };
  const readNode = (start, depth) => {
    if (++count > 250000 || depth > 96 || start + header > bytes.length) throw new Error('FBX structure exceeds the import limit.');
    const end = integer(start);
    if (end === 0) return null;
    const propertyCount = integer(start + (wide ? 8 : 4));
    const propertyLength = integer(start + (wide ? 16 : 8));
    const nameLength = view.getUint8(start + header - 1);
    const propertyStart = start + header + nameLength;
    const propertyEnd = propertyStart + propertyLength;
    if (end <= start || end > bytes.length || propertyEnd > end || propertyCount > 100000) throw new Error('Invalid FBX node.');
    const name = decoder.decode(bytes.subarray(start + header, propertyStart));
    const properties = [];
    let offset = propertyStart;
    for (let i = 0; i < propertyCount; i++) {
      const type = String.fromCharCode(bytes[offset++]);
      if ('SR'.includes(type)) {
        if (offset + 4 > propertyEnd) throw new Error('Invalid FBX property.');
        const length = view.getUint32(offset, true); offset += 4;
        if (offset + length > propertyEnd) throw new Error('Invalid FBX string.');
        properties.push(type === 'S' ? decoder.decode(bytes.subarray(offset, offset + length)) : { embeddedBytes: length, offset });
        offset += length;
      } else if ('fdlibc'.includes(type)) {
        if (offset + 12 > propertyEnd) throw new Error('Invalid FBX array.');
        arrayBytes += view.getUint32(offset, true) * ({ f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 }[type]);
        if (arrayBytes > 256 * 1024 * 1024) throw new Error('Decoded FBX geometry exceeds 256 MB.');
        const length = view.getUint32(offset + 8, true); offset += 12 + length;
        properties.push(null);
      } else {
        const length = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[type];
        if (!length) throw new Error('Unsupported FBX property.');
        offset += length; properties.push(null);
      }
      if (offset > propertyEnd) throw new Error('Truncated FBX property.');
    }
    const children = [];
    offset = propertyEnd;
    while (offset + header <= end) {
      const child = readNode(offset, depth + 1);
      if (!child) break;
      children.push(child); offset = child.end;
    }
    return { name, properties, children, start, end, propertyStart, propertyEnd };
  };
  const nodes = [];
  let offset = 27;
  while (offset + header <= bytes.length) {
    const node = readNode(offset, 0);
    if (!node) break;
    nodes.push(node); offset = node.end;
  }
  return { nodes, bytes, version, header, footerStart: offset };
}

function inspectFbx(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const binary = decoder.decode(bytes.subarray(0, 20)).startsWith('Kaydara FBX Binary');
  const videos = [];
  let hasUV = false;
  if (binary) {
    const parsed = binaryFbxNodes(bytes);
    if (parsed.version < 6400) throw new Error('Binary FBX version 6400 or later is required.');
    const walk = nodes => nodes.forEach(node => {
      if (node.name === 'LayerElementUV') hasUV = true;
      if (node.name === 'Video') {
        const child = name => node.children.find(n => n.name === name)?.properties[0];
        const reference = child('RelativeFilename') || child('Filename');
        const content = child('Content');
        if (reference) videos.push({ reference, embedded: Boolean(content?.embeddedBytes || (typeof content === 'string' && content.length)), content: content?.embeddedBytes ? bytes.subarray(content.offset, content.offset + content.embeddedBytes) : content });
      }
      walk(node.children);
    });
    walk(parsed.nodes);
  } else {
    const text = decoder.decode(bytes);
    const version = text.match(/FBXVersion\s*:\s*(\d+)/);
    if (!version || Number(version[1]) < 7000) throw new Error('ASCII FBX version 7000 or later is required.');
    hasUV = /LayerElementUV\s*:/.test(text);
    const blocks = text.match(/\bVideo\s*:[^\r\n]*\{[\s\S]*?\n\s*\}/g) || [];
    for (const block of blocks) {
      const relative = block.match(/\bRelativeFilename\s*:\s*"([^"]*)"/);
      const absolute = block.match(/\bFilename\s*:\s*"([^"]*)"/);
      const reference = relative?.[1] || absolute?.[1];
      const content = block.match(/\bContent\s*:\s*,?\s*"([A-Za-z0-9+/=\s]+)"/);
      if (reference) videos.push({ reference, embedded: Boolean(content), content: content?.[1] });
    }
  }
  return { videos, hasUV };
}

function inspectPackage(resources, bindings = {}) {
  const main = resources.find(r => r.kind === 'source');
  const format = extension(main?.path);
  const references = [];
  const issues = [];
  const warnings = [];
  let hasUV = false;
  const materials = new Set();
  const usedMaterials = new Set();
  const choose = (source, reference, kind, embedded = false) => {
    const id = source.id + ':' + kind + ':' + reference;
    const expected = resolvePath(source.path, reference);
    const candidates = resources.filter(r => r.kind === kind);
    let matches = candidates.filter(r => r.path === expected);
    if (!matches.length) matches = candidates.filter(r => r.path.toLowerCase() === expected.toLowerCase());
    if (!matches.length) matches = candidates.filter(r => basename(r.path).toLowerCase() === basename(reference).toLowerCase());
    const explicit = bindings[id] && candidates.find(r => r.id === bindings[id]);
    const found = explicit || (matches.length === 1 ? matches[0] : null);
    const supported = kind !== 'texture' || IMAGE_EXTENSIONS.includes(extension(reference));
    const status = !supported ? 'unsupported' : embedded ? 'embedded' : found ? 'linked' : matches.length > 1 ? 'conflict' : 'missing';
    const entry = { id, sourceId: source.id, reference, kind, status, resourceId: found?.id || null, embedded };
    if (!references.some(r => r.id === id)) references.push(entry);
    if (['missing', 'conflict', 'unsupported'].includes(status)) issues.push({ code: status, reference, message: status === 'conflict' ? 'Choose a file for ' + reference + '; several files have the same name.' : status === 'unsupported' ? 'Unsupported preview image: ' + reference + '. Use PNG or JPEG.' : 'Missing file: ' + reference });
    return found;
  };
  if (!main) return { format, references, issues: [{ code: 'source', message: 'Choose a main model.' }], warnings, hasUV };
  if (format === 'obj') {
    const text = main.text || '';
    hasUV = /^\s*vt\s+/m.test(text);
    for (const line of text.split(/\r?\n/)) {
      const match = stripComment(line).trim().match(/^(mtllib|usemtl)\s+(.+)$/i);
      if (match?.[1].toLowerCase() === 'mtllib') materialLibraries(match[2]).forEach(ref => choose(main, ref, 'material'));
      if (match?.[1].toLowerCase() === 'usemtl') usedMaterials.add(match[2].trim());
    }
    const linked = new Set(references.filter(r => r.kind === 'material' && r.resourceId).map(r => r.resourceId));
    if (!linked.size && resources.some(r => r.kind === 'material')) warnings.push('The OBJ does not reference the selected MTL. Export the OBJ with material references.');
    for (const resource of resources.filter(r => linked.has(r.id))) {
      for (const line of (resource.text || '').split(/\r?\n/)) {
        const match = stripComment(line).trim().match(/^(\S+)\s+(.+)$/);
        if (!match) continue;
        if (match[1].toLowerCase() === 'newmtl') {
          const name = match[2].trim();
          if (materials.has(name)) issues.push({ code: 'material-conflict', message: 'Repeated material name: ' + name });
          materials.add(name);
        } else if (MAP_COMMANDS.test(match[1])) {
          try { const ref = texturePath(match[2]); if (ref) choose(resource, ref, 'texture'); }
          catch (error) { issues.push({ code: 'material-option', message: error.message }); }
        }
      }
    }
    usedMaterials.forEach(name => { if (!materials.has(name)) issues.push({ code: 'material', message: 'Missing material definition: ' + name }); });
  } else if (format === 'fbx') {
    try {
      const inspected = inspectFbx(main.bytes);
      hasUV = inspected.hasUV;
      inspected.videos.forEach(video => choose(main, video.reference, 'texture', video.embedded));
    } catch (error) { issues.push({ code: 'fbx', message: 'FBX inspection failed: ' + error.message }); }
  }
  if (references.some(r => r.kind === 'texture') && !hasUV) issues.push({ code: 'uv', message: 'Texture references were found, but no UV coordinates were detected.' });
  resources.filter(r => r.kind !== 'source' && !references.some(ref => ref.resourceId === r.id)).forEach(r => warnings.push('Stored but not linked to the model: ' + r.path));
  return { format, references, issues, warnings, hasUV, embeddedCount: references.filter(r => r.embedded).length };
}

// Used by Three.js and portable OBJ downloads; preserve the original in storage.
function rewriteMtl(text, mapper) {
  return text.split(/\r?\n/).map(line => {
    const match = stripComment(line).trim().match(/^(\S+)\s+(.+)$/);
    if (!match) return line;
    if (!MAP_COMMANDS.test(match[1])) return match[1] + ' ' + match[2];
    let reference;
    try { reference = texturePath(match[2]); } catch { return line; }
    const target = mapper(reference);
    if (!target) return '# unavailable ' + line;
    // MTLLoader supports -bm, -s, -o. Retain those while removing filename quotes.
    const options = match[2].match(/-(?:bm\s+[-+\d.eE]+|[so]\s+[-+\d.eE]+(?:\s+[-+\d.eE]+){0,2})/g) || [];
    return match[1] + ' ' + (options.length ? options.join(' ') + ' ' : '') + target;
  }).join('\n');
}

// Rebind external FBX paths without changing geometry, animation or image data.
// Binary offsets are rebuilt into one output buffer, avoiding repeated subtree copies.
function rewriteFbx(input, mapper) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const encoder = new TextEncoder();
  if (!decoder.decode(bytes.subarray(0, 20)).startsWith('Kaydara FBX Binary')) {
    return encoder.encode(decoder.decode(bytes).replace(/((?:RelativeFilename|Filename|FileName)\s*:\s*")([^"]*)(")/g, (whole, prefix, name, suffix) => prefix + (mapper(name) || name) + suffix));
  }
  const parsed = binaryFbxNodes(bytes);
  const sizes = new Map(); const replacements = new Map();
  const measure = node => {
    let difference = 0;
    if (['RelativeFilename', 'Filename', 'FileName'].includes(node.name) && node.properties.length === 1 && typeof node.properties[0] === 'string') {
      const target = mapper(node.properties[0]);
      if (target && target !== node.properties[0]) {
        const name = encoder.encode(target); const property = new Uint8Array(5 + name.length);
        property[0] = 83; new DataView(property.buffer).setUint32(1, name.length, true); property.set(name, 5);
        replacements.set(node, property); difference = property.length - (node.propertyEnd - node.propertyStart);
      }
    }
    node.children.forEach(child => { difference += measure(child) - (child.end - child.start); });
    const size = node.end - node.start + difference; sizes.set(node, size); return size;
  };
  let delta = 0; parsed.nodes.forEach(node => { delta += measure(node) - (node.end - node.start); });
  if (bytes.length + delta > 150 * 1024 * 1024) throw new Error('Rebound FBX exceeds the import limit.');
  const output = new Uint8Array(bytes.length + delta); const view = new DataView(output.buffer);
  output.set(bytes.subarray(0, 27));
  const write = (node, start) => {
    const property = replacements.get(node) || bytes.subarray(node.propertyStart, node.propertyEnd);
    const head = bytes.subarray(node.start, node.propertyStart);
    output.set(head, start); let offset = start + head.length;
    output.set(property, offset); offset += property.length;
    node.children.forEach(child => { offset = write(child, offset); });
    const tailStart = node.children.length ? node.children[node.children.length - 1].end : node.propertyEnd;
    output.set(bytes.subarray(tailStart, node.end), offset); offset += node.end - tailStart;
    if (parsed.version >= 7500) { view.setBigUint64(start, BigInt(start + sizes.get(node)), true); view.setBigUint64(start + 16, BigInt(property.length), true); }
    else { view.setUint32(start, start + sizes.get(node), true); view.setUint32(start + 8, property.length, true); }
    return offset;
  };
  let offset = 27; parsed.nodes.forEach(node => { offset = write(node, offset); });
  output.set(bytes.subarray(parsed.footerStart), offset);
  return output;
}

function matchingFbxReference(references, filename) {
  const normalized = normalizePath(filename).toLowerCase();
  let entries = references.filter(ref => ref.kind === 'texture' && !ref.embedded && ref.resourceId && normalizePath(ref.reference).toLowerCase() === normalized);
  if (!entries.length) entries = references.filter(ref => ref.kind === 'texture' && !ref.embedded && ref.resourceId && normalized.endsWith('/' + normalizePath(ref.reference).toLowerCase()));
  if (!entries.length) entries = references.filter(ref => ref.kind === 'texture' && !ref.embedded && ref.resourceId && basename(ref.reference).toLowerCase() === basename(filename).toLowerCase());
  const ids = new Set(entries.map(ref => ref.resourceId));
  return ids.size === 1 ? entries[0] : null;
}

module.exports = { IMAGE_EXTENSIONS, extension, basename, normalizePath, resolvePath, materialLibraries, texturePath, binaryFbxNodes, inspectFbx, inspectPackage, rewriteMtl, rewriteFbx, matchingFbxReference };
