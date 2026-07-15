import * as vscode from 'vscode';
import type { ConnectionConfig, DatabaseObjectIdentity } from '../types';
import type { SqlObjectReference } from '../services/sqlObjectReference';
import type { ResolvedDatabaseObject } from '../services/databaseObjectMetadata';

export const DATABASE_OBJECT_DEFINITION_SCHEME = 'querydeck-definition';

interface BoundConnectionResolution {
  connection?: ConnectionConfig;
  isBound: boolean;
}

export interface DatabaseObjectLanguageProviderDependencies {
  resolveConnection(document: vscode.TextDocument): BoundConnectionResolution;
  findReference(sql: string, offset: number): SqlObjectReference | undefined;
  resolveObject(reference: SqlObjectReference, connection: ConnectionConfig): Promise<ResolvedDatabaseObject | undefined>;
  renderHover(object: ResolvedDatabaseObject): string;
  getDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined>;
  notify(message: string): void;
}

export class DatabaseObjectLanguageProviders implements vscode.HoverProvider, vscode.DefinitionProvider, vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly definitions = new Map<string, string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly registrations: vscode.Disposable[] = [];
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly dependencies: DatabaseObjectLanguageProviderDependencies) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
    if (token.isCancellationRequested) return undefined;
    const context = this.context(document, position);
    if (!context) return undefined;
    try {
      const object = await this.dependencies.resolveObject(context.reference, context.connection);
      if (token.isCancellationRequested || !object) return undefined;
      const markdown = this.dependencies.renderHover(object);
      if (token.isCancellationRequested) return undefined;
      return new vscode.Hover(markdown, this.range(document, context.reference));
    } catch {
      return undefined;
    }
  }

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
    if (token.isCancellationRequested) return undefined;
    const context = this.context(document, position);
    if (!context) return undefined;
    try {
      const object = await this.dependencies.resolveObject(context.reference, context.connection);
      if (token.isCancellationRequested || !object) return undefined;
      const identity = databaseObjectIdentity(object);
      const definition = await this.dependencies.getDefinition(context.connection.id, identity);
      if (token.isCancellationRequested) return undefined;
      if (definition === undefined) {
        this.dependencies.notify(`Definition navigation is not available for this ${object.kind}.`);
        return undefined;
      }
      const uri = definitionUri(context.connection.id, identity);
      this.definitions.set(uri.toString(), definition);
      this.changeEmitter.fire(uri);
      return new vscode.Location(uri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)));
    } catch (error) {
      if (!token.isCancellationRequested) {
        this.dependencies.notify(error instanceof Error ? error.message : String(error));
      }
      return undefined;
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    return this.definitions.get(uri.toString());
  }

  track(...registrations: vscode.Disposable[]): void {
    this.registrations.push(...registrations);
  }

  dispose(): void {
    for (const registration of this.registrations.splice(0)) registration.dispose();
    this.definitions.clear();
    this.changeEmitter.dispose();
  }

  private context(document: vscode.TextDocument, position: vscode.Position): { connection: ConnectionConfig; reference: SqlObjectReference } | undefined {
    if (document.languageId !== 'sql') return undefined;
    const resolution = this.dependencies.resolveConnection(document);
    if (!resolution.isBound || !resolution.connection || resolution.connection.type === 'redis') return undefined;
    const reference = this.dependencies.findReference(document.getText(), document.offsetAt(position));
    return reference ? { connection: resolution.connection, reference } : undefined;
  }

  private range(document: vscode.TextDocument, reference: SqlObjectReference): vscode.Range {
    return new vscode.Range(document.positionAt(reference.range.start), document.positionAt(reference.range.end));
  }
}

export function registerDatabaseObjectLanguageProviders(
  context: Pick<vscode.ExtensionContext, 'subscriptions'>,
  providers: DatabaseObjectLanguageProviders
): DatabaseObjectLanguageProviders {
  const selector: vscode.DocumentSelector = { language: 'sql' };
  providers.track(
    vscode.languages.registerHoverProvider(selector, providers),
    vscode.languages.registerDefinitionProvider(selector, providers),
    vscode.workspace.registerTextDocumentContentProvider(DATABASE_OBJECT_DEFINITION_SCHEME, providers)
  );
  context.subscriptions.push(providers);
  return providers;
}

export function definitionUri(connectionId: string, object: DatabaseObjectIdentity): vscode.Uri {
  const identity = [connectionId, object.kind, object.schema, object.name];
  if (object.signature !== undefined) identity.push(`signature=${object.signature}`);
  if (object.table !== undefined) identity.push(`table=${object.table}`);
  const title = `${object.schema}.${object.name} (${object.kind} @ ${connectionId}).sql`;
  return vscode.Uri.from({
    scheme: DATABASE_OBJECT_DEFINITION_SCHEME,
    path: `/${[...identity, title].map((component) => encodeURIComponent(component)).join('/')}`
  });
}

function databaseObjectIdentity(object: ResolvedDatabaseObject): DatabaseObjectIdentity {
  return {
    kind: object.kind,
    schema: object.schema,
    name: object.name,
    ...('signature' in object && object.signature ? { signature: object.signature } : {}),
    ...(object.kind === 'trigger' ? { table: object.table } : {})
  };
}
