"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshTunnelManager = void 0;
const child_process_1 = require("child_process");
const net = __importStar(require("net"));
class SshTunnelManager {
    tunnels = new Map();
    async open(connection) {
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
        const process = (0, child_process_1.spawn)('ssh', args, {
            stdio: ['ignore', 'ignore', 'pipe']
        });
        const stderr = [];
        process.stderr.on('data', (chunk) => stderr.push(String(chunk)));
        const exitPromise = new Promise((_, reject) => {
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
    async close(connectionId) {
        const tunnel = this.tunnels.get(connectionId);
        if (!tunnel) {
            return;
        }
        this.tunnels.delete(connectionId);
        await stopProcess(tunnel.process);
    }
}
exports.SshTunnelManager = SshTunnelManager;
async function freePort(host) {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, host, () => {
            const address = server.address();
            if (address && typeof address === 'object') {
                const port = address.port;
                server.close(() => resolve(port));
            }
            else {
                server.close(() => reject(new Error('Could not allocate a free TCP port.')));
            }
        });
    });
}
async function waitForListening(host, port, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await canConnect(host, port)) {
            return;
        }
        await delay(150);
    }
    throw new Error(`SSH tunnel did not become ready on ${host}:${port}.`);
}
async function canConnect(host, port) {
    return await new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        const done = (ok) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(ok);
        };
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
    });
}
async function stopProcess(process) {
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
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=sshTunnelManager.js.map