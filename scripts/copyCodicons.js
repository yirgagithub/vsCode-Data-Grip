const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'node_modules', '@vscode', 'codicons', 'dist');
const targetDir = path.join(root, 'media', 'codicons');
const files = ['codicon.css', 'codicon.ttf'];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  } else if (!fs.existsSync(target)) {
    throw new Error(`Missing ${file}; install @vscode/codicons or restore media/codicons/${file}.`);
  }
}
