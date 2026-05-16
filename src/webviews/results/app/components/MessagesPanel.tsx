import { QueryResultTab } from '../../../../types';
import { vscode } from '../vscode';

export function MessagesPanel({ tab }: { tab: QueryResultTab }) {
  const error = tab.error;
  return (
    <section className="messages">
      <h2>{error?.message ?? 'Query failed'}</h2>
      {error?.code && <p>SQLSTATE: {error.code}</p>}
      {error?.position && <p>Position: {error.position}</p>}
      {error?.detail && <pre>{error.detail}</pre>}
      {error?.hint && <pre>{error.hint}</pre>}
      <button onClick={() => vscode.postMessage({ type: 'copy', text: JSON.stringify(error, null, 2) })}>Copy Error</button>
    </section>
  );
}
