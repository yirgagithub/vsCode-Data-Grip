import { runStdioMcpServer } from './mcp/server';

void runStdioMcpServer().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
