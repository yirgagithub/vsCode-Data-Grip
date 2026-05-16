declare const acquireVsCodeApi: <T>() => {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
};

export const vscode = acquireVsCodeApi<unknown>();
