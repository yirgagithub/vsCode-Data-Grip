const { spawnSync } = require('node:child_process');

run('npm', ['run', 'build']);
run('npm', ['run', 'compile:e2e']);
run('npx', ['vscode-test', '--code-version', '1.128.1'], {
  QUERYDECK_ENABLE_TEST_COMMANDS: 'true',
  MARKETPLACE_MEDIA_CAPTURE_DIR: 'media/marketplace'
});

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
