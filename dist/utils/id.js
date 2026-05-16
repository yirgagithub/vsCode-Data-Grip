"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
//# sourceMappingURL=id.js.map