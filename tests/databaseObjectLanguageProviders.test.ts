import { beforeEach, describe, expect, it, vi } from 'vitest';

const changed: string[] = [];
const notifications: string[] = [];

vi.mock('vscode', () => {
  class EventEmitter<T> {
    event = (listener: (value: T) => void) => { this.listener = listener; return { dispose() {} }; };
    private listener?: (value: T) => void;
    fire(value: T) { changed.push(String(value)); this.listener?.(value); }
    dispose() {}
  }
  class Uri {
    constructor(public scheme: string, public path: string, public query = '') {}
    static from(value: { scheme: string; path: string; query?: string }) { return new Uri(value.scheme, value.path, value.query); }
    toString() { return `${this.scheme}:${this.path}${this.query ? `?${this.query}` : ''}`; }
  }
  class Position { constructor(public line: number, public character: number) {} }
  class Range { constructor(public start: Position, public end: Position) {} }
  class Hover { constructor(public contents: unknown, public range?: unknown) {} }
  class Location { constructor(public uri: Uri, public range: Range) {} }
  return {
    EventEmitter, Uri, Position, Range, Hover, Location,
    window: { showWarningMessage: (message: string) => { notifications.push(message); } },
    languages: {
      registerHoverProvider: vi.fn(() => ({ dispose() {} })),
      registerDefinitionProvider: vi.fn(() => ({ dispose() {} }))
    },
    workspace: { registerTextDocumentContentProvider: vi.fn(() => ({ dispose() {} })) }
  };
});

import * as vscode from 'vscode';
import { DatabaseObjectLanguageProviders, registerDatabaseObjectLanguageProviders } from '../src/providers/databaseObjectLanguageProviders';

const connection = { id: 'conn /?#', name: 'db', type: 'postgres', host: '', port: 0, database: '', username: '', sslMode: 'disable', color: 'blue', defaultSchema: 'public' } as const;
const object = { kind: 'view' as const, schema: 'sales data', name: 'orders/#1', columns: [] };

function document(languageId = 'sql', text = 'select * from "sales data"."orders/#1"') {
  return {
    languageId, uri: { toString: () => 'file:///query.sql' }, getText: () => text,
    offsetAt: (position: { character: number }) => position.character,
    positionAt: (offset: number) => new vscode.Position(0, offset)
  } as never;
}

function token(cancelled = false) { return { isCancellationRequested: cancelled } as never; }

function providers(overrides: Record<string, unknown> = {}) {
  return new DatabaseObjectLanguageProviders({
    resolveConnection: () => ({ connection, isBound: true }),
    findReference: () => ({ range: { start: 14, end: 39 }, parts: ['sales data', 'orders/#1'], context: 'relation' }),
    resolveObject: vi.fn(async () => object),
    renderHover: () => '**View** `sales data`.`orders/#1`',
    getDefinition: vi.fn(async () => 'CREATE VIEW x AS\r\nSELECT  1; -- native'),
    notify: (message) => notifications.push(message),
    ...overrides
  } as never);
}

describe('DatabaseObjectLanguageProviders', () => {
  beforeEach(() => { changed.length = 0; notifications.length = 0; vi.clearAllMocks(); });

  it('registers all three providers for SQL and disposes them', () => {
    const subscriptions: { dispose(): void }[] = [];
    const instance = registerDatabaseObjectLanguageProviders({ subscriptions } as never, providers());
    expect(vscode.languages.registerHoverProvider).toHaveBeenCalledWith({ language: 'sql' }, instance);
    expect(vscode.languages.registerDefinitionProvider).toHaveBeenCalledWith({ language: 'sql' }, instance);
    expect(vscode.workspace.registerTextDocumentContentProvider).toHaveBeenCalledWith('querydeck-definition', instance);
    expect(subscriptions).toContain(instance);
  });

  it('gates non-SQL and unbound documents', async () => {
    const unbound = providers({ resolveConnection: () => ({ connection, isBound: false }) });
    expect(await unbound.provideHover(document('plaintext'), new vscode.Position(0, 20), token())).toBeUndefined();
    expect(await unbound.provideDefinition(document(), new vscode.Position(0, 20), token())).toBeUndefined();
  });

  it('returns compact hover and keeps passive failures silent', async () => {
    const provider = providers();
    const hover = await provider.provideHover(document(), new vscode.Position(0, 20), token()) as vscode.Hover;
    expect(hover.contents).toBe('**View** `sales data`.`orders/#1`');
    const failing = providers({ resolveObject: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await failing.provideHover(document(), new vscode.Position(0, 20), token())).toBeUndefined();
    expect(notifications).toEqual([]);
  });

  it('honors cancellation before and after asynchronous work', async () => {
    const getDefinition = vi.fn(async () => 'DDL');
    const before = providers({ getDefinition });
    expect(await before.provideDefinition(document(), new vscode.Position(0, 20), token(true))).toBeUndefined();
    expect(getDefinition).not.toHaveBeenCalled();
    let cancelled = false;
    const after = providers({ resolveObject: vi.fn(async () => { cancelled = true; return object; }) });
    expect(await after.provideDefinition(document(), new vscode.Position(0, 20), { get isCancellationRequested() { return cancelled; } } as never)).toBeUndefined();
  });

  it('uses stable encoded URIs, refreshes content, and preserves native text verbatim', async () => {
    const getDefinition = vi.fn().mockResolvedValueOnce('CREATE VIEW x AS\r\nSELECT  1;').mockResolvedValueOnce('native replacement');
    const provider = providers({ getDefinition });
    const first = await provider.provideDefinition(document(), new vscode.Position(0, 20), token()) as vscode.Location;
    const second = await provider.provideDefinition(document(), new vscode.Position(0, 20), token()) as vscode.Location;
    expect(first.uri.toString()).toBe(second.uri.toString());
    expect(first.uri.toString()).toContain('querydeck-definition:/');
    expect(first.uri.toString()).not.toContain('sales data');
    expect(provider.provideTextDocumentContent(first.uri)).toBe('native replacement');
    expect(changed).toEqual([first.uri.toString(), second.uri.toString()]);
  });

  it('notifies on unsupported/errors and never exposes partial content', async () => {
    const unsupported = providers({ getDefinition: vi.fn(async () => undefined) });
    expect(await unsupported.provideDefinition(document(), new vscode.Position(0, 20), token())).toBeUndefined();
    expect(notifications[0]).toMatch(/not available/i);
    const failing = providers({ getDefinition: vi.fn(async () => { throw new Error('catalog denied'); }) });
    expect(await failing.provideDefinition(document(), new vscode.Position(0, 20), token())).toBeUndefined();
    expect(notifications.at(-1)).toMatch(/catalog denied/i);
  });
});
