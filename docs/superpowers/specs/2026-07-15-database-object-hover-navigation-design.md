# Query Console Database Object Hover and Definition Navigation Design

## Goal

Make database object references in QueryDeck query consoles discoverable without leaving the SQL editor:

- Hovering a resolved table, view, function, stored procedure, or trigger shows compact metadata appropriate to that object type.
- Ctrl+clicking the same reference opens its database definition/DDL in a generated, read-only SQL document.
- VS Code's F12 and **Go to Definition** invoke the same DDL navigation.

This feature applies to supported SQL connections. Redis is excluded because its data model has keys rather than these SQL objects. Sequences and database-specific object types outside the existing QueryDeck explorer model are deferred until the driver API can enumerate them consistently.

## User Experience

### Hover

When the pointer is over a resolved object reference, the hover displays a qualified name, object type, and type-specific details:

- Tables: columns in declaration order with type and nullability, primary key, and foreign keys.
- Views: columns in declaration order with type and nullability.
- Functions: signature/arguments and return type when the database exposes them.
- Stored procedures: signature/arguments when the database exposes them.
- Triggers: owning table, event, and timing when the database exposes them.

The popup is intentionally compact. Indexes, row counts, and storage sizes are outside this feature because they are not consistently available across all supported databases and may require extra live queries.

### Ctrl+click and Go to Definition

Ctrl+click, F12, or **Go to Definition** on a resolved object reference opens a generated read-only SQL document containing the exact definition returned by that connection's database driver. For tables this is `CREATE TABLE`; for views, routines, and triggers it is the engine's corresponding creation or source definition. The document title identifies the connection, object type, and qualified object name. Repeating navigation for the same connection and object reuses the same virtual document URI while refreshing its content.

The generated document is informational and cannot execute or modify the database.

## Supported SQL References

The resolver recognizes tables and views in relation positions, including:

- `FROM`
- `JOIN`
- `UPDATE`
- `INSERT INTO`
- `DELETE FROM`

It recognizes function and procedure calls in executable SQL positions and trigger names in DDL statements where the syntax identifies a trigger object. It supports quoted and unquoted identifiers, schema-qualified names, overloaded routine signatures, and dialect-specific identifier quoting already supported by QueryDeck.

It must not treat these tokens as database tables:

- Table aliases
- Common table expression names
- Identifiers inside strings or comments
- SQL keywords, built-in functions, and scalar expressions that do not resolve to cached database objects
- Temporary or derived relations that cannot be matched to cached database metadata

Only the object identifier itself is interactive. For `sales.orders AS o`, `sales.orders` resolves to the table while `o` does not. For overloaded routines, argument count and available type information narrow the match; ambiguous overloads produce no misleading hover or definition target.

## Resolution and Data Flow

1. A shared SQL object-reference resolver receives the document text and cursor position and returns an identifier range, syntactic object context, and qualified name parts.
2. The provider resolves the query console's selected connection through the existing SQL document connection resolver.
3. A schema-qualified identifier loads or reads that schema's metadata. An unqualified identifier uses the connection's configured/default schema.
4. The identifier is matched against cached tables/views or driver-supplied routines/triggers using the database's existing identifier comparison rules.
5. The hover provider formats the resolved object's metadata.
6. The definition provider asks a generalized database-driver object-definition API for the exact definition and exposes it through a virtual read-only document provider. Existing `getTableDDL` behavior is preserved behind this generalized contract.

The parser/resolver is independent of VS Code UI types so its behavior can be unit tested directly and reused by both providers.

## Metadata Loading and Failure Behavior

Hover should normally return cached metadata immediately. When the relevant schema has not been loaded, it may start one schema load and return the result when available. Concurrent hover requests share the existing in-flight schema request.

The providers return no result rather than guessing when:

- The document has no selected connection.
- The selected connection is Redis.
- The object reference is syntactically ambiguous.
- An unqualified name matches more than one viable table.
- Metadata cannot confirm that the object is a table.

If the database is disconnected and no usable cached metadata exists, hover shows a short connection/metadata-unavailable message with the existing **Refresh database metadata** command when possible. Definition navigation reports a concise VS Code error only when the user explicitly invokes it; passive hovering must not produce notifications.

Definition retrieval errors leave the editor unchanged and display the driver's sanitized error message. No partial definition document is opened.

## Components

### SQL object-reference resolver

Locates the object at a cursor offset, classifies its syntactic context, excludes comments, strings, aliases, CTEs, and built-ins, and returns the exact interactive range and normalized identifier parts.

### Database object metadata resolver

Combines the parsed reference, document connection, default-schema rules, schema metadata, and routine/trigger metadata into one resolved object. Both UI providers consume this result to prevent hover and Ctrl+click from disagreeing. Routine and trigger metadata is cached per connection/schema with the same in-flight request sharing and stale/error semantics used by schema metadata.

### Hover provider

Creates trusted Markdown only for the known refresh command. Database identifiers and types are escaped and rendered as data, never as command links or arbitrary Markdown.

### Definition provider and virtual definition documents

Implements VS Code definition navigation and a read-only content provider for a QueryDeck-owned URI scheme. The provider retrieves the definition on explicit navigation, caches it by connection/schema/object-type/object-identity for the document lifetime, and refreshes the content before opening.

### Driver definition API

Adds a typed object-definition request covering table, view, function, procedure, and trigger. Each SQL driver uses its engine's catalog or native definition command. An engine that cannot return a definition for a specific object reports that capability as unavailable; the hover still works, while explicit navigation shows a concise unsupported message.

## Registration and Scope

Register hover and definition providers for SQL-language documents, but return results only when QueryDeck can resolve a selected connection for the document. This naturally covers QueryDeck query consoles and also permits QueryDeck-bound `.sql` files to behave consistently without affecting unrelated SQL files.

All registrations are disposed through the extension context.

## Testing

Unit tests cover:

- Relation, routine-call, and trigger-definition positions with exact identifier ranges.
- Qualified, unqualified, and quoted identifiers.
- Aliases, CTEs, nested queries, built-ins, comments, and string literals.
- Default-schema resolution and case/quoting behavior.
- Compact, type-specific hover rendering for tables, views, functions, procedures, and triggers.
- Overloaded routine resolution and ambiguity handling.
- Missing, stale, disconnected, ambiguous, and unsupported metadata cases.
- Definition resolution and stable virtual document URIs for every supported object type.
- Successful definition loading, unavailable capabilities, and sanitized driver failures.

Integration-level extension tests verify provider registration and that a bound SQL document can hover and navigate using stubbed connection, schema, and driver services. Existing lint, build, unit-test, and VSIX packaging checks remain required.

## Out of Scope

- Editing or executing generated DDL.
- Hovering columns or navigating column definitions.
- Redis keys, sequences, packages, synonyms, events, and other engine-specific object types not currently enumerated by QueryDeck.
- Index, row-count, storage-size, or live performance details in hover.
- A custom table-details webview.
