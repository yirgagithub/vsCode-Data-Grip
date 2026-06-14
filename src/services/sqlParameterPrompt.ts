import * as vscode from 'vscode';
import { applySqlParameterValues, findSqlParameters, uniqueSqlParameterNames } from './sqlParameters';

type ParameterPickAction = 'parameter' | 'run' | 'cancel' | 'preview';

interface ParameterPickItem extends vscode.QuickPickItem {
  action: ParameterPickAction;
  name?: string;
}

export class SqlParameterPrompt {
  async resolve(sql: string): Promise<string | undefined> {
    const names = uniqueSqlParameterNames(findSqlParameters(sql));
    if (!names.length) {
      return sql;
    }
    const values = await this.collectValues(sql, names);
    return values ? applySqlParameterValues(sql, values) : undefined;
  }

  private async collectValues(sql: string, names: string[]): Promise<Record<string, string> | undefined> {
    const values: Record<string, string> = {};
    const preview = this.sqlPreview(sql);
    while (true) {
      const picked = await vscode.window.showQuickPick(this.pickItems(names, values, preview), {
        title: 'SQL Parameters',
        placeHolder: `Current SQL query: ${preview}`,
        ignoreFocusOut: true,
        matchOnDescription: true,
        matchOnDetail: true
      });
      if (!picked || picked.action === 'cancel') {
        return undefined;
      }
      if (picked.action === 'preview') {
        continue;
      }
      if (picked.action === 'run') {
        const missing = names.find((name) => values[name] === undefined);
        if (!missing) {
          return values;
        }
        const value = await this.promptValue(missing, preview, values[missing]);
        if (value === undefined) {
          return undefined;
        }
        values[missing] = value;
        continue;
      }
      if (picked.name) {
        const value = await this.promptValue(picked.name, preview, values[picked.name]);
        if (value === undefined) {
          return undefined;
        }
        values[picked.name] = value;
      }
    }
  }

  private pickItems(names: string[], values: Record<string, string>, preview: string): ParameterPickItem[] {
    const missing = names.filter((name) => values[name] === undefined).length;
    return [
      {
        label: '$(code) Current SQL query',
        detail: preview,
        action: 'preview'
      },
      ...names.map((name) => ({
        label: `$(symbol-variable) ${name}`,
        description: values[name] === undefined ? 'missing' : this.valuePreview(values[name]),
        detail: `Set value for ${name}`,
        action: 'parameter' as const,
        name
      })),
      {
        label: '$(play) Run SQL',
        description: missing ? `${missing} missing` : 'ready',
        detail: missing ? 'Set all parameter values before running.' : 'Run the current SQL query with these values.',
        action: 'run'
      },
      {
        label: '$(close) Cancel',
        action: 'cancel'
      }
    ];
  }

  private async promptValue(name: string, preview: string, currentValue?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: `SQL Parameter: ${name}`,
      prompt: `Current SQL query: ${preview}`,
      placeHolder: `Value for ${name}`,
      value: currentValue,
      ignoreFocusOut: true
    });
  }

  private sqlPreview(sql: string): string {
    const compact = sql.replace(/\s+/g, ' ').trim();
    return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
  }

  private valuePreview(value: string): string {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
}
