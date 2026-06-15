import { basename, join } from 'path';

export function loadBundledRuntime<T>(moduleName: string): T | undefined {
  if (typeof __dirname !== 'string' || basename(__dirname) !== 'dist' || typeof require !== 'function') {
    return undefined;
  }
  return require(join(__dirname, 'runtime', moduleName)) as T;
}
