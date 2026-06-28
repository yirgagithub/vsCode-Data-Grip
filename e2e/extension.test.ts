import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-code-database-client.querydeck';
const TWO_STATEMENTS = 'select 1;\n\nselect 2;\n';

async function openSqlDocument(content: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({ language: 'sql', content });
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function getCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
  const deadline = Date.now() + 10_000;
  let lenses: vscode.CodeLens[] = [];
  while (Date.now() < deadline) {
    lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri,
      100
    );
    if (lenses.length > 0) {
      return lenses;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return lenses;
}

suite('QueryDeck extension', () => {
  test('activates when a SQL document is opened', async () => {
    await openSqlDocument(TWO_STATEMENTS);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('registers its command surface', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'database.executeFile',
      'database.executeStatementRange',
      'database.addConnection',
      'database.openSqlConsole',
      'database.setSqlFileConnection',
      'database.findPastQuery'
    ]) {
      assert.ok(commands.includes(id), `command not registered: ${id}`);
    }
  });

  test('SQL code lenses expose the connection picker and one execute lens per section', async () => {
    const doc = await openSqlDocument(TWO_STATEMENTS);
    const lenses = await getCodeLenses(doc);
    assert.ok(lenses.length > 0, 'no code lenses provided for SQL document');

    const connectionLenses = lenses.filter((lens) => lens.command?.command === 'database.setSqlFileConnection');
    assert.strictEqual(connectionLenses.length, 1, 'expected exactly one connection picker lens');
    assert.strictEqual(connectionLenses[0].range.start.line, 0, 'connection picker lens should sit on line 0');

    const sectionLenses = lenses.filter((lens) => lens.command?.command === 'database.executeStatementRange');
    assert.strictEqual(sectionLenses.length, 2, 'expected one execute lens per SQL section');
  });

  test('execute file/selection is no longer a code lens (it lives in the editor title bar)', async () => {
    const doc = await openSqlDocument(TWO_STATEMENTS);
    const lenses = await getCodeLenses(doc);

    const executeFileLenses = lenses.filter((lens) => lens.command?.command === 'database.executeFile');
    assert.strictEqual(executeFileLenses.length, 0, 'database.executeFile should not appear as a code lens');
    const shouting = lenses.filter((lens) => lens.command?.title.includes('EXECUTE FILE'));
    assert.strictEqual(shouting.length, 0, 'no full-width EXECUTE FILE banner lens expected');
  });
});
