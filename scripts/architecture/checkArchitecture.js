const fs = require('fs');
const path = require('path');
const { isAllowedDependency } = require('./architectureRules');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g;

function checkArchitecture(root) {
  const sourceRoot = path.join(root, 'src');
  const violations = [];
  for (const file of sourceFiles(sourceRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith('.')) continue;
      const target = resolveSourceImport(file, specifier);
      if (!target) continue;
      const fromRelative = relative(root, file);
      const toRelative = relative(root, target);
      if (!isAllowedDependency(fromRelative, toRelative)) {
        violations.push({ from: fromRelative, to: toRelative, reason: 'forbidden dependency direction or deep feature import' });
      }
    }
  }
  return violations.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : SOURCE_EXTENSIONS.includes(path.extname(full)) ? [full] : [];
  });
}

function resolveSourceImport(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`))
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

if (require.main === module) {
  const violations = checkArchitecture(process.cwd());
  if (violations.length) {
    console.error(violations.map((item) => `${item.from} -> ${item.to}: ${item.reason}`).join('\n'));
    process.exitCode = 1;
  }
}

module.exports = { checkArchitecture };
