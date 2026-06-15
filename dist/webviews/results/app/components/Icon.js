"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Icon = Icon;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * Renders a VS Code codicon. `name` is the codicon id without the `codicon-`
 * prefix (e.g. `play`, `copy`, `chevron-left`). Sizing/colour are inherited
 * from the surrounding control via CSS (see `.codicon` rules in styles.css).
 */
function Icon({ name, className }) {
    return (0, jsx_runtime_1.jsx)("i", { className: `codicon codicon-${name}${className ? ` ${className}` : ''}`, "aria-hidden": "true" });
}
//# sourceMappingURL=Icon.js.map