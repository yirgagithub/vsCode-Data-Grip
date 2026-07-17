import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command: string; title: string; enablement?: string }>;
    menus?: unknown;
    keybindings?: Array<{ command: string }>;
  };
}

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function packageJson(): PackageJson {
  return JSON.parse(readText('package.json')) as PackageJson;
}

function collectMenuCommands(value: unknown, commands = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMenuCommands(item, commands));
    return commands;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.command === 'string') {
      commands.add(record.command);
    }
    Object.values(record).forEach((item) => collectMenuCommands(item, commands));
  }
  return commands;
}

function registeredCommands(): Set<string> {
  const source = [
    readText('src/extension.ts'),
    readText('src/controllers/queryMemoryController.ts')
  ].join('\n');
  return new Set([...source.matchAll(/register\('([^']+)'/g)].map((match) => match[1]));
}

describe('command surface', () => {
  it('does not contribute user-visible commands without registered handlers', () => {
    const pkg = packageJson();
    const contributed = new Set((pkg.contributes?.commands ?? []).map((item) => item.command));
    const registered = registeredCommands();
    const menus = collectMenuCommands(pkg.contributes?.menus);
    const keybindings = new Set((pkg.contributes?.keybindings ?? []).map((item) => item.command));
    const activationCommands = new Set((pkg.activationEvents ?? [])
      .filter((event) => event.startsWith('onCommand:'))
      .map((event) => event.slice('onCommand:'.length)));

    expect([...contributed].filter((command) => !registered.has(command)).sort()).toEqual([]);
    expect([...menus].filter((command) => !contributed.has(command)).sort()).toEqual([]);
    expect([...menus].filter((command) => !registered.has(command)).sort()).toEqual([]);
    expect([...keybindings].filter((command) => !contributed.has(command)).sort()).toEqual([]);
    expect([...keybindings].filter((command) => !registered.has(command)).sort()).toEqual([]);
    expect([...activationCommands].filter((command) => !registered.has(command)).sort()).toEqual([]);
  });

  it('keeps internal commands deliberate and out of the command palette', () => {
    const contributed = new Set((packageJson().contributes?.commands ?? []).map((item) => item.command));
    const allowedInternal = new Set([
      'database.executeCurrentQuery',
      'database.executeSelection',
      'database.executeStatementRange',
      'database.internal.seedAndConnectForMarketplaceMedia',
      'database.pickConnection'
    ]);

    expect([...registeredCommands()]
      .filter((command) => !contributed.has(command) && !allowedInternal.has(command))
      .sort()).toEqual([]);
  });

  it('registers Marketplace seed commands only in extension development hosts', () => {
    const extensionSource = readText('src/extension.ts');

    expect(extensionSource).toContain('context.extensionMode === vscode.ExtensionMode.Development');
    expect(extensionSource).not.toContain('QUERYDECK_ENABLE_TEST_COMMANDS');
  });

  it('keeps AI actions discoverable even before an AI provider is configured', () => {
    const pkg = packageJson();
    const commands = new Map((pkg.contributes?.commands ?? []).map((item) => [item.command, item]));
    const aiCommands = [
      'database.aiFixSql',
      'database.aiExplainSql',
      'database.backfillQueryMemorySummaries',
      'database.analyzeTablePerformance'
    ];
    const menuJson = JSON.stringify(pkg.contributes?.menus ?? {});

    aiCommands.forEach((command) => {
      expect(commands.get(command)).toBeDefined();
      expect(commands.get(command)?.enablement ?? '').not.toContain('database.aiAvailable');
      expect(menuJson).toContain(`"command":"${command}"`);
    });
    expect(menuJson).not.toContain('database.aiAvailable');
  });

  it('does not ship known placeholder or misleading actions', () => {
    const shippedSurface = [
      readText('package.json'),
      readText('src/extension.ts'),
      readText('src/explorer/DatabaseTreeProvider.ts'),
      readText('src/explorer/nodes.ts'),
      readText('src/webviews/connection/ConnectionEditorPanel.ts'),
      readText('src/webviews/results/app/components/ResultToolbar.tsx'),
      readText('src/webviews/results/app/components/ResultGrid.tsx'),
      readText('src/webviews/table/TableDataPanel.ts')
    ].join('\n');

    [
      'database.editTableData',
      'database.testQueryMemorySummary',
      'database.previewTableMetadata',
      'Query File...',
      'Stop query',
      'Search in result',
      'Transaction mode',
      'Tx: Auto',
      'pagerMenu',
      'lastPage',
      'Duplicate data source',
      'Settings',
      'Add comment',
      'URL only',
      'Authentication mode',
      'Password save mode',
      'Refresh schemas',
      'Expand all',
      'Collapse all',
      'Show internal system schemas',
      'Show template databases',
      'No problems found',
      'schemaPattern',
      'schemaDatabaseLabel',
      'data-schema-pattern',
      'StaticFolderNode',
      'Server Objects',
      'Query Files',
      'View DDL template',
      'select ...',
      '= ?'
    ].forEach((placeholder) => {
      expect(shippedSurface).not.toContain(placeholder);
    });
  });

  it('does not ship table edit, insert, or delete actions in the webviews', () => {
    const mutationWebviews = [
      readText('src/webviews/table/TableDataPanel.ts'),
      readText('src/webviews/results/app/components/ResultGrid.tsx')
    ].join('\n');

    [
      'editCell',
      'insertRow',
      'deleteRow',
      'Edit Cell',
      'Insert Row',
      'Delete Row',
      'type: \'mutation\'',
      'window.confirm'
    ].forEach((dialogText) => {
      expect(mutationWebviews).not.toContain(dialogText);
    });
  });

  it('only opens table column suggestions after typing a filter fragment', () => {
    const tablePanel = readText('src/webviews/table/TableDataPanel.ts');

    expect(tablePanel).toContain("if (!suggestContext.partial.trim())");
    expect(tablePanel).toContain("column.toLowerCase().includes(lower)");
    expect(tablePanel).not.toContain("filter((column) => !lower || column.toLowerCase().startsWith(lower))");
  });
});
