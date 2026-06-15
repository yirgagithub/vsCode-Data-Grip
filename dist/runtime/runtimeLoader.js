"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadBundledRuntime = loadBundledRuntime;
const path_1 = require("path");
function loadBundledRuntime(moduleName) {
    if (typeof __dirname !== 'string' || (0, path_1.basename)(__dirname) !== 'dist' || typeof require !== 'function') {
        return undefined;
    }
    return require((0, path_1.join)(__dirname, 'runtime', moduleName));
}
//# sourceMappingURL=runtimeLoader.js.map