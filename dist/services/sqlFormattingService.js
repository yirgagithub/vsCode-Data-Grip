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
exports.sqlFormatterDialect = sqlFormatterDialect;
exports.formatSqlText = formatSqlText;
const runtimeLoader_1 = require("../runtime/runtimeLoader");
function sqlFormatterDialect(connection) {
    if (connection?.type === 'redshift') {
        return 'redshift';
    }
    if (connection?.type === 'mysql') {
        return 'mysql';
    }
    if (connection?.type === 'sqlite') {
        return 'sqlite';
    }
    if (connection?.type === 'sqlserver') {
        return 'transactsql';
    }
    if (connection?.type === 'oracle') {
        return 'plsql';
    }
    if (connection?.type === 'snowflake') {
        return 'snowflake';
    }
    return 'postgresql';
}
async function formatSqlText(sql, dialect) {
    if (!sql.trim()) {
        return sql;
    }
    const { format } = await loadSqlFormatter();
    return format(sql, {
        language: dialect,
        tabWidth: 2
    });
}
let sqlFormatterRuntime;
function loadSqlFormatter() {
    sqlFormatterRuntime ??= loadSqlFormatterRuntime();
    return sqlFormatterRuntime;
}
async function loadSqlFormatterRuntime() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('sqlFormatterRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('sql-formatter'))).then((module) => {
        const candidate = module;
        return 'format' in candidate ? candidate : candidate.default;
    });
}
//# sourceMappingURL=sqlFormattingService.js.map