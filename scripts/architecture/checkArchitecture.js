const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { isAllowedDependency } = require('./architectureRules');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function checkArchitecture(root) {
  const sourceRoot = path.join(root, 'src');
  const violations = [];
  for (const file of sourceFiles(sourceRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const specifier of relativeImportSpecifiers(file, text)) {
      if (!specifier.startsWith('.')) continue;
      if (isExistingNonSourceImport(file, specifier)) continue;
      const target = resolveSourceImport(file, specifier);
      const fromRelative = relative(root, file);
      if (!target) {
        violations.push({
          from: fromRelative,
          to: relative(root, path.resolve(path.dirname(file), specifier)),
          reason: `unresolved relative import "${specifier}"`
        });
        continue;
      }
      const toRelative = relative(root, target);
      if (!isAllowedDependency(fromRelative, toRelative)) {
        violations.push({ from: fromRelative, to: toRelative, reason: 'forbidden dependency direction or deep feature import' });
      }
    }
  }
  return violations.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function isExistingNonSourceImport(from, specifier) {
  const target = path.resolve(path.dirname(from), specifier);
  return fs.existsSync(target) && fs.statSync(target).isFile() && !SOURCE_EXTENSIONS.includes(path.extname(target));
}

function relativeImportSpecifiers(file, text) {
  const scriptKind = path.extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const specifiers = [];

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) addStringLiteral(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
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
