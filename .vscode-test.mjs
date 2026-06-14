import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'e2e/out/**/*.test.js',
  version: 'stable',
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  mocha: {
    ui: 'tdd',
    timeout: 20000
  }
});
