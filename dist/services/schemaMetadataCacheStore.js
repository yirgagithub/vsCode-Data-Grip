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
exports.SchemaMetadataCacheStore = exports.SCHEMA_METADATA_CACHE_VERSION = void 0;
exports.connectionMetadataFingerprint = connectionMetadataFingerprint;
exports.serializeSchemaCacheEntry = serializeSchemaCacheEntry;
exports.parseStoredSchemaCacheEntry = parseStoredSchemaCacheEntry;
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
exports.SCHEMA_METADATA_CACHE_VERSION = 1;
class SchemaMetadataCacheStore {
    baseUri;
    storageError;
    constructor(context) {
        this.baseUri = vscode.Uri.joinPath(context.globalStorageUri, 'schema-metadata-cache');
    }
    getStorageError() {
        return this.storageError;
    }
    async hydrate(connection, schemaName) {
        try {
            const uri = this.cacheUri(connection, schemaName);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const stored = parseStoredSchemaCacheEntry(connection, Buffer.from(bytes).toString('utf8'));
            if (!stored || stored.entry.schemaName !== schemaName) {
                return undefined;
            }
            this.storageError = undefined;
            return { ...stored.entry, source: 'disk' };
        }
        catch (error) {
            if (!this.isNotFound(error)) {
                this.storageError = error instanceof Error ? error.message : String(error);
            }
            return undefined;
        }
    }
    async persist(connection, entry) {
        try {
            await vscode.workspace.fs.createDirectory(this.connectionCacheUri(connection));
            await vscode.workspace.fs.writeFile(this.cacheUri(connection, entry.schemaName), Buffer.from(serializeSchemaCacheEntry(connection, entry), 'utf8'));
            this.storageError = undefined;
        }
        catch (error) {
            this.storageError = error instanceof Error ? error.message : String(error);
        }
    }
    async deleteConnection(connectionId) {
        try {
            await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.baseUri, safePath(connectionId)), { recursive: true, useTrash: false });
            this.storageError = undefined;
        }
        catch (error) {
            if (!this.isNotFound(error)) {
                this.storageError = error instanceof Error ? error.message : String(error);
            }
        }
    }
    connectionCacheUri(connection) {
        return vscode.Uri.joinPath(this.baseUri, safePath(connection.id), connectionMetadataFingerprint(connection));
    }
    cacheUri(connection, schemaName) {
        return vscode.Uri.joinPath(this.connectionCacheUri(connection), `${safePath(schemaName)}.json`);
    }
    isNotFound(error) {
        const code = error instanceof vscode.FileSystemError
            ? error.code
            : typeof error === 'object' && error !== null
                ? error.code
                : undefined;
        const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        return code === 'FileNotFound' || /\b(FileNotFound|ENOENT)\b/i.test(message);
    }
}
exports.SchemaMetadataCacheStore = SchemaMetadataCacheStore;
function connectionMetadataFingerprint(connection) {
    const identity = {
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        sslMode: connection.sslMode,
        defaultSchema: connection.defaultSchema ?? 'public'
    };
    return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}
function serializeSchemaCacheEntry(connection, entry) {
    const fingerprint = connectionMetadataFingerprint(connection);
    const stored = {
        version: exports.SCHEMA_METADATA_CACHE_VERSION,
        fingerprint,
        savedAt: Date.now(),
        entry: {
            ...entry,
            cacheVersion: exports.SCHEMA_METADATA_CACHE_VERSION,
            connectionFingerprint: fingerprint,
            source: 'disk'
        }
    };
    return `${JSON.stringify(stored)}\n`;
}
function parseStoredSchemaCacheEntry(connection, raw) {
    let stored;
    try {
        stored = JSON.parse(raw);
    }
    catch {
        return undefined;
    }
    if (stored.version !== exports.SCHEMA_METADATA_CACHE_VERSION || stored.fingerprint !== connectionMetadataFingerprint(connection)) {
        return undefined;
    }
    if (!stored.entry || stored.entry.connectionId !== connection.id) {
        return undefined;
    }
    return stored;
}
function safePath(value) {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}
//# sourceMappingURL=schemaMetadataCacheStore.js.map