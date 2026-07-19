const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { classifyModule, isAllowedDependency } = require('./architectureRules');

function checkArchitecture(root) {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error(`No tsconfig.json found under ${root}`);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length) throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  const sourceRoot = path.join(root, 'src');
  const files = parsed.fileNames.filter((file) => isUnder(file, sourceRoot));
  const violations = [];
  const featureGraph = new Map();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(file, text)) {
      const resolution = ts.resolveModuleName(specifier, file, parsed.options, ts.sys).resolvedModule;
      if (!resolution) {
        const literalTarget = path.resolve(path.dirname(file), specifier);
        if (fs.existsSync(literalTarget) && fs.statSync(literalTarget).isFile()) continue;
        if (specifier.startsWith('.')) violations.push({ from: relative(root, file), to: relative(root, path.resolve(path.dirname(file), specifier)), reason: `unresolved relative import "${specifier}"` });
        continue;
      }
      const target = resolution.resolvedFileName;
      if (!isUnder(target, sourceRoot)) continue;
      const fromRelative = relative(root, file);
      const toRelative = relative(root, target);
      if (fromRelative === toRelative) violations.push({ from: fromRelative, to: toRelative, reason: 'circular module dependency: file imports itself' });
      if (!isAllowedDependency(fromRelative, toRelative)) violations.push({ from: fromRelative, to: toRelative, reason: 'forbidden dependency direction or deep feature import' });
      addFeatureEdge(featureGraph, fromRelative, toRelative);
    }
  }
  violations.push(...featureCycleViolations(featureGraph));
  return violations.sort((a, b) => `${a.from}:${a.to}:${a.reason}`.localeCompare(`${b.from}:${b.to}:${b.reason}`));
}

function importSpecifiers(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, path.extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers = [];
  const add = (node) => { if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text); };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function addFeatureEdge(graph, from, to) {
  if (classifyModule(from) !== 'feature' || classifyModule(to) !== 'feature') return;
  const fromFeature = from.split('/')[2];
  const toFeature = to.split('/')[2];
  if (fromFeature === toFeature) return;
  if (!graph.has(fromFeature)) graph.set(fromFeature, new Set());
  graph.get(fromFeature).add(toFeature);
  if (!graph.has(toFeature)) graph.set(toFeature, new Set());
}

function featureCycleViolations(graph) {
  const cycles = [];
  const nodes = [...graph.keys()].sort();
  for (const start of nodes) {
    const found = findCycle(start, start, graph, [start], new Set([start]));
    if (found) cycles.push(found);
  }
  const unique = new Map();
  for (const cycle of cycles) {
    const body = cycle.slice(0, -1);
    const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
    const canonical = rotations.map((item) => item.join(' -> ')).sort()[0];
    if (!unique.has(canonical)) unique.set(canonical, `${canonical} -> ${canonical.split(' -> ')[0]}`);
  }
  return [...unique.values()].sort().map((cycle) => ({ from: `src/features/${cycle.split(' -> ')[0]}/`, to: `src/features/${cycle.split(' -> ').slice(-1)[0]}/`, reason: `circular feature dependency: ${cycle}` }));
}

function findCycle(start, current, graph, pathSoFar, seen) {
  for (const next of [...(graph.get(current) || [])].sort()) {
    if (next === start) return [...pathSoFar, start];
    if (!seen.has(next)) {
      seen.add(next);
      const found = findCycle(start, next, graph, [...pathSoFar, next], seen);
      seen.delete(next);
      if (found) return found;
    }
  }
}

function isUnder(file, directory) { const rel = path.relative(directory, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
function relative(root, file) { return path.relative(root, file).split(path.sep).join('/'); }

if (require.main === module) {
  const violations = checkArchitecture(process.cwd());
  if (violations.length) { console.error(violations.map((item) => `${item.from} -> ${item.to}: ${item.reason}`).join('\n')); process.exitCode = 1; }
}
module.exports = { checkArchitecture };
