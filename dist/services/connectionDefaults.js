"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS_BY_DATABASE_TYPE = void 0;
exports.connectionDefaultsForType = connectionDefaultsForType;
exports.DEFAULTS_BY_DATABASE_TYPE = {
    postgres: {
        name: 'PostgreSQL',
        port: '5432',
        database: 'postgres',
        sslMode: 'disable',
        color: 'green'
    },
    redshift: {
        name: 'Redshift',
        port: '5439',
        database: 'dev',
        sslMode: 'require',
        color: 'purple'
    }
};
function connectionDefaultsForType(type) {
    return exports.DEFAULTS_BY_DATABASE_TYPE[type];
}
//# sourceMappingURL=connectionDefaults.js.map