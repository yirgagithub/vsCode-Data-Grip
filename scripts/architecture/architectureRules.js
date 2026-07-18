const manifest = require('../../architecture/modules.json');

validateManifest(manifest);

const normalize = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '');

function validateManifest(value) {
  if (!value.roots || typeof value.roots !== 'object' || !Array.isArray(value.legacyRoots)) {
    throw new Error('Architecture manifest must define roots and legacyRoots');
  }
  if (Object.values(value.roots).some((root) => typeof root !== 'string') || value.legacyRoots.some((root) => typeof root !== 'string')) {
    throw new Error('Architecture manifest roots must be strings');
  }
}

function matchesManifestPath(file, configuredPath) {
  return configuredPath.endsWith('/') ? file.startsWith(configuredPath) : file === configuredPath;
}

function classifyModule(file) {
  const normalized = normalize(file);
  for (const [kind, root] of Object.entries(manifest.roots)) {
    if (matchesManifestPath(normalized, root)) return kind;
  }
  if (manifest.legacyRoots.some((root) => matchesManifestPath(normalized, root))) return 'legacy';
  return 'unknown';
}

function isFeaturePublicEntry(file) {
  const parts = normalize(file).split('/');
  return parts.length === 4 && parts[0] === 'src' && parts[1] === 'features' && parts[3] === manifest.featurePublicEntry;
}

function isAllowedDependency(from, to) {
  const fromKind = classifyModule(from);
  const toKind = classifyModule(to);
  if (fromKind === 'unknown' || toKind === 'unknown') return false;
  if (fromKind === 'legacy' || toKind === 'legacy') return true;
  if (fromKind === 'core') return toKind === 'core';
  if (fromKind === 'feature') {
    return toKind === 'core' || (toKind === 'feature' && (sameFeature(from, to) || isFeaturePublicEntry(to)));
  }
  if (fromKind === 'adapter') return toKind !== 'app';
  return true;
}

function sameFeature(from, to) {
  const fromParts = normalize(from).split('/');
  const toParts = normalize(to).split('/');
  return fromParts[2] === toParts[2];
}

module.exports = { classifyModule, isAllowedDependency };
