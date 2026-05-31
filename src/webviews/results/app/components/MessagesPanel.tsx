import { QueryResultTab } from '../../../../types';
import { vscode } from '../vscode';

export function MessagesPanel({ tab }: { tab: QueryResultTab }) {
  const error = tab.error;
  return (
    <section className="messages">
      <div className="messages-toolbar">
        <span className="status-dot failed" />
        <strong>{error?.message ?? 'Query failed'}</strong>
        <span className="toolbar-spacer" />
        <button className="tool icon-tool" title="Copy error" aria-label="Copy error" onClick={() => vscode.postMessage({ type: 'copy', text: JSON.stringify(error, null, 2) })}>⧉</button>
      </div>
      <div className="message-log" role="log">
        <p><span className="log-time">status</span><span className="log-error">{tab.executionStatus}</span></p>
        {error?.code && <p><span className="log-time">sqlstate</span><span>{error.code}</span></p>}
        {error?.position && <p><span className="log-time">position</span><span>{error.position}</span></p>}
        {error?.detail && <pre>{error.detail}</pre>}
        {error?.hint && <pre>{error.hint}</pre>}
      </div>
    </section>
  );
}
