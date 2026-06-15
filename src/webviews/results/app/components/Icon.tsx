/**
 * Renders a VS Code codicon. `name` is the codicon id without the `codicon-`
 * prefix (e.g. `play`, `copy`, `chevron-left`). Sizing/colour are inherited
 * from the surrounding control via CSS (see `.codicon` rules in styles.css).
 */
export function Icon({ name, className }: { name: string; className?: string }) {
  return <i className={`codicon codicon-${name}${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
