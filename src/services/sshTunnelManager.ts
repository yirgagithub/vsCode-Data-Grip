import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import { ConnectionConfigWithPassword } from '../types';

interface TunnelHandle {
  process: ChildProcess;
  localHost: string;
  localPort: number;
}

export class SshTunnelManager {
  private readonly tunnels = new Map<string, TunnelHandle>();

  async open(connection: ConnectionConfigWithPassword): Promise<ConnectionConfigWithPassword> {
    const tunnel = connection.sshTunnel;
    if (!tunnel?.enabled) {
      return connection;
    }
    const existing = this.tunnels.get(connection.id);
    if (existing) {
      await this.close(connection.id);
    }
    const localHost = tunnel.localHost?.trim() || '127.0.0.1';
    const localPort = tunnel.localPort && tunnel.localPort > 0 ? Math.floor(tunnel.localPort) : await freePort(localHost);
    const sshHost = tunnel.host.trim();
    const sshUser = tunnel.username.trim();
    if (!sshHost || !sshUser) {
      throw new Error('SSH tunnel requires a bastion host and username.');
    }
    const args = [
      '-N',
      '-L',
      `${localHost}:${localPort}:${connection.host}:${connection.port}`,
      '-p',
      String(tunnel.port && tunnel.port > 0 ? Math.floor(tunnel.port) : 22),
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3'
    ];
    if (tunnel.privateKeyPath?.trim()) {
      args.push('-i', tunnel.privateKeyPath.trim());
    }
    args.push(`${sshUser}@${sshHost}`);

    const process = spawn('ssh', args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    const stderr: string[] = [];
    process.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    const exitPromise = new Promise<never>((_, reject) => {
      process.once('error', reject);
      process.once('exit', (code, signal) => {
        reject(new Error(`SSH tunnel exited before it was ready${code !== null ? ` (code ${code})` : ''}${signal ? ` (signal ${signal})` : ''}${stderr.length ? `: ${stderr.join('').trim()}` : ''}`));
      });
    });
    await Promise.race([
      waitForListening(localHost, localPort, 10_000),
      exitPromise
    ]);
    this.tunnels.set(connection.id, { process, localHost, localPort });
    return {
      ...connection,
      host: localHost,
      port: localPort
    };
  }

  async close(connectionId: string): Promise<void> {
    const tunnel = this.tunnels.get(connectionId);
    if (!tunnel) {
      return;
    }
    this.tunnels.delete(connectionId);
    await stopProcess(tunnel.process);
  }
}

async function freePort(host: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not allocate a free TCP port.')));
      }
    });
  });
}

async function waitForListening(host: string, port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect(host, port)) {
      return;
    }
    await delay(150);
  }
  throw new Error(`SSH tunnel did not become ready on ${host}:${port}.`);
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function stopProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  process.kill('SIGTERM');
  await delay(500);
  if (process.exitCode === null && process.signalCode === null) {
    process.kill('SIGKILL');
    await delay(200);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
