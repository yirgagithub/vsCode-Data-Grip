const path = require('path');
const manifest = require('../../architecture/modules.json');

const normalize = (value) => value.split(path.sep).join('/').replace(/^\.\//, '');

function classifyModule(file) {
  const normalized = normalize(file);
  for (const [kind, root] of Object.entries(manifest.roots)) {
    if (normalized.startsWith(root)) return kind;
  }
  return 'legacy';
}

function isFeaturePublicEntry(file) {
  const parts = normalize(file).split('/');
  return parts.length === 4 && parts[0] === 'src' && parts[1] === 'features' && parts[3] === manifest.featurePublicEntry;
}

function isAllowedDependency(from, to) {
  const fromKind = classifyModule(from);
  const toKind = classifyModule(to);
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
