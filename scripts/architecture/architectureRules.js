const manifest = require('../../architecture/modules.json');

const REQUIRED_LAYERS = ['core', 'feature', 'adapter', 'app', 'legacy'];
const REQUIRED_ROOTS = ['core', 'feature', 'adapter', 'app'];
const MANIFEST_KEYS = new Set(['layers', 'roots', 'featurePublicEntry', 'legacyRoots', 'legacyDependencyExceptions']);
const normalize = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '');

function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Architecture manifest must be an object');
  for (const key of Object.keys(value)) if (!MANIFEST_KEYS.has(key)) throw new Error(`Architecture manifest has unknown key "${key}"`);
  if (!Array.isArray(value.layers) || value.layers.length !== REQUIRED_LAYERS.length ||
      !REQUIRED_LAYERS.every((layer) => value.layers.includes(layer)) || new Set(value.layers).size !== value.layers.length) {
    throw new Error(`Architecture manifest layers must contain exactly: ${REQUIRED_LAYERS.join(', ')}`);
  }
  if (!value.roots || typeof value.roots !== 'object' || Array.isArray(value.roots) ||
      Object.keys(value.roots).length !== REQUIRED_ROOTS.length || !REQUIRED_ROOTS.every((root) => typeof value.roots[root] === 'string')) {
    throw new Error(`Architecture manifest roots must define exactly: ${REQUIRED_ROOTS.join(', ')}`);
  }
  if (typeof value.featurePublicEntry !== 'string' || !value.featurePublicEntry || value.featurePublicEntry.includes('/') || value.featurePublicEntry.includes('\\')) {
    throw new Error('Architecture manifest featurePublicEntry must be a file name');
  }
  if (!Array.isArray(value.legacyRoots) || !Array.isArray(value.legacyDependencyExceptions)) throw new Error('Architecture manifest must define legacyRoots and legacyDependencyExceptions arrays');
  const roots = [...Object.values(value.roots), ...value.legacyRoots];
  if (roots.some((root) => typeof root !== 'string' || !root.startsWith('src/'))) throw new Error('Architecture manifest roots must be src-relative strings');
  for (const root of roots) {
    const isFile = /\.[^/]+$/.test(root);
    if (!isFile && !root.endsWith('/')) throw new Error(`Architecture directory root "${root}" requires a trailing separator`);
  }
  if (new Set(roots).size !== roots.length) throw new Error('Architecture manifest roots must be unique');
  for (let index = 0; index < roots.length; index++) for (let other = index + 1; other < roots.length; other++) {
    if (matchesManifestPath(roots[index], roots[other]) || matchesManifestPath(roots[other], roots[index])) throw new Error(`Architecture manifest roots overlap: ${roots[index]} and ${roots[other]}`);
  }
  for (const exception of value.legacyDependencyExceptions) {
    if (!exception || typeof exception !== 'object' || Object.keys(exception).sort().join(',') !== 'from,rationale,removalMilestone,to' ||
        !['from', 'to', 'rationale', 'removalMilestone'].every((key) => typeof exception[key] === 'string' && exception[key].trim())) {
      throw new Error('Each legacy dependency exception requires exactly from, to, rationale, and removalMilestone');
    }
  }
}

function matchesManifestPath(file, configuredPath) {
  return configuredPath.endsWith('/') ? file.startsWith(configuredPath) : file === configuredPath;
}

function classifyModule(file) {
  const normalized = normalize(file);
  for (const [kind, root] of Object.entries(manifest.roots)) if (matchesManifestPath(normalized, root)) return kind;
  if (manifest.legacyRoots.some((root) => matchesManifestPath(normalized, root))) return 'legacy';
  return 'unknown';
}

function isFeaturePublicEntry(file) {
  const parts = normalize(file).split('/');
  return parts.length === 4 && parts[0] === 'src' && parts[1] === 'features' && parts[3] === manifest.featurePublicEntry;
}

function isAllowedDependency(from, to, exceptions = manifest.legacyDependencyExceptions) {
  const normalizedFrom = normalize(from);
  const normalizedTo = normalize(to);
  const fromKind = classifyModule(normalizedFrom);
  const toKind = classifyModule(normalizedTo);
  if (fromKind === 'unknown' || toKind === 'unknown') return false;
  if (fromKind === 'legacy') return true;
  if (toKind === 'legacy') return exceptions.some((item) => normalize(item.from) === normalizedFrom && normalize(item.to) === normalizedTo);
  if (fromKind === 'core') return toKind === 'core';
  if (fromKind === 'feature') return toKind === 'core' || (toKind === 'feature' && (sameFeature(from, to) || isFeaturePublicEntry(to)));
  if (fromKind === 'adapter') return toKind !== 'app';
  return true;
}

function sameFeature(from, to) { return normalize(from).split('/')[2] === normalize(to).split('/')[2]; }

validateManifest(manifest);
module.exports = { classifyModule, isAllowedDependency, validateManifest };
