"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode27 = __toESM(require("vscode"));

// src/database/connectionManager.ts
var vscode = __toESM(require("vscode"));

// src/database/drivers/postgresDriver.ts
var import_crypto = require("crypto");

// src/utils/identifiers.ts
function quoteIdentifier(identifier, quote) {
  const marker = typeof quote === "string" && quote ? quote : '"';
  if (marker === "`") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }
  return `${marker}${identifier.replace(new RegExp(escapeRegExp(marker), "g"), marker + marker)}${marker}`;
}
function qualifiedName(schema, name, quote) {
  return `${quoteIdentifier(schema, quote)}.${quoteIdentifier(name, quote)}`;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/services/queryPlanService.ts
function normalizeExplainJsonPlan(value, analyze) {
  const entry = Array.isArray(value) ? value[0] : value;
  const record = entry && typeof entry === "object" ? entry : {};
  const plan = record.Plan ?? record.plan;
  const root = plan && typeof plan === "object" ? normalizePlanNode(plan, "plan") : void 0;
  return {
    format: "json",
    analyze,
    root,
    rawPlan: value,
    planningTimeMs: numberValue(record["Planning Time"] ?? record["planning_time"]),
    executionTimeMs: numberValue(record["Execution Time"] ?? record["execution_time"]),
    annotations: root ? deterministicPlanAnnotations(root) : []
  };
}
function textExplainPlan(rawText, analyze) {
  return {
    format: "text",
    analyze,
    rawText,
    annotations: []
  };
}
function deterministicPlanAnnotations(root) {
  const nodes = flattenPlan(root);
  const maxCost = Math.max(...nodes.map((node) => node.totalCost ?? 0), 0);
  const annotations = [];
  for (const node of nodes) {
    const lower = node.nodeType.toLowerCase();
    if (lower.includes("seq scan") && (node.planRows ?? 0) > 1e4) {
      annotations.push({
        nodeId: node.id,
        severity: "high",
        message: `Sequential scan over ${node.planRows?.toLocaleString()} estimated rows.`,
        suggestion: "Check whether the WHERE or JOIN columns need an index, sort key, or more selective predicate."
      });
    }
    if (lower.includes("nested loop") && (node.planRows ?? 0) > 1e4) {
      annotations.push({
        nodeId: node.id,
        severity: "medium",
        message: `Nested loop estimates ${node.planRows?.toLocaleString()} rows.`,
        suggestion: "Large nested loops often point to missing join statistics, missing indexes, or a join order problem."
      });
    }
    if (lower.includes("sort") && maxCost > 0 && (node.totalCost ?? 0) >= maxCost * 0.35) {
      annotations.push({
        nodeId: node.id,
        severity: "medium",
        message: "Sort is a major cost contributor in this plan.",
        suggestion: "Consider whether ORDER BY/GROUP BY columns match an index or Redshift sort key."
      });
    }
  }
  return annotations.slice(0, 12);
}
function flattenPlan(root) {
  return [root, ...root.children.flatMap(flattenPlan)];
}
function normalizePlanNode(raw, id) {
  const children = Array.isArray(raw.Plans) ? raw.Plans.map((child, index) => normalizePlanNode(child, `${id}.${index + 1}`)) : [];
  return {
    id,
    nodeType: stringValue(raw["Node Type"]) ?? "Plan Node",
    relationName: stringValue(raw["Relation Name"]),
    alias: stringValue(raw.Alias),
    indexName: stringValue(raw["Index Name"]),
    joinType: stringValue(raw["Join Type"]),
    startupCost: numberValue(raw["Startup Cost"]),
    totalCost: numberValue(raw["Total Cost"]),
    planRows: numberValue(raw["Plan Rows"]),
    planWidth: numberValue(raw["Plan Width"]),
    actualStartupTime: numberValue(raw["Actual Startup Time"]),
    actualTotalTime: numberValue(raw["Actual Total Time"]),
    actualRows: numberValue(raw["Actual Rows"]),
    actualLoops: numberValue(raw["Actual Loops"]),
    filter: stringValue(raw.Filter),
    indexCond: stringValue(raw["Index Cond"]),
    joinFilter: stringValue(raw["Join Filter"]),
    hashCond: stringValue(raw["Hash Cond"]),
    mergeCond: stringValue(raw["Merge Cond"]),
    sortKey: stringArrayValue(raw["Sort Key"]),
    groupKey: stringArrayValue(raw["Group Key"]),
    raw,
    children
  };
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function stringArrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : void 0;
}
function numberValue(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : void 0;
}

// src/runtime/runtimeLoader.ts
var import_path = require("path");
function loadBundledRuntime(moduleName) {
  if (typeof __dirname !== "string" || (0, import_path.basename)(__dirname) !== "dist" || typeof require !== "function") {
    return void 0;
  }
  return require((0, import_path.join)(__dirname, "runtime", moduleName));
}

// src/services/sqlDialect.ts
function assertSqlGeneratingType(type, feature) {
  if (type === "redis") {
    throw new Error(`${feature} is not available for Redis connections. Use Redis commands instead.`);
  }
  return type;
}
function quoteSqlIdentifier(type, identifier) {
  if (type === "mysql") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }
  if (type === "sqlserver") {
    return `[${identifier.replace(/]/g, "]]")}]`;
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}
function qualifiedSqlName(type, schema, name) {
  return `${quoteSqlIdentifier(type, schema)}.${quoteSqlIdentifier(type, name)}`;
}
function sqlLiteral(type, value) {
  if (value === null || value === void 0) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return type === "sqlserver" || type === "oracle" ? value ? "1" : "0" : value ? "true" : "false";
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
function createTableSql(type, schema, table, columns) {
  const sqlType = assertSqlGeneratingType(type, "CREATE TABLE generation");
  const ddlColumns = columns.length ? columns.map((column) => columnDefinitionSql(sqlType, column)) : [`  ${quoteSqlIdentifier(sqlType, "id")} ${defaultIdType(sqlType)}`];
  return `create table ${qualifiedSqlName(sqlType, schema, table)} (
${ddlColumns.join(",\n")}
);`;
}
function insertBatchSql(type, schema, table, columns, rows) {
  const sqlType = assertSqlGeneratingType(type, "INSERT generation");
  return `insert into ${qualifiedSqlName(sqlType, schema, table)} (${columns.map((column) => quoteSqlIdentifier(sqlType, column)).join(", ")})
values
${rows.map((row) => `  (${columns.map((column) => sqlLiteral(sqlType, row[column])).join(", ")})`).join(",\n")};`;
}
function selectTableSql(type, schema, table, limit = 100) {
  const sqlType = assertSqlGeneratingType(type, "SELECT generation");
  const tableName = qualifiedSqlName(sqlType, schema, table);
  if (sqlType === "sqlserver") {
    return `select top (${limit}) *
from ${tableName};
`;
  }
  if (sqlType === "oracle") {
    return `select *
from ${tableName}
fetch first ${limit} rows only;
`;
  }
  return `select *
from ${tableName}
limit ${limit};
`;
}
function selectAllTableSql(type, schema, table) {
  const sqlType = assertSqlGeneratingType(type, "SELECT generation");
  return `select *
from ${qualifiedSqlName(sqlType, schema, table)};
`;
}
function insertTemplateSql(type, schema, table, columns) {
  const sqlType = assertSqlGeneratingType(type, "INSERT generation");
  const writable = columns.filter((column) => !column.defaultValue).map((column) => column.name);
  const tableName = qualifiedSqlName(sqlType, schema, table);
  if (!writable.length) {
    return defaultValuesInsertSql(sqlType, tableName);
  }
  return `insert into ${tableName} (${writable.map((column) => quoteSqlIdentifier(sqlType, column)).join(", ")})
values (${writable.map(() => "null").join(", ")});
`;
}
function updateTemplateSql(type, schema, table) {
  const sqlType = assertSqlGeneratingType(type, "UPDATE generation");
  return `update ${qualifiedSqlName(sqlType, schema, table)}
set ${quoteSqlIdentifier(sqlType, "column_name")} = null
where ${quoteSqlIdentifier(sqlType, "id")} = '<id>';
`;
}
function deleteTemplateSql(type, schema, table) {
  const sqlType = assertSqlGeneratingType(type, "DELETE generation");
  return `delete from ${qualifiedSqlName(sqlType, schema, table)}
where ${quoteSqlIdentifier(sqlType, "id")} = '<id>';
`;
}
function addColumnSql(type, schema, table, column = "new_column") {
  const sqlType = assertSqlGeneratingType(type, "ADD COLUMN generation");
  const addKeyword = addColumnKeyword(sqlType);
  return `alter table ${qualifiedSqlName(sqlType, schema, table)}
  ${addKeyword} ${quoteSqlIdentifier(sqlType, column)} ${defaultTextType(sqlType)};
`;
}
function newObjectSql(type, kind, schema, table) {
  const sqlType = assertSqlGeneratingType(type, `${kind} generation`);
  const target = table ?? { schema, name: "table_name" };
  if (kind === "table") {
    return `create table ${qualifiedSqlName(sqlType, schema, "new_table")} (
  ${quoteSqlIdentifier(sqlType, "id")} ${defaultIdType(sqlType)},
  ${quoteSqlIdentifier(sqlType, "created_at")} ${timestampColumnSql(sqlType)}
);
`;
  }
  if (kind === "view") {
    return createViewSql(sqlType, schema, "new_view", "source_table");
  }
  if (kind === "materialized_view") {
    return materializedViewSql(sqlType, schema, "new_materialized_view", "source_table");
  }
  if (kind === "column") {
    return addColumnSql(sqlType, target.schema, target.name);
  }
  if (kind === "index") {
    return `create index ${quoteSqlIdentifier(sqlType, `idx_${target.name}_column`)}
on ${qualifiedSqlName(sqlType, target.schema, target.name)} (${quoteSqlIdentifier(sqlType, "column_name")});
`;
  }
  if (kind === "unique_key") {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_column_key`)} unique (${quoteSqlIdentifier(sqlType, "column_name")});
`;
  }
  if (kind === "foreign_key") {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_fk`)} foreign key (${quoteSqlIdentifier(sqlType, "column_name")})
  references ${qualifiedSqlName(sqlType, schema, "referenced_table")} (${quoteSqlIdentifier(sqlType, "id")});
`;
  }
  if (kind === "check") {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_check`)} check (${quoteSqlIdentifier(sqlType, "column_name")} is not null);
`;
  }
  if (kind === "schema") {
    return createSchemaSql(sqlType, "new_schema");
  }
  if (kind === "sequence") {
    return createSequenceSql(sqlType, schema, "new_sequence");
  }
  return "";
}
function renameObjectSql(type, target) {
  const sqlType = assertSqlGeneratingType(type, "Rename generation");
  if (target.kind === "table") {
    if (sqlType === "mysql") {
      return `rename table ${qualifiedSqlName(sqlType, target.schema, target.name)} to ${qualifiedSqlName(sqlType, target.schema, `${target.name}_new`)};
`;
    }
    if (sqlType === "sqlserver") {
      return `exec sp_rename '${target.schema}.${target.name}', '${target.name}_new';
`;
    }
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  rename to ${quoteSqlIdentifier(sqlType, `${target.name}_new`)};
`;
  }
  if (target.kind === "view") {
    if (sqlType === "mysql") {
      return `rename table ${qualifiedSqlName(sqlType, target.schema, target.name)} to ${qualifiedSqlName(sqlType, target.schema, `${target.name}_new`)};
`;
    }
    if (sqlType === "sqlserver") {
      return `exec sp_rename '${target.schema}.${target.name}', '${target.name}_new';
`;
    }
    return `alter view ${qualifiedSqlName(sqlType, target.schema, target.name)}
  rename to ${quoteSqlIdentifier(sqlType, `${target.name}_new`)};
`;
  }
  if (target.kind === "schema") {
    return unsupportedSql(sqlType, "Renaming schemas");
  }
  if (target.kind === "column" && target.column) {
    if (sqlType === "sqlserver") {
      return `exec sp_rename '${target.schema}.${target.name}.${target.column}', '${target.column}_new', 'COLUMN';
`;
    }
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  rename column ${quoteSqlIdentifier(sqlType, target.column)} to ${quoteSqlIdentifier(sqlType, `${target.column}_new`)};
`;
  }
  return unsupportedSql(sqlType, "Rename generation");
}
function dropObjectSql(type, target) {
  const sqlType = assertSqlGeneratingType(type, "DROP generation");
  if (target.kind === "table") {
    return `drop table ${qualifiedSqlName(sqlType, target.schema, target.name)};
`;
  }
  if (target.kind === "view") {
    return `drop view ${qualifiedSqlName(sqlType, target.schema, target.name)};
`;
  }
  if (target.kind === "schema") {
    return sqlType === "oracle" ? unsupportedSql(sqlType, "Dropping schemas") : `drop schema ${quoteSqlIdentifier(sqlType, target.schema)};
`;
  }
  if (target.kind === "column" && target.column) {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}
  drop column ${quoteSqlIdentifier(sqlType, target.column)};
`;
  }
  return unsupportedSql(sqlType, "DROP generation");
}
function createSchemaSql(type, schema, options = {}) {
  const sqlType = assertSqlGeneratingType(type, "CREATE SCHEMA generation");
  if (sqlType === "sqlite" || sqlType === "oracle") {
    return unsupportedSql(sqlType, "CREATE SCHEMA");
  }
  const guard = options.ifNotExists && supportsIfNotExists(sqlType) ? " if not exists" : "";
  return `create schema${guard} ${quoteSqlIdentifier(sqlType, schema)};
`;
}
function dropTableIfExistsSql(type, schema, table) {
  const sqlType = assertSqlGeneratingType(type, "DROP TABLE generation");
  if (sqlType === "oracle") {
    return `drop table ${qualifiedSqlName(sqlType, schema, table)};
`;
  }
  return `drop table if exists ${qualifiedSqlName(sqlType, schema, table)};
`;
}
function dropViewIfExistsSql(type, schema, view) {
  const sqlType = assertSqlGeneratingType(type, "DROP VIEW generation");
  if (sqlType === "oracle") {
    return `drop view ${qualifiedSqlName(sqlType, schema, view)};
`;
  }
  return `drop view if exists ${qualifiedSqlName(sqlType, schema, view)};
`;
}
function createPlaceholderViewSql(type, schema, view) {
  const sqlType = assertSqlGeneratingType(type, "CREATE VIEW generation");
  return `create view ${qualifiedSqlName(sqlType, schema, view)} as
select 1 as ${quoteSqlIdentifier(sqlType, "placeholder")};
`;
}
function columnDefinitionSql(type, column) {
  const dataType = column.dataType?.trim();
  if (!dataType) {
    throw new Error(`Missing data type for ${column.schema}.${column.table}.${column.name}.`);
  }
  const nullable = column.nullable ? "" : " not null";
  const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : "";
  return `  ${quoteSqlIdentifier(type, column.name)} ${dataType}${defaultValue}${nullable}`;
}
function defaultTextType(type) {
  if (type === "mysql") {
    return "varchar(255)";
  }
  if (type === "sqlserver") {
    return "nvarchar(max)";
  }
  if (type === "oracle") {
    return "varchar2(255)";
  }
  return "text";
}
function defaultIdType(type) {
  if (type === "postgres") {
    return "bigserial primary key";
  }
  if (type === "redshift") {
    return "bigint identity(1,1) primary key";
  }
  if (type === "mysql") {
    return "bigint auto_increment primary key";
  }
  if (type === "sqlite") {
    return "integer primary key";
  }
  if (type === "sqlserver") {
    return "bigint identity(1,1) primary key";
  }
  if (type === "oracle") {
    return "number generated by default as identity primary key";
  }
  return "number autoincrement primary key";
}
function timestampColumnSql(type) {
  if (type === "sqlserver") {
    return "datetime2 not null default sysdatetime()";
  }
  if (type === "oracle") {
    return "timestamp default systimestamp not null";
  }
  if (type === "mysql") {
    return "timestamp not null default current_timestamp";
  }
  if (type === "sqlite") {
    return "text not null default current_timestamp";
  }
  if (type === "snowflake") {
    return "timestamp_ntz not null default current_timestamp()";
  }
  return "timestamp not null default current_timestamp";
}
function defaultValuesInsertSql(type, tableName) {
  if (type === "mysql") {
    return `insert into ${tableName} () values ();
`;
  }
  if (type === "oracle") {
    return `-- No writable columns were found. Oracle does not support a portable DEFAULT VALUES template for this table.
`;
  }
  return `insert into ${tableName}
default values;
`;
}
function addColumnKeyword(type) {
  return type === "sqlserver" || type === "oracle" ? "add" : "add column";
}
function createViewSql(type, schema, view, sourceTable) {
  if (type === "sqlserver") {
    return `create or alter view ${qualifiedSqlName(type, schema, view)} as
select *
from ${qualifiedSqlName(type, schema, sourceTable)};
`;
  }
  if (type === "sqlite") {
    return `create view ${qualifiedSqlName(type, schema, view)} as
select *
from ${qualifiedSqlName(type, schema, sourceTable)};
`;
  }
  return `create or replace view ${qualifiedSqlName(type, schema, view)} as
select *
from ${qualifiedSqlName(type, schema, sourceTable)};
`;
}
function materializedViewSql(type, schema, view, sourceTable) {
  if (type === "mysql" || type === "sqlite" || type === "sqlserver") {
    return unsupportedSql(type, "Materialized views");
  }
  return `create materialized view ${qualifiedSqlName(type, schema, view)} as
select *
from ${qualifiedSqlName(type, schema, sourceTable)};
`;
}
function createSequenceSql(type, schema, sequence) {
  if (type === "mysql" || type === "sqlite" || type === "redshift") {
    return unsupportedSql(type, "Sequences");
  }
  return `create sequence ${qualifiedSqlName(type, schema, sequence)}
  start with 1
  increment by 1;
`;
}
function supportsIfNotExists(type) {
  return type !== "oracle" && type !== "sqlserver";
}
function unsupportedSql(type, feature) {
  return `-- ${feature} is not supported by the ${type} SQL generator.
`;
}

// src/database/drivers/postgresDriver.ts
var PostgresDriver = class {
  id = "postgres";
  displayName = "PostgreSQL";
  pools = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  activeExecutions = /* @__PURE__ */ new Map();
  transactionClients = /* @__PURE__ */ new Map();
  async testConnection(config) {
    let pool;
    try {
      pool = await this.createVerifiedPool(config, 1);
      const result = await pool.query("select version() as version");
      return { ok: true, message: "Connection successful", serverVersion: result.rows[0]?.version };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (pool) {
        await this.endPool(pool);
      }
    }
  }
  async connect(config) {
    await this.disconnect(config.id);
    const pool = await this.createVerifiedPool(config, 8);
    this.pools.set(config.id, pool);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    await this.rollbackTransaction(connectionId).catch(() => void 0);
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      await pool.end();
    }
  }
  async beginTransaction(connectionId) {
    if (this.transactionClients.has(connectionId)) {
      return;
    }
    const pool = this.requirePool(connectionId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      this.transactionClients.set(connectionId, client);
    } catch (error) {
      client.release();
      throw error;
    }
  }
  async commitTransaction(connectionId) {
    const client = this.transactionClients.get(connectionId);
    if (!client) {
      return;
    }
    try {
      await client.query("commit");
    } finally {
      this.transactionClients.delete(connectionId);
      client.release();
    }
  }
  async rollbackTransaction(connectionId) {
    const client = this.transactionClients.get(connectionId);
    if (!client) {
      return;
    }
    try {
      await client.query("rollback");
    } finally {
      this.transactionClients.delete(connectionId);
      client.release();
    }
  }
  isTransactionOpen(connectionId) {
    return this.transactionClients.has(connectionId);
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const pool = this.requirePool(params.connectionId);
    const transactionClient = this.transactionClients.get(params.connectionId);
    const client = transactionClient ?? await pool.connect();
    const results = [];
    const hasExplicitTransaction = !transactionClient && statements.some((sql) => /\bbegin\b/i.test(sql));
    const pinnedTransaction = !!transactionClient;
    try {
      for (const [index, sql] of statements.entries()) {
        const executionId = (0, import_crypto.randomUUID)();
        const started = Date.now();
        params.onProgress?.({
          statementIndex: index,
          statementCount: statements.length,
          sql,
          status: "started",
          executionId,
          startedAt: started
        });
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, processId: client.processID });
        try {
          const result = await client.query(this.sqlWithClientLimit(sql, params.maxRows, params.offset));
          const queryResults = Array.isArray(result) ? result : [result];
          const executionResults = queryResults.map((item) => this.toExecutionResult(item, executionId, started));
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "completed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            rowCount: executionResults.reduce((total, item) => total + item.rowCount, 0),
            command: executionResults.at(-1)?.command
          });
          for (const item of executionResults) {
            results.push(item);
          }
        } catch (error) {
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "failed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        } finally {
          this.activeExecutions.delete(executionId);
        }
      }
      return results;
    } catch (error) {
      if (hasExplicitTransaction) {
        try {
          await client.query("rollback");
        } catch {
        }
      }
      throw error;
    } finally {
      if (!pinnedTransaction) {
        client.release();
      }
    }
  }
  async validateQuery(params) {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, "");
    if (!sql || !this.canExplain(sql)) {
      return { ok: true };
    }
    try {
      await pool.query(`explain ${sql}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.toQueryError(error) };
    }
  }
  async explainQuery(params, options = {}) {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, "");
    if (!sql || !this.canExplain(sql)) {
      throw new Error("Only SELECT, WITH, INSERT, UPDATE, DELETE, and MERGE statements can be explained.");
    }
    const explainOptions = options.analyze ? "analyze, format json" : "format json";
    const result = await pool.query(`explain (${explainOptions}) ${sql}`);
    const row = result.rows[0];
    const value = row?.["QUERY PLAN"] ?? row?.["query_plan"] ?? Object.values(row ?? {})[0];
    return normalizeExplainJsonPlan(value, options.analyze === true);
  }
  async cancelQuery(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (!active?.processId) {
      return;
    }
    const pool = this.requirePool(active.connectionId);
    await pool.query("select pg_cancel_backend($1)", [active.processId]);
  }
  async getSchemas(connectionId) {
    const result = await this.requirePool(connectionId).query(
      `select schema_name as name
       from information_schema.schemata
       where schema_name not like 'pg_%' and schema_name <> 'information_schema'
       order by schema_name`
    );
    return result.rows;
  }
  async getTables(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema, c.relname as name,
              case when c.relkind = 'm' then 'materialized_view' else 'table' end as type,
              c.reltuples::bigint as "rowEstimate",
              obj_description(c.oid) as comment
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'm')
       order by c.relname`,
      [schema]
    );
    return result.rows;
  }
  async getViews(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = $1
       order by table_name`,
      [schema]
    );
    return result.rows;
  }
  async getFunctions(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              p.proname as name,
              'function' as kind,
              pg_get_function_result(p.oid) as "returnType",
              l.lanname as language,
              obj_description(p.oid, 'pg_proc') as comment
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_language l on l.oid = p.prolang
       where n.nspname = $1 and p.prokind = 'f'
       order by p.proname`,
      [schema]
    );
    return result.rows;
  }
  async getProcedures(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              p.proname as name,
              'procedure' as kind,
              pg_get_function_result(p.oid) as "returnType",
              l.lanname as language,
              obj_description(p.oid, 'pg_proc') as comment
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_language l on l.oid = p.prolang
       where n.nspname = $1 and p.prokind = 'p'
       order by p.proname`,
      [schema]
    );
    return result.rows;
  }
  async getTriggers(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              c.relname as table,
              t.tgname as name,
              t.tgenabled as enabled,
              pg_get_triggerdef(t.oid) as definition
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and not t.tgisinternal
       order by c.relname, t.tgname`,
      [schema]
    );
    return result.rows.map((row) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      enabled: optionalString(row.enabled),
      orientation: optionalString(row.definition)?.includes("FOR EACH ROW") ? "row" : "statement",
      timing: optionalString(row.definition)?.includes("BEFORE") ? "before" : optionalString(row.definition)?.includes("AFTER") ? "after" : optionalString(row.definition)?.includes("INSTEAD OF") ? "instead of" : void 0,
      events: triggerEvents(optionalString(row.definition))
    }));
  }
  async getActiveSessions(connectionId) {
    const result = await this.requirePool(connectionId).query(
      `select pid,
              usename as user,
              datname as database,
              application_name as application,
              client_addr::text as client,
              state,
              query,
              backend_start as "startedAt",
              xact_start as "transactionStartedAt",
              state_change as "stateChangedAt",
              wait_event_type as "waitEventType",
              wait_event as "waitEvent",
              pid = pg_backend_pid() as "isCurrent",
              state = 'idle in transaction' as "isIdleInTransaction"
       from pg_stat_activity
       where datname = current_database()
       order by backend_start desc nulls last, pid desc`
    );
    return result.rows.map((row) => ({
      pid: Number(row.pid),
      user: optionalString(row.user),
      database: optionalString(row.database),
      application: optionalString(row.application),
      client: optionalString(row.client),
      state: optionalString(row.state),
      query: optionalString(row.query),
      startedAt: optionalString(row.startedAt),
      transactionStartedAt: optionalString(row.transactionStartedAt),
      stateChangedAt: optionalString(row.stateChangedAt),
      waitEventType: optionalString(row.waitEventType),
      waitEvent: optionalString(row.waitEvent),
      isCurrent: Boolean(row.isCurrent),
      isIdleInTransaction: Boolean(row.isIdleInTransaction)
    }));
  }
  async cancelSession(connectionId, pid) {
    await this.requirePool(connectionId).query("select pg_cancel_backend($1)", [pid]);
  }
  async terminateSession(connectionId, pid) {
    await this.requirePool(connectionId).query("select pg_terminate_backend($1)", [pid]);
  }
  async getColumns(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select c.table_schema as schema, c.table_name as table, c.column_name as name,
              c.ordinal_position as ordinal, c.data_type as "dataType",
              c.is_nullable = 'YES' as nullable, c.column_default as "defaultValue",
              col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position) as comment
       from information_schema.columns c
       where c.table_schema = $1 and c.table_name = $2
       order by c.ordinal_position`,
      [schema, table]
    );
    return result.rows;
  }
  async getIndexes(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select indexname as name, indexdef as definition
       from pg_indexes
       where schemaname = $1 and tablename = $2
       order by indexname`,
      [schema, table]
    );
    return result.rows.map((row) => ({
      name: row.name,
      definition: row.definition,
      columns: this.columnsFromIndexDefinition(row.definition),
      unique: /\bunique\b/i.test(row.definition)
    }));
  }
  async getPrimaryKeys(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name, array_agg(kcu.column_name order by kcu.ordinal_position) as columns
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name`,
      [schema, table]
    );
    return result.rows;
  }
  async getForeignKeys(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name,
              array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
              ccu.table_schema as "foreignSchema",
              ccu.table_name as "foreignTable",
              array_agg(ccu.column_name order by kcu.ordinal_position) as "foreignColumns"
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name, ccu.table_schema, ccu.table_name`,
      [schema, table]
    );
    return result.rows;
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const where = options?.where?.trim();
    if (where && /;|--|\/\*/.test(where)) {
      throw new Error("WHERE must be a single SQL expression without comments or semicolons.");
    }
    const orderBySql = options?.orderBySql?.trim();
    if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
      throw new Error("ORDER BY must be a single SQL expression without comments or semicolons.");
    }
    const orderBy = orderBySql ? `
order by ${orderBySql}` : options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : "";
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const paging = pageLimit ? `
limit ${pageLimit}${offset ? ` offset ${offset}` : ""}` : "";
    const sql = `select * from ${qualifiedName(schema, table)}${where ? `
where ${where}` : ""}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getTableDDL(connectionId, schema, table) {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }
  async getTableStats(connectionId, schema, table) {
    const pool = this.requirePool(connectionId);
    const tableResult = await pool.query(
      `select s.seq_scan as "seqScan",
              s.idx_scan as "idxScan",
              s.n_live_tup as "liveRows",
              s.n_dead_tup as "deadRows",
              s.last_vacuum as "lastVacuum",
              s.last_autovacuum as "lastAutoVacuum",
              s.last_analyze as "lastAnalyze",
              s.last_autoanalyze as "lastAutoAnalyze",
              c.reltuples as "rowEstimate"
       from pg_stat_user_tables s
       left join pg_class c on c.oid = s.relid
       where s.schemaname = $1 and s.relname = $2`,
      [schema, table]
    );
    const columnResult = await pool.query(
      `select attname as name,
              null_frac as "nullFraction",
              n_distinct as "nDistinct",
              correlation
       from pg_stats
       where schemaname = $1 and tablename = $2
       order by attname`,
      [schema, table]
    );
    const row = tableResult.rows[0] ?? {};
    return {
      schema,
      table,
      databaseType: this.id,
      rowEstimate: this.numberFromDb(row.rowEstimate),
      seqScan: this.numberFromDb(row.seqScan),
      idxScan: this.numberFromDb(row.idxScan),
      liveRows: this.numberFromDb(row.liveRows),
      deadRows: this.numberFromDb(row.deadRows),
      lastVacuum: this.dateFromDb(row.lastVacuum),
      lastAutoVacuum: this.dateFromDb(row.lastAutoVacuum),
      lastAnalyze: this.dateFromDb(row.lastAnalyze),
      lastAutoAnalyze: this.dateFromDb(row.lastAutoAnalyze),
      columns: columnResult.rows.map((column) => ({
        name: String(column.name),
        nullFraction: this.numberFromDb(column.nullFraction),
        nDistinct: this.numberFromDb(column.nDistinct),
        correlation: this.numberFromDb(column.correlation)
      }))
    };
  }
  requirePool(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error("Connection is not active. Connect first.");
    }
    return pool;
  }
  toPoolConfig(config, max) {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max,
      connectionTimeoutMillis: config.connectTimeoutMs ?? 1e4,
      query_timeout: config.queryTimeoutMs,
      ssl: config.sslMode === "disable" ? false : { rejectUnauthorized: false }
    };
  }
  shouldRetryWithoutSsl(config, error) {
    const message = error instanceof Error ? error.message : String(error);
    return config.sslMode === "prefer" && /server does not support ssl connections/i.test(message);
  }
  async createVerifiedPool(config, max) {
    const { Pool } = await loadPg();
    const pool = new Pool(this.toPoolConfig(config, max));
    try {
      await pool.query("select 1");
      return pool;
    } catch (error) {
      await this.endPool(pool);
      if (!this.shouldRetryWithoutSsl(config, error)) {
        throw error;
      }
      const fallbackPool = new Pool(this.toPoolConfig({ ...config, sslMode: "disable" }, max));
      try {
        await fallbackPool.query("select 1");
        return fallbackPool;
      } catch (fallbackError) {
        await this.endPool(fallbackPool);
        throw fallbackError;
      }
    }
  }
  async endPool(pool) {
    try {
      await pool.end();
    } catch {
    }
  }
  columnsFromIndexDefinition(definition) {
    const match = definition.match(/\((.*)\)/);
    return match ? match[1].split(",").map((part) => part.trim().replace(/^"|"$/g, "")) : [];
  }
  numberFromDb(value) {
    if (value === null || value === void 0) {
      return void 0;
    }
    const next = typeof value === "number" ? value : Number(value);
    return Number.isFinite(next) ? next : void 0;
  }
  dateFromDb(value) {
    if (!value) {
      return void 0;
    }
    return value instanceof Date ? value.toISOString() : String(value);
  }
  canApplyClientLimit(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return normalized.startsWith("select") || normalized.startsWith("with");
  }
  sqlWithClientLimit(sql, maxRows, offset) {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : void 0;
    return pageLimit && this.canApplyClientLimit(sql) ? `select * from (${sql.replace(/;+\s*$/, "")}) __dg_query limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ""}` : sql;
  }
  toExecutionResult(result, executionId, started) {
    const fields = result?.fields ?? [];
    const rows = result?.rows ?? [];
    return {
      executionId,
      fields: fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
      rows,
      rowCount: result?.rowCount ?? rows.length,
      command: result?.command,
      durationMs: Date.now() - started
    };
  }
  canExplain(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
  }
  toQueryError(error) {
    const pgError = error;
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
};
var pgRuntime;
function loadPg() {
  pgRuntime ??= loadPgRuntime();
  return pgRuntime;
}
async function loadPgRuntime() {
  const bundled = loadBundledRuntime("pgRuntime");
  if (bundled) {
    return bundled;
  }
  return import("pg").then((module2) => {
    const candidate = module2;
    return "Pool" in candidate ? candidate : candidate.default;
  });
}
function optionalString(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = String(value).trim();
  return next || void 0;
}
function triggerEvents(definition) {
  if (!definition) {
    return void 0;
  }
  const events = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"].filter((event) => definition.includes(event));
  return events.length ? events : void 0;
}

// src/database/drivers/redshiftDriver.ts
var RedshiftDriver = class extends PostgresDriver {
  id = "redshift";
  displayName = "Amazon Redshift";
  async getSchemas(connectionId) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select distinct name
         from (
           select schema_name as name
           from svv_all_schemas
           where database_name = current_database()
           union all
           select nspname as name
           from pg_namespace
         ) schemas
         where name <> 'information_schema' and name not like 'pg_toast%' and name not like 'pg_temp%'
         order by name`
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select nspname as name
         from pg_namespace
         where nspname <> 'information_schema' and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'
         order by nspname`
      );
      return result.rows;
    }
  }
  async getTables(connectionId, schema) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select schema_name as schema,
                table_name as name,
                case when lower(table_type) like '%materialized%' then 'materialized_view' else 'table' end as type,
                remarks as comment
         from svv_all_tables
         where database_name = current_database() and schema_name = $1
         order by table_name`,
        [schema]
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select schemaname as schema, tablename as name, 'table' as type
         from pg_tables
         where schemaname = $1
         order by tablename`,
        [schema]
      );
      return result.rows;
    }
  }
  async getViews(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select schemaname as schema, viewname as name, 'view' as type
       from pg_views
       where schemaname = $1
       order by viewname`,
      [schema]
    );
    return result.rows;
  }
  async getActiveSessions(connectionId) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select pid,
                user_name as user,
                db_name as database,
                '' as application,
                remotehost as client,
                status as state,
                query as query,
                starttime as "startedAt",
                null as "transactionStartedAt",
                null as "stateChangedAt",
                null as "waitEventType",
                null as "waitEvent",
                pid = pg_backend_pid() as "isCurrent",
                status = 'idle in transaction' as "isIdleInTransaction"
         from stv_recents
         where db_name = current_database()
         order by starttime desc nulls last, pid desc`
      );
      return result.rows.map((row) => ({
        pid: Number(row.pid),
        user: optionalString2(row.user),
        database: optionalString2(row.database),
        application: optionalString2(row.application),
        client: optionalString2(row.client),
        state: optionalString2(row.state),
        query: optionalString2(row.query),
        startedAt: optionalString2(row.startedAt),
        transactionStartedAt: optionalString2(row.transactionStartedAt),
        stateChangedAt: optionalString2(row.stateChangedAt),
        waitEventType: optionalString2(row.waitEventType),
        waitEvent: optionalString2(row.waitEvent),
        isCurrent: Boolean(row.isCurrent),
        isIdleInTransaction: Boolean(row.isIdleInTransaction)
      }));
    } catch {
      return super.getActiveSessions(connectionId);
    }
  }
  async cancelSession(connectionId, pid) {
    await this.requirePool(connectionId).query("select pg_cancel_backend($1)", [pid]);
  }
  async terminateSession(connectionId, pid) {
    await this.cancelSession(connectionId, pid);
  }
  async getColumns(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as table, column_name as name,
              ordinal_position as ordinal, data_type as "dataType",
              is_nullable = 'YES' as nullable, column_default as "defaultValue"
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table]
    );
    return result.rows.map((row) => {
      const name = String(row.name ?? row.column_name);
      const dataType = optionalString2(row.dataType ?? row.datatype ?? row.data_type);
      if (!dataType) {
        throw new Error(`Redshift column metadata for ${qualifiedName(schema, table)}.${name} did not include a data type.`);
      }
      return {
        schema: String(row.schema ?? schema),
        table: String(row.table ?? table),
        name,
        ordinal: Number(row.ordinal ?? row.ordinal_position),
        dataType,
        nullable: booleanFromDb(row.nullable),
        defaultValue: optionalString2(row.defaultValue ?? row.defaultvalue ?? row.column_default)
      };
    });
  }
  async getTableStats(connectionId, schema, table) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select diststyle as "distStyle",
                sortkey1 as "sortKey1",
                sortkey_num as "sortKeyNum",
                size as "sizeMb",
                tbl_rows as "rowCount",
                skew_rows as "skewRows",
                unsorted as "unsortedPct",
                stats_off as "statsOffPct",
                encoded as "encoded"
         from svv_table_info
         where "schema" = $1 and "table" = $2`,
        [schema, table]
      );
      const row = result.rows[0] ?? {};
      return {
        schema,
        table,
        databaseType: this.id,
        rowEstimate: this.numberFromDb(row.rowCount),
        columns: [],
        redshift: {
          distStyle: optionalString2(row.distStyle),
          sortKey1: optionalString2(row.sortKey1),
          sortKeyNum: this.numberFromDb(row.sortKeyNum),
          sizeMb: this.numberFromDb(row.sizeMb),
          rowCount: this.numberFromDb(row.rowCount),
          skewRows: this.numberFromDb(row.skewRows),
          unsortedPct: this.numberFromDb(row.unsortedPct),
          statsOffPct: this.numberFromDb(row.statsOffPct),
          encoded: optionalString2(row.encoded)
        }
      };
    } catch {
      const fallback = await super.getTableStats(connectionId, schema, table);
      return { ...fallback, databaseType: this.id };
    }
  }
  async explainQuery(params, options = {}) {
    try {
      return await super.explainQuery(params, options);
    } catch (error) {
      if (options.analyze) {
        throw error;
      }
      const sql = params.sql.trim().replace(/;+\s*$/, "");
      if (!/^(select|with|insert|update|delete|merge)\b/i.test(sql)) {
        throw error;
      }
      const result = await this.requirePool(params.connectionId).query(`explain ${sql}`);
      const rawText = result.rows.map((row) => Object.values(row).map((value) => String(value)).join(" ")).join("\n");
      return textExplainPlan(rawText, false);
    }
  }
  shouldRetryWithoutSsl(_config, _error) {
    return false;
  }
  toPoolConfig(config, max) {
    return {
      ...super.toPoolConfig({ ...config, sslMode: config.sslMode === "disable" ? "prefer" : config.sslMode }, max),
      port: config.port || 5439
    };
  }
};
function optionalString2(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = String(value).trim();
  return next || void 0;
}
function booleanFromDb(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = optionalString2(value)?.toLowerCase();
  return normalized === "true" || normalized === "t" || normalized === "yes" || normalized === "y" || normalized === "1";
}

// src/database/drivers/mysqlDriver.ts
var import_crypto2 = require("crypto");
var MySQLDriver = class {
  id = "mysql";
  displayName = "MySQL";
  pools = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  activeExecutions = /* @__PURE__ */ new Map();
  transactionConnections = /* @__PURE__ */ new Map();
  async testConnection(config) {
    let pool;
    try {
      pool = await this.createVerifiedPool(config, 1);
      const [rows] = await pool.query("select version() as version");
      const row = rows[0] ?? {};
      return { ok: true, message: "Connection successful", serverVersion: optionalString3(row.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (pool) {
        await this.endPool(pool);
      }
    }
  }
  async connect(config) {
    await this.disconnect(config.id);
    const pool = await this.createVerifiedPool(config, 8);
    this.pools.set(config.id, pool);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    await this.rollbackTransaction(connectionId).catch(() => void 0);
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      await pool.end();
    }
  }
  async beginTransaction(connectionId) {
    if (this.transactionConnections.has(connectionId)) {
      return;
    }
    const pool = this.requirePool(connectionId);
    const connection = await pool.getConnection();
    try {
      await connection.query("start transaction");
      this.transactionConnections.set(connectionId, connection);
    } catch (error) {
      connection.release();
      throw error;
    }
  }
  async commitTransaction(connectionId) {
    const connection = this.transactionConnections.get(connectionId);
    if (!connection) {
      return;
    }
    try {
      await connection.query("commit");
    } finally {
      this.transactionConnections.delete(connectionId);
      connection.release();
    }
  }
  async rollbackTransaction(connectionId) {
    const connection = this.transactionConnections.get(connectionId);
    if (!connection) {
      return;
    }
    try {
      await connection.query("rollback");
    } finally {
      this.transactionConnections.delete(connectionId);
      connection.release();
    }
  }
  isTransactionOpen(connectionId) {
    return this.transactionConnections.has(connectionId);
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const pool = this.requirePool(params.connectionId);
    const transactionConnection = this.transactionConnections.get(params.connectionId);
    const connection = transactionConnection ?? await pool.getConnection();
    const results = [];
    const hasExplicitTransaction = !transactionConnection && statements.some((sql) => /\bbegin\b/i.test(sql));
    const pinnedTransaction = !!transactionConnection;
    try {
      for (const [index, sql] of statements.entries()) {
        const executionId = (0, import_crypto2.randomUUID)();
        const started = Date.now();
        params.onProgress?.({
          statementIndex: index,
          statementCount: statements.length,
          sql,
          status: "started",
          executionId,
          startedAt: started
        });
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, threadId: this.threadId(connection) });
        try {
          const [rows, fields] = await connection.query(this.sqlWithClientLimit(sql, params.maxRows, params.offset));
          const executionResult = this.toExecutionResult(rows, fields, executionId, started, sql);
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "completed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            rowCount: executionResult.rowCount,
            command: executionResult.command
          });
          results.push(executionResult);
        } catch (error) {
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "failed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        } finally {
          this.activeExecutions.delete(executionId);
        }
      }
      return results;
    } catch (error) {
      if (hasExplicitTransaction) {
        try {
          await connection.query("rollback");
        } catch {
        }
      }
      throw error;
    } finally {
      if (!pinnedTransaction) {
        connection.release();
      }
    }
  }
  async validateQuery(params) {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, "");
    if (!sql || !this.canExplain(sql)) {
      return { ok: true };
    }
    try {
      await pool.query(`explain ${sql}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.toQueryError(error) };
    }
  }
  async explainQuery(params, options = {}) {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, "");
    if (!sql || !this.canExplain(sql)) {
      throw new Error("Only SELECT, WITH, INSERT, UPDATE, DELETE, and MERGE statements can be explained.");
    }
    const explainSql2 = options.analyze ? `explain analyze ${sql}` : `explain format=json ${sql}`;
    const [rows] = await pool.query(explainSql2);
    return textExplainPlan(JSON.stringify(rows, null, 2), options.analyze === true);
  }
  async cancelQuery(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (!active?.threadId) {
      return;
    }
    const pool = this.requirePool(active.connectionId);
    await pool.query(`kill query ${active.threadId}`);
  }
  async getSchemas(connectionId) {
    const [rows] = await this.requirePool(connectionId).query(
      `select schema_name as name
       from information_schema.schemata
       where schema_name not in ('information_schema', 'mysql', 'performance_schema', 'sys')
       order by schema_name`
    );
    return rows;
  }
  async getTables(connectionId, schema) {
    const [rows] = await this.requirePool(connectionId).query(
      `select table_schema as \`schema\`,
              table_name as name,
              'table' as type,
              table_rows as "rowEstimate",
              table_comment as comment
       from information_schema.tables
       where table_schema = ? and table_type = 'BASE TABLE'
       order by table_name`,
      [schema]
    );
    return rows;
  }
  async getViews(connectionId, schema) {
    const [rows] = await this.requirePool(connectionId).query(
      `select table_schema as \`schema\`, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = ?
       order by table_name`,
      [schema]
    );
    return rows;
  }
  async getFunctions(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "FUNCTION");
  }
  async getProcedures(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "PROCEDURE");
  }
  async getTriggers(connectionId, schema) {
    const [rows] = await this.requirePool(connectionId).query(
      `select trigger_schema as \`schema\`,
              event_object_table as "table",
              trigger_name as name,
              action_timing as timing,
              event_manipulation as event,
              action_orientation as orientation,
              action_statement as definition
       from information_schema.triggers
       where trigger_schema = ?
       order by event_object_table, trigger_name`,
      [schema]
    );
    return rows.map((row) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      timing: optionalString3(row.timing)?.toLowerCase(),
      orientation: optionalString3(row.orientation)?.toLowerCase(),
      enabled: "YES",
      events: optionalString3(row.event) ? [optionalString3(row.event)] : void 0
    }));
  }
  async getActiveSessions(connectionId) {
    const pool = this.requirePool(connectionId);
    const connection = await pool.getConnection();
    let currentThreadId;
    let rows = [];
    try {
      const [currentRows] = await connection.query(`select connection_id() as id`);
      currentThreadId = numberFromDb(currentRows[0]?.id);
      const [processRows] = await connection.query(`show full processlist`);
      rows = processRows;
    } finally {
      connection.release();
    }
    return rows.map((row) => ({
      pid: Number(row.Id ?? row.id ?? row.ID),
      user: optionalString3(row.User ?? row.user),
      database: optionalString3(row.db ?? row.Database ?? row.database),
      application: optionalString3(row.Command ?? row.command),
      client: optionalString3(row.Host ?? row.host),
      state: optionalString3(row.State ?? row.state),
      query: optionalString3(row.Info ?? row.info),
      isCurrent: Number(row.Id ?? row.id ?? row.ID) === currentThreadId
    }));
  }
  async cancelSession(connectionId, pid) {
    await this.requirePool(connectionId).query(`kill query ${Math.trunc(pid)}`);
  }
  async terminateSession(connectionId, pid) {
    await this.requirePool(connectionId).query(`kill ${Math.trunc(pid)}`);
  }
  async getColumns(connectionId, schema, table) {
    const [rows] = await this.requirePool(connectionId).query(
      `select table_schema as \`schema\`,
              table_name as \`table\`,
              column_name as name,
              ordinal_position as ordinal,
              column_type as "dataType",
              is_nullable = 'YES' as nullable,
              column_default as "defaultValue",
              column_comment as comment
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`,
      [schema, table]
    );
    return rows;
  }
  async getIndexes(connectionId, schema, table) {
    const [rows] = await this.requirePool(connectionId).query(
      `select index_name as name,
              non_unique as "nonUnique",
              seq_in_index as "seqInIndex",
              column_name as "columnName",
              index_type as "indexType"
       from information_schema.statistics
       where table_schema = ? and table_name = ?
       order by index_name, seq_in_index`,
      [schema, table]
    );
    const grouped = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const name = String(row.name);
      const entry = grouped.get(name) ?? { name, columns: [], unique: true };
      if (typeof row.nonUnique === "number") {
        entry.unique = row.nonUnique === 0;
      }
      if (row.columnName) {
        entry.columns.push(String(row.columnName));
      }
      if (!entry.definition && row.indexType) {
        entry.definition = String(row.indexType);
      }
      grouped.set(name, entry);
    }
    return [...grouped.values()].map(({ nonUnique: _nonUnique, ...index }) => index);
  }
  async getPrimaryKeys(connectionId, schema, table) {
    const [rows] = await this.requirePool(connectionId).query(
      `select constraint_name as name, column_name as "columnName", ordinal_position as ordinal
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and constraint_name = 'PRIMARY'
       order by ordinal_position`,
      [schema, table]
    );
    return groupKeyRows(rows);
  }
  async getForeignKeys(connectionId, schema, table) {
    const [rows] = await this.requirePool(connectionId).query(
      `select constraint_name as name,
              column_name as "columnName",
              ordinal_position as ordinal,
              referenced_table_schema as "foreignSchema",
              referenced_table_name as "foreignTable",
              referenced_column_name as "foreignColumn"
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and referenced_table_name is not null
       order by constraint_name, ordinal_position`,
      [schema, table]
    );
    return groupForeignKeyRows(rows);
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const where = options?.where?.trim();
    if (where && /;|--|\/\*/.test(where)) {
      throw new Error("WHERE must be a single SQL expression without comments or semicolons.");
    }
    const orderBySql = options?.orderBySql?.trim();
    if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
      throw new Error("ORDER BY must be a single SQL expression without comments or semicolons.");
    }
    const orderBy = orderBySql ? `
order by ${orderBySql}` : options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column, "`")} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : "";
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const paging = pageLimit ? `
limit ${pageLimit}${offset ? ` offset ${offset}` : ""}` : "";
    const sql = `select * from ${qualifiedName(schema, table, "`")}${where ? `
where ${where}` : ""}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getTableDDL(connectionId, schema, table) {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }
  async getTableStats(connectionId, schema, table) {
    const [rows] = await this.requirePool(connectionId).query(
      `select table_rows as "rowEstimate",
              data_length as "dataLength",
              index_length as "indexLength",
              update_time as "updatedAt"
       from information_schema.tables
       where table_schema = ? and table_name = ?`,
      [schema, table]
    );
    const row = rows[0] ?? {};
    return {
      schema,
      table,
      databaseType: this.id,
      rowEstimate: numberFromDb(row.rowEstimate),
      columns: []
    };
  }
  requirePool(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error("Connection is not active. Connect first.");
    }
    return pool;
  }
  toPoolConfig(config, max) {
    const ssl = config.sslMode === "disable" ? void 0 : { rejectUnauthorized: false };
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionLimit: max,
      waitForConnections: true,
      connectTimeout: config.connectTimeoutMs ?? 1e4,
      ssl
    };
  }
  shouldRetryWithoutSsl(config, error) {
    const message = error instanceof Error ? error.message : String(error);
    return config.sslMode === "prefer" && /ssl|secure connection|handshake/i.test(message);
  }
  async createVerifiedPool(config, max) {
    const mysql = await loadMysql();
    const pool = mysql.createPool(this.toPoolConfig(config, max));
    try {
      await pool.query("select 1");
      return pool;
    } catch (error) {
      await this.endPool(pool);
      if (!this.shouldRetryWithoutSsl(config, error)) {
        throw error;
      }
      const fallbackPool = mysql.createPool(this.toPoolConfig({ ...config, sslMode: "disable" }, max));
      try {
        await fallbackPool.query("select 1");
        return fallbackPool;
      } catch (fallbackError) {
        await this.endPool(fallbackPool);
        throw fallbackError;
      }
    }
  }
  async endPool(pool) {
    try {
      await pool.end();
    } catch {
    }
  }
  sqlWithClientLimit(sql, maxRows, offset) {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : void 0;
    return pageLimit && this.canApplyClientLimit(sql) ? `select * from (${sql.replace(/;+\s*$/, "")}) __dg_query limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ""}` : sql;
  }
  canApplyClientLimit(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return normalized.startsWith("select") || normalized.startsWith("with");
  }
  toExecutionResult(rows, fields, executionId, started, sql) {
    const recordRows = Array.isArray(rows) ? rows : [];
    const rowCount = Array.isArray(rows) ? recordRows.length : typeof rows?.affectedRows === "number" ? Number(rows.affectedRows) : 0;
    return {
      executionId,
      fields: Array.isArray(fields) ? fields.map((field) => ({ name: field.name, dataTypeId: field.columnType })) : [],
      rows: recordRows,
      rowCount,
      command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
      durationMs: Date.now() - started
    };
  }
  async getRoutines(connectionId, schema, type) {
    const [rows] = await this.requirePool(connectionId).query(
      `select routine_schema as \`schema\`,
              routine_name as name,
              routine_type as kind,
              dtd_identifier as "returnType",
              security_type as language,
              routine_comment as comment
       from information_schema.routines
       where routine_schema = ? and routine_type = ?
       order by routine_name`,
      [schema, type]
    );
    return rows.map((row) => ({
      schema: String(row.schema),
      name: String(row.name),
      kind: optionalString3(row.kind)?.toLowerCase() === "procedure" ? "procedure" : "function",
      returnType: optionalString3(row.returnType),
      language: optionalString3(row.language),
      comment: optionalString3(row.comment)
    }));
  }
  canExplain(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
  }
  threadId(connection) {
    return numberFromDb(connection.threadId);
  }
  toQueryError(error) {
    const mysqlError = error;
    return {
      message: mysqlError.message ?? String(error),
      code: mysqlError.code,
      detail: mysqlError.detail,
      hint: mysqlError.hint,
      position: mysqlError.position,
      where: mysqlError.where
    };
  }
};
var mysqlRuntime;
function loadMysql() {
  mysqlRuntime ??= loadMysqlRuntime();
  return mysqlRuntime;
}
async function loadMysqlRuntime() {
  const bundled = loadBundledRuntime("mysqlRuntime");
  if (bundled) {
    return bundled;
  }
  return import("mysql2/promise").then((module2) => {
    const candidate = module2;
    return "createPool" in candidate ? candidate : candidate.default;
  });
}
function groupKeyRows(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const name = String(row.name);
    const entry = grouped.get(name) ?? { name, columns: [] };
    const column = row.columnName ?? row.column_name;
    if (column) {
      entry.columns.push(String(column));
    }
    grouped.set(name, entry);
  }
  return [...grouped.values()];
}
function groupForeignKeyRows(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const name = String(row.name);
    const entry = grouped.get(name) ?? {
      name,
      columns: [],
      foreignSchema: String(row.foreignSchema ?? row.referenced_table_schema ?? ""),
      foreignTable: String(row.foreignTable ?? row.referenced_table_name ?? ""),
      foreignColumns: []
    };
    const column = row.columnName ?? row.column_name;
    const foreignColumn = row.foreignColumn ?? row.referenced_column_name;
    if (column) {
      entry.columns.push(String(column));
    }
    if (foreignColumn) {
      entry.foreignColumns.push(String(foreignColumn));
    }
    grouped.set(name, entry);
  }
  return [...grouped.values()];
}
function numberFromDb(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : void 0;
}
function optionalString3(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = String(value).trim();
  return next || void 0;
}

// src/database/drivers/driverUtils.ts
var import_crypto3 = require("crypto");
var BasicDatabaseDriver = class {
  async testConnection(config) {
    try {
      const connection = await this.connect(config);
      await this.disconnect(connection.id);
      return { ok: true, message: "Connection successful" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async beginTransaction(connectionId) {
    await this.executeQuery({ connectionId, sql: "begin" });
  }
  async commitTransaction(connectionId) {
    await this.executeQuery({ connectionId, sql: "commit" });
  }
  async rollbackTransaction(connectionId) {
    await this.executeQuery({ connectionId, sql: "rollback" });
  }
  isTransactionOpen(_connectionId) {
    return false;
  }
  async validateQuery(_params) {
    return { ok: true };
  }
  async explainQuery(params) {
    return {
      format: "text",
      analyze: false,
      rawText: params.sql,
      annotations: [{ severity: "low", message: `${this.displayName} explain output is not available in this driver yet.` }]
    };
  }
  async cancelQuery(_executionId) {
  }
  async getViews(_connectionId, _schema) {
    return [];
  }
  async getFunctions(_connectionId, _schema) {
    return [];
  }
  async getProcedures(_connectionId, _schema) {
    return [];
  }
  async getTriggers(_connectionId, _schema) {
    return [];
  }
  async getActiveSessions(_connectionId) {
    return [];
  }
  async cancelSession(_connectionId, _pid) {
  }
  async terminateSession(_connectionId, _pid) {
  }
  async getIndexes(_connectionId, _schema, _table) {
    return [];
  }
  async getPrimaryKeys(_connectionId, _schema, _table) {
    return [];
  }
  async getForeignKeys(_connectionId, _schema, _table) {
    return [];
  }
  async getTableDDL(connectionId, schema, table) {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }
  async getTableStats(_connectionId, schema, table) {
    return { schema, table, databaseType: this.id, columns: [] };
  }
};
function executionResultFromRows(rows, started, sql, dataTypes = {}) {
  const fields = rows[0] ? Object.keys(rows[0]).map((name) => ({ name, dataTypeName: dataTypes[name] })) : Object.keys(dataTypes).map((name) => ({ name, dataTypeName: dataTypes[name] }));
  return {
    executionId: (0, import_crypto3.randomUUID)(),
    fields,
    rows,
    rowCount: rows.length,
    command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
    durationMs: Date.now() - started
  };
}
function emptyExecutionResult(started, sql, rowCount = 0) {
  return {
    executionId: (0, import_crypto3.randomUUID)(),
    fields: [],
    rows: [],
    rowCount,
    command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
    durationMs: Date.now() - started
  };
}
function optionalString4(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = String(value).trim();
  return next || void 0;
}
function numberFromDb2(value) {
  if (value === null || value === void 0) {
    return void 0;
  }
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : void 0;
}
function toQueryError(error) {
  const record = error;
  return {
    message: record.message ?? String(error),
    code: record.code,
    detail: record.detail,
    hint: record.hint,
    position: record.position,
    where: record.where
  };
}
function clientLimit(sql, maxRows, offset, quote = '"') {
  const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
  const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
  const pageLimit = limit ? limit + 1 : void 0;
  return pageLimit && /^(select|with)\b/i.test(sql.trim()) ? `select * from (${sql.replace(/;+\s*$/, "")}) ${quote}__dg_query${quote} limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ""}` : sql;
}
function safeFilterClause(where) {
  const trimmed = where?.trim();
  if (!trimmed) {
    return "";
  }
  if (/;|--|\/\*/.test(trimmed)) {
    throw new Error("WHERE must be a single SQL expression without comments or semicolons.");
  }
  return `
where ${trimmed}`;
}

// src/database/drivers/sqliteDriver.ts
var SQLiteDriver = class extends BasicDatabaseDriver {
  id = "sqlite";
  displayName = "SQLite";
  connections = /* @__PURE__ */ new Map();
  async connect(config) {
    await this.disconnect(config.id);
    const sqlite = await loadSqlite();
    const database = new sqlite.Database(config.database);
    await run(database, "select 1");
    this.connections.set(config.id, database);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const database = this.connections.get(connectionId);
    if (!database) {
      return;
    }
    this.connections.delete(connectionId);
    await close(database);
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const database = this.requireDatabase(params.connectionId);
    const results = [];
    for (const sql of statements) {
      const started = Date.now();
      const executable = clientLimit(sql, params.maxRows, params.offset);
      if (/^\s*(select|with|pragma)\b/i.test(executable)) {
        const rows = await all(database, executable);
        results.push(executionResultFromRows(rows, started, sql));
      } else {
        const changes = await run(database, executable);
        results.push(emptyExecutionResult(started, sql, changes));
      }
    }
    return results;
  }
  async getSchemas(connectionId) {
    const rows = await all(this.requireDatabase(connectionId), "pragma database_list");
    return rows.map((row) => ({ name: String(row.name) }));
  }
  async getTables(connectionId, schema) {
    const rows = await all(this.requireDatabase(connectionId), `select name, type from ${quoteIdentifier(schema)}.sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`);
    return rows.map((row) => ({ schema, name: String(row.name), type: "table" }));
  }
  async getViews(connectionId, schema) {
    const rows = await all(this.requireDatabase(connectionId), `select name from ${quoteIdentifier(schema)}.sqlite_master where type = 'view' order by name`);
    return rows.map((row) => ({ schema, name: String(row.name), type: "view" }));
  }
  async getColumns(connectionId, schema, table) {
    const rows = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`);
    return rows.map((row) => ({
      schema,
      table,
      name: String(row.name),
      ordinal: (numberFromDb2(row.cid) ?? 0) + 1,
      dataType: optionalString4(row.type) ?? "text",
      nullable: !Boolean(row.notnull),
      defaultValue: optionalString4(row.dflt_value)
    }));
  }
  async getIndexes(connectionId, schema, table) {
    const database = this.requireDatabase(connectionId);
    const indexes = await all(database, `pragma ${quoteIdentifier(schema)}.index_list(${quoteIdentifier(table)})`);
    const result = [];
    for (const index of indexes) {
      const name = String(index.name);
      const columns = await all(database, `pragma ${quoteIdentifier(schema)}.index_info(${quoteIdentifier(name)})`);
      result.push({
        name,
        unique: Boolean(index.unique),
        columns: columns.map((column) => String(column.name))
      });
    }
    return result;
  }
  async getPrimaryKeys(connectionId, schema, table) {
    const columns = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`);
    const primaryColumns = columns.filter((column) => Number(column.pk) > 0).sort((left, right) => Number(left.pk) - Number(right.pk));
    return primaryColumns.length ? [{ name: `${table}_pk`, columns: primaryColumns.map((column) => String(column.name)) }] : [];
  }
  async getForeignKeys(connectionId, schema, table) {
    const rows = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.foreign_key_list(${quoteIdentifier(table)})`);
    const grouped = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const name = `${table}_fk_${row.id}`;
      const entry = grouped.get(name) ?? { name, columns: [], foreignSchema: schema, foreignTable: String(row.table), foreignColumns: [] };
      entry.columns.push(String(row.from));
      entry.foreignColumns.push(String(row.to));
      grouped.set(name, entry);
    }
    return [...grouped.values()];
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const orderBy = options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : options?.orderBySql?.trim() ? `
order by ${options.orderBySql.trim()}` : "";
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit ? `
limit ${pageLimit}${offset ? ` offset ${offset}` : ""}` : ""}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getTableDDL(connectionId, schema, table) {
    const rows = await all(this.requireDatabase(connectionId), `select sql from ${quoteIdentifier(schema)}.sqlite_master where name = ? and type in ('table', 'view')`, [table]);
    const ddl = optionalString4(rows[0]?.sql);
    return ddl ? `${ddl};` : super.getTableDDL(connectionId, schema, table);
  }
  requireDatabase(connectionId) {
    const database = this.connections.get(connectionId);
    if (!database) {
      throw new Error("Connection is not active. Connect first.");
    }
    return database;
  }
};
async function loadSqlite() {
  const bundled = loadBundledRuntime("sqliteRuntime");
  if (bundled) {
    return bundled;
  }
  return import("sqlite3").then((module2) => {
    const candidate = module2;
    return "Database" in candidate ? candidate : candidate.default;
  });
}
function all(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows ?? []));
  });
}
function run(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function callback(error) {
      if (error) {
        reject(error);
      } else {
        resolve(this.changes ?? 0);
      }
    });
  });
}
function close(database) {
  return new Promise((resolve, reject) => {
    database.close((error) => error ? reject(error) : resolve());
  });
}

// src/database/drivers/sqlServerDriver.ts
var SqlServerDriver = class extends BasicDatabaseDriver {
  id = "sqlserver";
  displayName = "Microsoft SQL Server";
  pools = /* @__PURE__ */ new Map();
  async connect(config) {
    await this.disconnect(config.id);
    const mssql = await loadMssql();
    const pool = new mssql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeout: config.connectTimeoutMs ?? 1e4,
      requestTimeout: config.queryTimeoutMs ?? 3e5,
      options: {
        encrypt: config.sslMode !== "disable",
        trustServerCertificate: config.sslMode !== "require"
      }
    });
    await pool.connect();
    this.pools.set(config.id, pool);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      return;
    }
    this.pools.delete(connectionId);
    await pool.close();
  }
  async testConnection(config) {
    let connection;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: "select @@version as version" });
      return { ok: true, message: "Connection successful", serverVersion: optionalString4(result.rows[0]?.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => void 0);
      }
    }
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const pool = this.requirePool(params.connectionId);
    const results = [];
    for (const sql of statements) {
      const started = Date.now();
      try {
        const result = await pool.request().query(sql);
        const rows = result.recordset ?? [];
        results.push(rows.length ? executionResultFromRows(rows, started, sql) : emptyExecutionResult(started, sql, result.rowsAffected?.[0] ?? 0));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }
  async getSchemas(connectionId) {
    const result = await this.query(connectionId, `select name from sys.schemas where name not in ('sys', 'INFORMATION_SCHEMA') order by name`);
    return result.map((row) => ({ name: String(row.name) }));
  }
  async getTables(connectionId, schema) {
    const result = await this.query(connectionId, `select table_schema as [schema], table_name as name, 'table' as type from information_schema.tables where table_schema = '${escapeSql(schema)}' and table_type = 'BASE TABLE' order by table_name`);
    return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: "table" }));
  }
  async getViews(connectionId, schema) {
    const result = await this.query(connectionId, `select table_schema as [schema], table_name as name, 'view' as type from information_schema.views where table_schema = '${escapeSql(schema)}' order by table_name`);
    return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: "view" }));
  }
  async getFunctions(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "FUNCTION");
  }
  async getProcedures(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "PROCEDURE");
  }
  async getColumns(connectionId, schema, table) {
    const rows = await this.query(connectionId, `select table_schema as [schema], table_name as [table], column_name as name, ordinal_position as ordinal, data_type as dataType, is_nullable as nullable, column_default as defaultValue from information_schema.columns where table_schema = '${escapeSql(schema)}' and table_name = '${escapeSql(table)}' order by ordinal_position`);
    return rows.map((row) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      ordinal: Number(row.ordinal),
      dataType: String(row.dataType),
      nullable: String(row.nullable).toUpperCase() === "YES",
      defaultValue: optionalString4(row.defaultValue)
    }));
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const orderBy = options?.orderBy?.length ? ` order by ${options.orderBy.map((item) => `${quoteSqlIdentifier(this.id, item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : options?.orderBySql?.trim() ? ` order by ${options.orderBySql.trim()}` : offset ? " order by (select null)" : "";
    const sql = `select ${pageLimit && !offset ? `top (${pageLimit}) ` : ""}* from ${qualifiedSqlName(this.id, schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit && offset ? ` offset ${offset} rows fetch next ${pageLimit} rows only` : ""}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getRoutines(connectionId, schema, type) {
    const rows = await this.query(connectionId, `select routine_schema as [schema], routine_name as name, routine_type as kind, data_type as returnType from information_schema.routines where routine_schema = '${escapeSql(schema)}' and routine_type = '${type}' order by routine_name`);
    return rows.map((row) => ({
      schema: String(row.schema),
      name: String(row.name),
      kind: type === "PROCEDURE" ? "procedure" : "function",
      returnType: optionalString4(row.returnType)
    }));
  }
  async query(connectionId, sql) {
    const result = await this.requirePool(connectionId).request().query(sql);
    return result.recordset ?? [];
  }
  requirePool(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error("Connection is not active. Connect first.");
    }
    return pool;
  }
};
async function loadMssql() {
  const bundled = loadBundledRuntime("mssqlRuntime");
  if (bundled) {
    return bundled;
  }
  return import("mssql").then((module2) => {
    const candidate = module2;
    return "ConnectionPool" in candidate ? candidate : candidate.default;
  });
}
function escapeSql(value) {
  return value.replace(/'/g, "''");
}

// src/database/drivers/oracleDriver.ts
var OracleDriver = class extends BasicDatabaseDriver {
  id = "oracle";
  displayName = "Oracle";
  pools = /* @__PURE__ */ new Map();
  async connect(config) {
    await this.disconnect(config.id);
    const oracle = await loadOracle();
    const pool = await oracle.createPool({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
      poolMin: 0,
      poolMax: 8,
      connectTimeout: Math.ceil((config.connectTimeoutMs ?? 1e4) / 1e3)
    });
    this.pools.set(config.id, pool);
    const connection = await pool.getConnection();
    try {
      await connection.execute("select 1 from dual");
    } finally {
      await connection.close();
    }
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      return;
    }
    this.pools.delete(connectionId);
    await pool.close(0);
  }
  async testConnection(config) {
    let connection;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: "select banner as version from v$version where rownum = 1" });
      return { ok: true, message: "Connection successful", serverVersion: optionalString4(result.rows[0]?.VERSION ?? result.rows[0]?.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => void 0);
      }
    }
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const oracle = await loadOracle();
    const connection = await this.requirePool(params.connectionId).getConnection();
    const results = [];
    try {
      for (const sql of statements) {
        const started = Date.now();
        try {
          const result = await connection.execute(sql, [], { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: true });
          const rows = result.rows ?? [];
          const dataTypes = Object.fromEntries((result.metaData ?? []).map((field) => [field.name, field.dbTypeName ?? ""]));
          results.push(rows.length ? executionResultFromRows(rows, started, sql, dataTypes) : emptyExecutionResult(started, sql, result.rowsAffected ?? 0));
        } catch (error) {
          throw toQueryError(error);
        }
      }
      return results;
    } finally {
      await connection.close();
    }
  }
  async getSchemas(connectionId) {
    const rows = await this.query(connectionId, `select username as "name" from all_users order by username`);
    return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
  }
  async getTables(connectionId, schema) {
    const rows = await this.query(connectionId, `select owner as "schema", table_name as "name", 'table' as "type", num_rows as "rowEstimate" from all_tables where owner = upper('${escapeSql2(schema)}') order by table_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: "table", rowEstimate: Number(row.rowEstimate ?? row.ROWESTIMATE) || void 0 }));
  }
  async getViews(connectionId, schema) {
    const rows = await this.query(connectionId, `select owner as "schema", view_name as "name", 'view' as "type" from all_views where owner = upper('${escapeSql2(schema)}') order by view_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: "view" }));
  }
  async getFunctions(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "FUNCTION");
  }
  async getProcedures(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "PROCEDURE");
  }
  async getColumns(connectionId, schema, table) {
    const rows = await this.query(connectionId, `select owner as "schema", table_name as "table", column_name as "name", column_id as "ordinal", data_type as "dataType", nullable as "nullable", data_default as "defaultValue" from all_tab_columns where owner = upper('${escapeSql2(schema)}') and table_name = upper('${escapeSql2(table)}') order by column_id`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      table: String(row.table ?? row.TABLE),
      name: String(row.name ?? row.NAME),
      ordinal: Number(row.ordinal ?? row.ORDINAL),
      dataType: String(row.dataType ?? row.DATATYPE),
      nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === "Y",
      defaultValue: optionalString4(row.defaultValue ?? row.DEFAULTVALUE)
    }));
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const orderBy = options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : options?.orderBySql?.trim() ? `
order by ${options.orderBySql.trim()}` : "";
    const paging = pageLimit ? `
offset ${offset} rows fetch next ${pageLimit} rows only` : "";
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getRoutines(connectionId, schema, kind) {
    const rows = await this.query(connectionId, `select owner as "schema", object_name as "name" from all_objects where owner = upper('${escapeSql2(schema)}') and object_type = '${kind}' order by object_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), kind: kind === "PROCEDURE" ? "procedure" : "function" }));
  }
  async query(connectionId, sql) {
    const result = await this.executeQuery({ connectionId, sql });
    return result.rows;
  }
  requirePool(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error("Connection is not active. Connect first.");
    }
    return pool;
  }
};
async function loadOracle() {
  const bundled = loadBundledRuntime("oracleRuntime");
  if (bundled) {
    return bundled;
  }
  return import("oracledb").then((module2) => {
    const candidate = module2;
    return "createPool" in candidate ? candidate : candidate.default;
  });
}
function escapeSql2(value) {
  return value.replace(/'/g, "''");
}

// src/database/drivers/redisDriver.ts
var REDIS_TABLES = [
  { name: "strings", redisType: "string" },
  { name: "hashes", redisType: "hash" },
  { name: "lists", redisType: "list" },
  { name: "sets", redisType: "set" },
  { name: "sorted_sets", redisType: "zset" },
  { name: "streams", redisType: "stream" },
  { name: "keys", redisType: "" }
];
var RedisDriver = class extends BasicDatabaseDriver {
  id = "redis";
  displayName = "Redis";
  clients = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  async beginTransaction(_connectionId) {
  }
  async commitTransaction(_connectionId) {
  }
  async rollbackTransaction(_connectionId) {
  }
  async connect(config) {
    await this.disconnect(config.id);
    const redis = await loadRedis();
    const client = redis.createClient({
      username: config.username || void 0,
      password: config.password || void 0,
      database: parseRedisDatabase(config.database),
      socket: {
        host: config.host,
        port: config.port,
        tls: config.sslMode !== "disable",
        connectTimeout: config.connectTimeoutMs ?? 1e4
      }
    });
    await client.connect();
    await client.sendCommand(["PING"]);
    this.clients.set(config.id, client);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const client = this.clients.get(connectionId);
    if (!client) {
      return;
    }
    this.clients.delete(connectionId);
    this.configs.delete(connectionId);
    await client.disconnect();
  }
  async testConnection(config) {
    let connection;
    try {
      connection = await this.connect(config);
      const version = await this.executeQuery({ connectionId: connection.id, sql: "INFO server" });
      return { ok: true, message: "Connection successful", serverVersion: optionalString4(version.rows.find((row) => row.key === "redis_version")?.value) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => void 0);
      }
    }
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const client = this.requireClient(params.connectionId);
    const results = [];
    for (const sql of statements) {
      const started = Date.now();
      const args = parseRedisCommand(sql);
      if (args.length === 0) {
        results.push(emptyExecutionResult(started, sql));
        continue;
      }
      try {
        const reply = await client.sendCommand(args);
        const rows = redisReplyRows(args[0], reply);
        results.push(executionResultFromRows(rows, started, sql));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }
  async getSchemas(connectionId) {
    const connection = this.requireConnectionConfig(connectionId);
    return [{ name: `db${parseRedisDatabase(connection.database)}` }];
  }
  async getTables(connectionId, schema) {
    this.requireClient(connectionId);
    return REDIS_TABLES.map((item) => ({ schema, name: item.name, type: "table" }));
  }
  async getColumns(_connectionId, schema, table) {
    const fields = ["key", "type", "ttl", "size", "value"];
    return fields.map((name, index) => ({
      schema,
      table,
      name,
      ordinal: index + 1,
      dataType: name === "ttl" || name === "size" ? "integer" : "text",
      nullable: name !== "key" && name !== "type"
    }));
  }
  async getTablePreview(connectionId, _schema, table, limit, options) {
    const started = Date.now();
    const client = this.requireClient(connectionId);
    const redisType = REDIS_TABLES.find((item) => item.name === table)?.redisType ?? "";
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 501;
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pattern = redisKeyPattern(options?.where);
    const keys = await scanKeys(client, pattern, offset + pageLimit);
    const page = keys.slice(offset, offset + pageLimit);
    const rows = [];
    for (const key of page) {
      const type = String(await client.sendCommand(["TYPE", key]));
      if (redisType && type !== redisType) {
        continue;
      }
      const ttl = numberFromDb2(await client.sendCommand(["TTL", key]));
      rows.push({
        key,
        type,
        ttl,
        size: await redisValueSize(client, key, type),
        value: await redisPreviewValue(client, key, type)
      });
    }
    return {
      ...executionResultFromRows(rows, started, `SCAN ${pattern}`),
      hasMore: rows.length > limit
    };
  }
  async getTableDDL(_connectionId, schema, table) {
    return [
      `-- Redis logical view: ${schema}.${table}`,
      "-- Redis is a key-value store; inspect data with commands such as:",
      `-- SCAN 0 MATCH * COUNT 100`,
      `-- TYPE <key>`,
      `-- GET <key> / HGETALL <key> / LRANGE <key> 0 99`
    ].join("\n");
  }
  requireClient(connectionId) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error("Connection is not active. Connect first.");
    }
    return client;
  }
  requireConnectionConfig(connectionId) {
    const config = this.configs.get(connectionId);
    if (!config) {
      throw new Error("Connection is not active. Connect first.");
    }
    return config;
  }
};
var redisRuntime;
function loadRedis() {
  redisRuntime ??= loadRedisRuntime();
  return redisRuntime;
}
async function loadRedisRuntime() {
  const bundled = loadBundledRuntime("redisRuntime");
  if (bundled) {
    return bundled;
  }
  return import("redis").then((module2) => {
    const candidate = module2;
    return "createClient" in candidate ? candidate : candidate.default;
  });
}
function parseRedisDatabase(value) {
  const next = Number(value || 0);
  return Number.isInteger(next) && next >= 0 ? next : 0;
}
function parseRedisCommand(sql) {
  const text = sql.trim().replace(/;+\s*$/, "");
  const args = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|(\S+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    args.push((match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/\\(["'`\\])/g, "$1"));
  }
  return args;
}
function redisReplyRows(command, reply) {
  if (command.toUpperCase() === "INFO" && typeof reply === "string") {
    return reply.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
      const index = line.indexOf(":");
      return index >= 0 ? { key: line.slice(0, index), value: line.slice(index + 1) } : { value: line };
    });
  }
  if (Array.isArray(reply)) {
    return reply.map((value, index) => ({ index, value: stringifyRedisValue(value) }));
  }
  if (reply && typeof reply === "object" && !(reply instanceof Buffer)) {
    return Object.entries(reply).map(([key, value]) => ({ key, value: stringifyRedisValue(value) }));
  }
  return [{ value: stringifyRedisValue(reply) }];
}
function stringifyRedisValue(value) {
  if (value === null || value === void 0 || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value ?? null;
  }
  if (value instanceof Buffer) {
    return value.toString("utf8");
  }
  return JSON.stringify(value);
}
function redisKeyPattern(where) {
  const trimmed = where?.trim();
  if (!trimmed) {
    return "*";
  }
  const match = trimmed.match(/^(?:key\s+(?:like|=)\s*)?['"]?([^'";]+)['"]?$/i);
  if (!match) {
    throw new Error("Redis preview filter must be a key pattern, for example: user:*");
  }
  return match[1].replace(/%/g, "*");
}
async function scanKeys(client, pattern, limit) {
  const keys = [];
  let cursor = "0";
  do {
    const reply = await client.sendCommand(["SCAN", cursor, "MATCH", pattern, "COUNT", "100"]);
    if (!Array.isArray(reply) || reply.length < 2) {
      break;
    }
    cursor = String(reply[0]);
    const batch = Array.isArray(reply[1]) ? reply[1] : [];
    keys.push(...batch.map((key) => String(key)));
  } while (cursor !== "0" && keys.length < limit);
  return keys;
}
async function redisValueSize(client, key, type) {
  const command = {
    string: ["STRLEN", key],
    hash: ["HLEN", key],
    list: ["LLEN", key],
    set: ["SCARD", key],
    zset: ["ZCARD", key],
    stream: ["XLEN", key]
  };
  const args = command[type];
  return args ? numberFromDb2(await client.sendCommand(args)) : void 0;
}
async function redisPreviewValue(client, key, type) {
  const commands5 = {
    string: ["GET", key],
    hash: ["HGETALL", key],
    list: ["LRANGE", key, "0", "9"],
    set: ["SMEMBERS", key],
    zset: ["ZRANGE", key, "0", "9", "WITHSCORES"],
    stream: ["XRANGE", key, "-", "+", "COUNT", "10"]
  };
  const args = commands5[type];
  if (!args) {
    return void 0;
  }
  const value = await client.sendCommand(args);
  return optionalString4(stringifyRedisValue(value));
}

// src/database/drivers/snowflakeDriver.ts
var SnowflakeDriver = class extends BasicDatabaseDriver {
  id = "snowflake";
  displayName = "Snowflake";
  connections = /* @__PURE__ */ new Map();
  async connect(config) {
    await this.disconnect(config.id);
    const snowflake = await loadSnowflake();
    const connection = snowflake.createConnection({
      account: snowflakeAccount(config.host),
      username: config.username,
      password: config.password,
      database: optionalString4(config.database),
      schema: optionalString4(config.defaultSchema),
      timeout: config.connectTimeoutMs ?? 1e4,
      application: "QueryDeck",
      rowMode: "object"
    });
    await connection.connectAsync();
    this.connections.set(config.id, connection);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    this.connections.delete(connectionId);
    await new Promise((resolve, reject) => {
      connection.destroy((error) => error ? reject(error) : resolve());
    });
  }
  async testConnection(config) {
    let connection;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: "select current_version() as version" });
      return { ok: true, message: "Connection successful", serverVersion: optionalString4(result.rows[0]?.VERSION ?? result.rows[0]?.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => void 0);
      }
    }
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const connection = this.requireConnection(params.connectionId);
    const results = [];
    for (const sql of statements) {
      const started = Date.now();
      try {
        const result = await executeSnowflake(connection, sqlWithLimit(sql, params.maxRows, params.offset));
        results.push(result.rows.length ? executionResultFromRows(result.rows, started, sql, result.dataTypes) : emptyExecutionResult(started, sql, result.rowCount));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }
  async getSchemas(connectionId) {
    const rows = await this.query(connectionId, 'select schema_name as "name" from information_schema.schemata order by schema_name');
    return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
  }
  async getTables(connectionId, schema) {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name", row_count as "rowEstimate" from information_schema.tables where table_schema = upper('${escapeSql3(schema)}') and table_type = 'BASE TABLE' order by table_name`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      name: String(row.name ?? row.NAME),
      type: "table",
      rowEstimate: numberFromDb2(row.rowEstimate ?? row.ROWESTIMATE)
    }));
  }
  async getViews(connectionId, schema) {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name" from information_schema.views where table_schema = upper('${escapeSql3(schema)}') order by table_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: "view" }));
  }
  async getFunctions(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "FUNCTION");
  }
  async getProcedures(connectionId, schema) {
    return this.getRoutines(connectionId, schema, "PROCEDURE");
  }
  async getColumns(connectionId, schema, table) {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "table", column_name as "name", ordinal_position as "ordinal", data_type as "dataType", is_nullable as "nullable", column_default as "defaultValue" from information_schema.columns where table_schema = upper('${escapeSql3(schema)}') and table_name = upper('${escapeSql3(table)}') order by ordinal_position`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      table: String(row.table ?? row.TABLE),
      name: String(row.name ?? row.NAME),
      ordinal: Number(row.ordinal ?? row.ORDINAL),
      dataType: String(row.dataType ?? row.DATATYPE),
      nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === "YES",
      defaultValue: optionalString4(row.defaultValue ?? row.DEFAULTVALUE)
    }));
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const orderBy = options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : options?.orderBySql?.trim() ? `
order by ${options.orderBySql.trim()}` : "";
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit ? `
limit ${pageLimit}${offset ? ` offset ${offset}` : ""}` : ""}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getRoutines(connectionId, schema, kind) {
    const rows = await this.query(connectionId, `select routine_schema as "schema", routine_name as "name", data_type as "returnType" from information_schema.routines where routine_schema = upper('${escapeSql3(schema)}') and routine_type = '${kind}' order by routine_name`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      name: String(row.name ?? row.NAME),
      kind: kind === "PROCEDURE" ? "procedure" : "function",
      returnType: optionalString4(row.returnType ?? row.RETURNTYPE)
    }));
  }
  async query(connectionId, sql) {
    const result = await this.executeQuery({ connectionId, sql });
    return result.rows;
  }
  requireConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error("Connection is not active. Connect first.");
    }
    return connection;
  }
};
var snowflakeRuntime;
function loadSnowflake() {
  snowflakeRuntime ??= loadSnowflakeRuntime();
  return snowflakeRuntime;
}
async function loadSnowflakeRuntime() {
  const bundled = loadBundledRuntime("snowflakeRuntime");
  if (bundled) {
    return bundled;
  }
  return import("snowflake-sdk").then((module2) => {
    const candidate = module2;
    return "createConnection" in candidate ? candidate : candidate.default;
  });
}
function executeSnowflake(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (error, statement, rows = []) => {
        if (error) {
          reject(error);
          return;
        }
        const dataTypes = Object.fromEntries((statement.getColumns() ?? []).map((column) => [column.getName(), column.getType()]));
        resolve({
          rows,
          rowCount: statement.getNumUpdatedRows() ?? statement.getNumRows() ?? rows.length,
          dataTypes
        });
      }
    });
  });
}
function sqlWithLimit(sql, maxRows, offset) {
  const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
  const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
  const pageLimit = limit ? limit + 1 : void 0;
  return pageLimit && /^(select|with)\b/i.test(sql.trim()) ? `select * from (${sql.replace(/;+\s*$/, "")}) "__dg_query" limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ""}` : sql;
}
function snowflakeAccount(host) {
  return host.replace(/^https?:\/\//i, "").replace(/\.snowflakecomputing\.com$/i, "").replace(/\/.*$/, "");
}
function escapeSql3(value) {
  return value.replace(/'/g, "''");
}

// src/utils/id.ts
function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// src/services/connectionDefaults.ts
var DEFAULTS_BY_DATABASE_TYPE = {
  postgres: {
    name: "PostgreSQL",
    host: "localhost",
    port: "5432",
    database: "postgres",
    username: "",
    sslMode: "disable",
    defaultSchema: "public",
    color: "green"
  },
  redshift: {
    name: "Redshift",
    host: "",
    port: "5439",
    database: "dev",
    username: "",
    sslMode: "require",
    defaultSchema: "public",
    color: "purple"
  },
  mysql: {
    name: "MySQL",
    host: "localhost",
    port: "3306",
    database: "mysql",
    username: "",
    sslMode: "disable",
    defaultSchema: "",
    color: "blue"
  },
  sqlite: {
    name: "SQLite",
    host: "",
    port: "0",
    database: ":memory:",
    username: "",
    sslMode: "disable",
    defaultSchema: "main",
    color: "gray"
  },
  sqlserver: {
    name: "SQL Server",
    host: "localhost",
    port: "1433",
    database: "master",
    username: "",
    sslMode: "prefer",
    defaultSchema: "dbo",
    color: "yellow"
  },
  oracle: {
    name: "Oracle",
    host: "localhost",
    port: "1521",
    database: "ORCLPDB1",
    username: "",
    sslMode: "disable",
    defaultSchema: "",
    color: "red"
  },
  redis: {
    name: "Redis",
    host: "localhost",
    port: "6379",
    database: "0",
    username: "",
    sslMode: "disable",
    defaultSchema: "db0",
    color: "red"
  },
  snowflake: {
    name: "Snowflake",
    host: "",
    port: "443",
    database: "SNOWFLAKE",
    username: "",
    sslMode: "require",
    defaultSchema: "PUBLIC",
    color: "purple"
  }
};
function connectionDefaultsForType(type) {
  return DEFAULTS_BY_DATABASE_TYPE[type];
}

// src/services/sshTunnelManager.ts
var import_child_process = require("child_process");
var net = __toESM(require("net"));
var SshTunnelManager = class {
  tunnels = /* @__PURE__ */ new Map();
  async open(connection) {
    const tunnel = connection.sshTunnel;
    if (!tunnel?.enabled) {
      return connection;
    }
    const existing = this.tunnels.get(connection.id);
    if (existing) {
      await this.close(connection.id);
    }
    const localHost = tunnel.localHost?.trim() || "127.0.0.1";
    const localPort = tunnel.localPort && tunnel.localPort > 0 ? Math.floor(tunnel.localPort) : await freePort(localHost);
    const sshHost = tunnel.host.trim();
    const sshUser = tunnel.username.trim();
    if (!sshHost || !sshUser) {
      throw new Error("SSH tunnel requires a bastion host and username.");
    }
    const args = [
      "-N",
      "-L",
      `${localHost}:${localPort}:${connection.host}:${connection.port}`,
      "-p",
      String(tunnel.port && tunnel.port > 0 ? Math.floor(tunnel.port) : 22),
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3"
    ];
    if (tunnel.privateKeyPath?.trim()) {
      args.push("-i", tunnel.privateKeyPath.trim());
    }
    args.push(`${sshUser}@${sshHost}`);
    const process2 = (0, import_child_process.spawn)("ssh", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderr = [];
    process2.stderr.on("data", (chunk3) => stderr.push(String(chunk3)));
    const exitPromise = new Promise((_, reject) => {
      process2.once("error", reject);
      process2.once("exit", (code, signal) => {
        reject(new Error(`SSH tunnel exited before it was ready${code !== null ? ` (code ${code})` : ""}${signal ? ` (signal ${signal})` : ""}${stderr.length ? `: ${stderr.join("").trim()}` : ""}`));
      });
    });
    await Promise.race([
      waitForListening(localHost, localPort, 1e4),
      exitPromise
    ]);
    this.tunnels.set(connection.id, { process: process2, localHost, localPort });
    return {
      ...connection,
      host: localHost,
      port: localPort
    };
  }
  async close(connectionId) {
    const tunnel = this.tunnels.get(connectionId);
    if (!tunnel) {
      return;
    }
    this.tunnels.delete(connectionId);
    await stopProcess(tunnel.process);
  }
};
async function freePort(host) {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not allocate a free TCP port.")));
      }
    });
  });
}
async function waitForListening(host, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect(host, port)) {
      return;
    }
    await delay(150);
  }
  throw new Error(`SSH tunnel did not become ready on ${host}:${port}.`);
}
async function canConnect(host, port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
async function stopProcess(process2) {
  if (process2.exitCode !== null || process2.signalCode !== null) {
    return;
  }
  process2.kill("SIGTERM");
  await delay(500);
  if (process2.exitCode === null && process2.signalCode === null) {
    process2.kill("SIGKILL");
    await delay(200);
  }
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/database/connectionManager.ts
var ConnectionManager = class {
  constructor(store) {
    this.store = store;
    this.drivers.set("postgres", new PostgresDriver());
    this.drivers.set("redshift", new RedshiftDriver());
    this.drivers.set("mysql", new MySQLDriver());
    this.drivers.set("sqlite", new SQLiteDriver());
    this.drivers.set("sqlserver", new SqlServerDriver());
    this.drivers.set("oracle", new OracleDriver());
    this.drivers.set("redis", new RedisDriver());
    this.drivers.set("snowflake", new SnowflakeDriver());
  }
  drivers = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  transactionModes = /* @__PURE__ */ new Map();
  activeConnectionEmitter = new vscode.EventEmitter();
  sshTunnelManager = new SshTunnelManager();
  connectionCreator;
  onDidChangeActiveConnections = this.activeConnectionEmitter.event;
  setConnectionCreator(creator) {
    this.connectionCreator = creator;
  }
  getConnections() {
    return this.store.getAll();
  }
  getActiveConnections() {
    return [...this.active.values()];
  }
  isConnected(id) {
    return this.active.has(id);
  }
  getConnection(id) {
    return this.store.getAll().find((connection) => connection.id === id);
  }
  getPreferredConnection() {
    const selected = this.store.getSelectedConnectionId();
    return this.active.get(selected ?? "")?.config ?? (selected ? this.getConnection(selected) : void 0) ?? this.getActiveConnections()[0]?.config ?? this.getConnections()[0];
  }
  async getConnectionWithPassword(id) {
    const config = this.getConnection(id);
    if (!config) {
      throw new Error("Connection not found.");
    }
    return this.store.withPassword(config);
  }
  getDriverByConnectionId(id) {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error("Connection not found.");
    }
    return this.getDriver(connection.type);
  }
  getDriver(type) {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return driver;
  }
  async save(config) {
    const activeConnection = this.active.get(config.id);
    await this.store.save(config);
    if (!activeConnection) {
      return;
    }
    await this.disconnect(config.id);
    await this.connect(config.id);
  }
  async setSelectedConnection(id) {
    await this.store.setSelectedConnectionId(id);
  }
  async delete(id) {
    await this.disconnect(id);
    await this.store.delete(id);
  }
  async connect(id) {
    const config = await this.getConnectionWithPassword(id);
    const driver = this.getDriver(config.type);
    try {
      const tunneled = await this.sshTunnelManager.open(config);
      await driver.connect(tunneled);
      const connection = { id: config.id, config, connectedAt: Date.now() };
      this.active.set(id, connection);
      await this.store.setSelectedConnectionId(id);
      this.activeConnectionEmitter.fire(id);
      return connection;
    } catch (error) {
      await this.sshTunnelManager.close(id).catch(() => void 0);
      if (this.active.has(id)) {
        this.active.delete(id);
        this.activeConnectionEmitter.fire(id);
      }
      throw error;
    }
  }
  async disconnect(id) {
    const wasConnected = this.active.has(id);
    const config = this.getConnection(id);
    if (config) {
      await this.getDriver(config.type).disconnect(id);
    }
    await this.sshTunnelManager.close(id).catch(() => void 0);
    this.active.delete(id);
    this.transactionModes.delete(id);
    if (wasConnected) {
      this.activeConnectionEmitter.fire(id);
    }
  }
  async test(id) {
    const config = await this.getConnectionWithPassword(id);
    return this.testConfig(config);
  }
  async testConfig(config) {
    const driver = this.getDriver(config.type);
    const tunneled = await this.sshTunnelManager.open(config);
    try {
      const result = await driver.testConnection(tunneled);
      if (!result.ok) {
        throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
      }
      return result.serverVersion ?? result.message;
    } finally {
      await this.sshTunnelManager.close(config.id).catch(() => void 0);
    }
  }
  getTransactionMode(id) {
    return this.transactionModes.get(id) ?? "auto";
  }
  setTransactionMode(id, mode) {
    if (mode === "auto") {
      this.transactionModes.delete(id);
    } else {
      this.transactionModes.set(id, mode);
    }
  }
  isTransactionOpen(id) {
    const connection = this.getConnection(id);
    return connection ? this.getDriver(connection.type).isTransactionOpen(id) : false;
  }
  async beginTransaction(id) {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error("Connection not found.");
    }
    await this.getDriver(connection.type).beginTransaction(id);
    this.transactionModes.set(id, "manual");
  }
  async commitTransaction(id) {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error("Connection not found.");
    }
    await this.getDriver(connection.type).commitTransaction(id);
  }
  async rollbackTransaction(id) {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error("Connection not found.");
    }
    await this.getDriver(connection.type).rollbackTransaction(id);
  }
  async pickConnection() {
    const connections = this.getConnections();
    if (connections.length === 0) {
      const create = await vscode.window.showInformationMessage("No database connections yet.", "Add Connection");
      if (create === "Add Connection") {
        return this.connectionCreator?.();
      }
      return void 0;
    }
    const selectedId = this.store.getSelectedConnectionId();
    const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
      label: truncateMiddle(connection.name, 48),
      description: `${this.isConnected(connection.id) ? "online" : "offline"} - ${connection.type}${connection.production ? " - prod" : ""}`,
      detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
      connection
    })), { placeHolder: "Select database connection" });
    return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
  }
  async promptConnection(existing) {
    const typePick = await vscode.window.showQuickPick([
      { label: "PostgreSQL", type: "postgres" },
      { label: "Amazon Redshift", type: "redshift" },
      { label: "MySQL", type: "mysql" },
      { label: "SQLite", type: "sqlite" },
      { label: "Microsoft SQL Server", type: "sqlserver" },
      { label: "Oracle", type: "oracle" },
      { label: "Redis", type: "redis" },
      { label: "Snowflake", type: "snowflake" }
    ], { placeHolder: "Database type" });
    if (!typePick) {
      return void 0;
    }
    const type = typePick.type;
    const defaults = connectionDefaultsForType(type);
    const name = await vscode.window.showInputBox({ prompt: "Connection name", value: existing?.name ?? defaults.name });
    if (!name) {
      return void 0;
    }
    const host = type === "sqlite" ? defaults.host : await vscode.window.showInputBox({ prompt: connectionHostPrompt(type), value: existing?.host ?? defaults.host });
    if (!host && type !== "sqlite") {
      return void 0;
    }
    const port = type === "sqlite" ? 0 : Number(await vscode.window.showInputBox({ prompt: "Port", value: String(existing?.port ?? defaults.port) }));
    if (type !== "sqlite" && (!Number.isInteger(port) || port <= 0)) {
      void vscode.window.showErrorMessage(`${typePick.label} port must be a positive whole number.`);
      return void 0;
    }
    const database = type === "sqlite" ? await this.pickSqliteDatabase(existing?.database ?? defaults.database) : await vscode.window.showInputBox({ prompt: connectionDatabasePrompt(type), value: existing?.database ?? defaults.database });
    if (!database) {
      return void 0;
    }
    if (type === "redis") {
      const databaseIndex = Number(database);
      if (!Number.isInteger(databaseIndex) || databaseIndex < 0) {
        void vscode.window.showErrorMessage("Redis database index must be a zero-based whole number, for example 0.");
        return void 0;
      }
    }
    const username = type === "sqlite" ? defaults.username : await vscode.window.showInputBox({ prompt: type === "redis" ? "ACL username (optional)" : "Username", value: existing?.username ?? defaults.username });
    if (type !== "sqlite" && type !== "redis" && !username) {
      return void 0;
    }
    const password = type === "sqlite" ? void 0 : await vscode.window.showInputBox({ prompt: "Password", password: true });
    const ssl = type === "sqlite" ? defaults.sslMode : await vscode.window.showQuickPick(["disable", "prefer", "require"], { placeHolder: connectionSslPrompt(type) });
    return {
      id: existing?.id ?? createId("conn"),
      name,
      type,
      host: host || defaults.host,
      port: type === "sqlite" ? 0 : port,
      database,
      username: username ?? "",
      password,
      sslMode: ssl ?? defaults.sslMode,
      color: existing?.color ?? defaults.color,
      defaultSchema: existing?.defaultSchema ?? defaults.defaultSchema,
      queryTimeoutMs: vscode.workspace.getConfiguration("database").get("query.timeoutMs", 3e5)
    };
  }
  async pickSqliteDatabase(current) {
    const choice = await vscode.window.showQuickPick([
      { label: "Choose SQLite database file", value: "file" },
      { label: "Use in-memory database", description: ":memory:", value: "memory" }
    ], { placeHolder: current === ":memory:" ? "SQLite database" : `SQLite database: ${current}` });
    if (!choice) {
      return void 0;
    }
    if (choice.value === "memory") {
      return ":memory:";
    }
    const files = await vscode.window.showOpenDialog({
      title: "Choose SQLite database file",
      openLabel: "Use Database File",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "SQLite databases": ["db", "sqlite", "sqlite3"],
        "All files": ["*"]
      }
    });
    return files?.[0]?.fsPath;
  }
};
function truncateMiddle(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
function connectionHostPrompt(type) {
  if (type === "snowflake") {
    return "Snowflake account identifier";
  }
  if (type === "redshift") {
    return "Redshift cluster endpoint";
  }
  if (type === "sqlserver") {
    return "SQL Server host";
  }
  return "Host";
}
function connectionDatabasePrompt(type) {
  if (type === "oracle") {
    return "Oracle service name";
  }
  if (type === "redis") {
    return "Redis database index";
  }
  return "Database";
}
function connectionSslPrompt(type) {
  if (type === "sqlserver") {
    return "SSL mode: prefer trusts the server certificate, require validates it";
  }
  if (type === "redshift" || type === "snowflake") {
    return "SSL mode: require is recommended";
  }
  if (type === "redis") {
    return "SSL mode: use require for rediss/TLS endpoints";
  }
  return "SSL mode";
}

// src/database/queryExecutor.ts
var vscode2 = __toESM(require("vscode"));

// src/database/sqlSplitter.ts
function splitSqlStatements(text) {
  const statements = [];
  let start = 0;
  let i = 0;
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      i += 1;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = void 0;
      } else {
        i += 1;
      }
      continue;
    }
    if (single) {
      if (char === "'" && next === "'") {
        i += 2;
      } else if (char === "'") {
        single = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (double) {
      if (char === '"' && next === '"') {
        i += 2;
      } else if (char === '"') {
        double = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      i += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 2;
      continue;
    }
    if (char === "'") {
      single = true;
      i += 1;
      continue;
    }
    if (char === '"') {
      double = true;
      i += 1;
      continue;
    }
    if (char === "$") {
      const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }
    if (char === ";") {
      const bounds2 = trimmedBounds(text, start, i);
      if (bounds2) {
        statements.push({ sql: text.slice(bounds2.start, bounds2.end), start: bounds2.start, end: bounds2.end });
      }
      start = i + 1;
    }
    i += 1;
  }
  const bounds = trimmedBounds(text, start, text.length);
  if (bounds) {
    statements.push({ sql: text.slice(bounds.start, bounds.end), start: bounds.start, end: bounds.end });
  }
  return statements;
}
function trimmedBounds(text, start, end) {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
    nextStart += 1;
  }
  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
    nextEnd -= 1;
  }
  return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : void 0;
}

// src/services/queryMemoryMetadata.ts
function extractQueryTables(sql) {
  const tables = /* @__PURE__ */ new Set();
  const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.add(stripQuotes(match[1]));
  }
  return [...tables];
}
function extractQualifiedColumns(sql) {
  const columns = /* @__PURE__ */ new Set();
  const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const before = sql.slice(Math.max(0, match.index - 16), match.index);
    if (/\b(from|join|update|into)\s+$/i.test(before)) {
      continue;
    }
    columns.add(`${stripQuotes(match[1] ?? match[2])}.${stripQuotes(match[3] ?? match[4])}`);
  }
  return [...columns];
}
function outputColumnNames(fields) {
  return [...new Set((fields ?? []).map((field) => field.name).filter(Boolean))];
}
function stripQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

// src/services/sqlSafetyClassifier.ts
var DESTRUCTIVE_RE = /\b(drop|truncate|alter)\b/i;
var WRITE_RE = /\b(insert\s+into|update|delete\s+from|create\s+(?:unique\s+)?index|create\s+table|create\s+schema)\b/i;
var TABLE_NAME_RE = '((?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|\\w+)(?:\\.(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|\\w+))?)';
var SqlSafetyClassifier = class {
  classify(sql, options = {}) {
    const statements = splitSqlStatements(sql).map((statement) => statement.sql);
    const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
    const reasons = [];
    let risk = "safe";
    let previewAvailable = false;
    for (const statement of parts) {
      if (DESTRUCTIVE_RE.test(statement)) {
        risk = this.maxRisk(risk, "destructive");
        reasons.push("Contains DROP, TRUNCATE, or ALTER.");
      }
      if (/\bcreate\s+(?:unique\s+)?index\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        reasons.push("Creates an index, which can be expensive on large tables.");
        previewAvailable = true;
      }
      if (/\bdelete\s+from\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, "destructive");
          reasons.push("DELETE has no WHERE clause.");
        } else {
          reasons.push("Deletes rows.");
        }
      }
      if (/\bupdate\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, "destructive");
          reasons.push("UPDATE has no WHERE clause.");
        } else {
          reasons.push("Updates rows.");
        }
      }
      if (WRITE_RE.test(statement) && risk === "safe") {
        risk = "write";
        reasons.push("Writes database objects or rows.");
      }
    }
    if (options.production) {
      risk = this.maxRisk(risk, "production");
      reasons.push("Connection is marked production.");
    }
    return {
      risk,
      reasons: [...new Set(reasons)],
      statements: parts,
      requiresConfirmation: risk !== "safe",
      previewAvailable: previewAvailable || risk === "destructive" || risk === "production"
    };
  }
  previewSql(sql, databaseType = "postgres") {
    const first = splitSqlStatements(sql)[0]?.sql ?? sql.trim();
    if (!first) {
      return void 0;
    }
    if (/^\s*(select|with)\b/i.test(first)) {
      return explainSql(databaseType, first);
    }
    const deleteMatch = first.match(new RegExp(`\\bdelete\\s+from\\s+${TABLE_NAME_RE}([\\s\\S]*)`, "i"));
    if (deleteMatch) {
      const where = deleteMatch[2].match(/\bwhere\b[\s\S]*/i)?.[0] ?? "";
      return limitedSelect(databaseType, deleteMatch[1], where);
    }
    const updateMatch = first.match(new RegExp(`\\bupdate\\s+${TABLE_NAME_RE}[\\s\\S]*?\\bwhere\\b([\\s\\S]*)`, "i"));
    if (updateMatch) {
      return limitedSelect(databaseType, updateMatch[1], `where ${updateMatch[2].trim()}`);
    }
    return explainSql(databaseType, first);
  }
  maxRisk(current, next) {
    const order = ["safe", "write", "destructive", "production"];
    return order.indexOf(next) > order.indexOf(current) ? next : current;
  }
};
function limitedSelect(databaseType, tableName, whereClause) {
  const where = whereClause.trim();
  if (databaseType === "redis") {
    return "-- Safety preview is not available for Redis commands.";
  }
  if (databaseType === "sqlserver") {
    return `select top (100) *
from ${tableName}${where ? `
${where}` : ""};`;
  }
  if (databaseType === "oracle") {
    return `select *
from ${tableName}${where ? `
${where}` : ""}
fetch first 100 rows only;`;
  }
  return `select *
from ${tableName}${where ? `
${where}` : ""}
limit 100;`;
}
function explainSql(databaseType, sql) {
  const statement = sql.trim().replace(/;+\s*$/, "");
  if (databaseType === "redis") {
    return "-- Safety preview is not available for Redis commands.";
  }
  if (databaseType === "sqlserver") {
    return `set showplan_text on;
${statement};
set showplan_text off;`;
  }
  if (databaseType === "oracle") {
    return `explain plan for
${statement};
select * from table(dbms_xplan.display);`;
  }
  return `explain ${statement};`;
}

// src/services/readOnlySql.ts
function isReadOnlySql(sql) {
  const statements = splitSqlStatements(sql).map((statement) => statement.sql.trim()).filter(Boolean);
  const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
  return parts.every((statement) => {
    const normalized = stripSqlLiteralsCommentsAndQuotedIdentifiers(statement);
    return /^(select|with|values|show|describe|explain)\b/i.test(normalized.trim()) && !hasWriteOrDestructiveKeyword(normalized);
  });
}
function hasWriteOrDestructiveKeyword(sql) {
  return /\b(insert|update|delete|merge|drop|alter|truncate|create|replace|grant|revoke|call|execute|exec|copy|load|vacuum|refresh|reindex|cluster|attach|detach)\b/i.test(sql);
}
function stripSqlLiteralsCommentsAndQuotedIdentifiers(sql) {
  let result = "";
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      result += " ";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
        index += 1;
      }
      index = Math.min(index + 2, sql.length);
      result += " ";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      index = consumeQuoted(sql, index, char);
      result += " ";
      continue;
    }
    if (char === "[") {
      index += 1;
      while (index < sql.length && sql[index] !== "]") {
        index += 1;
      }
      index = Math.min(index + 1, sql.length);
      result += " ";
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}
function consumeQuoted(sql, start, quote) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    if (quote === "'" && sql[index] === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}

// src/database/queryExecutor.ts
var QueryExecutor = class {
  constructor(connectionManager, historyStore, recorder, safety = new SqlSafetyClassifier()) {
    this.connectionManager = connectionManager;
    this.historyStore = historyStore;
    this.recorder = recorder;
    this.safety = safety;
  }
  async execute(params) {
    const config = this.connectionManager.getConnection(params.connectionId);
    if (!config) {
      throw new Error("Connection not found.");
    }
    const started = Date.now();
    const tabId = createId("tab");
    const resultSets = [];
    const transactionMode = this.connectionManager.getTransactionMode(params.connectionId);
    let effectiveTransactionMode = params.transactionMode ?? transactionMode;
    try {
      if (!this.connectionManager.isConnected(params.connectionId)) {
        await this.connectionManager.connect(params.connectionId);
      }
      if (config.readOnlyDefault && !isReadOnlySql(params.sql)) {
        throw new Error("This connection is read-only by default and only accepts SELECT-style queries.");
      }
      await this.confirmDestructiveIfNeeded(config.production === true, params.sql);
      if (effectiveTransactionMode === "manual" && !this.connectionManager.isTransactionOpen(params.connectionId)) {
        await this.connectionManager.beginTransaction(params.connectionId);
      }
      const statements = splitSqlStatements(params.sql);
      const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
      const results = await this.connectionManager.getDriver(config.type).executeStatements(params, sqlParts);
      for (const [index, result] of results.entries()) {
        const maxRows = params.maxRows && params.maxRows > 0 ? Math.floor(params.maxRows) : void 0;
        const rows = maxRows ? result.rows.slice(0, maxRows) : result.rows;
        resultSets.push({
          id: result.executionId,
          title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(sqlParts[index] ?? params.sql, params.source?.fileName),
          fields: result.fields,
          rows,
          rowCount: rows.length,
          maxRows,
          hasMore: maxRows ? result.rowCount > rows.length : false,
          command: result.command,
          durationMs: result.durationMs
        });
      }
      const durationMs = Date.now() - started;
      const historyItem = {
        id: createId("history"),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        status: "completed",
        outputColumns: outputColumnNames(resultSets[0]?.fields),
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);
      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: "completed",
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        maxRows: params.maxRows,
        rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
        resultSets,
        transaction: {
          mode: effectiveTransactionMode,
          open: this.connectionManager.isTransactionOpen(config.id)
        },
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    } catch (error) {
      const queryError = this.toQueryError(error);
      const cancelled = params.isCancellationRequested?.() === true || isCancellationError(error);
      const historyItem = {
        id: createId("history"),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs: Date.now() - started,
        status: cancelled ? "cancelled" : "failed",
        errorMessage: cancelled ? void 0 : queryError.message,
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);
      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: cancelled ? "cancelled" : "failed",
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - started,
        maxRows: params.maxRows,
        rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
        error: cancelled ? void 0 : queryError,
        resultSets: [],
        transaction: {
          mode: effectiveTransactionMode,
          open: this.connectionManager.isTransactionOpen(config.id)
        },
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    }
  }
  async cancel(connectionId, executionId) {
    const driver = this.connectionManager.getDriverByConnectionId(connectionId);
    await driver.cancelQuery(executionId);
  }
  resultTitle(sql, fileName) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? "SQL";
    if (from) {
      return `${keyword} ${from.replace(/"/g, "")}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? "SQL";
  }
  async recordHistory(params, item) {
    if (params.source?.origin !== "queryConsole") {
      return;
    }
    await this.historyStore.add(item);
    await this.recorder?.recordHistoryItem(item);
  }
  async confirmDestructiveIfNeeded(isProduction, sql) {
    const confirm = vscode2.workspace.getConfiguration("database").get("safety.confirmDestructiveQueries", true);
    const warnAll = vscode2.workspace.getConfiguration("database").get("safety.confirmDestructiveQueriesOnAllConnections", false);
    if (!confirm || !isProduction && !warnAll) {
      return;
    }
    const assessment = this.safety.classify(sql, { production: isProduction });
    if (!assessment.requiresConfirmation) {
      return;
    }
    const target = isProduction ? "production connection" : "connection";
    const detail = assessment.reasons.length ? ` ${assessment.reasons.join(" ")}` : "";
    const answer = await vscode2.window.showWarningMessage(`This looks risky on a ${target}.${detail}`, { modal: true }, "Run Anyway");
    if (answer !== "Run Anyway") {
      throw new Error("Query cancelled by safety confirmation.");
    }
  }
  toQueryError(error) {
    const pgError = error;
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
};
function isCancellationError(error) {
  const record = error;
  const code = typeof record?.code === "string" ? record.code : void 0;
  const errno = typeof record?.errno === "number" ? record.errno : void 0;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(record?.message ?? "");
  if (/statement timeout/i.test(message)) {
    return false;
  }
  return code === "57014" && /\b(user request|canceling statement)\b/i.test(message) || code === "ER_QUERY_INTERRUPTED" || errno === 1317 || /\b(cancelled|canceled|canceling statement|cancelled by safety confirmation|query execution was interrupted|query interrupted)\b/i.test(message);
}

// src/explorer/DatabaseTreeProvider.ts
var vscode4 = __toESM(require("vscode"));

// src/services/tablePerformanceAdvisorService.ts
var TablePerformanceAdvisorService = class {
  constructor(connectionManager, memory, ai) {
    this.connectionManager = connectionManager;
    this.memory = memory;
    this.ai = ai;
  }
  async analyzeTable(connection, schema, table) {
    if (!this.connectionManager.isConnected(connection.id)) {
      await this.connectionManager.connect(connection.id);
    }
    const driver = this.connectionManager.getDriver(connection.type);
    const tableRef = `${schema}.${table}`;
    const [tableDdl, stats, workload] = await Promise.all([
      driver.getTableDDL(connection.id, schema, table),
      driver.getTableStats(connection.id, schema, table),
      this.memory.getTableWorkload(connection.id, tableRef)
    ]);
    const prepassFlags = buildTablePerformancePrepassFlags(stats, workload);
    const request = {
      connectionName: connection.name,
      databaseType: connection.type,
      databaseName: connection.database,
      schema,
      table,
      tableDdl,
      stats,
      prepassFlags,
      workload
    };
    try {
      const advice = await this.ai.adviseTablePerformance(request);
      return { request, advice: mergeDeterministicRecommendations(advice, prepassFlags) };
    } catch (error) {
      return {
        request,
        advice: deterministicAdvice(prepassFlags),
        aiError: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
function buildTablePerformancePrepassFlags(stats, workload) {
  const flags = [];
  const databaseType = stats.databaseType;
  if (databaseType === "redis") {
    return flags;
  }
  const table = qualifiedSqlName(databaseType, stats.schema, stats.table);
  const redshift = stats.redshift;
  if (redshift) {
    const joinColumn = topWorkloadColumn(workload, "join");
    const filterColumn2 = topWorkloadColumn(workload, "filter") ?? topWorkloadColumn(workload, "orderBy");
    if ((redshift.skewRows ?? 0) > 4) {
      flags.push({
        kind: "redshift_distribution_skew",
        impact: "high",
        message: "Distribution skew is high for this Redshift table.",
        evidence: `skew_rows=${redshift.skewRows}`,
        recommendationKind: "distkey",
        ddl: joinColumn ? `alter table ${table} alter distkey ${quoteSqlIdentifier(databaseType, joinColumn)};` : void 0
      });
    }
    if ((redshift.unsortedPct ?? 0) > 20) {
      flags.push({
        kind: "redshift_unsorted_rows",
        impact: "medium",
        message: "A large share of rows are unsorted; sort-sensitive scans can slow down.",
        evidence: `unsorted=${redshift.unsortedPct}%`,
        recommendationKind: "vacuum",
        ddl: `vacuum sort only ${table};`
      });
    }
    if ((redshift.statsOffPct ?? 0) > 10) {
      flags.push({
        kind: "redshift_stale_stats",
        impact: "medium",
        message: "Redshift statistics are stale enough to affect plan quality.",
        evidence: `stats_off=${redshift.statsOffPct}%`,
        recommendationKind: "analyze",
        ddl: `analyze ${table};`
      });
    }
    if (filterColumn2 && !redshift.sortKey1) {
      flags.push({
        kind: "redshift_missing_sortkey_candidate",
        impact: "medium",
        message: "The workload repeatedly filters or orders this table without a leading sort key.",
        evidence: workloadEvidence(workload, filterColumn2),
        recommendationKind: "sortkey",
        ddl: `alter table ${table} alter sortkey (${quoteSqlIdentifier(databaseType, filterColumn2)});`
      });
    }
    return flags;
  }
  if (databaseType !== "postgres") {
    return flags;
  }
  const rowCount = stats.liveRows ?? stats.rowEstimate ?? 0;
  const seqScan = stats.seqScan ?? 0;
  const idxScan = stats.idxScan ?? 0;
  const filterColumn = topWorkloadColumn(workload, "filter");
  if (rowCount > 1e4 && seqScan > 50 && seqScan > idxScan * 5) {
    flags.push({
      kind: "postgres_sequential_scan_pressure",
      impact: "high",
      message: "Sequential scans dominate index scans on a large table.",
      evidence: `seq_scan=${seqScan}, idx_scan=${idxScan}, rows=${rowCount}`,
      recommendationKind: "index",
      ddl: filterColumn ? `create index concurrently if not exists ${quoteSqlIdentifier(databaseType, `${stats.table}_${filterColumn}_idx`)} on ${table} (${quoteSqlIdentifier(databaseType, filterColumn)});` : void 0
    });
  }
  return flags;
}
function deterministicAdvice(flags) {
  return {
    findings: flags.length ? flags.map((flag) => `${flag.message} (${flag.evidence})`) : ["No deterministic performance issues were found from cached stats and query memory."],
    recommendations: deterministicRecommendations(flags)
  };
}
function mergeDeterministicRecommendations(advice, flags) {
  const recommendations = [...advice.recommendations];
  const existing = new Set(recommendations.map((item) => `${item.kind}:${item.ddl.trim().toLowerCase()}`));
  for (const recommendation of deterministicRecommendations(flags)) {
    const key = `${recommendation.kind}:${recommendation.ddl.trim().toLowerCase()}`;
    if (!existing.has(key)) {
      existing.add(key);
      recommendations.push(recommendation);
    }
  }
  return { findings: advice.findings, recommendations };
}
function deterministicRecommendations(flags) {
  return flags.filter((flag) => flag.recommendationKind && flag.ddl).map((flag) => ({
    kind: flag.recommendationKind,
    impact: flag.impact,
    rationale: `${flag.message} Evidence: ${flag.evidence}`,
    ddl: flag.ddl
  }));
}
function topWorkloadColumn(workload, role) {
  return workload.columns.filter((column) => column.role === role).sort((left, right) => right.durationMs - left.durationMs || right.runCount - left.runCount || right.queryCount - left.queryCount)[0]?.column;
}
function workloadEvidence(workload, column) {
  const uses = workload.columns.filter((item) => item.column.toLowerCase() === column.toLowerCase());
  const runCount = uses.reduce((total, item) => total + item.runCount, 0);
  const durationMs = uses.reduce((total, item) => total + item.durationMs, 0);
  return `${column} appears in ${runCount} weighted runs totaling ${durationMs}ms`;
}

// src/explorer/nodes.ts
var vscode3 = __toESM(require("vscode"));
var ConnectionNode = class extends vscode3.TreeItem {
  constructor(connection, connected) {
    super(truncateMiddle2(connection.name, 36), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = connection.id;
    this.description = `${connected ? "online" : "offline"} | ${connection.type}${connection.production ? " | prod" : ""}`;
    this.contextValue = "connection";
    this.iconPath = new vscode3.ThemeIcon(
      "database",
      new vscode3.ThemeColor(connection.production ? "errorForeground" : connected ? connectionColorTheme(connection.color) : "descriptionForeground")
    );
    this.tooltip = new vscode3.MarkdownString(
      [
        `**${connection.name}**`,
        "",
        `Type: ${connection.type}`,
        `Host: ${connection.host}:${connection.port}`,
        `Database: ${connection.database}`,
        `User: ${connection.username}`,
        `Schema: ${connection.defaultSchema ?? "public"}`,
        `Environment: ${connection.production ? "production" : "non-production"}`,
        `Status: ${connected ? "connected" : "disconnected"}`
      ].join("\n\n")
    );
  }
  kind = "connection";
};
function connectionColorTheme(color) {
  switch (color) {
    case "red":
      return "charts.red";
    case "yellow":
      return "charts.yellow";
    case "green":
      return "charts.green";
    case "blue":
      return "charts.blue";
    case "purple":
      return "charts.purple";
    case "gray":
    default:
      return "descriptionForeground";
  }
}
var CatalogNode = class extends vscode3.TreeItem {
  constructor(connection) {
    super(truncateMiddle2(connection.database, 40), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = `catalog:${connection.id}:${connection.database}`;
    this.description = connection.host;
    this.contextValue = "catalog";
    this.iconPath = new vscode3.ThemeIcon("server-environment");
    this.tooltip = `${connection.database} on ${connection.host}:${connection.port}`;
  }
  kind = "catalog";
};
var SchemasNode = class extends vscode3.TreeItem {
  constructor(connection) {
    super("Schemas", vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = `schemas:${connection.id}`;
    this.contextValue = "schemas";
    this.iconPath = new vscode3.ThemeIcon("library");
  }
  kind = "schemas";
};
var SchemaNode = class extends vscode3.TreeItem {
  constructor(connection, schema) {
    super(truncateMiddle2(schema.name, 40), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.schema = schema;
    this.id = `schema:${connection.id}:${schema.name}`;
    this.contextValue = "schema";
    this.iconPath = new vscode3.ThemeIcon("library");
    this.tooltip = schema.name;
  }
  kind = "schema";
};
var FolderNode = class extends vscode3.TreeItem {
  constructor(connection, schema, folder, tableName) {
    super(folder, vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.schema = schema;
    this.folder = folder;
    this.tableName = tableName;
    this.id = `folder:${connection.id}:${schema}:${folder}:${tableName ?? ""}`;
    this.contextValue = folder === "Functions" ? "function-folder" : folder === "Procedures" ? "procedure-folder" : folder === "Triggers" ? "trigger-folder" : folder.toLowerCase().replace(/\s+/g, "-");
    this.iconPath = new vscode3.ThemeIcon(folder === "Materialized Views" ? "symbol-structure" : "folder");
  }
  kind = "folder";
};
var RoutineNode = class extends vscode3.TreeItem {
  constructor(connection, routine) {
    super(truncateMiddle2(routine.name, 48), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.routine = routine;
    this.id = `routine:${connection.id}:${routine.kind}:${routine.schema}:${routine.name}`;
    this.contextValue = routine.kind;
    this.iconPath = new vscode3.ThemeIcon(routine.kind === "procedure" ? "gear" : "symbol-function");
    this.tooltip = [
      `${routine.schema}.${routine.name}`,
      routine.kind === "procedure" ? "Procedure" : "Function",
      routine.returnType ? `Returns: ${routine.returnType}` : void 0,
      routine.language ? `Language: ${routine.language}` : void 0,
      routine.comment
    ].filter(Boolean).join("\n");
    this.command = { command: "database.quickDocumentation", title: "Quick Documentation", arguments: [this] };
  }
  kind = "routine";
};
var TriggerNode = class extends vscode3.TreeItem {
  constructor(connection, trigger) {
    super(truncateMiddle2(trigger.name, 48), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.trigger = trigger;
    this.id = `trigger:${connection.id}:${trigger.schema}:${trigger.table}:${trigger.name}`;
    this.contextValue = "trigger";
    this.iconPath = new vscode3.ThemeIcon("debug-breakpoint-log");
    this.tooltip = [
      `${trigger.schema}.${trigger.table}.${trigger.name}`,
      trigger.timing ? `Timing: ${trigger.timing}` : void 0,
      trigger.orientation ? `Orientation: ${trigger.orientation}` : void 0,
      trigger.events?.length ? `Events: ${trigger.events.join(", ")}` : void 0,
      trigger.enabled ? `Enabled: ${trigger.enabled}` : void 0
    ].filter(Boolean).join("\n");
    this.command = { command: "database.quickDocumentation", title: "Quick Documentation", arguments: [this] };
  }
  kind = "trigger";
};
var TableNode = class extends vscode3.TreeItem {
  constructor(connection, table) {
    super(truncateMiddle2(table.name, 48), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.table = table;
    this.id = `table:${connection.id}:${table.schema}:${table.name}`;
    this.baseDescription = table.rowEstimate !== void 0 ? `~${table.rowEstimate}` : void 0;
    this.description = this.baseDescription;
    this.contextValue = "table";
    this.baseIconPath = new vscode3.ThemeIcon(table.type === "materialized_view" ? "symbol-structure" : "table");
    this.iconPath = this.baseIconPath;
    this.baseTooltip = table.comment ? `${table.schema}.${table.name}
${table.comment}` : `${table.schema}.${table.name}`;
    this.tooltip = this.baseTooltip;
    this.command = { command: "database.openTableData", title: "Open Table Data", arguments: [this] };
  }
  kind = "table";
  baseDescription;
  baseTooltip;
  baseIconPath;
  applyMaintenanceFlags(flags) {
    if (!flags.length) {
      this.description = this.baseDescription;
      this.iconPath = this.baseIconPath;
      this.tooltip = this.baseTooltip;
      return;
    }
    const details = flags.map((flag) => `${flag.message} (${flag.evidence})`);
    const actionSummary = flags.map((flag) => flag.ddl ? `${flag.recommendationKind ?? "maintenance"}: ${flag.ddl}` : flag.message).join("\n");
    this.description = [this.baseDescription, flags.map((flag) => flag.evidence).join(" \u2022 ")].filter(Boolean).join(" | ");
    this.iconPath = new vscode3.ThemeIcon("warning");
    this.tooltip = `${this.baseTooltip}

${details.join("\n")}${actionSummary ? `

${actionSummary}` : ""}`;
  }
};
var ViewNode = class extends vscode3.TreeItem {
  constructor(connection, view) {
    super(truncateMiddle2(view.name, 48), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.view = view;
    this.id = `view:${connection.id}:${view.schema}:${view.name}`;
    this.contextValue = "view";
    this.iconPath = new vscode3.ThemeIcon("eye");
    this.tooltip = `${view.schema}.${view.name}`;
  }
  kind = "view";
};
var ColumnNode = class extends vscode3.TreeItem {
  constructor(connection, column) {
    super(truncateMiddle2(column.name, 44), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.column = column;
    this.id = `column:${connection.id}:${column.schema}:${column.table}:${column.name}`;
    this.description = truncateEnd(`${column.dataType}${column.nullable ? "" : " not null"}`, 30);
    this.contextValue = "column";
    this.iconPath = new vscode3.ThemeIcon(column.name.toLowerCase() === "id" ? "key" : "symbol-field");
    this.tooltip = `${column.schema}.${column.table}.${column.name}
${column.dataType}${column.nullable ? "" : " not null"}`;
  }
  kind = "column";
};
function truncateMiddle2(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
function truncateEnd(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

// src/explorer/DatabaseTreeProvider.ts
var EMPTY_WORKLOAD = {
  connectionId: "",
  table: "",
  queryCount: 0,
  totalRunCount: 0,
  totalDurationMs: 0,
  topQueries: [],
  columns: []
};
var DatabaseTreeProvider = class {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }
  emitter = new vscode4.EventEmitter();
  onDidChangeTreeData = this.emitter.event;
  tableStatsCache = /* @__PURE__ */ new Map();
  inflightTableStats = /* @__PURE__ */ new Map();
  refresh(node) {
    if (!node) {
      this.tableStatsCache.clear();
    }
    this.emitter.fire(node);
  }
  getTreeItem(element) {
    return element;
  }
  async getChildren(element) {
    if (!element) {
      return this.connectionManager.getConnections().map((connection) => new ConnectionNode(connection, this.connectionManager.isConnected(connection.id)));
    }
    if (element instanceof ConnectionNode) {
      return [new CatalogNode(element.connection)];
    }
    if (element instanceof CatalogNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }
    if (element instanceof SchemasNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }
    if (element instanceof SchemaNode) {
      return [
        new FolderNode(element.connection, element.schema.name, "Tables"),
        new FolderNode(element.connection, element.schema.name, "Materialized Views"),
        new FolderNode(element.connection, element.schema.name, "Views"),
        new FolderNode(element.connection, element.schema.name, "Functions"),
        new FolderNode(element.connection, element.schema.name, "Procedures"),
        new FolderNode(element.connection, element.schema.name, "Triggers")
      ];
    }
    if (element instanceof FolderNode && element.folder === "Tables") {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type !== "materialized_view").map((table) => {
        const node = new TableNode(element.connection, table);
        void this.decorateTableNode(node);
        return node;
      });
    }
    if (element instanceof FolderNode && element.folder === "Materialized Views") {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type === "materialized_view").map((table) => {
        const node = new TableNode(element.connection, table);
        void this.decorateTableNode(node);
        return node;
      });
    }
    if (element instanceof FolderNode && element.folder === "Views") {
      await this.ensureConnected(element.connection.id);
      const views = await this.connectionManager.getDriver(element.connection.type).getViews(element.connection.id, element.schema);
      return views.map((view) => new ViewNode(element.connection, view));
    }
    if (element instanceof FolderNode && element.folder === "Functions") {
      await this.ensureConnected(element.connection.id);
      const routines = await this.connectionManager.getDriver(element.connection.type).getFunctions(element.connection.id, element.schema);
      return routines.map((routine) => new RoutineNode(element.connection, routine));
    }
    if (element instanceof FolderNode && element.folder === "Procedures") {
      await this.ensureConnected(element.connection.id);
      const routines = await this.connectionManager.getDriver(element.connection.type).getProcedures(element.connection.id, element.schema);
      return routines.map((routine) => new RoutineNode(element.connection, routine));
    }
    if (element instanceof FolderNode && element.folder === "Triggers") {
      await this.ensureConnected(element.connection.id);
      const triggers = await this.connectionManager.getDriver(element.connection.type).getTriggers(element.connection.id, element.schema);
      return triggers.map((trigger) => new TriggerNode(element.connection, trigger));
    }
    if (element instanceof TableNode) {
      return [
        new FolderNode(element.connection, element.table.schema, "Columns", element.table.name)
      ];
    }
    if (element instanceof FolderNode && element.folder === "Columns") {
      const table = element.tableName;
      if (!table) {
        return [];
      }
      const columns = await this.connectionManager.getDriver(element.connection.type).getColumns(element.connection.id, element.schema, table);
      return columns.map((column) => new ColumnNode(element.connection, column));
    }
    return [];
  }
  async ensureConnected(connectionId) {
    if (!this.connectionManager.isConnected(connectionId)) {
      await this.connectionManager.connect(connectionId);
    }
  }
  async decorateTableNode(node) {
    const key = this.tableKey(node.connection.id, node.table.schema, node.table.name);
    const cached = this.tableStatsCache.get(key);
    if (cached) {
      node.applyMaintenanceFlags(this.maintenanceFlags(cached));
      this.refresh(node);
      return;
    }
    if (this.inflightTableStats.has(key)) {
      return this.inflightTableStats.get(key);
    }
    const task = (async () => {
      try {
        await this.ensureConnected(node.connection.id);
        const stats = await this.connectionManager.getDriver(node.connection.type).getTableStats(node.connection.id, node.table.schema, node.table.name);
        this.tableStatsCache.set(key, stats);
        node.applyMaintenanceFlags(this.maintenanceFlags(stats));
        this.refresh(node);
      } catch {
        node.applyMaintenanceFlags([]);
        this.refresh(node);
      } finally {
        this.inflightTableStats.delete(key);
      }
    })();
    this.inflightTableStats.set(key, task);
    return task;
  }
  maintenanceFlags(stats) {
    if (stats.databaseType !== "redshift") {
      return [];
    }
    return buildTablePerformancePrepassFlags(stats, EMPTY_WORKLOAD).filter((flag) => flag.kind === "redshift_unsorted_rows" || flag.kind === "redshift_stale_stats");
  }
  tableKey(connectionId, schema, table) {
    return `${connectionId}:${schema}:${table}`;
  }
};

// src/persistence/connectionStore.ts
var CONNECTIONS_KEY = "database.connections";
var SELECTED_CONNECTION_KEY = "database.selectedConnectionId";
var ConnectionStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.globalState.get(CONNECTIONS_KEY, []);
  }
  async save(config) {
    const { password, ...metadata } = config;
    const connections = this.getAll().filter((item) => item.id !== config.id);
    connections.push(metadata);
    await this.context.globalState.update(CONNECTIONS_KEY, connections.sort((a, b) => a.name.localeCompare(b.name)));
    if (password !== void 0) {
      await this.context.secrets.store(this.secretKey(config.id), password);
    }
  }
  async delete(id) {
    await this.context.globalState.update(CONNECTIONS_KEY, this.getAll().filter((item) => item.id !== id));
    await this.context.secrets.delete(this.secretKey(id));
  }
  async withPassword(config) {
    return { ...config, password: await this.context.secrets.get(this.secretKey(config.id)) };
  }
  getSelectedConnectionId() {
    return this.context.workspaceState.get(SELECTED_CONNECTION_KEY);
  }
  async setSelectedConnectionId(id) {
    await this.context.workspaceState.update(SELECTED_CONNECTION_KEY, id);
  }
  secretKey(id) {
    return `database.connection.${id}.password`;
  }
};

// src/persistence/queryConsoleStore.ts
var vscode5 = __toESM(require("vscode"));

// src/persistence/queryConsoleRecords.ts
async function partitionExistingConsoleRecords(records, documentExists) {
  const existing = [];
  const missing = [];
  for (const record of records) {
    if (await documentExists(record.documentUri)) {
      existing.push(record);
    } else {
      missing.push(record);
    }
  }
  return { existing, missing };
}

// src/persistence/queryConsoleStore.ts
var CONSOLES_KEY = "database.queryConsoles";
var QueryConsoleStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(CONSOLES_KEY, []);
  }
  async pruneMissingDocuments() {
    const records = this.getAll();
    const { existing, missing } = await partitionExistingConsoleRecords(
      records,
      (documentUri) => this.documentExists(documentUri)
    );
    if (missing.length) {
      await this.context.workspaceState.update(CONSOLES_KEY, existing);
    }
    return missing.length;
  }
  getByConnection(connectionId) {
    return this.getAll().filter((record) => record.connectionId === connectionId).sort((a, b) => (b.lastTouchedAt ?? b.updatedAt) - (a.lastTouchedAt ?? a.updatedAt))[0];
  }
  async openOrCreate(connection, initialSql = "", options = {}) {
    const reuse = options.reuse ?? true;
    const existing = reuse && connection ? this.getByConnection(connection.id) : void 0;
    if (existing) {
      try {
        const document = await vscode5.workspace.openTextDocument(vscode5.Uri.parse(existing.documentUri));
        await this.touch(existing.id, { opened: true });
        return document;
      } catch {
        await this.delete(existing.id);
      }
    }
    const uri = await this.createConsoleUri(connection);
    await this.ensureFile(uri, initialSql || this.defaultContent());
    const now = Date.now();
    if (connection) {
      await this.save({
        id: createId("console"),
        connectionId: connection.id,
        documentUri: uri.toString(),
        schemaName: connection.defaultSchema,
        sortOrder: -now,
        lastOpenedAt: now,
        lastTouchedAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
    return vscode5.workspace.openTextDocument(uri);
  }
  async markExecuted(documentUri, range) {
    const records = this.getAll();
    const index = records.findIndex((record) => record.documentUri === documentUri);
    if (index === -1) {
      return;
    }
    const now = Date.now();
    records[index] = { ...records[index], lastExecutedRange: range, lastTouchedAt: now, updatedAt: now };
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }
  async touch(id, options = {}) {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => record.id === id ? { ...record, lastOpenedAt: options.opened ? now : record.lastOpenedAt, lastTouchedAt: now, updatedAt: now } : record));
  }
  async touchDocument(documentUri, options = {}) {
    const record = this.getAll().find((item) => item.documentUri === documentUri);
    if (record) {
      await this.touch(record.id, options);
    }
  }
  async setPinned(id, pinned) {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => record.id === id ? { ...record, pinned, updatedAt: now } : record));
  }
  async move(id, direction) {
    const records = this.getAll();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return;
    }
    const siblings = records.filter((item) => item.connectionId === record.connectionId).sort((a, b) => this.sortValue(a) - this.sortValue(b));
    const index = siblings.findIndex((item) => item.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const swap = siblings[swapIndex];
    if (index === -1 || !swap) {
      return;
    }
    const firstOrder = this.sortValue(record);
    const secondOrder = this.sortValue(swap);
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, records.map((item) => {
      if (item.id === record.id) {
        return { ...item, sortOrder: secondOrder, updatedAt: now };
      }
      if (item.id === swap.id) {
        return { ...item, sortOrder: firstOrder, updatedAt: now };
      }
      return item;
    }));
  }
  async delete(id) {
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => !idSet.has(record.id)));
  }
  async save(record) {
    const records = this.getAll().filter((existing) => existing.id !== record.id);
    records.push(record);
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }
  sortValue(record) {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
  }
  async createConsoleUri(connection) {
    const base = vscode5.Uri.joinPath(this.context.globalStorageUri, "query-consoles");
    await vscode5.workspace.fs.createDirectory(base);
    const name = this.safeName(connection ? `${connection.name}-${connection.database}` : "sql-console");
    const existing = new Set(this.getAll().map((record) => record.documentUri));
    for (let index = 1; index < 1e4; index += 1) {
      const suffix = index === 1 ? "" : `-${index}`;
      const uri = vscode5.Uri.joinPath(base, `${name}${suffix}.sql`);
      if (!existing.has(uri.toString())) {
        try {
          await vscode5.workspace.fs.stat(uri);
        } catch {
          return uri;
        }
      }
    }
    return vscode5.Uri.joinPath(base, `${name}-${Date.now()}.sql`);
  }
  async ensureFile(uri, content) {
    try {
      await vscode5.workspace.fs.stat(uri);
    } catch {
      await vscode5.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    }
  }
  defaultContent() {
    return "";
  }
  safeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sql-console";
  }
  async documentExists(documentUri) {
    try {
      await vscode5.workspace.fs.stat(vscode5.Uri.parse(documentUri));
      return true;
    } catch (error) {
      return !this.isFileNotFound(error);
    }
  }
  isFileNotFound(error) {
    const code = error instanceof vscode5.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
};

// src/persistence/sqlDocumentConnectionStore.ts
var SQL_DOCUMENT_CONNECTIONS_KEY = "database.sqlDocumentConnections";
var MAX_SQL_DOCUMENT_CONNECTIONS = 500;
var SqlDocumentConnectionStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(SQL_DOCUMENT_CONNECTIONS_KEY, []);
  }
  get(documentUri) {
    return this.getAll().find((record) => record.documentUri === documentUri);
  }
  async set(documentUri, connectionId) {
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({ ...existing, documentUri, connectionId, updatedAt: Date.now() });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }
  async markExecuted(documentUri, connectionId, range) {
    const now = Date.now();
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({
      ...existing,
      documentUri,
      connectionId,
      lastExecutedRange: range,
      lastTouchedAt: now,
      updatedAt: now
    });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }
  async touch(documentUri) {
    const now = Date.now();
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().map((record) => record.documentUri === documentUri ? { ...record, lastTouchedAt: now, updatedAt: now } : record)
    );
  }
  async delete(documentUri) {
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => record.documentUri !== documentUri)
    );
  }
  async deleteMany(documentUris) {
    const uriSet = new Set(documentUris);
    if (!uriSet.size) {
      return;
    }
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => !uriSet.has(record.documentUri))
    );
  }
};

// src/persistence/queryHistoryStore.ts
var vscode6 = __toESM(require("vscode"));
var HISTORY_KEY = "database.queryHistory";
var QueryHistoryStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(HISTORY_KEY, []);
  }
  async add(item) {
    const maxItems = vscode6.workspace.getConfiguration("database").get("history.maxItems", 1e3);
    const history = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].slice(0, maxItems);
    await this.context.workspaceState.update(HISTORY_KEY, history);
  }
  async update(item) {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().map((existing) => existing.id === item.id ? item : existing));
  }
  async delete(id) {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
  }
};

// src/persistence/queryMemoryStore.ts
var vscode7 = __toESM(require("vscode"));
var MEMORY_KEY = "database.queryMemory";
var QueryMemoryStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(MEMORY_KEY, []);
  }
  get(id) {
    return this.getAll().find((item) => item.id === id);
  }
  async upsert(item) {
    const maxItems = vscode7.workspace.getConfiguration("database").get("queryMemory.maxItems", 2e3);
    const next = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].sort((a, b) => (b.executedAt ?? b.updatedAt) - (a.executedAt ?? a.updatedAt)).slice(0, Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 2e3);
    await this.context.workspaceState.update(MEMORY_KEY, next);
  }
  async update(id, patch) {
    const now = Date.now();
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().map((item) => item.id === id ? { ...item, ...patch, updatedAt: now } : item));
  }
  async delete(id) {
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
  }
};

// src/persistence/resultSessionStore.ts
var vscode8 = __toESM(require("vscode"));
var TABS_KEY = "database.resultTabs";
var ResultSessionStore = class {
  constructor(context) {
    this.context = context;
  }
  getTabs() {
    return this.context.workspaceState.get(TABS_KEY, []);
  }
  async saveTabs(tabs) {
    const persistPinned = vscode8.workspace.getConfiguration("database").get("resultTabs.persistPinned", true);
    const persisted = persistPinned ? tabs.filter((tab) => tab.pinned && !["queued", "running"].includes(tab.executionStatus)).map((tab) => ({
      ...tab,
      resultSets: tab.resultSets.map((set) => set.rows.length <= 1e3 ? set : { ...set, rows: [], rowCount: set.rowCount })
    })) : [];
    await this.context.workspaceState.update(TABS_KEY, persisted);
  }
};

// src/persistence/orphanedConnectionRecords.ts
function orphanedConnectionRecordIds(records, connectionIds) {
  const knownConnectionIds = new Set(connectionIds);
  const historyIds = records.history.filter((item) => !knownConnectionIds.has(item.connectionId)).map((item) => item.id);
  const orphanedHistoryIds = new Set(historyIds);
  return {
    consoleIds: records.consoles.filter((record) => !knownConnectionIds.has(record.connectionId)).map((record) => record.id),
    sqlDocumentUris: records.sqlDocuments.filter((record) => !knownConnectionIds.has(record.connectionId)).map((record) => record.documentUri),
    historyIds,
    memoryIds: records.memory.filter((item) => {
      if (item.connectionId && !knownConnectionIds.has(item.connectionId)) {
        return true;
      }
      if (item.latestHistoryId && orphanedHistoryIds.has(item.latestHistoryId)) {
        return true;
      }
      return item.historyIds?.some((id) => orphanedHistoryIds.has(id)) === true;
    }).map((item) => item.id)
  };
}

// src/services/dataProfileService.ts
var DataProfileService = class {
  constructor(connectionManager, ai) {
    this.connectionManager = connectionManager;
    this.ai = ai;
  }
  async profileTable(connection, schema, table, sampleRows) {
    if (!this.connectionManager.isConnected(connection.id)) {
      await this.connectionManager.connect(connection.id);
    }
    const driver = this.connectionManager.getDriver(connection.type);
    const [columns, preview] = await Promise.all([
      driver.getColumns(connection.id, schema, table),
      driver.getTablePreview(connection.id, schema, table, sampleRows)
    ]);
    const rows = preview.rows.slice(0, sampleRows);
    const profileColumns = columns.map((column) => profileColumn(
      column.name,
      column.dataType,
      column.nullable,
      rows.map((row) => row[column.name])
    ));
    const report = {
      connectionName: connection.name,
      databaseType: connection.type,
      databaseName: connection.database,
      schema,
      table,
      sampleRows: rows.length,
      sampledAt: Date.now(),
      columns: profileColumns
    };
    if (!await this.ai.isAvailable()) {
      return { ...report, narrative: deterministicNarrative(profileColumns, rows.length) };
    }
    try {
      return {
        ...report,
        narrative: await this.ai.summarizeDataProfile({
          connectionName: connection.name,
          databaseType: connection.type,
          databaseName: connection.database,
          schema,
          table,
          sampleRows: rows.length,
          columns: profileColumns
        })
      };
    } catch (error) {
      return {
        ...report,
        narrative: deterministicNarrative(profileColumns, rows.length),
        aiError: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
function profileColumn(name, dataType, nullable, values) {
  const rowCount = values.length;
  const present = values.filter((value) => value !== null && value !== void 0);
  const displayValues = present.map(displayValue);
  const distinct = /* @__PURE__ */ new Map();
  for (const value of displayValues) {
    distinct.set(value, (distinct.get(value) ?? 0) + 1);
  }
  const numeric = present.map(numericValue).filter((value) => value !== void 0);
  const dates = present.map(dateValue).filter((value) => value !== void 0);
  const minMax = numeric.length >= Math.max(2, present.length * 0.75) ? numericMinMax(numeric) : dates.length >= Math.max(2, present.length * 0.75) ? dateMinMax(dates) : stringMinMax(displayValues);
  return {
    name,
    dataType,
    nullable,
    rowCount,
    nullCount: rowCount - present.length,
    nullPct: rowCount ? roundPct((rowCount - present.length) / rowCount) : 0,
    distinctCount: distinct.size,
    min: minMax.min,
    max: minMax.max,
    topValues: topValues(distinct),
    histogram: numeric.length >= Math.max(2, present.length * 0.75) ? numericHistogram(numeric) : dates.length >= Math.max(2, present.length * 0.75) ? dateHistogram(dates) : categoricalHistogram(distinct)
  };
}
function deterministicNarrative(columns, sampleRows) {
  const anomalies = [];
  for (const column of columns) {
    if (column.nullPct >= 50) {
      anomalies.push(`${column.name} is ${column.nullPct}% null in the sample.`);
    }
    if (sampleRows > 0 && column.distinctCount === 1) {
      anomalies.push(`${column.name} has only one distinct sampled value.`);
    }
    const top = column.topValues[0];
    if (top && sampleRows > 0 && top.count / sampleRows >= 0.8) {
      anomalies.push(`${column.name} is dominated by ${top.value} (${top.count}/${sampleRows}).`);
    }
  }
  return {
    summary: `Profiled ${columns.length} columns across ${sampleRows} sampled rows.`,
    anomalies: anomalies.slice(0, 8)
  };
}
function topValues(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], void 0, { numeric: true, sensitivity: "base" })).slice(0, 8).map(([value, count]) => ({ value, count }));
}
function numericMinMax(values) {
  return {
    min: String(Math.min(...values)),
    max: String(Math.max(...values))
  };
}
function dateMinMax(values) {
  const times = values.map((value) => value.getTime());
  return {
    min: new Date(Math.min(...times)).toISOString(),
    max: new Date(Math.max(...times)).toISOString()
  };
}
function stringMinMax(values) {
  const sorted = [...values].sort((left, right) => left.localeCompare(right, void 0, { numeric: true, sensitivity: "base" }));
  return {
    min: sorted[0],
    max: sorted.at(-1)
  };
}
function numericHistogram(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ label: String(min), count: values.length }];
  }
  const bucketCount = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const value of values) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => ({
    label: `${formatNumber(min + width * index)}-${formatNumber(index === bucketCount - 1 ? max : min + width * (index + 1))}`,
    count
  }));
}
function dateHistogram(values) {
  const times = values.map((value) => value.getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (min === max) {
    return [{ label: new Date(min).toISOString().slice(0, 10), count: values.length }];
  }
  const bucketCount = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const value of times) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => {
    const start = min + width * index;
    const end = index === bucketCount - 1 ? max : min + width * (index + 1);
    return {
      label: `${new Date(start).toISOString().slice(0, 10)}-${new Date(end).toISOString().slice(0, 10)}`,
      count
    };
  });
}
function categoricalHistogram(counts) {
  return topValues(counts).map((item) => ({ label: item.value, count: item.count }));
}
function displayValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function numericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : void 0;
  }
  if (typeof value === "bigint") {
    const next = Number(value);
    return Number.isFinite(next) ? next : void 0;
  }
  if (typeof value === "string" && /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    const next = Number(value);
    return Number.isFinite(next) ? next : void 0;
  }
  return void 0;
}
function dateValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return void 0;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : void 0;
}
function roundPct(value) {
  return Math.round(value * 1e3) / 10;
}
function formatNumber(value) {
  return new Intl.NumberFormat(void 0, { maximumFractionDigits: 2 }).format(value);
}

// src/services/queryMemoryService.ts
var vscode9 = __toESM(require("vscode"));

// src/services/queryMemorySearch.ts
var QueryMemorySearch = class {
  constructor(safety = new SqlSafetyClassifier()) {
    this.safety = safety;
  }
  search(items, request) {
    const terms = this.terms(request.query);
    const limit = request.limit && request.limit > 0 ? request.limit : 20;
    return items.filter((item) => this.matchesFilters(item, request)).map((item) => this.score(item, terms)).filter((result) => request.query.trim().length === 0 || result.score > 0).sort((a, b) => b.score - a.score || (b.item.executedAt ?? b.item.updatedAt) - (a.item.executedAt ?? a.item.updatedAt)).slice(0, limit);
  }
  matchesFilters(item, request) {
    if (request.connectionId && item.connectionId !== request.connectionId) {
      return false;
    }
    if (!request.includeFailed && item.status === "failed") {
      return false;
    }
    return true;
  }
  score(item, terms) {
    const reasons = [];
    let score = 0;
    const fields = [
      ["title", item.title ?? "", 12],
      ["summary", item.summary ?? "", 8],
      ["sql", item.sql, 5],
      ["source", item.sourceFile ?? item.documentUri ?? "", 4],
      ["connection", `${item.connectionName ?? ""} ${item.databaseName ?? ""}`, 3],
      ["status", item.status ?? "", 2]
    ];
    const arrays = [
      ["table", item.tables, 10],
      ["column", item.columns, 7],
      ["output column", item.outputColumns, 9]
    ];
    for (const term of terms) {
      for (const [name, value, weight] of fields) {
        if (this.includes(value, term)) {
          score += weight;
          reasons.push(`${name}: ${term}`);
        }
      }
      for (const [name, values, weight] of arrays) {
        if (values.some((value) => this.includes(value, term))) {
          score += weight;
          reasons.push(`${name}: ${term}`);
        }
      }
    }
    if (item.favorite) {
      score += 5;
      reasons.push("favorite");
    }
    if (item.executedAt && Date.now() - item.executedAt < 7 * 24 * 60 * 60 * 1e3) {
      score += 2;
      reasons.push("recent");
    }
    return {
      item,
      score,
      reasons: [...new Set(reasons)].slice(0, 6),
      safety: this.safety.classify(item.sql)
    };
  }
  terms(query) {
    return [...new Set(query.toLowerCase().split(/[^a-z0-9_.$"]+/).map((term) => term.replace(/^"|"$/g, "")).filter((term) => term.length >= 2))];
  }
  includes(value, term) {
    return value.toLowerCase().includes(term);
  }
};

// src/services/queryConsoleHistory.ts
function queryConsoleDocumentUris(records) {
  return new Set(records.map((record) => record.documentUri));
}
function executionOriginForDocument(documentUri, consoleDocumentUris) {
  return documentUri && consoleDocumentUris.has(documentUri) ? "queryConsole" : "sqlFile";
}
function isQueryConsoleHistoryItem(item, consoleDocumentUris) {
  if (item.sourceOrigin) {
    return item.sourceOrigin === "queryConsole";
  }
  return item.documentUri !== void 0 && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isQueryConsoleMemoryItem(item, consoleDocumentUris) {
  return item.documentUri !== void 0 && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isLegacyQueryConsoleDocumentUri(documentUri) {
  const normalized = documentUri.toLowerCase().replace(/\\/g, "/");
  return normalized.includes("/.vscode-data-grip/") || normalized.includes("/query-consoles/");
}

// src/services/sqlRelationParser.ts
var RELATION_KEYWORDS = /* @__PURE__ */ new Set(["from", "join", "update", "into"]);
var ALIAS_BOUNDARIES = /* @__PURE__ */ new Set([
  "where",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "using",
  "group",
  "order",
  "limit",
  "set",
  "values",
  "returning",
  "union",
  "intersect",
  "except"
]);
function extractSqlAliases(sql) {
  const aliases = [];
  let depth = 0;
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag;
  for (let index = 0; index < sql.length; ) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      lineComment = char !== "\n";
      index += 1;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = void 0;
      } else {
        index += 1;
      }
      continue;
    }
    if (single) {
      if (char === "'" && next === "'") {
        index += 2;
      } else {
        single = char !== "'";
        index += 1;
      }
      continue;
    }
    if (double) {
      if (char === '"' && next === '"') {
        index += 2;
      } else {
        double = char !== '"';
        index += 1;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 2;
      continue;
    }
    if (char === "'") {
      single = true;
      index += 1;
      continue;
    }
    if (char === '"') {
      double = true;
      index += 1;
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length;
        continue;
      }
    }
    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (depth === 0 && isIdentifierStart(char)) {
      const word = readIdentifierWord(sql, index);
      if (word && RELATION_KEYWORDS.has(word.value.toLowerCase())) {
        const parsed = readRelationAlias(sql, word.end);
        if (parsed) {
          aliases.push(parsed.alias);
          index = parsed.end;
          continue;
        }
      }
      index = word?.end ?? index + 1;
      continue;
    }
    index += 1;
  }
  return aliases;
}
function readRelationAlias(sql, start) {
  let index = skipWhitespace(sql, start);
  const relation = readQualifiedIdentifier(sql, index);
  if (!relation) {
    return void 0;
  }
  index = relation.end;
  let aliasIndex = skipWhitespace(sql, index);
  const maybeAs = readIdentifierWord(sql, aliasIndex);
  if (maybeAs?.value.toLowerCase() === "as") {
    aliasIndex = skipWhitespace(sql, maybeAs.end);
  }
  const aliasToken = readIdentifier(sql, aliasIndex);
  const boundary = aliasToken ? ALIAS_BOUNDARIES.has(aliasToken.value.toLowerCase()) : true;
  if (aliasToken && !boundary) {
    return {
      alias: {
        alias: aliasToken.value,
        schema: relation.schema,
        table: relation.table,
        explicitAlias: true
      },
      end: aliasToken.end
    };
  }
  return {
    alias: {
      alias: relation.table,
      schema: relation.schema,
      table: relation.table,
      explicitAlias: false
    },
    end: index
  };
}
function readQualifiedIdentifier(sql, start) {
  const first = readIdentifier(sql, start);
  if (!first) {
    return void 0;
  }
  let end = first.end;
  if (sql[end] !== ".") {
    return { table: first.value, end };
  }
  const second = readIdentifier(sql, end + 1);
  if (!second) {
    return { table: first.value, end };
  }
  end = second.end;
  return { schema: first.value, table: second.value, end };
}
function readIdentifier(sql, start) {
  if (sql[start] === '"') {
    let value = "";
    for (let index = start + 1; index < sql.length; index += 1) {
      if (sql[index] === '"' && sql[index + 1] === '"') {
        value += '"';
        index += 1;
        continue;
      }
      if (sql[index] === '"') {
        return { value, end: index + 1 };
      }
      value += sql[index];
    }
    return void 0;
  }
  return readIdentifierWord(sql, start);
}
function readIdentifierWord(sql, start) {
  if (!isIdentifierStart(sql[start])) {
    return void 0;
  }
  let end = start + 1;
  while (isIdentifierPart(sql[end])) {
    end += 1;
  }
  return { value: sql.slice(start, end), end };
}
function skipWhitespace(sql, start) {
  let index = start;
  while (/\s/.test(sql[index] ?? "")) {
    index += 1;
  }
  return index;
}
function isIdentifierStart(char) {
  return !!char && /[A-Za-z_]/.test(char);
}
function isIdentifierPart(char) {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

// src/services/queryMemoryService.ts
var QueryMemoryService = class {
  constructor(historyStore, memoryStore, consoleStore, connectionManager, summarizer) {
    this.historyStore = historyStore;
    this.memoryStore = memoryStore;
    this.consoleStore = consoleStore;
    this.connectionManager = connectionManager;
    this.summarizer = summarizer;
  }
  searcher = new QueryMemorySearch();
  getAll() {
    return this.memoryStore.getAll();
  }
  async recordHistoryItem(item) {
    const id = this.historyMemoryId(item);
    const existing = this.memoryStore.get(id);
    if (existing?.historyIds?.includes(item.id)) {
      return;
    }
    await this.memoryStore.upsert(this.fromHistory(item, existing));
    const legacyId = this.legacyHistoryMemoryId(item);
    if (legacyId !== id) {
      await this.memoryStore.delete(legacyId);
    }
  }
  async search(request) {
    await this.syncFromHistory();
    await this.syncKnownDocuments();
    return this.searcher.search(this.queryConsoleMemoryItems(), request);
  }
  async getTableWorkload(connectionId, tableRef) {
    await this.syncFromHistory();
    await this.syncKnownDocuments();
    const target = this.parseTableRef(tableRef);
    const items = this.memoryStore.getAll().filter((item) => item.connectionId === connectionId && item.status !== "failed" && this.memoryItemReferencesTable(item, target)).map((item) => ({
      item,
      runCount: Math.max(1, item.runCount ?? 1),
      durationMs: Math.max(0, item.durationMs ?? 0),
      score: Math.max(1, item.runCount ?? 1) * Math.max(1, item.durationMs ?? 1)
    })).sort((left, right) => right.score - left.score).slice(0, 15);
    const columns = /* @__PURE__ */ new Map();
    for (const ranked of items) {
      const seenInQuery = /* @__PURE__ */ new Set();
      for (const use of this.extractTableColumnUses(ranked.item.sql, target)) {
        const key = `${use.role}:${use.column.toLowerCase()}`;
        if (seenInQuery.has(key)) {
          continue;
        }
        seenInQuery.add(key);
        const existing = columns.get(key);
        columns.set(key, {
          column: use.column,
          role: use.role,
          queryCount: (existing?.queryCount ?? 0) + 1,
          runCount: (existing?.runCount ?? 0) + ranked.runCount,
          durationMs: (existing?.durationMs ?? 0) + ranked.durationMs
        });
      }
    }
    return {
      connectionId,
      table: tableRef,
      queryCount: items.length,
      totalRunCount: items.reduce((total, ranked) => total + ranked.runCount, 0),
      totalDurationMs: items.reduce((total, ranked) => total + ranked.durationMs, 0),
      topQueries: items.map((ranked) => ({
        sql: ranked.item.sql,
        title: ranked.item.title,
        runCount: ranked.runCount,
        durationMs: ranked.durationMs,
        lastExecutedAt: ranked.item.lastExecutedAt ?? ranked.item.executedAt,
        score: ranked.score
      })),
      columns: [...columns.values()].sort((left, right) => {
        return right.durationMs - left.durationMs || right.runCount - left.runCount || left.role.localeCompare(right.role) || left.column.localeCompare(right.column);
      })
    };
  }
  async backfillSummaries(options = {}) {
    const limit = options.limit && options.limit > 0 ? options.limit : 25;
    const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    if (!this.summarizer) {
      return { ...result, skipped: limit };
    }
    const candidates = this.memoryStore.getAll().filter((item) => item.summaryStatus !== "ready").slice(0, limit);
    for (const item of candidates) {
      if (options.token?.isCancellationRequested) {
        break;
      }
      result.processed += 1;
      if (!item.sql.trim()) {
        result.skipped += 1;
        await this.memoryStore.update(item.id, { summaryStatus: "skipped", summaryError: "Empty SQL." });
        continue;
      }
      try {
        await this.memoryStore.update(item.id, { summaryStatus: "pending", summaryError: void 0 });
        const summary = await this.summarizer.summarizeQueryMemory({
          sql: item.sql,
          connectionName: item.connectionName,
          databaseName: item.databaseName,
          databaseType: item.databaseType,
          outputColumns: item.outputColumns,
          errorMessage: item.errorMessage
        });
        await this.memoryStore.update(item.id, {
          title: summary.title,
          summary: summary.summary,
          tables: summary.tables.length ? summary.tables : item.tables,
          columns: summary.columns.length ? summary.columns : item.columns,
          summaryStatus: "ready",
          summaryError: void 0
        });
        result.succeeded += 1;
      } catch (error) {
        await this.memoryStore.update(item.id, {
          summaryStatus: "failed",
          summaryError: error instanceof Error ? error.message : String(error)
        });
        result.failed += 1;
      }
    }
    return result;
  }
  async syncFromHistory() {
    for (const item of this.queryConsoleHistoryItems()) {
      await this.recordHistoryItem(item);
    }
  }
  async syncKnownDocuments() {
    const documentUris = /* @__PURE__ */ new Set();
    for (const record of this.consoleStore.getAll()) {
      documentUris.add(record.documentUri);
    }
    for (const documentUri of documentUris) {
      await this.indexDocument(documentUri);
    }
  }
  async indexDocument(documentUri) {
    let sql = "";
    try {
      const bytes = await vscode9.workspace.fs.readFile(vscode9.Uri.parse(documentUri));
      sql = Buffer.from(bytes).toString("utf8");
    } catch {
      return;
    }
    if (!sql.trim()) {
      return;
    }
    const id = this.documentMemoryId(documentUri);
    const existing = this.memoryStore.get(id);
    const now = Date.now();
    await this.memoryStore.upsert({
      id,
      sourceKind: "document",
      sourceId: documentUri,
      sql,
      title: existing?.title,
      summary: existing?.summary,
      summaryStatus: existing?.summaryStatus ?? "pending",
      summaryError: existing?.summaryError,
      tables: extractQueryTables(sql),
      columns: extractQualifiedColumns(sql),
      outputColumns: [],
      documentUri,
      sourceFile: this.fsPath(documentUri),
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    });
  }
  fromHistory(item, existing) {
    const connection = this.connectionManager.getConnection(item.connectionId);
    const now = Date.now();
    const lastExecutedAt = Math.max(existing?.lastExecutedAt ?? existing?.executedAt ?? 0, item.executedAt);
    const isLatest = item.executedAt >= (existing?.lastExecutedAt ?? existing?.executedAt ?? 0);
    return {
      id: this.historyMemoryId(item),
      sourceKind: "history",
      sourceId: this.historyFingerprint(item),
      connectionId: item.connectionId,
      databaseType: item.databaseType,
      databaseName: connection?.database,
      connectionName: connection?.name,
      sql: item.sql,
      title: existing?.title ?? item.memoryTitle,
      summary: existing?.summary ?? item.memorySummary,
      summaryStatus: existing?.summaryStatus ?? item.memorySummaryStatus ?? "pending",
      summaryError: existing?.summaryError ?? item.memorySummaryError,
      tables: this.mergeStrings(existing?.tables, item.tables?.length ? item.tables : extractQueryTables(item.sql)),
      columns: this.mergeStrings(existing?.columns, item.columns?.length ? item.columns : extractQualifiedColumns(item.sql)),
      outputColumns: this.mergeStrings(existing?.outputColumns, item.outputColumns ?? []),
      sourceFile: isLatest ? item.sourceFile : existing?.sourceFile,
      documentUri: isLatest ? item.documentUri : existing?.documentUri,
      sourceRange: isLatest ? item.sourceRange : existing?.sourceRange,
      favorite: existing?.favorite || item.favorite,
      status: isLatest ? item.status : existing?.status,
      errorMessage: isLatest ? item.errorMessage : existing?.errorMessage,
      rowCount: isLatest ? item.rowCount : existing?.rowCount,
      durationMs: isLatest ? item.durationMs : existing?.durationMs,
      executedAt: lastExecutedAt,
      firstExecutedAt: Math.min(existing?.firstExecutedAt ?? existing?.executedAt ?? item.executedAt, item.executedAt),
      lastExecutedAt,
      runCount: (existing?.runCount ?? existing?.historyIds?.length ?? 0) + 1,
      historyIds: [...existing?.historyIds ?? [], item.id],
      latestHistoryId: isLatest ? item.id : existing?.latestHistoryId,
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    };
  }
  queryConsoleHistoryItems() {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.historyStore.getAll().filter((item) => isQueryConsoleHistoryItem(item, consoleUris));
  }
  queryConsoleMemoryItems() {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.memoryStore.getAll().filter((item) => isQueryConsoleMemoryItem(item, consoleUris));
  }
  historyMemoryId(item) {
    return `memory_${this.hash(this.historyFingerprint(item))}`;
  }
  legacyHistoryMemoryId(item) {
    return `memory_${item.id}`;
  }
  historyFingerprint(item) {
    return `${item.connectionId}:${this.normalizeSql(item.sql)}`;
  }
  normalizeSql(sql) {
    return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim().replace(/;+$/g, "").toLowerCase();
  }
  mergeStrings(first = [], second = []) {
    return [...new Set([...first, ...second].filter(Boolean))];
  }
  memoryItemReferencesTable(item, target) {
    return item.tables.some((table) => this.tableRefMatches(table, target)) || extractQueryTables(item.sql).some((table) => this.tableRefMatches(table, target));
  }
  extractTableColumnUses(sql, target) {
    const aliases = /* @__PURE__ */ new Set([target.table.toLowerCase()]);
    for (const alias of extractSqlAliases(sql)) {
      if (this.tableRefMatches(`${alias.schema ? `${alias.schema}.` : ""}${alias.table}`, target)) {
        aliases.add(alias.alias.toLowerCase());
        aliases.add(alias.table.toLowerCase());
      }
    }
    const uses = [];
    this.extractClauseColumnUses(sql, aliases, "join", /\bon\s+([\s\S]*?)(?=\b(?:left|right|inner|outer|full|cross)?\s*join\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|\bintersect\b|\bexcept\b|$)/gi, uses);
    this.extractClauseColumnUses(sql, aliases, "filter", /\bwhere\s+([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|\bintersect\b|\bexcept\b|$)/gi, uses);
    this.extractClauseColumnUses(sql, aliases, "groupBy", /\bgroup\s+by\s+([\s\S]*?)(?=\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|\bintersect\b|\bexcept\b|$)/gi, uses);
    this.extractClauseColumnUses(sql, aliases, "orderBy", /\border\s+by\s+([\s\S]*?)(?=\blimit\b|\bunion\b|\bintersect\b|\bexcept\b|$)/gi, uses);
    return uses;
  }
  extractClauseColumnUses(sql, aliases, role, regex, uses) {
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const clause = match[1];
      const columnRegex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
      let columnMatch;
      while ((columnMatch = columnRegex.exec(clause)) !== null) {
        const qualifier = stripQuotes2(columnMatch[1] ?? columnMatch[2]);
        const column = stripQuotes2(columnMatch[3] ?? columnMatch[4]);
        if (aliases.has(qualifier.toLowerCase())) {
          uses.push({ column, role });
        }
      }
    }
  }
  tableRefMatches(value, target) {
    const parsed = this.parseTableRef(value);
    return parsed.table.toLowerCase() === target.table.toLowerCase() && (!target.schema || !parsed.schema || parsed.schema.toLowerCase() === target.schema.toLowerCase());
  }
  parseTableRef(value) {
    const parts = value.split(".").map(stripQuotes2).filter(Boolean);
    return parts.length > 1 ? { schema: parts[parts.length - 2], table: parts[parts.length - 1] } : { table: stripQuotes2(value) };
  }
  documentMemoryId(documentUri) {
    return `memory_doc_${this.hash(documentUri)}`;
  }
  hash(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
    }
    return Math.abs(hash).toString(36);
  }
  fsPath(documentUri) {
    try {
      return vscode9.Uri.parse(documentUri).fsPath;
    } catch {
      return void 0;
    }
  }
};
function stripQuotes2(value) {
  return value.replace(/^"|"$/g, "");
}

// src/services/schemaMetadataCacheStore.ts
var crypto = __toESM(require("crypto"));
var vscode10 = __toESM(require("vscode"));
var SCHEMA_METADATA_CACHE_VERSION = 1;
var SchemaMetadataCacheStore = class {
  baseUri;
  storageError;
  constructor(context) {
    this.baseUri = vscode10.Uri.joinPath(context.globalStorageUri, "schema-metadata-cache");
  }
  getStorageError() {
    return this.storageError;
  }
  async hydrate(connection, schemaName) {
    try {
      const uri = this.cacheUri(connection, schemaName);
      const bytes = await vscode10.workspace.fs.readFile(uri);
      const stored = parseStoredSchemaCacheEntry(connection, Buffer.from(bytes).toString("utf8"));
      if (!stored || stored.entry.schemaName !== schemaName) {
        return void 0;
      }
      this.storageError = void 0;
      return { ...stored.entry, source: "disk" };
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
      return void 0;
    }
  }
  async persist(connection, entry) {
    try {
      await vscode10.workspace.fs.createDirectory(this.connectionCacheUri(connection));
      await vscode10.workspace.fs.writeFile(
        this.cacheUri(connection, entry.schemaName),
        Buffer.from(serializeSchemaCacheEntry(connection, entry), "utf8")
      );
      this.storageError = void 0;
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : String(error);
    }
  }
  async deleteConnection(connectionId) {
    try {
      await vscode10.workspace.fs.delete(vscode10.Uri.joinPath(this.baseUri, safePath(connectionId)), { recursive: true, useTrash: false });
      this.storageError = void 0;
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  connectionCacheUri(connection) {
    return vscode10.Uri.joinPath(this.baseUri, safePath(connection.id), connectionMetadataFingerprint(connection));
  }
  cacheUri(connection, schemaName) {
    return vscode10.Uri.joinPath(this.connectionCacheUri(connection), `${safePath(schemaName)}.json`);
  }
  isNotFound(error) {
    const code = error instanceof vscode10.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
};
function connectionMetadataFingerprint(connection) {
  const identity = {
    type: connection.type,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    sslMode: connection.sslMode,
    defaultSchema: connection.defaultSchema ?? "public"
  };
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);
}
function serializeSchemaCacheEntry(connection, entry) {
  const fingerprint = connectionMetadataFingerprint(connection);
  const stored = {
    version: SCHEMA_METADATA_CACHE_VERSION,
    fingerprint,
    savedAt: Date.now(),
    entry: {
      ...entry,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: fingerprint,
      source: "disk"
    }
  };
  return `${JSON.stringify(stored)}
`;
}
function parseStoredSchemaCacheEntry(connection, raw) {
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (stored.version !== SCHEMA_METADATA_CACHE_VERSION || stored.fingerprint !== connectionMetadataFingerprint(connection)) {
    return void 0;
  }
  if (!stored.entry || stored.entry.connectionId !== connection.id) {
    return void 0;
  }
  return stored;
}
function safePath(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

// src/services/schemaContextService.ts
var CACHE_TTL_MS = 5 * 6e4;
var REFRESH_DEBOUNCE_MS = 500;
var COLUMN_METADATA_WORKERS = 4;
var SchemaContextService = class {
  constructor(connectionManager, persistentCache) {
    this.connectionManager = connectionManager;
    this.persistentCache = persistentCache;
  }
  cache = /* @__PURE__ */ new Map();
  inflight = /* @__PURE__ */ new Map();
  refreshTimers = /* @__PURE__ */ new Map();
  async loadDefaultSchema(connection, refresh = false) {
    return this.loadSchema(connection, connection.defaultSchema ?? "public", refresh);
  }
  async loadSchema(connection, schemaName, refresh = false) {
    const key = this.key(connection, schemaName);
    const cached = this.markStale(this.cache.get(key));
    if (!refresh && cached && cached.status === "ready") {
      return cached;
    }
    if (this.inflight.has(key)) {
      return this.inflight.get(key);
    }
    if (!refresh && cached && !this.connectionManager.isConnected(connection.id)) {
      return cached;
    }
    if (!refresh && !cached) {
      const hydrated = await this.hydrateSchema(connection, schemaName);
      if (hydrated && !this.connectionManager.isConnected(connection.id)) {
        return hydrated;
      }
      if (hydrated && hydrated.status === "ready") {
        return hydrated;
      }
    }
    if (!this.connectionManager.isConnected(connection.id)) {
      const missing = this.emptyEntry(connection, schemaName, "error", "Connection is not active. Connect first to refresh metadata.");
      this.cache.set(key, missing);
      return missing;
    }
    const started = cached ? { ...cached, errorMessage: void 0 } : this.emptyEntry(connection, schemaName, "loading");
    if (!cached) {
      this.cache.set(key, started);
    }
    const load = this.loadSchemaNow(connection, schemaName, started).finally(() => this.inflight.delete(key));
    this.inflight.set(key, load);
    return load;
  }
  getCached(connectionId, schemaName) {
    const connection = this.connectionManager.getConnection(connectionId);
    const cached = connection ? this.cache.get(this.key(connection, schemaName)) : [...this.cache.values()].find((entry) => entry.connectionId === connectionId && entry.schemaName === schemaName);
    return this.markStale(cached);
  }
  async getCachedForConnection(connection, schemaName) {
    return this.markStale(this.cache.get(this.key(connection, schemaName))) ?? await this.hydrateSchema(connection, schemaName);
  }
  getAnyCached(connectionId) {
    return [...this.cache.values()].filter((entry) => entry.connectionId === connectionId).map((entry) => this.markStale(entry));
  }
  async getColumns(connection, schemaName, tableName) {
    const entry = await this.loadSchema(connection, schemaName);
    const tableKey3 = this.tableKey(schemaName, tableName);
    if (entry.columns[tableKey3]) {
      return entry.columns[tableKey3];
    }
    const columns = await this.connectionManager.getDriver(connection.type).getColumns(connection.id, schemaName, tableName);
    entry.columns[tableKey3] = columns;
    entry.loadedAt = Date.now();
    entry.status = "ready";
    entry.source = "live";
    await this.persistentCache?.persist(connection, entry);
    return columns;
  }
  async getPrimaryKeys(connection, schemaName, tableName) {
    const entry = await this.loadSchema(connection, schemaName);
    const tableKey3 = this.tableKey(schemaName, tableName);
    if (entry.keys[tableKey3]) {
      return entry.keys[tableKey3];
    }
    const keys = await this.connectionManager.getDriver(connection.type).getPrimaryKeys(connection.id, schemaName, tableName);
    entry.keys[tableKey3] = keys;
    entry.loadedAt = Date.now();
    entry.status = "ready";
    entry.source = "live";
    await this.persistentCache?.persist(connection, entry);
    return keys;
  }
  async getCachedColumns(connection, schemaName, tableName) {
    const entry = await this.getCachedForConnection(connection, schemaName);
    return entry?.columns[this.tableKey(schemaName, tableName)];
  }
  invalidate(connectionId, schemaName) {
    if (!connectionId) {
      this.cache.clear();
      return;
    }
    for (const [key, entry] of this.cache) {
      if (entry.connectionId === connectionId && (!schemaName || entry.schemaName === schemaName)) {
        this.cache.delete(key);
      }
    }
  }
  async deletePersistent(connectionId) {
    this.invalidate(connectionId);
    await this.persistentCache?.deleteConnection(connectionId);
  }
  async warmFromDisk(connections) {
    await Promise.all(connections.map((connection) => this.hydrateSchema(connection, connection.defaultSchema ?? "public")));
  }
  refreshDefaultSchemaInBackground(connection) {
    this.refreshSchemaInBackground(connection, connection.defaultSchema ?? "public");
  }
  refreshSchemaInBackground(connection, schemaName) {
    if (!this.connectionManager.isConnected(connection.id)) {
      return;
    }
    const key = this.key(connection, schemaName);
    const existing = this.refreshTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.refreshTimers.delete(key);
      void this.loadSchema(connection, schemaName, true);
    }, REFRESH_DEBOUNCE_MS);
    this.refreshTimers.set(key, timer);
  }
  async metadataStatus(connection, schemaName = connection.defaultSchema ?? "public") {
    const entry = await this.getCachedForConnection(connection, schemaName);
    return {
      connection,
      schemaName,
      entry,
      freshForDiagnostics: !!entry && entry.status === "ready",
      storageError: this.persistentCache?.getStorageError(),
      refreshRunning: this.inflight.has(this.key(connection, schemaName)),
      connected: this.connectionManager.isConnected(connection.id)
    };
  }
  tablesAndViews(connectionId) {
    return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
  }
  async loadSchemaNow(connection, schemaName, base) {
    try {
      const driver = this.connectionManager.getDriver(connection.type);
      const [schemas, tables, views] = await Promise.all([
        driver.getSchemas(connection.id),
        driver.getTables(connection.id, schemaName),
        driver.getViews(connection.id, schemaName)
      ]);
      const columns = await this.loadColumnsForRelations(connection, schemaName, [...tables, ...views]);
      const entry = {
        ...base,
        schemas,
        tables,
        views,
        columns,
        loadedAt: Date.now(),
        cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
        connectionFingerprint: connectionMetadataFingerprint(connection),
        source: "live",
        status: "ready",
        errorMessage: void 0
      };
      this.cache.set(this.key(connection, schemaName), entry);
      await this.persistentCache?.persist(connection, entry);
      return entry;
    } catch (error) {
      const failed = {
        ...base,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        loadedAt: Date.now()
      };
      this.cache.set(this.key(connection, schemaName), failed);
      return failed;
    }
  }
  async hydrateSchema(connection, schemaName) {
    const key = this.key(connection, schemaName);
    const hydrated = this.markStale(await this.persistentCache?.hydrate(connection, schemaName));
    if (hydrated) {
      this.cache.set(key, hydrated);
    }
    return hydrated;
  }
  async loadColumnsForRelations(connection, schemaName, relations) {
    const driver = this.connectionManager.getDriver(connection.type);
    const result = {};
    const queue = relations.filter((relation) => relation.schema === schemaName).slice(0, 300);
    const workers = Array.from({ length: Math.min(COLUMN_METADATA_WORKERS, queue.length) }, async () => {
      while (queue.length) {
        const relation = queue.shift();
        if (!relation) {
          return;
        }
        try {
          result[this.tableKey(relation.schema, relation.name)] = await driver.getColumns(connection.id, relation.schema, relation.name);
        } catch {
        }
      }
    });
    await Promise.all(workers);
    return result;
  }
  emptyEntry(connection, schemaName, status, errorMessage) {
    return {
      connectionId: connection.id,
      schemaName,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: connectionMetadataFingerprint(connection),
      source: "memory",
      schemas: [],
      tables: [],
      views: [],
      columns: {},
      indexes: {},
      keys: {},
      status,
      errorMessage
    };
  }
  markStale(entry) {
    if (!entry) {
      return void 0;
    }
    if (entry.loadedAt && Date.now() - entry.loadedAt > CACHE_TTL_MS && entry.status === "ready") {
      entry.status = "stale";
    }
    return entry;
  }
  key(connection, schemaName) {
    return `${connection.id}:${connectionMetadataFingerprint(connection)}:${schemaName}`;
  }
  tableKey(schemaName, tableName) {
    return `${schemaName}.${tableName}`;
  }
};

// src/services/sqlMetadataCompletion.ts
function relationCompletionContext(linePrefix) {
  const match = linePrefix.match(/\b(?:from|join|update|into)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))(?:\.(?:"([^"]*)|([A-Za-z_][A-Za-z0-9_]*))?)?$/i);
  if (!match) {
    return void 0;
  }
  const hasQualifiedPrefix = match[1] !== void 0 || match[2] !== void 0;
  const schema = match[1] ?? match[2];
  const partial = match[3] ?? match[4] ?? "";
  return hasQualifiedPrefix && linePrefix.endsWith(".") || match[3] !== void 0 || match[4] !== void 0 ? { schema, partial } : { partial: schema };
}
function relationCompletionCandidates(entry, context) {
  const schema = context.schema?.toLowerCase();
  const partial = context.partial.toLowerCase();
  return [...entry.tables, ...entry.views].filter((relation) => {
    if (schema && relation.schema.toLowerCase() !== schema) {
      return false;
    }
    return relation.name.toLowerCase().startsWith(partial);
  });
}
function selectListColumnCompletionContext(statementPrefix) {
  const selectMatches = [...statementPrefix.matchAll(/\bselect\b/gi)];
  const lastSelect = selectMatches.at(-1);
  if (lastSelect?.index === void 0) {
    return false;
  }
  const afterSelect = statementPrefix.slice(lastSelect.index + lastSelect[0].length);
  return !/\b(?:from|where|join|left|right|inner|outer|full|cross|on|using|group|order|having|limit|union|intersect|except)\b/i.test(afterSelect);
}
function unqualifiedColumnCompletionContext(statementPrefix) {
  if (/\.\s*(?:"[^"]*|[A-Za-z_][A-Za-z0-9_]*)?$/.test(statementPrefix) || relationCompletionContext(statementPrefix)) {
    return false;
  }
  if (selectListColumnCompletionContext(statementPrefix)) {
    return true;
  }
  const relationIndex = lastKeywordIndex(statementPrefix, /\b(?:from|join|update|into)\b/gi);
  const columnIndex = lastKeywordIndex(statementPrefix, /\bwhere\b|\bhaving\b|\bon\b|\band\b|\bor\b|\bgroup\s+by\b|\border\s+by\b/gi);
  return columnIndex >= 0 && columnIndex > relationIndex;
}
function lastKeywordIndex(value, regex) {
  let index = -1;
  for (const match of value.matchAll(regex)) {
    if (match.index !== void 0) {
      index = match.index;
    }
  }
  return index;
}

// src/services/sqlMetadataWarmup.ts
async function connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection) {
  let refreshConnection = connection;
  if (!connectionManager.isConnected(connection.id)) {
    const active = await connectionManager.connect(connection.id);
    refreshConnection = active.config;
  }
  schemaContext.refreshDefaultSchemaInBackground(refreshConnection);
}

// src/services/sqlDiagnosticsService.ts
var vscode11 = __toESM(require("vscode"));

// src/services/sqlParameters.ts
function findSqlParameters(sql) {
  const parameters = [];
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag;
  for (let index = 0; index < sql.length; ) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      lineComment = char !== "\n";
      index += 1;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = void 0;
      } else {
        index += 1;
      }
      continue;
    }
    const brace = readBraceParameter(sql, index, single);
    if (brace) {
      parameters.push(brace);
      index = brace.end;
      continue;
    }
    const colon = readColonParameter(sql, index, single);
    if (colon) {
      parameters.push(colon);
      index = colon.end;
      continue;
    }
    if (single) {
      if (char === "'" && next === "'") {
        index += 2;
      } else {
        single = char !== "'";
        index += 1;
      }
      continue;
    }
    if (double) {
      if (char === '"' && next === '"') {
        index += 2;
      } else {
        double = char !== '"';
        index += 1;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 2;
      continue;
    }
    if (char === "'") {
      single = true;
      index += 1;
      continue;
    }
    if (char === '"') {
      double = true;
      index += 1;
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length;
        continue;
      }
    }
    index += 1;
  }
  return parameters;
}
function hasSqlParameters(sql) {
  return findSqlParameters(sql).length > 0;
}
function uniqueSqlParameterNames(parameters) {
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const parameter of parameters) {
    if (!seen.has(parameter.name)) {
      seen.add(parameter.name);
      names.push(parameter.name);
    }
  }
  return names;
}
function applySqlParameterValues(sql, values) {
  const parameters = findSqlParameters(sql);
  let nextSql = sql;
  for (const parameter of [...parameters].reverse()) {
    if (!(parameter.name in values)) {
      throw new Error(`Missing SQL parameter value for ${parameter.name}.`);
    }
    const replacement = sqlParameterReplacement(values[parameter.name], parameter.inSingleQuotedString);
    nextSql = `${nextSql.slice(0, parameter.start)}${replacement}${nextSql.slice(parameter.end)}`;
  }
  return nextSql;
}
function sqlParameterSpansContain(parameters, start, end = start + 1) {
  return parameters.some((parameter) => start >= parameter.start && end <= parameter.end);
}
function readBraceParameter(sql, start, inSingleQuotedString) {
  if (sql[start] !== "{") {
    return void 0;
  }
  const match = sql.slice(start).match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}/);
  if (!match) {
    return void 0;
  }
  return {
    name: match[1],
    placeholder: match[0],
    kind: "brace",
    start,
    end: start + match[0].length,
    inSingleQuotedString
  };
}
function readColonParameter(sql, start, inSingleQuotedString) {
  if (sql[start] !== ":" || sql[start - 1] === ":" || !isIdentifierStart2(sql[start + 1])) {
    return void 0;
  }
  let end = start + 2;
  while (isIdentifierPart2(sql[end])) {
    end += 1;
  }
  const name = sql.slice(start + 1, end);
  return {
    name,
    placeholder: sql.slice(start, end),
    kind: "colon",
    start,
    end,
    inSingleQuotedString
  };
}
function sqlParameterReplacement(value, inSingleQuotedString) {
  if (inSingleQuotedString) {
    return escapeSingleQuotedSql(value);
  }
  const trimmed = value.trim();
  if (/^sql:/i.test(trimmed)) {
    return trimmed.slice(4).trim();
  }
  if (/^null$/i.test(trimmed)) {
    return "NULL";
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return trimmed;
  }
  if (isSingleQuotedSqlLiteral(trimmed)) {
    return trimmed;
  }
  return `'${escapeSingleQuotedSql(value)}'`;
}
function isSingleQuotedSqlLiteral(value) {
  if (!value.startsWith("'") || !value.endsWith("'") || value.length < 2) {
    return false;
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value[index] === "'" && value[index + 1] !== "'") {
      return false;
    }
    if (value[index] === "'" && value[index + 1] === "'") {
      index += 1;
    }
  }
  return true;
}
function escapeSingleQuotedSql(value) {
  return value.replace(/'/g, "''");
}
function isIdentifierStart2(char) {
  return !!char && /[A-Za-z_]/.test(char);
}
function isIdentifierPart2(char) {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

// src/services/sqlDiagnosticsService.ts
var SQL_COLUMN_CONTEXT_KEYWORDS = /* @__PURE__ */ new Set([
  "all",
  "and",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "cast",
  "date",
  "desc",
  "distinct",
  "else",
  "end",
  "false",
  "from",
  "group",
  "having",
  "in",
  "is",
  "like",
  "limit",
  "not",
  "null",
  "or",
  "order",
  "select",
  "then",
  "true",
  "when",
  "where"
]);
var SqlDiagnosticsService = class {
  constructor(connectionManager, schemaContext, sectionService) {
    this.connectionManager = connectionManager;
    this.schemaContext = schemaContext;
    this.sectionService = sectionService;
  }
  async getDiagnostics(document, selection, connectionOverride) {
    const diagnostics = [...this.sectionService.getSyntaxIssues(document)];
    const connection = connectionOverride === void 0 ? this.connectionManager.getPreferredConnection() : connectionOverride;
    if (!connection) {
      return diagnostics;
    }
    const scriptRelations = this.collectCreatedRelationNames(document);
    diagnostics.push(...await this.getSchemaDiagnostics(document, connection, scriptRelations));
    if (this.connectionManager.isConnected(connection.id)) {
      const executable = selection ? this.sectionService.detectExecutable(document, selection) : this.sectionService.getSections(document)[0];
      if (executable?.sql.trim() && !hasSqlParameters(executable.sql)) {
        const plannerDiagnostic = await this.getPlannerDiagnostic(document, connection, executable, scriptRelations);
        if (plannerDiagnostic) {
          diagnostics.push(plannerDiagnostic);
        }
      }
    }
    return diagnostics;
  }
  async getSchemaDiagnostics(document, connection, scriptRelations) {
    const diagnostics = [];
    const defaultSchema = connection.defaultSchema ?? "public";
    const entry = await this.schemaContext.getCachedForConnection(connection, defaultSchema);
    if (!entry || entry.status !== "ready") {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshDefaultSchemaInBackground(connection);
      }
      return diagnostics;
    }
    const knownRelations = new Set([...entry.tables, ...entry.views].map((item) => this.relationKey(item.schema, item.name)));
    const cteNames = this.collectCteNames(this.sectionService.getTree(document));
    for (const section of this.sectionService.getSections(document)) {
      for (const alias of section.aliases) {
        if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
          continue;
        }
        const schema = alias.schema ?? defaultSchema;
        if (!knownRelations.has(this.relationKey(schema, alias.table))) {
          diagnostics.push(new vscode11.Diagnostic(
            this.findIdentifierRange(document, section, alias.schema ? `${alias.schema}.${alias.table}` : alias.table),
            `Table or view "${alias.schema ? `${alias.schema}.` : ""}${alias.table}" does not exist in ${schema}.`,
            vscode11.DiagnosticSeverity.Error
          ));
        }
      }
      diagnostics.push(...await this.getColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    }
    return diagnostics;
  }
  async getColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
    const diagnostics = [];
    const defaultSchema = connection.defaultSchema ?? "public";
    const aliases = new Map(section.aliases.map((alias) => [alias.alias.toLowerCase(), alias]));
    const seen = /* @__PURE__ */ new Set();
    const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
    let match;
    while ((match = regex.exec(section.sql)) !== null) {
      const qualifier = match[1] ?? match[2];
      const column = match[3] ?? match[4];
      const alias = aliases.get(qualifier.toLowerCase());
      if (!alias || cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const key = `${alias.schema ?? defaultSchema}.${alias.table}.${column}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const columns = await this.schemaContext.getCachedColumns(connection, alias.schema ?? defaultSchema, alias.table);
      if (!columns) {
        if (this.connectionManager.isConnected(connection.id)) {
          this.schemaContext.refreshSchemaInBackground(connection, alias.schema ?? defaultSchema);
        }
        continue;
      }
      if (!columns.some((item) => item.name.toLowerCase() === column.toLowerCase())) {
        const start = section.start + match.index + match[0].lastIndexOf(column);
        diagnostics.push(new vscode11.Diagnostic(
          new vscode11.Range(document.positionAt(start), document.positionAt(start + column.length)),
          `Column "${column}" does not exist on ${alias.schema ? `${alias.schema}.` : ""}${alias.table}.`,
          vscode11.DiagnosticSeverity.Error
        ));
      }
    }
    diagnostics.push(...await this.getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    return diagnostics;
  }
  async getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
    const defaultSchema = connection.defaultSchema ?? "public";
    const relationKeys = /* @__PURE__ */ new Map();
    for (const alias of section.aliases) {
      if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const schema = alias.schema ?? defaultSchema;
      relationKeys.set(this.relationKey(schema, alias.table), { schema, table: alias.table });
    }
    const [relation] = [...relationKeys.values()];
    if (!relation || relationKeys.size !== 1) {
      return [];
    }
    const columns = await this.schemaContext.getCachedColumns(connection, relation.schema, relation.table);
    if (!columns) {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshSchemaInBackground(connection, relation.schema);
      }
      return [];
    }
    const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
    const ignored = this.unqualifiedColumnIgnoreSet(section, columns, defaultSchema);
    const parameters = findSqlParameters(section.sql);
    const diagnostics = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [spanStart, spanEnd] of this.columnExpressionSpans(section.sql)) {
      const text = section.sql.slice(spanStart, spanEnd);
      const regex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const token = match[0];
        const tokenStart = spanStart + match.index;
        const lower = token.toLowerCase();
        if (columnNames.has(lower) || ignored.has(lower) || this.isInsideSingleQuotedLiteral(section.sql, tokenStart) || this.isInLineComment(section.sql, tokenStart) || sqlParameterSpansContain(parameters, tokenStart, tokenStart + token.length) || this.isQualifiedIdentifierPart(section.sql, tokenStart, token.length) || this.isTypeCastName(section.sql, tokenStart) || this.isFunctionName(section.sql, tokenStart + token.length) || this.isAliasDeclaration(section.sql, tokenStart)) {
          continue;
        }
        const key = `${lower}:${tokenStart}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        diagnostics.push(new vscode11.Diagnostic(
          new vscode11.Range(
            document.positionAt(section.start + tokenStart),
            document.positionAt(section.start + tokenStart + token.length)
          ),
          `Column "${token}" does not exist on ${relation.schema}.${relation.table}.`,
          vscode11.DiagnosticSeverity.Error
        ));
      }
    }
    return diagnostics;
  }
  async getPlannerDiagnostic(document, connection, section, scriptRelations) {
    if (section.aliases.some((alias) => this.isScriptRelation(alias, scriptRelations))) {
      return void 0;
    }
    let result;
    try {
      result = await this.connectionManager.getDriver(connection.type).validateQuery({
        connectionId: connection.id,
        sql: section.sql
      });
    } catch {
      return void 0;
    }
    if (result.ok || !result.error) {
      return void 0;
    }
    return new vscode11.Diagnostic(
      this.errorRange(document, section, result.error),
      this.errorMessage(result.error),
      vscode11.DiagnosticSeverity.Error
    );
  }
  findIdentifierRange(document, section, identifier) {
    const index = section.sql.toLowerCase().indexOf(identifier.toLowerCase());
    const start = section.start + Math.max(0, index);
    return new vscode11.Range(document.positionAt(start), document.positionAt(start + identifier.length));
  }
  collectCreatedRelationNames(document) {
    const relations = /* @__PURE__ */ new Set();
    const regex = /\bcreate\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
    const text = document.getText();
    let match;
    while ((match = regex.exec(text)) !== null) {
      const [schema, table] = this.splitQualified(match[1]);
      relations.add(table.toLowerCase());
      if (schema) {
        relations.add(this.relationKey(schema, table));
      }
    }
    return relations;
  }
  isScriptRelation(alias, scriptRelations) {
    if (scriptRelations.has(alias.table.toLowerCase())) {
      return !alias.schema || alias.schema.toLowerCase() === "pg_temp";
    }
    return alias.schema ? scriptRelations.has(this.relationKey(alias.schema, alias.table)) : false;
  }
  splitQualified(value) {
    const parts = value.split(".").map((part) => part.replace(/^"|"$/g, ""));
    return parts.length > 1 ? [parts[0], parts[1]] : [void 0, parts[0]];
  }
  errorRange(document, section, error) {
    const messageRange = this.errorIdentifierRange(document, section, error);
    if (messageRange) {
      return messageRange;
    }
    const offset = Number(error.position);
    if (Number.isFinite(offset) && offset > 0) {
      const explainPrefixLength = "explain ".length;
      const relative = Math.max(0, offset - 1 - explainPrefixLength);
      const start = Math.min(section.end, section.start + relative);
      return this.expandIdentifierRange(document, section, start);
    }
    return section.range;
  }
  errorIdentifierRange(document, section, error) {
    const column = error.message.match(/\bcolumn\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+does not exist/i)?.[1];
    if (!column) {
      return void 0;
    }
    const regex = new RegExp(`\\b${escapeRegExp2(column)}\\b`, "i");
    const match = regex.exec(section.sql);
    if (!match) {
      return void 0;
    }
    const start = section.start + match.index;
    return new vscode11.Range(document.positionAt(start), document.positionAt(start + column.length));
  }
  expandIdentifierRange(document, section, absoluteStart) {
    const sql = section.sql;
    const relative = Math.max(0, Math.min(sql.length, absoluteStart - section.start));
    let start = relative;
    let end = relative;
    while (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) {
      start -= 1;
    }
    while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
      end += 1;
    }
    if (start === end) {
      end = Math.min(sql.length, end + 1);
    }
    return new vscode11.Range(document.positionAt(section.start + start), document.positionAt(section.start + end));
  }
  errorMessage(error) {
    return [error.message, error.detail, error.hint].filter(Boolean).join("\n");
  }
  relationKey(schema, table) {
    return `${schema}.${table}`.toLowerCase();
  }
  collectCteNames(sections) {
    const names = /* @__PURE__ */ new Set();
    const visit = (section) => {
      if (section.kind === "cte" && section.name) {
        names.add(section.name.toLowerCase());
      }
      for (const child of section.children) {
        if (child.kind === "cte" && child.name) {
          names.add(child.name.toLowerCase());
        }
        visit({ ...child, aliases: [], tables: [] });
      }
    };
    for (const section of sections) {
      visit(section);
    }
    return names;
  }
  unqualifiedColumnIgnoreSet(section, columns, defaultSchema) {
    const ignored = new Set(SQL_COLUMN_CONTEXT_KEYWORDS);
    for (const alias of section.aliases) {
      ignored.add(alias.alias.toLowerCase());
      ignored.add(alias.table.toLowerCase());
      ignored.add((alias.schema ?? defaultSchema).toLowerCase());
    }
    for (const column of columns) {
      ignored.add(column.dataType.toLowerCase());
    }
    for (const alias of this.outputAliases(section.sql)) {
      ignored.add(alias.toLowerCase());
    }
    return ignored;
  }
  columnExpressionSpans(sql) {
    const spans = [];
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (select && from && from.index > select.index) {
      spans.push([select.index + select[0].length, from.index]);
    }
    for (const regex of [/\bwhere\b/gi, /\bhaving\b/gi, /\bgroup\s+by\b/gi, /\border\s+by\b/gi]) {
      for (const match of sql.matchAll(regex)) {
        if (match.index === void 0) {
          continue;
        }
        const start = match.index + match[0].length;
        spans.push([start, this.nextClauseIndex(sql, start)]);
      }
    }
    return spans;
  }
  nextClauseIndex(sql, start) {
    const match = /\b(?:where|group\s+by|order\s+by|having|limit|union|intersect|except)\b/i.exec(sql.slice(start));
    return match?.index === void 0 ? sql.length : start + match.index;
  }
  isQualifiedIdentifierPart(sql, start, length) {
    return sql.slice(0, start).trimEnd().endsWith(".") || sql.slice(start + length).trimStart().startsWith(".");
  }
  isTypeCastName(sql, start) {
    return sql.slice(0, start).trimEnd().endsWith("::");
  }
  isFunctionName(sql, end) {
    return sql.slice(end).trimStart().startsWith("(");
  }
  isAliasDeclaration(sql, start) {
    return /\bas\s+$/i.test(sql.slice(0, start));
  }
  outputAliases(sql) {
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (!select || !from || from.index <= select.index) {
      return [];
    }
    return [...sql.slice(select.index + select[0].length, from.index).matchAll(/\bas\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)].map((match) => match[1] ?? match[2]).filter((alias) => Boolean(alias));
  }
  isInsideSingleQuotedLiteral(sql, start) {
    let inside = false;
    for (let index = 0; index < start; index += 1) {
      if (sql[index] !== "'") {
        continue;
      }
      if (sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inside = !inside;
    }
    return inside;
  }
  isInLineComment(sql, start) {
    const lineStart = sql.lastIndexOf("\n", start - 1) + 1;
    const commentStart = sql.indexOf("--", lineStart);
    return commentStart >= 0 && commentStart < start;
  }
};
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/services/sqlParameterPrompt.ts
var vscode12 = __toESM(require("vscode"));
var SqlParameterPrompt = class {
  async resolve(sql) {
    const parameters = findSqlParameters(sql);
    const names = uniqueSqlParameterNames(parameters);
    if (!names.length) {
      return sql;
    }
    const values = await this.collectValues(sql, this.parameterRows(sql, parameters, names));
    return values ? applySqlParameterValues(sql, values) : void 0;
  }
  collectValues(sql, rows) {
    const panel = vscode12.window.createWebviewPanel(
      "databaseSqlParameters",
      "Parameters",
      vscode12.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false
      }
    );
    panel.webview.html = this.html(panel.webview, sql, rows);
    return new Promise((resolve) => {
      let settled = false;
      const subscriptions = [];
      const finish = (values) => {
        if (settled) {
          return;
        }
        settled = true;
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
        resolve(values);
        panel.dispose();
      };
      subscriptions.push(panel.webview.onDidReceiveMessage((message) => {
        if (message.type === "cancel") {
          finish(void 0);
          return;
        }
        if (message.type === "execute") {
          const values = message.values ?? {};
          const missing = rows.find((row) => values[row.name] === void 0 || values[row.name].trim() === "");
          if (!missing) {
            finish(values);
          }
        }
      }));
      subscriptions.push(panel.onDidDispose(() => finish(void 0)));
    });
  }
  parameterRows(sql, parameters, names) {
    return names.map((name) => {
      const parameter = parameters.find((item) => item.name === name);
      return {
        name,
        placeholder: parameter?.placeholder ?? `:${name}`,
        context: parameter ? this.contextPreview(sql, parameter) : ""
      };
    });
  }
  html(webview, sql, rows) {
    const nonce = Date.now().toString();
    const data = jsonForScript({ preview: this.sqlPreview(sql), rows });
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parameters</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: var(--vscode-editor-background, #1f1f1f);
      --panel: var(--vscode-quickInput-background, #252526);
      --border: var(--vscode-panel-border, #3c3c3c);
      --text: var(--vscode-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #9d9d9d);
      --accent: var(--vscode-focusBorder, #007fd4);
      --button: var(--vscode-button-background, #0e639c);
      --button-text: var(--vscode-button-foreground, #ffffff);
      --button-secondary: var(--vscode-button-secondaryBackground, #3a3d41);
      --input: var(--vscode-input-background, #1b1b1b);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 12px;
    }
    .dialog {
      width: min(560px, calc(100vw - 48px));
      border: 1px solid var(--border);
      background: var(--panel);
      box-shadow: 0 14px 36px rgb(0 0 0 / 0.42);
    }
    .titlebar {
      height: 28px;
      display: grid;
      grid-template-columns: 28px 1fr 28px;
      align-items: center;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 88%, white 12%);
    }
    .titlebar strong {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
    }
    .close {
      width: 28px;
      height: 28px;
      border: 0;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
    }
    .close:hover {
      color: var(--text);
      background: var(--button-secondary);
    }
    .content {
      padding: 10px;
    }
    .preview {
      margin-bottom: 8px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      table-layout: fixed;
    }
    th, td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
      text-align: left;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      background: color-mix(in srgb, var(--panel) 82%, black 18%);
    }
    th:first-child,
    td:first-child {
      width: 34%;
    }
    th:nth-child(2),
    td:nth-child(2) {
      width: 42%;
    }
    th:last-child,
    td:last-child {
      width: 24%;
    }
    .name {
      color: var(--text);
      font-family: var(--vscode-editor-font-family, monospace);
      font-weight: 600;
    }
    .context {
      color: var(--muted);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    input {
      width: 100%;
      height: 24px;
      border: 1px solid var(--border);
      outline: 0;
      color: var(--text);
      background: var(--input);
      padding: 3px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    input:focus {
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 10px;
    }
    button.action {
      min-width: 74px;
      height: 26px;
      border: 1px solid transparent;
      color: var(--button-text);
      background: var(--button);
      cursor: pointer;
      font-size: 12px;
    }
    button.secondary {
      color: var(--text);
      background: var(--button-secondary);
    }
    button:disabled {
      cursor: default;
      opacity: 0.45;
    }
  </style>
</head>
<body>
  <section class="dialog" role="dialog" aria-labelledby="parameter-title">
    <div class="titlebar">
      <span></span>
      <strong id="parameter-title">Parameters</strong>
      <button class="close" id="closeTop" title="Close" aria-label="Close">x</button>
    </div>
    <div class="content">
      <div class="preview" id="preview"></div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>SQL context</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="actions">
        <button class="action" id="execute" disabled>Execute</button>
        <button class="action secondary" id="closeBottom">Close</button>
      </div>
    </div>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${data};
    const preview = document.getElementById('preview');
    const tbody = document.getElementById('rows');
    const execute = document.getElementById('execute');
    preview.textContent = state.preview;
    tbody.innerHTML = state.rows.map((row) => (
      '<tr>' +
      '<td><span class="name">' + html(row.name) + '</span></td>' +
      '<td><div class="context" title="' + html(row.context) + '">' + html(row.context) + '</div></td>' +
      '<td><input data-name="' + html(row.name) + '" placeholder="&lt;null&gt;" autocomplete="off"></td>' +
      '</tr>'
    )).join('');
    const inputs = Array.from(tbody.querySelectorAll('input'));
    function html(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }
    function values() {
      return Object.fromEntries(inputs.map((input) => [input.dataset.name, input.value]));
    }
    function refresh() {
      execute.disabled = inputs.some((input) => input.value.trim() === '');
    }
    function cancel() {
      vscode.postMessage({ type: 'cancel' });
    }
    for (const input of inputs) {
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !execute.disabled) {
          vscode.postMessage({ type: 'execute', values: values() });
        }
      });
    }
    execute.addEventListener('click', () => {
      if (!execute.disabled) {
        vscode.postMessage({ type: 'execute', values: values() });
      }
    });
    document.getElementById('closeTop').addEventListener('click', cancel);
    document.getElementById('closeBottom').addEventListener('click', cancel);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        cancel();
      }
    });
    inputs[0]?.focus();
    refresh();
  </script>
</body>
</html>`;
  }
  contextPreview(sql, parameter) {
    const before = sql.slice(Math.max(0, parameter.start - 42), parameter.start).replace(/\s+/g, " ").trim();
    const after = sql.slice(parameter.end, Math.min(sql.length, parameter.end + 34)).replace(/\s+/g, " ").trim();
    return [before, parameter.placeholder, after].filter(Boolean).join(" ");
  }
  sqlPreview(sql) {
    const compact = sql.replace(/\s+/g, " ").trim();
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
  }
};
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// src/services/sqlSectionHighlighter.ts
var vscode13 = __toESM(require("vscode"));
var SqlSectionHighlighter = class {
  singleLineDecoration = vscode13.window.createTextEditorDecorationType({
    border: "1px solid",
    borderColor: new vscode13.ThemeColor("testing.iconPassed"),
    borderRadius: "3px",
    overviewRulerColor: new vscode13.ThemeColor("testing.iconPassed"),
    overviewRulerLane: vscode13.OverviewRulerLane.Right
  });
  firstLineDecoration = vscode13.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "1px 1px 0 1px",
    borderStyle: "solid",
    borderColor: new vscode13.ThemeColor("testing.iconPassed"),
    overviewRulerColor: new vscode13.ThemeColor("testing.iconPassed"),
    overviewRulerLane: vscode13.OverviewRulerLane.Right
  });
  middleLineDecoration = vscode13.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "0 1px",
    borderStyle: "solid",
    borderColor: new vscode13.ThemeColor("testing.iconPassed")
  });
  lastLineDecoration = vscode13.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "0 1px 1px 1px",
    borderStyle: "solid",
    borderColor: new vscode13.ThemeColor("testing.iconPassed"),
    borderRadius: "0 0 3px 3px"
  });
  activeRanges = /* @__PURE__ */ new Map();
  highlight(editor, range) {
    const targetRange = this.clampRange(editor.document, range);
    this.activeRanges.set(editor.document.uri.toString(), targetRange);
    this.applyDecorations(editor, targetRange);
  }
  async reveal(documentUri, range, expectedSql) {
    let document;
    try {
      document = await vscode13.workspace.openTextDocument(vscode13.Uri.parse(documentUri));
    } catch {
      void vscode13.window.showWarningMessage("Source SQL file no longer exists.");
      return void 0;
    }
    const editor = await vscode13.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode13.ViewColumn.Active
    });
    const targetRange = this.resolveRange(document, range, expectedSql);
    this.activeRanges.set(document.uri.toString(), targetRange);
    this.applyDecorations(editor, targetRange);
    editor.revealRange(targetRange, vscode13.TextEditorRevealType.InCenterIfOutsideViewport);
    return editor;
  }
  refreshVisibleEditors() {
    for (const editor of vscode13.window.visibleTextEditors) {
      const range = this.activeRanges.get(editor.document.uri.toString());
      this.applyDecorations(editor, range);
    }
  }
  clear(documentUri) {
    if (documentUri) {
      this.activeRanges.delete(documentUri);
    } else {
      this.activeRanges.clear();
    }
    this.refreshVisibleEditors();
  }
  dispose() {
    this.singleLineDecoration.dispose();
    this.firstLineDecoration.dispose();
    this.middleLineDecoration.dispose();
    this.lastLineDecoration.dispose();
  }
  applyDecorations(editor, range) {
    editor.setDecorations(this.singleLineDecoration, []);
    editor.setDecorations(this.firstLineDecoration, []);
    editor.setDecorations(this.middleLineDecoration, []);
    editor.setDecorations(this.lastLineDecoration, []);
    if (!range) {
      return;
    }
    if (range.start.line === range.end.line) {
      editor.setDecorations(this.singleLineDecoration, [range]);
      return;
    }
    const firstLine = editor.document.lineAt(range.start.line).range;
    const lastLine = editor.document.lineAt(range.end.line).range;
    const middleLines = [];
    for (let line = range.start.line + 1; line < range.end.line; line += 1) {
      middleLines.push(editor.document.lineAt(line).range);
    }
    editor.setDecorations(this.firstLineDecoration, [firstLine]);
    editor.setDecorations(this.middleLineDecoration, middleLines);
    editor.setDecorations(this.lastLineDecoration, [lastLine]);
  }
  resolveRange(document, range, expectedSql) {
    const direct = this.clampRange(document, range);
    const directText = document.getText(direct);
    if (!expectedSql || normalizeSql(directText) === normalizeSql(expectedSql)) {
      return direct;
    }
    const text = document.getText();
    const normalizedExpected = normalizeSql(expectedSql);
    const index = text.toLowerCase().indexOf(expectedSql.trim().toLowerCase());
    if (index >= 0) {
      return new vscode13.Range(document.positionAt(index), document.positionAt(index + expectedSql.trim().length));
    }
    for (const line of text.split(/\r?\n/).entries()) {
      if (normalizeSql(line[1]).includes(normalizedExpected.slice(0, 48))) {
        const start = new vscode13.Position(line[0], 0);
        return new vscode13.Range(start, start.translate(0, line[1].length));
      }
    }
    void vscode13.window.showWarningMessage("Source SQL range changed; showing the last known location.");
    return direct;
  }
  clampRange(document, range) {
    const maxLine = Math.max(0, document.lineCount - 1);
    const startLine = Math.min(Math.max(0, range.startLine), maxLine);
    const endLine = Math.min(Math.max(startLine, range.endLine), maxLine);
    const startColumn = Math.min(Math.max(0, range.startColumn), document.lineAt(startLine).text.length);
    const endColumn = Math.min(Math.max(0, range.endColumn), document.lineAt(endLine).text.length);
    return new vscode13.Range(
      new vscode13.Position(startLine, startColumn),
      new vscode13.Position(endLine, endColumn)
    );
  }
};
function rangeFromPlain(range) {
  return new vscode13.Range(
    new vscode13.Position(range.startLine, range.startColumn),
    new vscode13.Position(range.endLine, range.endColumn)
  );
}
function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

// src/services/sqlSectionService.ts
var vscode15 = __toESM(require("vscode"));

// src/services/sqlQueryTreeService.ts
var vscode14 = __toESM(require("vscode"));
var SqlQueryTreeService = class {
  getTree(document) {
    const text = document.getText();
    const counter = { value: 0 };
    return splitSqlStatements(text).map((statement) => {
      const sql = text.slice(statement.start, statement.end);
      const range = new vscode14.Range(document.positionAt(statement.start), document.positionAt(statement.end));
      const index = counter.value;
      counter.value += 1;
      const node = {
        id: this.nodeId(document.uri.toString(), "statement", statement.start, statement.end),
        index,
        kind: "statement",
        sql,
        range,
        start: statement.start,
        end: statement.end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      node.children = this.parseChildren(document, sql, statement.start, counter);
      return node;
    });
  }
  findNode(document, selection) {
    const roots = this.getTree(document);
    if (!roots.length) {
      return void 0;
    }
    if (!selection.isEmpty) {
      const trimmed = this.trimRange(document, selection);
      if (trimmed.isEmpty) {
        return void 0;
      }
      return this.findSmallestContainingNode(roots, document.offsetAt(trimmed.start), document.offsetAt(trimmed.end));
    }
    const offset = document.offsetAt(selection.active);
    const token = this.wordAt(document.getText(), offset);
    const root = roots.find((node) => offset >= node.start && offset <= node.end);
    if (root && token) {
      const cte = this.findReferencedCte(root, token);
      if (cte) {
        return cte;
      }
    }
    return this.findSmallestContainingNode(roots, offset, offset);
  }
  findExecutableNode(document, selection) {
    const node = this.findNode(document, selection);
    if (!node) {
      return void 0;
    }
    if (node.kind !== "cte") {
      return node;
    }
    return this.getTree(document).find((root) => node.start >= root.start && node.end <= root.end);
  }
  getRootNodes(document) {
    return this.getTree(document);
  }
  getSyntaxIssues(document) {
    const text = document.getText();
    const issues = [];
    const stack = [];
    let single = false;
    let double = false;
    let lineComment = false;
    let blockCommentStart;
    let dollarTag;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        continue;
      }
      if (blockCommentStart !== void 0) {
        if (char === "*" && next === "/") {
          blockCommentStart = void 0;
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = void 0;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        blockCommentStart = i;
        i += 1;
        continue;
      }
      if (char === "'") {
        single = true;
        continue;
      }
      if (char === '"') {
        double = true;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (char === "(") {
        stack.push(i);
      } else if (char === ")") {
        const open = stack.pop();
        if (open === void 0) {
          issues.push({
            message: "Unexpected closing parenthesis.",
            range: new vscode14.Range(document.positionAt(i), document.positionAt(i + 1))
          });
        }
      }
    }
    for (const open of stack) {
      issues.push({
        message: "Missing closing parenthesis.",
        range: new vscode14.Range(document.positionAt(open), document.positionAt(open + 1))
      });
    }
    if (single) {
      issues.push(this.endOfDocumentIssue(document, "Unterminated string literal."));
    }
    if (double) {
      issues.push(this.endOfDocumentIssue(document, "Unterminated quoted identifier."));
    }
    if (blockCommentStart !== void 0) {
      issues.push({
        message: "Unterminated block comment.",
        range: new vscode14.Range(document.positionAt(blockCommentStart), document.positionAt(blockCommentStart + 2))
      });
    }
    if (dollarTag) {
      issues.push(this.endOfDocumentIssue(document, `Unterminated dollar quote ${dollarTag}.`));
    }
    issues.push(...this.getIncompleteBetweenIssues(document));
    issues.push(...this.getDanglingClauseIssues(document));
    return issues;
  }
  parseChildren(document, text, baseOffset, counter) {
    const children = [];
    let i = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    while (i < text.length) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        i += 1;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length;
          dollarTag = void 0;
        } else {
          i += 1;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 2;
        } else if (char === "'") {
          single = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 2;
        } else if (char === '"') {
          double = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 2;
        continue;
      }
      if (char === "'") {
        single = true;
        i += 1;
        continue;
      }
      if (char === '"') {
        double = true;
        i += 1;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length;
          continue;
        }
      }
      const withMatch = this.matchWord(text, i, "with");
      if (withMatch) {
        const parsed = this.parseWithClause(document, text, baseOffset, i, counter);
        if (parsed) {
          children.push(...parsed.nodes);
          i = parsed.nextIndex;
          continue;
        }
      }
      if (char === "(") {
        const close2 = this.findMatchingParen(text, i);
        if (close2 > i) {
          const inner = text.slice(i + 1, close2);
          const trimmed = this.trimBounds(inner, 0, inner.length);
          if (trimmed) {
            const innerSql = inner.slice(trimmed.start, trimmed.end);
            if (this.isQueryStart(innerSql)) {
              const start = baseOffset + i + 1 + trimmed.start;
              const end = baseOffset + i + 1 + trimmed.end;
              const child = {
                id: this.nodeId(document.uri.toString(), "subquery", start, end),
                index: counter.value += 1,
                kind: "subquery",
                sql: innerSql,
                range: new vscode14.Range(document.positionAt(start), document.positionAt(end)),
                start,
                end,
                children: [],
                aliasNames: this.extractAliases(innerSql)
              };
              child.children = this.parseChildren(document, innerSql, start, counter);
              children.push(child);
            }
          }
          const nestedBaseOffset = baseOffset + i + 1;
          const nestedChildren = this.parseChildren(document, inner, nestedBaseOffset, counter).filter((child) => !children.some((existing) => existing.start === child.start && existing.end === child.end));
          children.push(...nestedChildren);
          i = close2 + 1;
          continue;
        }
      }
      i += 1;
    }
    return children;
  }
  parseWithClause(document, text, baseOffset, withIndex, counter) {
    let i = withIndex + 4;
    i = this.skipWhitespace(text, i);
    if (this.matchWord(text, i, "recursive")) {
      i += "recursive".length;
      i = this.skipWhitespace(text, i);
    }
    const nodes = [];
    while (i < text.length) {
      i = this.skipWhitespace(text, i);
      const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*|"[^"]+"/);
      if (!nameMatch) {
        break;
      }
      const name = this.stripQuotes(nameMatch[0]);
      const nameStart = i;
      i += nameMatch[0].length;
      i = this.skipWhitespace(text, i);
      if (text[i] === "(") {
        const columnsClose = this.findMatchingParen(text, i);
        if (columnsClose > i) {
          i = columnsClose + 1;
          i = this.skipWhitespace(text, i);
        }
      }
      if (!this.matchWord(text, i, "as")) {
        break;
      }
      i += 2;
      i = this.skipWhitespace(text, i);
      if (text[i] !== "(") {
        break;
      }
      const open = i;
      const close2 = this.findMatchingParen(text, open);
      if (close2 <= open) {
        break;
      }
      const nodeStart = nameStart;
      const nodeEnd = close2 + 1;
      const sql = text.slice(nodeStart, nodeEnd);
      const start = baseOffset + nodeStart;
      const end = baseOffset + nodeEnd;
      const node = {
        id: this.nodeId(document.uri.toString(), "cte", start, end, name),
        index: counter.value += 1,
        kind: "cte",
        name,
        sql,
        range: new vscode14.Range(document.positionAt(start), document.positionAt(end)),
        start,
        end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      const body = text.slice(open + 1, close2);
      node.children = this.parseChildren(document, body, baseOffset + open + 1, counter);
      nodes.push(node);
      i = close2 + 1;
      i = this.skipWhitespace(text, i);
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      break;
    }
    return nodes.length ? { nodes, nextIndex: i } : void 0;
  }
  findSmallestContainingNode(nodes, startOffset, endOffset) {
    const flat = this.flatten(nodes).filter((node) => startOffset >= node.start && endOffset <= node.end);
    if (!flat.length) {
      return nodes.find((node) => startOffset >= node.start && endOffset <= node.end);
    }
    flat.sort((a, b) => a.end - a.start - (b.end - b.start));
    return flat[0];
  }
  flatten(nodes) {
    const flat = [];
    for (const node of nodes) {
      flat.push(node);
      flat.push(...this.flatten(node.children));
    }
    return flat;
  }
  findReferencedCte(root, token) {
    const tokenLower = token.toLowerCase();
    return this.flatten(root.children).find((node) => node.kind === "cte" && node.name?.toLowerCase() === tokenLower);
  }
  extractAliases(sql) {
    return extractSqlAliases(sql).filter((alias) => alias.explicitAlias).map((alias) => alias.alias);
  }
  matchWord(text, index, word) {
    const slice = text.slice(index, index + word.length);
    if (slice.toLowerCase() !== word.toLowerCase()) {
      return false;
    }
    const before = index > 0 ? text[index - 1] : "";
    const after = text[index + word.length] ?? "";
    return !this.isWordChar(before) && !this.isWordChar(after);
  }
  isQueryStart(sql) {
    return /^(with|select|values|insert|update|delete)\b/i.test(sql.trim());
  }
  wordAt(text, offset) {
    let start = offset;
    let end = offset;
    while (start > 0 && this.isWordChar(text[start - 1])) {
      start -= 1;
    }
    while (end < text.length && this.isWordChar(text[end])) {
      end += 1;
    }
    const word = text.slice(start, end).trim();
    return word || void 0;
  }
  findMatchingParen(text, openIndex) {
    let depth = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    for (let i = openIndex; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = void 0;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 1;
        continue;
      }
      if (char === "'") {
        single = true;
        continue;
      }
      if (char === '"') {
        double = true;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }
  trimBounds(text, start, end) {
    let nextStart = start;
    let nextEnd = end;
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
      nextStart += 1;
    }
    while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
      nextEnd -= 1;
    }
    return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : void 0;
  }
  trimRange(document, range) {
    const text = document.getText(range);
    const trimmed = this.trimBounds(text, 0, text.length);
    if (!trimmed) {
      return new vscode14.Range(range.start, range.start);
    }
    const base = document.offsetAt(range.start);
    return new vscode14.Range(document.positionAt(base + trimmed.start), document.positionAt(base + trimmed.end));
  }
  skipWhitespace(text, index) {
    let i = index;
    while (i < text.length && /\s/.test(text[i])) {
      i += 1;
    }
    return i;
  }
  isWordChar(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
  }
  stripQuotes(value) {
    return value.replace(/^"|"$/g, "");
  }
  getDanglingClauseIssues(document) {
    const text = document.getText();
    const issues = [];
    for (const statement of splitSqlStatements(text)) {
      const tokens = this.wordTokens(text, statement.start, statement.end, { includeQuotedIdentifiers: true });
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const word = token.word.toLowerCase();
        if (!["from", "join", "update", "into"].includes(word)) {
          continue;
        }
        const next = tokens[index + 1]?.word.toLowerCase();
        if (!next || this.isClauseBoundary(next)) {
          issues.push({
            message: `Expected a table name after ${word.toUpperCase()}.`,
            range: new vscode14.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
        }
      }
    }
    return issues;
  }
  getIncompleteBetweenIssues(document) {
    const text = document.getText();
    const issues = [];
    for (const statement of splitSqlStatements(text)) {
      const tokens = this.wordTokens(text, statement.start, statement.end, { includeQuotedValues: true });
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.word.toLowerCase() !== "between") {
          continue;
        }
        const lowerBound = tokens[index + 1]?.word.toLowerCase();
        if (!lowerBound || lowerBound === "and" || this.isBetweenBoundary(lowerBound)) {
          issues.push({
            message: "BETWEEN requires a lower bound and an AND upper bound.",
            range: new vscode14.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
          continue;
        }
        const andIndex = this.findBetweenAnd(tokens, index + 2);
        if (andIndex < 0) {
          issues.push({
            message: "BETWEEN requires an AND upper bound.",
            range: new vscode14.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
          continue;
        }
        const upperBound = tokens[andIndex + 1]?.word.toLowerCase();
        if (!upperBound || upperBound === "and" || this.isBetweenBoundary(upperBound)) {
          issues.push({
            message: "BETWEEN requires an upper bound after AND.",
            range: new vscode14.Range(document.positionAt(tokens[andIndex].start), document.positionAt(tokens[andIndex].end))
          });
        }
      }
    }
    return issues;
  }
  findBetweenAnd(tokens, startIndex) {
    for (let index = startIndex; index < tokens.length; index += 1) {
      const word = tokens[index].word.toLowerCase();
      if (word === "and") {
        return index;
      }
      if (this.isBetweenBoundary(word)) {
        return -1;
      }
    }
    return -1;
  }
  wordTokens(text, start, end, options = {}) {
    const tokens = [];
    let i = start;
    let lineComment = false;
    let blockComment = false;
    while (i < end) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        lineComment = char !== "\n";
        i += 1;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 2;
        continue;
      }
      if (char === "'") {
        const tokenStart = i;
        i += 1;
        while (i < end) {
          if (text[i] === "'" && text[i + 1] === "'") {
            i += 2;
          } else if (text[i] === "'") {
            i += 1;
            break;
          } else {
            i += 1;
          }
        }
        if (options.includeQuotedValues) {
          tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        }
        continue;
      }
      if (char === '"') {
        const tokenStart = i;
        i += 1;
        while (i < end) {
          if (text[i] === '"' && text[i + 1] === '"') {
            i += 2;
          } else if (text[i] === '"') {
            i += 1;
            break;
          } else {
            i += 1;
          }
        }
        if (options.includeQuotedValues || options.includeQuotedIdentifiers) {
          tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        }
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          const tokenStart = i;
          const tag = match[0];
          const close2 = text.indexOf(tag, i + tag.length);
          i = close2 >= 0 ? close2 + tag.length : end;
          if (options.includeQuotedValues) {
            tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
          }
          continue;
        }
      }
      if (this.isWordChar(char)) {
        const tokenStart = i;
        while (i < end && this.isWordChar(text[i])) {
          i += 1;
        }
        tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        continue;
      }
      i += 1;
    }
    return tokens;
  }
  isBetweenBoundary(word) {
    return [
      "or",
      "when",
      "then",
      "else",
      "end"
    ].includes(word) || this.isClauseBoundary(word);
  }
  isClauseBoundary(word) {
    return [
      "where",
      "group",
      "order",
      "limit",
      "having",
      "union",
      "intersect",
      "except",
      "join",
      "left",
      "right",
      "inner",
      "outer",
      "full",
      "cross",
      "on",
      "using",
      "set",
      "values",
      "returning"
    ].includes(word);
  }
  endOfDocumentIssue(document, message) {
    const end = document.positionAt(document.getText().length);
    return {
      message,
      range: new vscode14.Range(end, end)
    };
  }
  nodeId(documentUri, kind, start, end, name) {
    return `${documentUri}:${kind}:${start}-${end}${name ? `:${name}` : ""}`;
  }
};

// src/services/sqlSectionService.ts
var SqlSectionService = class {
  treeService = new SqlQueryTreeService();
  getSections(document) {
    return this.treeService.getRootNodes(document).map((node) => this.toSection(node));
  }
  getTree(document) {
    return this.treeService.getTree(document).map((node) => this.toSection(node));
  }
  detect(document, selection) {
    const node = this.treeService.findNode(document, selection);
    return node ? this.toSection(node) : void 0;
  }
  detectExecutable(document, selection) {
    const node = this.treeService.findExecutableNode(document, selection);
    return node ? this.toSection(node) : void 0;
  }
  getSyntaxIssues(document) {
    return this.treeService.getSyntaxIssues(document).map((issue) => new vscode15.Diagnostic(
      issue.range,
      issue.message,
      vscode15.DiagnosticSeverity.Error
    ));
  }
  outline(document) {
    return this.getSections(document).map((section) => new vscode15.SymbolInformation(
      section.kind === "cte" && section.name ? `CTE ${section.name}` : `SQL section ${section.index + 1}`,
      vscode15.SymbolKind.Function,
      section.sql.replace(/\s+/g, " ").slice(0, 80),
      new vscode15.Location(document.uri, section.range)
    ));
  }
  extractAliases(sql) {
    return extractSqlAliases(sql);
  }
  extractTables(sql) {
    return this.extractAliases(sql).map(({ schema, table }) => ({ schema, table }));
  }
  toSection(node) {
    return {
      ...node,
      aliases: this.extractAliases(node.sql),
      tables: this.extractTables(node.sql)
    };
  }
};

// src/services/sqlSelectionExecution.ts
function shouldRunSelectionForStatement(selected, statementRange) {
  return selected.some((selection) => rangesOverlap(selection.range, statementRange) && looksExecutableSelection(selection.sql));
}
function looksExecutableSelection(sql) {
  const text = sql.trim();
  return /^(select|with|begin|commit|rollback|lock|create|alter|drop|insert|update|delete|merge|analyze|explain|grant|revoke|truncate|call)\b/i.test(text) || /;\s*\S/.test(text);
}
function rangesOverlap(a, b) {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}
function comparePositions(a, b) {
  return a.line - b.line || a.character - b.character;
}

// src/ai/vsCodeLanguageModelSqlAdapter.ts
var vscode16 = __toESM(require("vscode"));

// src/ai/queryMemorySummaryParser.ts
function parseQueryMemorySummaryText(text) {
  const json = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The language model did not return valid summary JSON.");
  }
  const maybe = parsed;
  if (typeof maybe.title !== "string" || typeof maybe.summary !== "string") {
    throw new Error("The language model summary is missing title or summary.");
  }
  return {
    title: maybe.title.trim().slice(0, 80),
    summary: maybe.summary.trim().slice(0, 300),
    tables: Array.isArray(maybe.tables) ? maybe.tables.filter((value) => typeof value === "string").slice(0, 20) : [],
    columns: Array.isArray(maybe.columns) ? maybe.columns.filter((value) => typeof value === "string").slice(0, 40) : []
  };
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The language model did not return summary JSON.");
  }
  return candidate.slice(start, end + 1);
}

// src/ai/vsCodeLanguageModelSqlAdapter.ts
var VsCodeLanguageModelSqlAdapter = class {
  async isAvailable() {
    const settings = this.settings();
    if (settings.provider === "openAiCompatible") {
      return !!(settings.openAiCompatibleBaseUrl && settings.openAiCompatibleModel && this.openAiCompatibleApiKey(settings));
    }
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      return false;
    }
    try {
      const models = await this.selectVsCodeLanguageModels(settings);
      return models.length > 0;
    } catch {
      return false;
    }
  }
  async send(request) {
    const prompt = this.prompt(request);
    const text = await this.sendRaw(prompt);
    const sql = this.extractSql(text);
    if (!sql.trim()) {
      throw new Error("The language model did not return SQL.");
    }
    return sql;
  }
  async summarizeQueryMemory(request) {
    const text = await this.sendRaw(this.summaryPrompt(request));
    return this.parseSummary(text);
  }
  async adviseTablePerformance(request) {
    const text = await this.sendRaw(this.tablePerformancePrompt(request));
    return this.parseTablePerformanceAdvice(text);
  }
  async annotateQueryPlan(request) {
    const text = await this.sendRaw(this.queryPlanPrompt(request));
    return this.parseQueryPlanAdvice(text);
  }
  async summarizeDataProfile(request) {
    const text = await this.sendRaw(this.dataProfilePrompt(request));
    return this.parseDataProfileNarrative(text);
  }
  prompt(request) {
    const schema = request.relevantSchema.tables.map((table) => {
      const columns = table.columns?.map((column) => `${column.name} ${column.dataType}${column.nullable ? "" : " not null"}`).join(", ");
      return `${table.schema}.${table.name}${columns ? ` (${columns})` : ""}`;
    }).join("\n");
    return [
      "You are helping write PostgreSQL/Redshift SQL inside VS Code.",
      "Return only SQL or concise SQL comments plus SQL. Do not execute anything.",
      `Action: ${request.action}`,
      request.selectedSql ? `Selected SQL:
${request.selectedSql}` : "",
      request.lastError ? `Last error:
${request.lastError}` : "",
      `Visible database context: ${request.relevantSchema.connectionName ?? "connection"} ${request.relevantSchema.databaseName ?? ""}`,
      `Schema:
${schema || "(no schema metadata available)"}`
    ].filter(Boolean).join("\n\n");
  }
  async sendRaw(prompt) {
    const settings = this.settings();
    if (settings.provider === "openAiCompatible") {
      return this.sendOpenAiCompatible(prompt, settings);
    }
    return this.sendVsCodeLanguageModel(prompt, settings);
  }
  async sendVsCodeLanguageModel(prompt, settings = this.settings()) {
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      throw new Error("VS Code Language Model API is not available.");
    }
    const model = (await this.selectVsCodeLanguageModels(settings))[0];
    if (!model) {
      throw new Error("No VS Code language model is available.");
    }
    const messages = [
      vscode16.LanguageModelChatMessage?.User(prompt) ?? { role: "user", content: prompt }
    ];
    const response = await model.sendRequest(messages, {}, new vscode16.CancellationTokenSource().token);
    let text = "";
    for await (const chunk3 of response.text) {
      text += chunk3;
    }
    return text;
  }
  async selectVsCodeLanguageModels(settings = this.settings()) {
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      return [];
    }
    const preferredVendor = settings.vscodeLanguageModelVendor.trim();
    if (preferredVendor) {
      const preferred = await lm2.selectChatModels({ vendor: preferredVendor });
      if (preferred.length) {
        return preferred;
      }
    }
    return lm2.selectChatModels();
  }
  async sendOpenAiCompatible(prompt, settings = this.settings()) {
    const apiKey = this.openAiCompatibleApiKey(settings);
    if (!settings.openAiCompatibleBaseUrl || !settings.openAiCompatibleModel || !apiKey) {
      throw new Error("OpenAI-compatible AI settings require base URL, model, and API key.");
    }
    const endpoint = this.openAiCompatibleEndpoint(settings.openAiCompatibleBaseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.openAiCompatibleModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI-compatible model request failed (${response.status}): ${text.slice(0, 300)}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("OpenAI-compatible model did not return JSON.");
    }
    const content = this.openAiCompatibleContent(json);
    if (!content.trim()) {
      throw new Error("OpenAI-compatible model returned an empty response.");
    }
    return content;
  }
  summaryPrompt(request) {
    return [
      "Summarize this SQL query for local query-memory search inside VS Code.",
      'Return only JSON with this shape: {"title":"short title","summary":"one sentence","tables":["schema.table"],"columns":["table.column"]}.',
      "Do not include result row values. Do not include secrets.",
      `Connection: ${request.connectionName ?? "connection"} ${request.databaseName ?? ""} ${request.databaseType ?? ""}`,
      request.outputColumns?.length ? `Output columns: ${request.outputColumns.join(", ")}` : "",
      request.errorMessage ? `Execution error: ${request.errorMessage}` : "",
      `SQL:
${request.sql}`
    ].filter(Boolean).join("\n\n");
  }
  tablePerformancePrompt(request) {
    return [
      "You are a PostgreSQL and Amazon Redshift performance advisor inside VS Code.",
      'Return only JSON with this exact shape: {"findings":["..."],"recommendations":[{"kind":"sortkey|distkey|index|partition|vacuum|analyze","impact":"high|medium|low","rationale":"...","ddl":"..."}]}.',
      "Use only the supplied DDL, table stats, deterministic flags, and workload summary. Do not invent columns, indexes, or runtime facts not present in the input.",
      "Never suggest auto-executing DDL. DDL must be ready to paste into a SQL editor for user review.",
      `Connection: ${request.connectionName ?? "connection"} ${request.databaseName ?? ""} ${request.databaseType}`,
      `Table: ${request.schema}.${request.table}`,
      `DDL:
${request.tableDdl}`,
      `Stats JSON:
${JSON.stringify(request.stats, null, 2)}`,
      `Deterministic flags JSON:
${JSON.stringify(request.prepassFlags, null, 2)}`,
      `Workload summary JSON:
${JSON.stringify({
        queryCount: request.workload.queryCount,
        totalRunCount: request.workload.totalRunCount,
        totalDurationMs: request.workload.totalDurationMs,
        columns: request.workload.columns,
        topQueries: request.workload.topQueries.map((query) => ({
          title: query.title,
          runCount: query.runCount,
          durationMs: query.durationMs,
          sql: query.sql.slice(0, 1600)
        }))
      }, null, 2)}`
    ].filter(Boolean).join("\n\n");
  }
  queryPlanPrompt(request) {
    return [
      "You are a PostgreSQL and Amazon Redshift query-plan advisor inside VS Code.",
      'Return only JSON with this exact shape: {"findings":["..."],"annotations":[{"nodeId":"plan.1","severity":"high|medium|low","message":"...","suggestion":"..."}],"rewrittenSql":"optional rewritten SQL"}.',
      "Use only the supplied SQL and plan. Do not invent schema objects. Keep suggestions actionable and concise.",
      "Focus on hot nodes: sequential scans over large relations, bad nested loops, expensive sorts, hash joins with large row estimates, and stale statistics symptoms.",
      `Connection: ${request.connectionName ?? "connection"} ${request.databaseName ?? ""} ${request.databaseType}`,
      `SQL:
${request.sql}`,
      `Plan JSON:
${JSON.stringify(request.plan, null, 2)}`
    ].filter(Boolean).join("\n\n");
  }
  dataProfilePrompt(request) {
    return [
      "You are summarizing a sampled database table profile inside VS Code.",
      'Return only JSON with this exact shape: {"summary":"one sentence","anomalies":["..."]}.',
      "Use only the supplied sample profile. Do not claim exact full-table facts unless the sample says so.",
      `Connection: ${request.connectionName ?? "connection"} ${request.databaseName ?? ""} ${request.databaseType}`,
      `Table: ${request.schema}.${request.table}`,
      `Sample rows: ${request.sampleRows}`,
      `Column profiles JSON:
${JSON.stringify(request.columns, null, 2)}`
    ].filter(Boolean).join("\n\n");
  }
  parseSummary(text) {
    return parseQueryMemorySummaryText(text);
  }
  parseTablePerformanceAdvice(text) {
    const parsed = JSON.parse(this.extractJson(text));
    const findings = Array.isArray(parsed.findings) ? parsed.findings.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 12) : [];
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.map((item) => item).flatMap((item) => {
      const kind = this.validRecommendationKind(item.kind);
      const impact = this.validImpact(item.impact);
      const rationale = typeof item.rationale === "string" ? item.rationale.trim() : "";
      const ddl = typeof item.ddl === "string" ? item.ddl.trim() : "";
      return kind && impact && rationale && ddl ? [{ kind, impact, rationale, ddl }] : [];
    }).slice(0, 12) : [];
    return { findings, recommendations };
  }
  parseQueryPlanAdvice(text) {
    const parsed = JSON.parse(this.extractJson(text));
    const findings = Array.isArray(parsed.findings) ? parsed.findings.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 12) : [];
    const annotations = Array.isArray(parsed.annotations) ? parsed.annotations.flatMap((item) => {
      const record = item;
      const severity = this.validPlanSeverity(record.severity);
      const message = typeof record.message === "string" ? record.message.trim() : "";
      const suggestion = typeof record.suggestion === "string" ? record.suggestion.trim() : void 0;
      const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : void 0;
      return severity && message ? [{ nodeId, severity, message, suggestion }] : [];
    }).slice(0, 20) : [];
    const rewrittenSql = typeof parsed.rewrittenSql === "string" && parsed.rewrittenSql.trim() ? parsed.rewrittenSql.trim() : void 0;
    return { findings, annotations, rewrittenSql };
  }
  parseDataProfileNarrative(text) {
    const parsed = JSON.parse(this.extractJson(text));
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 500) : "Profile generated from sampled rows.",
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 12) : []
    };
  }
  languageModelNamespace() {
    return vscode16.lm;
  }
  extractSql(text) {
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    return (fenced?.[1] ?? text).trim();
  }
  extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("The language model did not return JSON.");
    }
    return candidate.slice(start, end + 1);
  }
  settings() {
    const config = vscode16.workspace.getConfiguration("database");
    const provider = config.get("ai.provider", "vscodeLanguageModel") === "openAiCompatible" ? "openAiCompatible" : "vscodeLanguageModel";
    const legacyVendor = config.get("ai.copilot.vendor", "copilot");
    return {
      provider,
      vscodeLanguageModelVendor: config.get("ai.vscodeLanguageModel.vendor", legacyVendor).trim(),
      openAiCompatibleBaseUrl: config.get("ai.openAiCompatible.baseUrl", "").trim(),
      openAiCompatibleModel: config.get("ai.openAiCompatible.model", "").trim(),
      openAiCompatibleApiKey: config.get("ai.openAiCompatible.apiKey", "").trim(),
      openAiCompatibleApiKeyEnvVar: config.get("ai.openAiCompatible.apiKeyEnvVar", "DATABASE_AI_API_KEY").trim()
    };
  }
  openAiCompatibleApiKey(settings = this.settings()) {
    return settings.openAiCompatibleApiKey || (settings.openAiCompatibleApiKeyEnvVar ? process.env[settings.openAiCompatibleApiKeyEnvVar]?.trim() ?? "" : "");
  }
  openAiCompatibleEndpoint(baseUrl) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
  }
  openAiCompatibleContent(value) {
    const record = value;
    const first = record.choices?.[0];
    const content = first?.message?.content ?? first?.text;
    return typeof content === "string" ? content : "";
  }
  validImpact(value) {
    return value === "high" || value === "medium" || value === "low" ? value : void 0;
  }
  validPlanSeverity(value) {
    return value === "high" || value === "medium" || value === "low" ? value : void 0;
  }
  validRecommendationKind(value) {
    return value === "sortkey" || value === "distkey" || value === "index" || value === "partition" || value === "vacuum" || value === "analyze" ? value : void 0;
  }
};

// src/controllers/queryMemoryController.ts
var vscode17 = __toESM(require("vscode"));
var QueryMemoryController = class {
  constructor(context, memory, connectionManager, executor, ai, addResultTab) {
    this.context = context;
    this.memory = memory;
    this.connectionManager = connectionManager;
    this.executor = executor;
    this.ai = ai;
    this.addResultTab = addResultTab;
  }
  safety = new SqlSafetyClassifier();
  register(register) {
    register("database.findPastQuery", () => this.findPastQuery());
    register("database.backfillQueryMemorySummaries", () => this.backfillSummaries());
  }
  async findPastQuery() {
    const query = await vscode17.window.showInputBox({
      prompt: "Find past query",
      placeHolder: "duplicate invoices, monthly churn, customer email last_login"
    });
    if (query === void 0) {
      return;
    }
    const connection = this.connectionManager.getPreferredConnection();
    const results = await this.memory.search({
      query,
      connectionId: connection?.id,
      limit: 20,
      includeFailed: true
    });
    if (!results.length) {
      void vscode17.window.showInformationMessage("No matching query memory found.");
      return;
    }
    const picked = await vscode17.window.showQuickPick(results.map((result) => this.toPick(result)), {
      placeHolder: "Query memory results",
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!picked) {
      return;
    }
    await this.handleAction(picked.result);
  }
  async handleAction(result) {
    const item = result.item;
    const safety = this.safety.classify(item.sql, { production: this.connectionManager.getConnection(item.connectionId ?? "")?.production });
    const aiAvailable = await this.ai.isAvailable();
    const actions = [
      { label: "Open SQL", action: "open" },
      { label: "Copy SQL", action: "copy" },
      aiAvailable ? { label: "Explain", action: "explain" } : void 0,
      aiAvailable ? { label: "Modify...", action: "modify" } : void 0,
      safety.previewAvailable ? { label: "Preview Safety SQL", action: "preview" } : void 0,
      { label: safety.requiresConfirmation ? "Run with Safety Check" : "Run", action: "run" }
    ].filter((action) => action !== void 0);
    const picked = await vscode17.window.showQuickPick(actions, {
      placeHolder: [item.title ?? "Query memory", safety.reasons.join(" ")].filter(Boolean).join(" - ")
    });
    if (!picked) {
      return;
    }
    if (picked.action === "open") {
      await this.openSql(item.sql, item.title ?? "Query Memory");
    } else if (picked.action === "copy") {
      await vscode17.env.clipboard.writeText(item.sql);
    } else if (picked.action === "explain") {
      await this.openAiResult("Explain Query", await this.ai.send({ action: "explain", selectedSql: item.sql, relevantSchema: { tables: [] } }));
    } else if (picked.action === "modify") {
      const instruction = await vscode17.window.showInputBox({ prompt: "How should this query change?" });
      if (instruction) {
        await this.openAiResult("Modified Query", await this.ai.send({ action: "generate", selectedSql: item.sql, lastError: instruction, relevantSchema: { tables: [] } }));
      }
    } else if (picked.action === "preview") {
      const preview = this.safety.previewSql(item.sql, item.databaseType);
      if (preview) {
        await this.openSql(preview, "Query Safety Preview");
      }
    } else if (picked.action === "run") {
      await this.run(item.sql, item.connectionId);
    }
  }
  async run(sql, connectionId) {
    const connection = connectionId ? this.connectionManager.getConnection(connectionId) : this.connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode17.window.showInformationMessage("Select a database connection before running query memory SQL.");
      return;
    }
    const tab = await this.executor.execute({ connectionId: connection.id, sql });
    await this.addResultTab(tab);
  }
  async backfillSummaries() {
    if (!await this.ai.isAvailable()) {
      void vscode17.window.showInformationMessage("Query memory summaries need a VS Code language model provider or configured database.ai.openAiCompatible settings.");
      return;
    }
    await vscode17.window.withProgress({
      location: vscode17.ProgressLocation.Notification,
      title: "Summarizing query memory",
      cancellable: true
    }, async (_progress, token) => {
      const result = await this.memory.backfillSummaries({ limit: 25, token });
      void vscode17.window.showInformationMessage(`Query memory backfill: ${result.succeeded} summarized, ${result.failed} failed, ${result.skipped} skipped.`);
    });
  }
  toPick(result) {
    const item = result.item;
    const title = item.title ?? item.sql.replace(/\s+/g, " ").slice(0, 80);
    const meta = [
      item.connectionName ?? item.databaseName,
      item.status,
      item.runCount && item.runCount > 1 ? `${item.runCount} runs` : void 0,
      item.rowCount !== void 0 ? `${item.rowCount} rows` : void 0,
      item.executedAt ? new Date(item.executedAt).toLocaleString() : void 0
    ].filter(Boolean).join(" - ");
    return {
      label: title,
      description: `${Math.round(result.score)} pts${result.safety.risk !== "safe" ? ` - ${result.safety.risk}` : ""}`,
      detail: [item.summary, meta, result.reasons.join(", "), item.sql.replace(/\s+/g, " ").slice(0, 180)].filter(Boolean).join("\n"),
      result
    };
  }
  async openSql(sql, title) {
    const doc = await vscode17.workspace.openTextDocument({ language: "sql", content: `${sql.trim()}
` });
    await vscode17.window.showTextDocument(doc, { preview: false, viewColumn: vscode17.ViewColumn.Beside });
  }
  async openAiResult(title, text) {
    const doc = await vscode17.workspace.openTextDocument({ language: "sql", content: `-- ${title}
${text.trim()}
` });
    await vscode17.window.showTextDocument(doc, { preview: true, viewColumn: vscode17.ViewColumn.Beside });
  }
};

// src/services/documentConnectionResolver.ts
function resolveDocumentConnection(documentUri, bindings, connections, fallback) {
  const binding = bindings.find((record) => record.documentUri === documentUri);
  if (binding) {
    return {
      connection: connections.find((connection) => connection.id === binding.connectionId),
      isBound: true,
      boundConnectionId: binding.connectionId
    };
  }
  return {
    connection: fallback,
    isBound: false
  };
}

// src/services/queryOutputService.ts
var vscode18 = __toESM(require("vscode"));
var MAX_OUTPUT_LINES_PER_CONNECTION = 600;
var QueryOutputService = class {
  channels = /* @__PURE__ */ new Map();
  lineCounts = /* @__PURE__ */ new Map();
  record(connection, tab) {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryResultOutput(tab));
  }
  recordExecutionStarted(connection, fileName, statementCount, startedAt = Date.now()) {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryExecutionStartedOutput(fileName, statementCount, startedAt));
  }
  recordExecutionElapsed(connection, startedAt, now = Date.now()) {
    this.channelFor(connection);
    this.appendBlock(connection.id, [`${timestamp(now)} ${statusText("running")} for ${formatDuration(now - startedAt)}`]);
  }
  recordProgress(connection, progress) {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryProgressOutput(progress));
  }
  show(connection, preserveFocus = true) {
    this.channelFor(connection).show(preserveFocus);
  }
  disposeConnection(connectionId) {
    this.channels.get(connectionId)?.dispose();
    this.channels.delete(connectionId);
    this.lineCounts.delete(connectionId);
  }
  dispose() {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
    this.lineCounts.clear();
  }
  channelFor(connection) {
    const existing = this.channels.get(connection.id);
    if (existing) {
      return existing;
    }
    const channel = vscode18.window.createOutputChannel(`Database: ${connection.name}`);
    this.channels.set(connection.id, channel);
    this.lineCounts.set(connection.id, 0);
    return channel;
  }
  appendBlock(connectionId, lines) {
    this.ensureCapacity(connectionId, lines.length);
    for (const line of lines) {
      this.append(connectionId, line);
    }
  }
  append(connectionId, line) {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    channel.appendLine(line);
    this.lineCounts.set(connectionId, (this.lineCounts.get(connectionId) ?? 0) + 1);
  }
  ensureCapacity(connectionId, incomingLines) {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    const nextLineCount = (this.lineCounts.get(connectionId) ?? 0) + incomingLines;
    if (nextLineCount <= MAX_OUTPUT_LINES_PER_CONNECTION) {
      return;
    }
    channel.clear();
    this.lineCounts.set(connectionId, 0);
    this.append(connectionId, `${timestamp(Date.now())} OUTPUT truncated to keep memory bounded`);
    this.append(connectionId, "");
  }
};
function formatQueryExecutionStartedOutput(fileName, statementCount, startedAt = Date.now()) {
  const lines = [
    "",
    `${timestamp(startedAt)} ${statusText("running")} ${statementCount} statement${statementCount === 1 ? "" : "s"}`
  ];
  if (fileName) {
    lines.push(`  file: ${fileName}`);
  }
  return lines;
}
function formatQueryProgressOutput(progress, now = Date.now()) {
  const statement = `statement ${progress.statementIndex + 1}/${progress.statementCount}`;
  if (progress.status === "started") {
    return [
      `${timestamp(now)} ${statusText("running")} ${statement} started`,
      "  sql:",
      ...progress.sql.trimEnd().split(/\r?\n/).map((line) => `    ${line}`)
    ];
  }
  const duration = progress.durationMs !== void 0 ? formatDuration(progress.durationMs) : "unknown duration";
  if (progress.status === "completed") {
    const details = [
      `completed in ${duration}`,
      progress.rowCount !== void 0 ? `${progress.rowCount} rows` : void 0,
      progress.command
    ].filter(Boolean).join(" | ");
    return [`${timestamp(now)} ${statusText("completed")} ${statement} ${details}`];
  }
  const lines = [`${timestamp(now)} ${statusText("failed")} ${statement} failed after ${duration}`];
  if (progress.errorMessage) {
    lines.push(`  error: ${progress.errorMessage}`);
  }
  return lines;
}
function formatQueryResultOutput(tab) {
  const duration = formatDuration(tab.executionTimeMs ?? 0);
  const status = statusText(tab.executionStatus);
  const lines = [
    `${timestamp(tab.executionFinishedAt ?? Date.now())} ${status} total ${duration} | ${tab.rowCount ?? 0} rows | ${tab.title}`
  ];
  if (tab.error) {
    lines.push(`  error: ${tab.error.code ? `${tab.error.code}: ` : ""}${tab.error.message}`);
  }
  lines.push("");
  return lines;
}
function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0s";
  }
  const totalSeconds = Math.max(1, Math.round(durationMs / 1e3));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
function timestamp(value) {
  return `[${new Date(value).toLocaleTimeString()}]`;
}
function statusText(status) {
  switch (status.toLowerCase()) {
    case "completed":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "CANCELLED";
    case "running":
      return "RUNNING";
    default:
      return status.toUpperCase();
  }
}

// src/services/erDiagramService.ts
var ErDiagramService = class {
  constructor(connectionManager, schemaContext) {
    this.connectionManager = connectionManager;
    this.schemaContext = schemaContext;
  }
  async build(request) {
    if (!this.connectionManager.isConnected(request.connection.id)) {
      await this.connectionManager.connect(request.connection.id);
    }
    const entry = await this.schemaContext.loadSchema(request.connection, request.schemaName);
    if (entry.status !== "ready") {
      throw new Error(entry.errorMessage ?? `Could not load schema ${request.schemaName}.`);
    }
    const tables = [...entry.tables, ...entry.views].filter((relation) => relation.schema === request.schemaName).sort((left, right) => left.name.localeCompare(right.name));
    const relations = [];
    const tableMap2 = new Map(tables.map((relation) => [relation.name, relation]));
    const mappedTables = [];
    for (const table of tables) {
      if ("type" in table && table.type === "view") {
        const columnInfos2 = entry.columns[tableKey(table.schema, table.name)] ?? [];
        mappedTables.push({
          schema: table.schema,
          name: table.name,
          type: table.type,
          rowEstimate: "rowEstimate" in table ? table.rowEstimate : void 0,
          primaryKeys: [],
          columns: columnInfos2.map((column) => ({
            name: column.name,
            dataType: column.dataType,
            nullable: column.nullable,
            primary: false
          })),
          outgoing: [],
          incoming: []
        });
        continue;
      }
      const primaryKeyList = await this.schemaContext.getPrimaryKeys(request.connection, table.schema, table.name);
      const foreignKeyList = await this.connectionManager.getDriver(request.connection.type).getForeignKeys(request.connection.id, table.schema, table.name);
      const pkColumns = primaryKeyList[0]?.columns ?? [];
      const columnInfos = entry.columns[tableKey(table.schema, table.name)] ?? [];
      const outgoing = foreignKeyList.filter((fk) => fk.foreignSchema === request.schemaName && tableMap2.has(fk.foreignTable));
      relations.push(...outgoing.map((fk) => ({
        name: fk.name,
        fromSchema: table.schema,
        fromTable: table.name,
        fromColumns: fk.columns,
        toSchema: fk.foreignSchema,
        toTable: fk.foreignTable,
        toColumns: fk.foreignColumns
      })));
      mappedTables.push({
        schema: table.schema,
        name: table.name,
        type: table.type,
        rowEstimate: "rowEstimate" in table ? table.rowEstimate : void 0,
        primaryKeys: pkColumns,
        columns: columnInfos.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          nullable: column.nullable,
          primary: pkColumns.includes(column.name)
        })),
        outgoing: [],
        incoming: []
      });
    }
    const tableIndex = new Map(mappedTables.map((table) => [table.name, table]));
    for (const relation of relations) {
      const from = tableIndex.get(relation.fromTable);
      const to = tableIndex.get(relation.toTable);
      if (from) {
        from.outgoing.push(relation);
      }
      if (to) {
        to.incoming.push(relation);
      }
    }
    return {
      connectionName: request.connection.name,
      schemaName: request.schemaName,
      tables: mappedTables,
      relations
    };
  }
};
function tableKey(schema, table) {
  return `${schema}.${table}`;
}

// src/services/queryPlanAnalyzerService.ts
var QueryPlanAnalyzerService = class {
  constructor(connectionManager, ai) {
    this.connectionManager = connectionManager;
    this.ai = ai;
  }
  async explain(connection, sql, options = {}) {
    if (!this.connectionManager.isConnected(connection.id)) {
      await this.connectionManager.connect(connection.id);
    }
    const plan = await this.connectionManager.getDriver(connection.type).explainQuery({
      connectionId: connection.id,
      sql
    }, { analyze: options.analyze });
    if (!await this.ai.isAvailable()) {
      return plan;
    }
    try {
      const advice = await this.ai.annotateQueryPlan({
        connectionName: connection.name,
        databaseType: connection.type,
        databaseName: connection.database,
        sql,
        plan
      });
      return {
        ...plan,
        annotations: [...plan.annotations, ...advice.annotations],
        aiFindings: advice.findings,
        rewrittenSql: advice.rewrittenSql
      };
    } catch (error) {
      return {
        ...plan,
        aiError: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

// src/services/resultSetDiffService.ts
function compareResultSets(left, right, leftTitle = left.title, rightTitle = right.title) {
  const leftColumns = left.fields.map((field) => field.name);
  const rightColumns = right.fields.map((field) => field.name);
  const rightColumnSet = new Set(rightColumns);
  const sharedColumns = leftColumns.filter((column) => rightColumnSet.has(column));
  const leftOnlyColumns = leftColumns.filter((column) => !rightColumnSet.has(column));
  const rightOnlyColumns = rightColumns.filter((column) => !leftColumns.includes(column));
  const identityColumns = pickIdentityColumns(sharedColumns);
  const leftRows = left.rows.map((row, index) => ({ row, index }));
  const rightRows = right.rows.map((row, index) => ({ row, index }));
  const comparisonColumns = sharedColumns.length ? sharedColumns : [.../* @__PURE__ */ new Set([...leftColumns, ...rightColumns])];
  const leftGroups = groupRows(leftRows, identityColumns, comparisonColumns);
  const rightGroups = groupRows(rightRows, identityColumns, comparisonColumns);
  const addedRows = [];
  const removedRows = [];
  const changedRows = [];
  let sameRows = 0;
  const allKeys = [.../* @__PURE__ */ new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();
  for (const key of allKeys) {
    const leftGroup = leftGroups.get(key) ?? [];
    const rightGroup = rightGroups.get(key) ?? [];
    const pairCount = Math.min(leftGroup.length, rightGroup.length);
    for (let index = 0; index < pairCount; index += 1) {
      const leftRow = leftGroup[index];
      const rightRow = rightGroup[index];
      const changes = compareRows(leftRow.row, rightRow.row, sharedColumns);
      if (changes.length) {
        changedRows.push({
          key,
          leftRow: leftRow.row,
          rightRow: rightRow.row,
          changes
        });
      } else {
        sameRows += 1;
      }
    }
    for (let index = pairCount; index < leftGroup.length; index += 1) {
      removedRows.push({ key, row: leftGroup[index].row });
    }
    for (let index = pairCount; index < rightGroup.length; index += 1) {
      addedRows.push({ key, row: rightGroup[index].row });
    }
  }
  return {
    leftTitle,
    rightTitle,
    leftRowCount: left.rows.length,
    rightRowCount: right.rows.length,
    sharedColumns,
    leftOnlyColumns,
    rightOnlyColumns,
    identityColumns,
    addedRows,
    removedRows,
    changedRows,
    sameRows
  };
}
function formatResultSetDiffMarkdown(report) {
  const lines = [
    "# Result Set Diff",
    "",
    `Comparing **${report.leftTitle}** to **${report.rightTitle}**.`,
    "",
    `- Left rows: ${report.leftRowCount}`,
    `- Right rows: ${report.rightRowCount}`,
    `- Shared columns: ${report.sharedColumns.length ? report.sharedColumns.join(", ") : "none"}`,
    `- Identity columns: ${report.identityColumns.length ? report.identityColumns.join(", ") : "row order fallback"}`,
    `- Added rows: ${report.addedRows.length}`,
    `- Removed rows: ${report.removedRows.length}`,
    `- Changed rows: ${report.changedRows.length}`,
    `- Unchanged pairs: ${report.sameRows}`
  ];
  if (report.leftOnlyColumns.length || report.rightOnlyColumns.length) {
    lines.push("");
    lines.push("## Column Differences");
    if (report.leftOnlyColumns.length) {
      lines.push(`- Only in left: ${report.leftOnlyColumns.join(", ")}`);
    }
    if (report.rightOnlyColumns.length) {
      lines.push(`- Only in right: ${report.rightOnlyColumns.join(", ")}`);
    }
  }
  if (report.changedRows.length) {
    lines.push("");
    lines.push("## Changed Rows");
    for (const change of report.changedRows.slice(0, 20)) {
      lines.push("");
      lines.push(`### ${change.key}`);
      for (const field of change.changes) {
        lines.push(`- \`${field.column}\`: ${formatValue(field.leftValue)} -> ${formatValue(field.rightValue)}`);
      }
    }
    if (report.changedRows.length > 20) {
      lines.push("");
      lines.push(`_\u2026 ${report.changedRows.length - 20} more changed rows omitted._`);
    }
  }
  if (report.addedRows.length) {
    lines.push("");
    lines.push("## Added Rows");
    for (const delta of report.addedRows.slice(0, 10)) {
      lines.push(`- ${delta.key}`);
      lines.push("```json");
      lines.push(stringifyRow(delta.row));
      lines.push("```");
    }
    if (report.addedRows.length > 10) {
      lines.push(`_\u2026 ${report.addedRows.length - 10} more added rows omitted._`);
    }
  }
  if (report.removedRows.length) {
    lines.push("");
    lines.push("## Removed Rows");
    for (const delta of report.removedRows.slice(0, 10)) {
      lines.push(`- ${delta.key}`);
      lines.push("```json");
      lines.push(stringifyRow(delta.row));
      lines.push("```");
    }
    if (report.removedRows.length > 10) {
      lines.push(`_\u2026 ${report.removedRows.length - 10} more removed rows omitted._`);
    }
  }
  return lines.join("\n");
}
function compareRows(left, right, columns) {
  const changes = [];
  for (const column of columns) {
    if (!isDeepEqual(left[column], right[column])) {
      changes.push({
        column,
        leftValue: left[column],
        rightValue: right[column]
      });
    }
  }
  return changes;
}
function groupRows(rows, identityColumns, comparisonColumns) {
  const groups = /* @__PURE__ */ new Map();
  const keyColumns = identityColumns.length ? identityColumns : comparisonColumns.slice(0, Math.min(2, comparisonColumns.length));
  const sorted = [...rows].sort((left, right) => {
    const leftKey = rowKey(left.row, keyColumns, left.index);
    const rightKey = rowKey(right.row, keyColumns, right.index);
    return leftKey.localeCompare(rightKey);
  });
  for (const entry of sorted) {
    const key = rowKey(entry.row, keyColumns, entry.index);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return groups;
}
function pickIdentityColumns(columns) {
  const preferred = columns.filter((column) => /(^id$)|(^.+_id$)|(^.+id$)/i.test(column));
  if (preferred.length) {
    return preferred.slice(0, 3);
  }
  return columns.slice(0, Math.min(2, columns.length));
}
function rowKey(row, columns, index) {
  if (!columns.length) {
    return `${index}:${stringifyValue(row)}`;
  }
  return columns.map((column) => `${column}=${stringifyValue(row[column])}`).join(" | ") || `${index}`;
}
function stringifyValue(value) {
  if (value === void 0) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return stableStringify(value);
}
function stringifyRow(row) {
  return stableStringify(row);
}
function stableStringify(value) {
  return JSON.stringify(normalizeValue(value));
}
function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])]));
  }
  return value;
}
function isDeepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}
function formatValue(value) {
  if (value === void 0) {
    return "`undefined`";
  }
  if (value === null) {
    return "`null`";
  }
  const text = typeof value === "string" ? value : stableStringify(value);
  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  return `\`${preview.replace(/`/g, "\\`")}\``;
}

// src/services/schemaDiffService.ts
function compareSchemas(request) {
  const targetDatabaseType = assertSqlGeneratingType(request.targetDatabaseType ?? "postgres", "Schema diff migration SQL");
  const sourceTables = tableMap(request.sourceSchema.tables);
  const targetTables = tableMap(request.targetSchema.tables);
  const sourceViews = viewMap(request.sourceSchema.views);
  const targetViews = viewMap(request.targetSchema.views);
  const createTables = [...sourceTables.values()].filter((table) => !targetTables.has(tableKey2(table.schema, table.name))).map((table) => ({
    schema: table.schema,
    name: table.name,
    ddl: createTableSql(targetDatabaseType, table.schema, table.name, request.sourceSchema.columns[tableKey2(table.schema, table.name)] ?? [])
  }));
  const dropTables = [...targetTables.values()].filter((table) => !sourceTables.has(tableKey2(table.schema, table.name))).map((table) => ({ schema: table.schema, name: table.name }));
  const createViews = [...sourceViews.values()].filter((view) => !targetViews.has(viewKey(view.schema, view.name))).map((view) => ({
    schema: view.schema,
    name: view.name,
    ddl: createPlaceholderViewSql(targetDatabaseType, view.schema, view.name)
  }));
  const dropViews = [...targetViews.values()].filter((view) => !sourceViews.has(viewKey(view.schema, view.name))).map((view) => ({ schema: view.schema, name: view.name }));
  const alterTables = [...sourceTables.values()].filter((table) => targetTables.has(tableKey2(table.schema, table.name))).map((table) => compareTableColumns(
    table.schema,
    table.name,
    targetDatabaseType,
    request.sourceSchema.columns[tableKey2(table.schema, table.name)] ?? [],
    request.targetSchema.columns[tableKey2(table.schema, table.name)] ?? []
  )).filter((change) => change.addedColumns.length || change.removedColumns.length || change.typeChanges.length || change.nullableChanges.length);
  const migrationSql = buildMigrationSql(targetDatabaseType, { createTables, dropTables, createViews, dropViews, alterTables });
  return {
    sourceConnectionName: request.sourceConnectionName,
    targetConnectionName: request.targetConnectionName,
    targetDatabaseType,
    sourceSchema: request.sourceSchema.schemaName,
    targetSchema: request.targetSchema.schemaName,
    createTables,
    dropTables,
    createViews,
    dropViews,
    alterTables,
    migrationSql
  };
}
function formatSchemaDiffMarkdown(report) {
  const lines = [
    "# Schema Diff",
    "",
    `Source: **${report.sourceConnectionName}** / schema **${report.sourceSchema}**`,
    `Target: **${report.targetConnectionName}** / schema **${report.targetSchema}**`,
    "",
    `- Tables to create: ${report.createTables.length}`,
    `- Tables to drop: ${report.dropTables.length}`,
    `- Views to create: ${report.createViews.length}`,
    `- Views to drop: ${report.dropViews.length}`,
    `- Tables to alter: ${report.alterTables.length}`
  ];
  appendObjects(lines, "## Create Tables", report.createTables.map((item) => `${qualifiedSqlName(report.targetDatabaseType, item.schema, item.name)}
\`\`\`sql
${item.ddl}
\`\`\``));
  appendSimple(lines, "## Drop Tables", report.dropTables.map((item) => qualifiedSqlName(report.targetDatabaseType, item.schema, item.name)));
  appendObjects(lines, "## Create Views", report.createViews.map((item) => `${qualifiedSqlName(report.targetDatabaseType, item.schema, item.name)}
\`\`\`sql
${item.ddl}
\`\`\``));
  appendSimple(lines, "## Drop Views", report.dropViews.map((item) => qualifiedSqlName(report.targetDatabaseType, item.schema, item.name)));
  if (report.alterTables.length) {
    lines.push("");
    lines.push("## Table Changes");
    for (const table of report.alterTables) {
      lines.push("");
      lines.push(`### ${qualifiedSqlName(report.targetDatabaseType, table.schema, table.name)}`);
      if (table.addedColumns.length) {
        lines.push(`- Added columns: ${table.addedColumns.map((item) => `${item.name}`).join(", ")}`);
      }
      if (table.removedColumns.length) {
        lines.push(`- Removed columns: ${table.removedColumns.map((item) => item.name).join(", ")}`);
      }
      if (table.typeChanges.length) {
        lines.push(`- Type changes: ${table.typeChanges.map((item) => `${item.name} ${item.from} -> ${item.to}`).join(", ")}`);
      }
      if (table.nullableChanges.length) {
        lines.push(`- Nullability changes: ${table.nullableChanges.map((item) => `${item.name} ${item.from ? "nullable" : "not null"} -> ${item.to ? "nullable" : "not null"}`).join(", ")}`);
      }
    }
  }
  lines.push("");
  lines.push("## Migration SQL");
  lines.push("```sql");
  lines.push(report.migrationSql || "-- No migration SQL generated.");
  lines.push("```");
  return lines.join("\n");
}
function compareTableColumns(schema, name, targetDatabaseType, sourceColumns, targetColumns) {
  const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
  const sourceByName = new Map(sourceColumns.map((column) => [column.name, column]));
  const addedColumns = sourceColumns.filter((column) => !targetByName.has(column.name)).map((column) => ({
    name: column.name,
    ddl: addColumnMigrationSql(targetDatabaseType, schema, name, column)
  }));
  const removedColumns = targetColumns.filter((column) => !sourceByName.has(column.name)).map((column) => ({ name: column.name }));
  const typeChanges = sourceColumns.filter((column) => {
    const target = targetByName.get(column.name);
    return !!target && target.dataType !== column.dataType;
  }).map((column) => ({
    name: column.name,
    from: targetByName.get(column.name)?.dataType ?? "",
    to: column.dataType
  }));
  const nullableChanges = sourceColumns.filter((column) => {
    const target = targetByName.get(column.name);
    return !!target && target.nullable !== column.nullable;
  }).map((column) => ({
    name: column.name,
    from: targetByName.get(column.name)?.nullable ?? false,
    to: column.nullable
  }));
  return { schema, name, addedColumns, removedColumns, typeChanges, nullableChanges };
}
function buildMigrationSql(targetDatabaseType, report) {
  const statements = [];
  for (const item of report.createTables) {
    statements.push(item.ddl);
  }
  for (const item of report.createViews) {
    statements.push(item.ddl);
  }
  for (const item of report.alterTables) {
    for (const added of item.addedColumns) {
      statements.push(added.ddl);
    }
  }
  for (const item of report.dropViews) {
    statements.push(dropViewIfExistsSql(targetDatabaseType, item.schema, item.name));
  }
  for (const item of report.dropTables) {
    statements.push(dropTableIfExistsSql(targetDatabaseType, item.schema, item.name));
  }
  return statements.join("\n");
}
function addColumnMigrationSql(type, schema, table, column) {
  const dataType = column.dataType?.trim();
  if (!dataType) {
    throw new Error(`Missing data type for ${column.schema}.${column.table}.${column.name}.`);
  }
  const addKeyword = type === "sqlserver" || type === "oracle" ? "add" : "add column";
  const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : "";
  const nullable = column.nullable ? "" : " not null";
  return `alter table ${qualifiedSqlName(type, schema, table)}
  ${addKeyword} ${quoteSqlIdentifier(type, column.name)} ${dataType}${defaultValue}${nullable};`;
}
function tableMap(items) {
  return new Map(items.map((item) => [tableKey2(item.schema, item.name), item]));
}
function viewMap(items) {
  return new Map(items.map((item) => [viewKey(item.schema, item.name), item]));
}
function tableKey2(schema, table) {
  return `${schema}.${table}`;
}
function viewKey(schema, view) {
  return `${schema}.${view}`;
}
function appendObjects(lines, title, values) {
  if (!values.length) {
    return;
  }
  lines.push("");
  lines.push(title);
  for (const value of values) {
    lines.push("");
    lines.push(value);
  }
}
function appendSimple(lines, title, values) {
  if (!values.length) {
    return;
  }
  lines.push("");
  lines.push(title);
  for (const value of values) {
    lines.push(`- ${value}`);
  }
}

// src/services/querySnippetService.ts
function querySnippets() {
  return [
    {
      id: "select-by-id",
      label: "Select by ID",
      description: "Template for fetching one row by primary key.",
      snippet: [
        "select *",
        "from ${1:table_name}",
        "where ${2:id_column} = ${3:value};"
      ].join("\n")
    },
    {
      id: "filtered-select",
      label: "Filtered Select",
      description: "Template for a constrained query with ordering.",
      snippet: [
        "select ${1:columns}",
        "from ${2:table_name}",
        "where ${3:filter_expression}",
        "order by ${4:sort_column} ${5|asc,desc|};"
      ].join("\n")
    },
    {
      id: "join-query",
      label: "Join Query",
      description: "Template for joining two relations.",
      snippet: [
        "select ${1:left_alias}.*, ${2:right_alias}.*",
        "from ${3:left_table} ${1:left_alias}",
        "join ${4:right_table} ${2:right_alias}",
        "  on ${5:join_condition};"
      ].join("\n")
    },
    {
      id: "cte-query",
      label: "CTE Query",
      description: "Template for a common table expression.",
      snippet: [
        "with ${1:base} as (",
        "  select ${2:columns}",
        "  from ${3:table_name}",
        ")",
        "select *",
        "from ${1:base};"
      ].join("\n")
    },
    {
      id: "insert-row",
      label: "Insert Row",
      description: "Template for inserting a single row.",
      snippet: [
        "insert into ${1:table_name} (${2:column_list})",
        "values (${3:value_list});"
      ].join("\n")
    },
    {
      id: "update-row",
      label: "Update Row",
      description: "Template for updating rows with a predicate.",
      snippet: [
        "update ${1:table_name}",
        "set ${2:column} = ${3:value}",
        "where ${4:predicate};"
      ].join("\n")
    },
    {
      id: "delete-row",
      label: "Delete Row",
      description: "Template for deleting rows with a predicate.",
      snippet: [
        "delete from ${1:table_name}",
        "where ${2:predicate};"
      ].join("\n")
    }
  ];
}

// src/services/sqlFormattingService.ts
function sqlFormatterDialect(connection) {
  if (connection?.type === "redshift") {
    return "redshift";
  }
  if (connection?.type === "mysql") {
    return "mysql";
  }
  if (connection?.type === "sqlite") {
    return "sqlite";
  }
  if (connection?.type === "sqlserver") {
    return "transactsql";
  }
  if (connection?.type === "oracle") {
    return "plsql";
  }
  if (connection?.type === "snowflake") {
    return "snowflake";
  }
  return "postgresql";
}
async function formatSqlText(sql, dialect) {
  if (!sql.trim()) {
    return sql;
  }
  const { format } = await loadSqlFormatter();
  return format(sql, {
    language: dialect,
    tabWidth: 2
  });
}
var sqlFormatterRuntime;
function loadSqlFormatter() {
  sqlFormatterRuntime ??= loadSqlFormatterRuntime();
  return sqlFormatterRuntime;
}
async function loadSqlFormatterRuntime() {
  const bundled = loadBundledRuntime("sqlFormatterRuntime");
  if (bundled) {
    return bundled;
  }
  return import("sql-formatter").then((module2) => {
    const candidate = module2;
    return "format" in candidate ? candidate : candidate.default;
  });
}

// src/services/tableCopyService.ts
function buildTableCopyPreview(sourceSchema, sourceTable, targetSchema, targetTable, columns, rows, sourceLabel, targetLabel, targetDatabaseType = "postgres") {
  if (!columns.length) {
    throw new Error("No table columns were found to copy.");
  }
  const columnNames = columns.map((column) => column.name);
  const warnings = [
    sourceLabel ? `Source connection: ${sourceLabel}` : void 0,
    targetLabel ? `Target connection: ${targetLabel}` : void 0,
    rows.length === 0 ? "No data rows were found; only the table structure will be copied." : void 0,
    rows.length > 5e3 ? `Copy preview includes ${rows.length.toLocaleString()} rows.` : void 0
  ].filter(Boolean);
  const ddl = createTableSql(targetDatabaseType, targetSchema, targetTable, columns);
  const inserts = chunk(rows, 100).map((batch) => insertBatchSql(targetDatabaseType, targetSchema, targetTable, columnNames, batch));
  return {
    sourceRowCount: rows.length,
    targetSchema,
    targetTable,
    sql: [
      `-- Source table: ${qualifiedSqlName(targetDatabaseType, sourceSchema, sourceTable)}`,
      `-- Target table: ${qualifiedSqlName(targetDatabaseType, targetSchema, targetTable)}`,
      ...warnings.map((warning) => `-- ${warning}`),
      "",
      ddl,
      "",
      ...inserts
    ].join("\n"),
    warnings
  };
}
function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

// src/services/tableImportService.ts
function buildTableImportPreview(_databaseType, _schema, _table, tableColumns, fileName, text) {
  const kind = fileName.toLowerCase().endsWith(".json") ? "json" : "csv";
  const source = kind === "json" ? parseJsonSource(text) : parseCsvSource(text);
  if (!source.rows.length) {
    throw new Error("No import rows were found.");
  }
  const mapping = inferMapping(source.columns, tableColumns);
  if (!mapping.some((item) => item.source)) {
    throw new Error("Could not map any source fields to table columns.");
  }
  const warnings = [
    ...source.warnings,
    ...mappingWarnings(source.columns, tableColumns, mapping)
  ];
  return {
    kind,
    fileName,
    rowCount: source.rows.length,
    sourceColumns: source.columns,
    targetColumns: tableColumns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      defaultValue: column.defaultValue
    })),
    mapping,
    sampleRows: source.rows.slice(0, 50),
    warnings
  };
}
function buildTableImportData(fileName, text, mapping) {
  const kind = fileName.toLowerCase().endsWith(".json") ? "json" : "csv";
  const source = kind === "json" ? parseJsonSource(text) : parseCsvSource(text);
  const activeMapping = mapping.filter((item) => Boolean(item.source?.trim()) && Boolean(item.target.trim()));
  if (!activeMapping.length) {
    throw new Error("Map at least one source column before importing.");
  }
  const sourceColumns = new Set(source.columns);
  for (const item of activeMapping) {
    if (!sourceColumns.has(item.source)) {
      throw new Error(`Source column "${item.source}" was not found in the import file.`);
    }
  }
  const targetColumns = unique(activeMapping.map((item) => item.target));
  if (targetColumns.length !== activeMapping.length) {
    throw new Error("Each target column can only be mapped once.");
  }
  const rows = source.rows.map((row) => {
    const next = {};
    for (const item of activeMapping) {
      next[item.target] = row[item.source];
    }
    return next;
  }).filter((row) => Object.keys(row).length > 0);
  if (!rows.length) {
    throw new Error("No import rows were found.");
  }
  return { columns: targetColumns, rows };
}
function buildTableImportStatements(databaseType, schema, table, data, batchSize = 100) {
  if (!data.columns.length) {
    throw new Error("Map at least one source column before importing.");
  }
  if (!data.rows.length) {
    throw new Error("No import rows were found.");
  }
  const safeBatchSize = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 100;
  return chunk2(data.rows, safeBatchSize).map((batch) => insertBatchSql(databaseType, schema, table, data.columns, batch));
}
function parseJsonSource(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON import expects an array of objects.");
  }
  const rows = parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("JSON import expects an array of objects.");
    }
    return item;
  });
  const columns = unique(rows.flatMap((row) => Object.keys(row)));
  return { columns, rows, warnings: [] };
}
function parseCsvSource(text) {
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error("CSV file is empty.");
  }
  const [header, ...dataRows] = rows;
  const columns = header.map((value, index) => value || `column_${index + 1}`);
  return {
    columns,
    rows: dataRows.map((row) => Object.fromEntries(columns.map((column, index) => [column, parseScalar(row[index] ?? "")]))),
    warnings: []
  };
}
function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;
  const pushValue = () => {
    currentRow.push(currentValue);
    currentValue = "";
  };
  const pushRow = () => {
    if (currentRow.length || currentValue.length) {
      if (currentValue.length || inQuotes) {
        pushValue();
      }
      rows.push(currentRow);
      currentRow = [];
    }
    currentValue = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      pushValue();
      continue;
    }
    if (char === "\n") {
      pushValue();
      pushRow();
      continue;
    }
    if (char === "\r") {
      continue;
    }
    currentValue += char;
  }
  if (currentValue.length || currentRow.length) {
    pushValue();
    rows.push(currentRow);
  }
  return rows.filter((row) => row.some((value) => value.length > 0));
}
function inferMapping(sourceColumns, targetColumns) {
  const sourceLookup = new Map(sourceColumns.map((column) => [normalizeName(column), column]));
  const usedSources = /* @__PURE__ */ new Set();
  const mapping = [];
  for (const target of targetColumns) {
    const exact = sourceLookup.get(normalizeName(target.name));
    if (exact && !usedSources.has(exact)) {
      mapping.push({ target: target.name, targetType: target.dataType, source: exact, auto: true });
      usedSources.add(exact);
      continue;
    }
    mapping.push({ target: target.name, targetType: target.dataType, source: null, auto: true });
  }
  if (usedSources.size === 0) {
    for (const [index, item] of mapping.entries()) {
      const source = sourceColumns[index];
      if (source) {
        item.source = source;
        usedSources.add(source);
      }
    }
  }
  return mapping;
}
function mappingWarnings(sourceColumns, targetColumns, mapping) {
  const activeMapping = mapping.filter((item) => item.source);
  const unmatchedSource = sourceColumns.filter((source) => !activeMapping.some((item) => item.source === source));
  const unmappedRequiredTargets = targetColumns.filter((target) => !target.nullable && !target.defaultValue && !activeMapping.some((item) => item.target === target.name)).map((target) => target.name);
  const unusedTargets = targetColumns.filter((target) => !activeMapping.some((item) => item.target === target.name)).map((target) => target.name).filter((target) => !unmappedRequiredTargets.includes(target));
  const warnings = [];
  if (unmatchedSource.length) {
    warnings.push(`Skipped source columns: ${unmatchedSource.join(", ")}.`);
  }
  if (unmappedRequiredTargets.length) {
    warnings.push(`Required target columns left unmapped: ${unmappedRequiredTargets.join(", ")}.`);
  }
  if (unusedTargets.length) {
    warnings.push(`Target columns left unmapped: ${unusedTargets.join(", ")}.`);
  }
  return warnings;
}
function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function parseScalar(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (/^null$/i.test(trimmed)) {
    return null;
  }
  if (/^true$/i.test(trimmed)) {
    return true;
  }
  if (/^false$/i.test(trimmed)) {
    return false;
  }
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    const next = Number(trimmed);
    return Number.isFinite(next) ? next : trimmed;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
function chunk2(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
function unique(values) {
  return [...new Set(values)];
}

// src/webviews/session/SessionMonitorPanel.ts
var vscode19 = __toESM(require("vscode"));
var SessionMonitorPanel = class {
  static async open(context, connectionManager, connection) {
    const panel = vscode19.window.createWebviewPanel(
      "databaseSessionMonitor",
      `Sessions: ${connection.name}`,
      vscode19.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode19.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.html(panel.webview, connection);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "ready" || message.type === "refresh") {
        await this.postState(panel, connectionManager, connection);
        return;
      }
      if (message.type === "cancel" && typeof message.pid === "number") {
        await connectionManager.getDriver(connection.type).cancelSession(connection.id, message.pid);
        await this.postState(panel, connectionManager, connection);
        return;
      }
      if (message.type === "terminate" && typeof message.pid === "number") {
        const confirmed = await vscode19.window.showWarningMessage(
          `Terminate session ${message.pid} on ${connection.name}?`,
          { modal: true },
          "Terminate"
        );
        if (confirmed === "Terminate") {
          await connectionManager.getDriver(connection.type).terminateSession(connection.id, message.pid);
          await this.postState(panel, connectionManager, connection);
        }
      }
    });
  }
  static async postState(panel, connectionManager, connection) {
    try {
      if (!connectionManager.isConnected(connection.id)) {
        await connectionManager.connect(connection.id);
      }
      const sessions = await connectionManager.getDriver(connection.type).getActiveSessions(connection.id);
      await panel.webview.postMessage({
        type: "state",
        sessions,
        connection: {
          name: connection.name,
          type: connection.type,
          host: connection.host,
          database: connection.database
        }
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  static html(webview, connection) {
    const nonce = Date.now().toString();
    const title = `${connection.name} sessions`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-row: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
    }
    .shell {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      height: 100vh;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
    }
    .toolbar button {
      border: 1px solid var(--border);
      background: var(--bg-row);
      color: var(--text-main);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .toolbar button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .meta {
      padding: 8px 12px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead th, tbody td {
      border-bottom: 1px solid var(--border);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    thead th {
      position: sticky;
      top: 0;
      background: var(--bg-panel);
      z-index: 1;
    }
    tbody tr:hover {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 80%, transparent);
    }
    .muted { color: var(--text-muted); }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-row);
      border: 1px solid var(--border);
      font-size: 11px;
    }
    .error {
      padding: 12px;
      color: var(--vscode-errorForeground);
    }
    .query {
      font-family: var(--vscode-editor-font-family);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button id="refresh">Refresh</button>
      <span class="pill">${connection.name}</span>
      <span class="muted">${connection.type} \u2022 ${connection.host}</span>
    </div>
    <div id="meta" class="meta">Loading sessions...</div>
    <div id="body"></div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const body = document.getElementById('body');
    const meta = document.getElementById('meta');
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
    function render(sessions) {
      if (!sessions.length) {
        body.innerHTML = '<div class="error">No active sessions were returned.</div>';
        meta.textContent = '0 sessions';
        return;
      }
      meta.textContent = sessions.length + ' sessions';
      body.innerHTML = '<table>'
        + '<thead><tr><th>PID</th><th>User</th><th>State</th><th>Client</th><th>Age</th><th>Query</th><th>Actions</th></tr></thead>'
        + '<tbody>'
        + sessions.map(function(session) {
          return '<tr>'
            + '<td>' + session.pid + (session.isCurrent ? ' <span class="pill">current</span>' : '') + '</td>'
            + '<td>' + escapeHtml(session.user || '') + '<div class="muted">' + escapeHtml(session.application || '') + '</div></td>'
            + '<td>' + escapeHtml(session.state || '') + (session.isIdleInTransaction ? '<div class="pill">idle in tx</div>' : '') + '</td>'
            + '<td>' + escapeHtml(session.client || '') + '</td>'
            + '<td>' + escapeHtml(relativeTime(session.startedAt)) + '</td>'
            + '<td><div class="query">' + escapeHtml(session.query || '') + '</div></td>'
            + '<td>'
            + '<button data-cancel="' + session.pid + '" ' + (session.isCurrent ? 'disabled' : '') + '>Cancel</button>'
            + ' <button data-terminate="' + session.pid + '" ' + (session.isCurrent ? 'disabled' : '') + '>Terminate</button>'
            + '</td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
      body.querySelectorAll('[data-cancel]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'cancel', pid: Number(button.getAttribute('data-cancel')) }));
      });
      body.querySelectorAll('[data-terminate]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'terminate', pid: Number(button.getAttribute('data-terminate')) }));
      });
    }
    function relativeTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      const diff = Date.now() - date.getTime();
      const minutes = Math.round(diff / 60000);
      if (Math.abs(minutes) < 1) return 'now';
      if (Math.abs(minutes) < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) return hours + 'h ago';
      const days = Math.round(hours / 24);
      return days + 'd ago';
    }
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'error') {
        body.innerHTML = '<div class="error">' + escapeHtml(event.data.message || 'Failed to load sessions') + '</div>';
        meta.textContent = 'error';
        return;
      }
      if (event.data?.type === 'state') {
        render(event.data.sessions || []);
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
};

// src/webviews/erDiagram/ErDiagramPanel.ts
var vscode20 = __toESM(require("vscode"));
var ErDiagramPanel = class {
  static async open(context, report) {
    const panel = vscode20.window.createWebviewPanel(
      "databaseErDiagram",
      `ER Diagram: ${report.schemaName}`,
      vscode20.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode20.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.html(panel.webview, report);
  }
  static html(webview, report) {
    const nonce = Date.now().toString();
    const data = JSON.stringify(report).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ER Diagram</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --success: var(--vscode-testing-iconPassed);
      --warning: var(--vscode-charts-orange);
      --space-xs: .35rem;
      --space-sm: .5rem;
      --space-md: .75rem;
      --space-lg: 1rem;
      --radius-sm: .35rem;
      --radius-md: .5rem;
      --card-width: 18rem;
      --card-min-height: 9rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg-main);
      color: var(--text-main);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      gap: var(--space-sm);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .stats {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .pill {
      padding: .2rem .55rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg-elevated);
      color: var(--text-main);
    }
    .viewport {
      position: relative;
      min-height: 0;
      overflow: auto;
      padding: var(--space-lg);
    }
    .canvas {
      position: relative;
      min-width: max-content;
      min-height: max-content;
    }
    .diagram-grid {
      position: relative;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--card-width), 1fr));
      gap: var(--space-md);
      align-items: start;
      width: max(100%, 56rem);
    }
    .table-card {
      position: relative;
      min-height: var(--card-min-height);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--bg-panel) 82%, transparent);
      box-shadow: 0 .35rem .9rem color-mix(in srgb, black 18%, transparent);
      overflow: hidden;
    }
    .table-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-sm);
      align-items: flex-start;
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
    }
    .table-name {
      min-width: 0;
    }
    .table-name strong {
      display: block;
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .table-name span {
      display: block;
      color: var(--text-muted);
      font-size: .85em;
    }
    .pk-badge {
      flex: 0 0 auto;
      padding: .18rem .45rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--success) 15%, transparent);
      color: var(--success);
      border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
      font-size: .82em;
      white-space: nowrap;
    }
    .column-list {
      margin: 0;
      padding: var(--space-sm) var(--space-md) var(--space-md);
      list-style: none;
      display: grid;
      gap: .22rem;
    }
    .column {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-xs);
      align-items: center;
      padding: .12rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
    }
    .column:last-child { border-bottom: 0; }
    .column-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .column-meta {
      color: var(--text-muted);
      font-size: .82em;
      white-space: nowrap;
    }
    .column.primary .column-name::before {
      content: 'PK ';
      color: var(--success);
      font-weight: 600;
    }
    .relations {
      display: grid;
      gap: .3rem;
      padding: 0 var(--space-md) var(--space-md);
      color: var(--text-muted);
      font-size: .84em;
    }
    .relation {
      padding: .2rem .35rem;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--bg-main) 82%, transparent);
      border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    }
    .relation strong {
      color: var(--text-main);
    }
    svg.overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    }
    .legend {
      color: var(--text-muted);
      font-size: .85em;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${escapeHtml(report.connectionName)} ER Diagram</h1>
        <div class="legend">${escapeHtml(report.schemaName)} schema</div>
      </div>
      <div class="stats">
        <span class="pill">${report.tables.length.toLocaleString()} tables</span>
        <span class="pill">${report.relations.length.toLocaleString()} relationships</span>
      </div>
    </header>
    <div class="viewport">
      <div class="canvas">
        <svg class="overlay" aria-hidden="true">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path>
            </marker>
          </defs>
        </svg>
        <div id="grid" class="diagram-grid"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const data = ${data};
    const grid = document.getElementById('grid');
    const overlay = document.querySelector('svg.overlay');
    grid.innerHTML = data.tables.map((table) => {
      const columns = table.columns.map((column) => '<li class="column ' + (column.primary ? 'primary' : '') + '"><span class="column-name">' + escapeHtml(column.name) + '</span><span class="column-meta">' + escapeHtml(column.dataType + (column.nullable ? '' : ' not null')) + '</span></li>').join('');
      const outgoing = table.outgoing.map((relation) => '<div class="relation"><strong>' + escapeHtml(relation.name) + '</strong> ' + escapeHtml(relation.fromColumns.join(', ')) + ' \u2192 ' + escapeHtml(relation.toTable) + '(' + escapeHtml(relation.toColumns.join(', ')) + ')</div>').join('');
      return '<article class="table-card" data-table="' + escapeHtml(table.schema + '.' + table.name) + '">' +
        '<div class="table-head">' +
          '<div class="table-name"><strong>' + escapeHtml(table.name) + '</strong><span>' + escapeHtml(table.schema) + ' \u2022 ' + escapeHtml(table.type) + (table.rowEstimate ? ' \u2022 ~' + table.rowEstimate : '') + '</span></div>' +
          (table.primaryKeys.length ? '<span class="pk-badge">PK ' + escapeHtml(table.primaryKeys.join(', ')) + '</span>' : '<span class="pk-badge" style="opacity:.7">No PK</span>') +
        '</div>' +
        '<ol class="column-list">' + columns + '</ol>' +
        (outgoing ? '<div class="relations">' + outgoing + '</div>' : '') +
      '</article>';
    }).join('');

    function draw() {
      overlay.setAttribute('viewBox', '0 0 ' + grid.scrollWidth + ' ' + grid.scrollHeight);
      overlay.innerHTML = '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path></marker></defs>';
      const cards = new Map([...document.querySelectorAll('.table-card')].map((element) => [element.getAttribute('data-table'), element]));
      for (const relation of data.relations) {
        const from = cards.get(relation.fromSchema + '.' + relation.fromTable);
        const to = cards.get(relation.toSchema + '.' + relation.toTable);
        if (!from || !to) continue;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        const fromX = fromRect.right - gridRect.left + grid.scrollLeft;
        const toX = toRect.left - gridRect.left + grid.scrollLeft;
        const fromY = fromRect.top - gridRect.top + fromRect.height / 2 + grid.scrollTop;
        const toY = toRect.top - gridRect.top + toRect.height / 2 + grid.scrollTop;
        const startX = fromX < toX ? fromRect.right - gridRect.left + grid.scrollLeft : fromRect.left - gridRect.left + grid.scrollLeft;
        const endX = fromX < toX ? toRect.left - gridRect.left + grid.scrollLeft : toRect.right - gridRect.left + grid.scrollLeft;
        const midX = (startX + endX) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M ' + startX + ' ' + fromY + ' L ' + midX + ' ' + fromY + ' L ' + midX + ' ' + toY + ' L ' + endX + ' ' + toY);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--accent)');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('stroke-opacity', '0.9');
        path.setAttribute('marker-end', 'url(#arrow)');
        overlay.appendChild(path);
      }
    }
    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    window.addEventListener('resize', draw);
    grid.addEventListener('scroll', draw, { passive: true });
    requestAnimationFrame(draw);
  </script>
</body>
</html>`;
  }
};
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/webviews/connection/ConnectionEditorPanel.ts
var vscode21 = __toESM(require("vscode"));

// src/webviews/connection/connectionOnboarding.ts
var ENGINE_GUIDANCE_BY_DATABASE_TYPE = {
  postgres: {
    hostLabel: "Host:",
    databaseLabel: "Database:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "localhost",
    databasePlaceholder: "postgres",
    usernamePlaceholder: "postgres",
    databaseHelp: "Database name to open after login.",
    usernameHelp: "Required unless the server is configured for passwordless local auth.",
    authHelp: "Password auth is common. Leave blank only for trust or socket-based local auth.",
    sslHelp: "Use require for managed cloud databases that enforce TLS; disable is fine for local Docker.",
    defaultSchemaHelp: "Usually public.",
    required: { host: true, username: true, database: true }
  },
  redshift: {
    hostLabel: "Cluster endpoint:",
    databaseLabel: "Database:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "example-cluster.abc123.us-east-1.redshift.amazonaws.com",
    databasePlaceholder: "dev",
    usernamePlaceholder: "awsuser",
    databaseHelp: "Redshift defaults to dev unless your cluster was created with another database.",
    usernameHelp: "Use the database user or temporary IAM-generated user.",
    authHelp: "Use the generated database password/token when connecting through IAM tooling.",
    sslHelp: "Redshift normally requires TLS, so require is the default.",
    defaultSchemaHelp: "Usually public.",
    required: { host: true, username: true, database: true }
  },
  mysql: {
    hostLabel: "Host:",
    databaseLabel: "Database:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "localhost",
    databasePlaceholder: "mysql",
    usernamePlaceholder: "root",
    databaseHelp: "Schema/database to use after login.",
    usernameHelp: "Required for MySQL accounts.",
    authHelp: "Password can be blank for local accounts configured without a password.",
    sslHelp: "Use require when your MySQL server enforces TLS.",
    defaultSchemaHelp: "MySQL uses the database field as the active schema.",
    required: { host: true, username: true, database: true }
  },
  sqlite: {
    hostLabel: "Host:",
    databaseLabel: "SQLite file:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "",
    databasePlaceholder: "/path/to/app.db",
    usernamePlaceholder: "",
    hostHelp: "SQLite is file-based; host and port are not used.",
    databaseHelp: "Choose a .db/.sqlite file, or use :memory: for a temporary database.",
    usernameHelp: "SQLite does not use username or password fields.",
    authHelp: "No network auth is used for SQLite files.",
    sslHelp: "SQLite is file-based, so SSL mode is ignored.",
    defaultSchemaHelp: "SQLite usually uses main.",
    required: { host: false, username: false, database: true },
    disabled: { host: true, port: true, username: true, password: true, sslMode: true }
  },
  sqlserver: {
    hostLabel: "Server:",
    databaseLabel: "Database:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "localhost",
    databasePlaceholder: "master",
    usernamePlaceholder: "sa",
    databaseHelp: "Initial catalog, for example master or your app database.",
    usernameHelp: "Required for SQL authentication.",
    authHelp: "Use SQL authentication credentials. Windows auth is not configured from this form yet.",
    sslHelp: "prefer encrypts and trusts the server certificate; require validates the certificate chain.",
    defaultSchemaHelp: "Usually dbo.",
    required: { host: true, username: true, database: true }
  },
  oracle: {
    hostLabel: "Host:",
    databaseLabel: "Service name:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Default schema:",
    hostPlaceholder: "localhost",
    databasePlaceholder: "ORCLPDB1",
    usernamePlaceholder: "system",
    databaseHelp: "Service name used in host:port/service, for example ORCLPDB1.",
    usernameHelp: "Oracle user/schema name.",
    authHelp: "Use the password for the Oracle user above.",
    sslHelp: "Use require only when your Oracle listener is configured for TLS.",
    defaultSchemaHelp: "Leave blank to use the login user, or enter another schema to browse first.",
    required: { host: true, username: true, database: true }
  },
  redis: {
    hostLabel: "Host:",
    databaseLabel: "Database index:",
    usernameLabel: "ACL user:",
    defaultSchemaLabel: "Logical schema:",
    hostPlaceholder: "localhost",
    databasePlaceholder: "0",
    usernamePlaceholder: "default",
    databaseHelp: "Zero-based Redis database index. Most deployments use 0.",
    usernameHelp: "Optional unless Redis ACL users are enabled.",
    authHelp: "Use the Redis password or ACL user password when authentication is enabled.",
    sslHelp: "Use require for rediss/TLS endpoints.",
    defaultSchemaHelp: "Shown as db0, db1, and so on in the explorer.",
    required: { host: true, username: false, database: true }
  },
  snowflake: {
    hostLabel: "Account:",
    databaseLabel: "Database:",
    usernameLabel: "User:",
    defaultSchemaLabel: "Schema:",
    hostPlaceholder: "org-account or account.region",
    databasePlaceholder: "SNOWFLAKE",
    usernamePlaceholder: "user@example.com",
    hostHelp: "Enter the Snowflake account identifier, not a full URL.",
    databaseHelp: "Default Snowflake database.",
    usernameHelp: "Snowflake username.",
    authHelp: "Password authentication is used by this connection form.",
    sslHelp: "Snowflake requires TLS, so require is the default.",
    defaultSchemaHelp: "Default Snowflake schema, commonly PUBLIC.",
    required: { host: true, username: true, database: true }
  }
};

// src/webviews/connection/ConnectionEditorPanel.ts
var ConnectionEditorPanel = class _ConnectionEditorPanel {
  constructor(panel, extensionUri, connectionManager, existing, resolve) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.connectionManager = connectionManager;
    this.existing = existing;
    this.resolve = resolve;
    this.panel.onDidDispose(() => this.resolve(void 0));
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
  }
  static async open(context, connectionManager, existing) {
    return new Promise((resolve) => {
      const panel = vscode21.window.createWebviewPanel(
        "databaseConnectionEditor",
        existing ? `Edit ${existing.name}` : "Add Database Connection",
        vscode21.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      const editor = new _ConnectionEditorPanel(panel, context.extensionUri, connectionManager, existing, resolve);
      context.subscriptions.push(panel);
      editor.render();
    });
  }
  render() {
    this.panel.webview.html = this.html(this.panel.webview, this.toForm(this.existing));
  }
  async handleMessage(message) {
    if (message.type === "cancel") {
      this.panel.dispose();
      return;
    }
    if (message.type === "delete") {
      await this.connectionManager.delete(message.id);
      const connections = this.connectionManager.getConnections();
      await this.connectionManager.setSelectedConnection(connections[0]?.id);
      await this.panel.webview.postMessage({
        type: "connections",
        connections,
        selectedId: connections[0]?.id ?? "new"
      });
      return;
    }
    if (message.type === "pickSqliteFile") {
      const files = await vscode21.window.showOpenDialog({
        title: "Choose SQLite database file",
        openLabel: "Use Database File",
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "SQLite databases": ["db", "sqlite", "sqlite3"],
          "All files": ["*"]
        }
      });
      const file = files?.[0];
      if (file) {
        await this.panel.webview.postMessage({ type: "sqliteFile", path: file.fsPath });
      }
      return;
    }
    if (message.type === "test") {
      await this.postState("testing", "Testing connection...");
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        const detail = await this.connectionManager.testConfig(config);
        await this.postState("success", `Connected to ${engineDisplayName(config.type)}: ${detail}`);
      } catch (error) {
        await this.postState("error", friendlyConnectionError(error, message.config.type));
      }
      return;
    }
    if (message.type === "save") {
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        this.resolve(config);
        this.panel.dispose();
      } catch (error) {
        await this.postState("error", error instanceof Error ? error.message : String(error));
      }
    }
  }
  async postState(state, message) {
    await this.panel.webview.postMessage({ type: "state", state, message });
  }
  fromForm(form) {
    const defaults = connectionDefaultsForType(form.type);
    const port = Number(form.port);
    const hostRequired = form.type !== "sqlite";
    const usernameRequired = form.type !== "sqlite" && form.type !== "redis";
    const missing = [];
    if (!form.name.trim()) {
      missing.push("connection name");
    }
    if (!form.database.trim()) {
      missing.push(databaseFieldLabel(form.type).toLowerCase());
    }
    if (hostRequired && !form.host.trim()) {
      missing.push(hostFieldLabel(form.type).toLowerCase());
    }
    if (usernameRequired && !form.username.trim()) {
      missing.push("username");
    }
    if (missing.length > 0) {
      throw new Error(`Required ${missing.length === 1 ? "field is" : "fields are"} missing: ${missing.join(", ")}.`);
    }
    if (form.type !== "sqlite" && (!Number.isInteger(port) || port <= 0)) {
      throw new Error(`${engineDisplayName(form.type)} port must be a positive whole number.`);
    }
    if (form.type === "redis") {
      const index = Number(form.database.trim());
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("Redis database index must be a zero-based whole number, for example 0.");
      }
    }
    return {
      id: form.id ?? this.existing?.id ?? createId("conn"),
      name: form.name.trim(),
      type: form.type,
      host: form.host.trim() || defaults.host,
      port: form.type === "sqlite" ? 0 : port,
      database: form.database.trim(),
      username: form.username.trim(),
      password: form.password === "" ? void 0 : form.password,
      sslMode: toSslMode(form.sslMode, defaults.sslMode),
      defaultSchema: form.defaultSchema?.trim() || defaults.defaultSchema,
      color: form.color,
      connectTimeoutMs: toOptionalNumber(form.connectTimeoutMs),
      queryTimeoutMs: toOptionalNumber(form.queryTimeoutMs),
      production: form.production === true,
      readOnlyDefault: form.readOnlyDefault === true,
      sshTunnel: this.sshTunnelFromForm(form)
    };
  }
  sshTunnelFromForm(form) {
    if (form.sshTunnelEnabled !== true) {
      return void 0;
    }
    const host = form.sshTunnelHost?.trim() || "";
    const username = form.sshTunnelUser?.trim() || "";
    if (!host || !username) {
      throw new Error("SSH tunnel requires a bastion host and username.");
    }
    return {
      enabled: true,
      host,
      port: toOptionalNumber(form.sshTunnelPort),
      username,
      privateKeyPath: form.sshTunnelKeyPath?.trim() || void 0,
      localHost: form.sshTunnelLocalHost?.trim() || void 0,
      localPort: toOptionalNumber(form.sshTunnelLocalPort)
    };
  }
  toForm(connection) {
    const defaults = connectionDefaultsForType(connection?.type ?? "postgres");
    return {
      id: connection?.id,
      name: connection?.name ?? defaults.name,
      type: connection?.type ?? "postgres",
      host: connection?.host ?? defaults.host,
      port: String(connection?.port ?? defaults.port),
      database: connection?.database ?? defaults.database,
      username: connection?.username ?? defaults.username,
      password: "",
      sslMode: connection?.sslMode ?? defaults.sslMode,
      defaultSchema: connection?.defaultSchema ?? defaults.defaultSchema,
      color: connection?.color ?? defaults.color,
      connectTimeoutMs: connection?.connectTimeoutMs ? String(connection.connectTimeoutMs) : "",
      queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode21.workspace.getConfiguration("database").get("query.timeoutMs", 3e5)),
      production: connection?.production ?? false,
      readOnlyDefault: connection?.readOnlyDefault ?? false,
      sshTunnelEnabled: connection?.sshTunnel?.enabled ?? false,
      sshTunnelHost: connection?.sshTunnel?.host ?? "",
      sshTunnelPort: connection?.sshTunnel?.port ? String(connection.sshTunnel.port) : "22",
      sshTunnelUser: connection?.sshTunnel?.username ?? "",
      sshTunnelKeyPath: connection?.sshTunnel?.privateKeyPath ?? "",
      sshTunnelLocalHost: connection?.sshTunnel?.localHost ?? "127.0.0.1",
      sshTunnelLocalPort: connection?.sshTunnel?.localPort ? String(connection.sshTunnel.localPort) : ""
    };
  }
  html(webview, form) {
    const nonce = getNonce();
    const data = JSON.stringify(form).replace(/</g, "\\u003c");
    const connections = JSON.stringify(this.connectionManager.getConnections()).replace(/</g, "\\u003c");
    const defaults = JSON.stringify(DEFAULTS_BY_DATABASE_TYPE).replace(/</g, "\\u003c");
    const guidance = JSON.stringify(ENGINE_GUIDANCE_BY_DATABASE_TYPE).replace(/</g, "\\u003c");
    const codicons = webview.asWebviewUri(vscode21.Uri.joinPath(this.extensionUri, "media", "codicons", "codicon.css"));
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${codicons}" rel="stylesheet">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --text-disabled: var(--vscode-disabledForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --space-lg: clamp(0.75rem, 0.65rem + 0.4vw, 1rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      --radius-md: 0.4rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    .codicon[class*='codicon-'] { font-size: var(--icon-size); line-height: 1; color: inherit; vertical-align: middle; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button, input, select { font: inherit; }
    button {
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation-duration: 0.001ms !important; }
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .6;
    }
    .dialog-shell {
      height: 100vh;
      display: grid;
      place-items: center;
      padding: var(--space-lg);
      overflow: auto;
    }
    form.dialog {
      width: min(92vw, 68rem);
      max-height: min(90vh, 52rem);
      min-height: min(38rem, 90vh);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-main);
      box-shadow: 0 1rem 2.6rem color-mix(in srgb, black 34%, transparent);
      overflow: hidden;
    }
    .dialog-titlebar {
      min-height: clamp(2.4rem, 2.15rem + .6vw, 3rem);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .dialog-titlebar h1 {
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 1.04rem;
      font-weight: 600;
    }
    .close {
      width: var(--toolbar-button-size);
      padding: 0;
      font-size: 1.05rem;
    }
    .dialog-body {
      min-height: 0;
      display: grid;
      grid-template-columns: clamp(12rem, 22vw, 17rem) minmax(0, 1fr);
      overflow: hidden;
    }
    .sidebar {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border-right: 1px solid var(--border);
      background: var(--bg-panel);
      overflow: hidden;
    }
    .sidebar-header {
      padding: var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .section-label {
      display: block;
      margin-bottom: var(--space-xs);
      color: var(--text-muted);
      font-size: .86em;
      font-weight: 600;
      text-transform: uppercase;
    }
    .rail-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      display: inline-grid;
      place-items: center;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .data-source-list {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .source-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      background: transparent;
      text-align: left;
    }
    .source-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .db-icon {
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .source-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .status-dot {
      width: .45rem;
      height: .45rem;
      border-radius: 50%;
      background: var(--success);
    }
    .problems {
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      color: var(--text-muted);
    }
    .content {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .top-fields {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto minmax(11rem, 14rem) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-md);
      border-bottom: 1px solid var(--border);
    }
    .field-label {
      color: var(--text-muted);
      white-space: nowrap;
    }
    .field-label.required::after {
      content: " *";
      color: var(--danger);
    }
    input,
    select {
      min-width: 0;
      height: var(--toolbar-button-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-sm);
      padding: 0 var(--space-sm);
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border, var(--border));
    }
    .comment-link {
      grid-column: 2 / 3;
      justify-self: start;
      height: auto;
      padding: 0;
      color: var(--accent);
      border: 0;
      background: transparent;
    }
    .tabs {
      display: flex;
      align-items: flex-end;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-md) 0;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      padding: 0 var(--space-md);
      color: var(--text-muted);
      border-color: transparent;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      white-space: nowrap;
    }
    .tab.active {
      color: var(--text-main);
      background: var(--bg-main);
      border-color: var(--border);
      border-bottom-color: var(--bg-main);
    }
    .tab-panel {
      min-height: 0;
      display: none;
      overflow: auto;
      padding: var(--space-md);
    }
    .tab-panel.active { display: block; }
    .form-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 11rem) minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      align-items: center;
      max-width: 56rem;
    }
    .full-row {
      grid-column: 2 / -1;
      min-width: 0;
    }
    .segment {
      display: inline-flex;
      align-items: stretch;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .segment button {
      border: 0;
      border-right: 1px solid var(--border);
      border-radius: 0;
      color: var(--text-muted);
      background: var(--bg-elevated);
    }
    .segment button:last-child { border-right: 0; }
    .segment button.active {
      color: var(--text-main);
      background: var(--bg-selected);
    }
    .inline-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      min-width: 0;
    }
    .field-stack {
      display: grid;
      gap: var(--space-xs);
      min-width: 0;
    }
    .path-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-sm);
      align-items: center;
      min-width: 0;
    }
    .path-row .icon-button {
      border-color: var(--vscode-button-border, var(--border));
      background: var(--bg-elevated);
    }
    .field-help {
      min-height: 1.15em;
      color: var(--text-muted);
      font-size: .88em;
      line-height: 1.3;
    }
    .field-help:empty {
      display: none;
    }
    .password-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      min-width: 0;
    }
    .url-field {
      font-family: var(--vscode-editor-font-family);
    }
    .schemas-layout {
      min-height: 20rem;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .schema-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 16rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .schema-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .schema-row {
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      text-align: left;
      width: 100%;
      border-radius: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
    }
    .schema-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .schema-row.child { padding-left: calc(var(--space-lg) * 1.6); }
    .schema-row input[type="checkbox"],
    .check input[type="checkbox"] {
      width: 1rem;
      height: 1rem;
      accent-color: var(--accent);
      padding: 0;
    }
    .schema-footer {
      display: grid;
      gap: var(--space-sm);
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
    }
    .pattern {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-sm);
      align-items: center;
    }
    .pattern code {
      overflow: auto;
      padding: var(--space-xs);
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      font-family: var(--vscode-editor-font-family);
      white-space: nowrap;
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-md);
      align-items: center;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-main);
    }
    .advanced-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
      gap: var(--space-sm);
      max-width: 42rem;
      align-items: center;
    }
    .empty-state {
      color: var(--text-muted);
      padding: var(--space-md);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .dialog-actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      padding: var(--space-sm) var(--space-md);
      border-top: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .button-row {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }
    .primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-border, transparent);
    }
    .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border, transparent);
    }
    #status {
      min-width: 0;
      min-height: var(--toolbar-button-size);
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-muted);
      overflow: auto;
      white-space: normal;
      line-height: 1.25;
    }
    #status.error { color: var(--danger); }
    #status.success { color: var(--success); }
    #status.testing::before {
      content: "";
      width: .75rem;
      height: .75rem;
      border-radius: 50%;
      border: 2px solid var(--accent);
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) {
      .dialog-shell { padding: 0; place-items: stretch; }
      form.dialog { width: 100vw; min-height: 100vh; max-height: 100vh; border: 0; }
      .dialog-body { grid-template-columns: minmax(0, 1fr); }
      .sidebar { display: none; }
      .top-fields,
      .form-grid,
      .advanced-grid,
      .schema-toolbar { grid-template-columns: minmax(0, 1fr); }
      .comment-link,
      .full-row { grid-column: 1 / -1; }
      .password-row,
      .inline-row { grid-template-columns: minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <div class="dialog-shell">
    <form id="form" class="dialog">
      <div class="dialog-titlebar">
        <h1>Data Sources and Drivers</h1>
        <button type="button" id="cancelTop" class="close" aria-label="Close"><i class="codicon codicon-close"></i></button>
      </div>
      <div class="dialog-body">
        <aside class="sidebar" aria-label="Data sources">
          <div class="sidebar-header">
            <span class="section-label">Data Sources</span>
            <div class="rail-toolbar" role="toolbar" aria-label="Data source actions">
              <button type="button" class="icon-button" title="Add data source" aria-label="Add data source"><i class="codicon codicon-add"></i></button>
              <button type="button" class="icon-button" title="Remove data source" aria-label="Remove data source"><i class="codicon codicon-remove"></i></button>
            </div>
          </div>
          <div class="data-source-list">
            <button type="button" class="source-row active">
              <span class="db-icon"><i class="codicon codicon-database"></i></span>
              <span class="source-name" id="sourceName">Connection</span>
              <span class="status-dot" title="Configured"></span>
            </button>
          </div>
        </aside>
        <section class="content">
          <div class="top-fields">
            <span class="field-label" data-field-label="name">Name:</span>
            <input name="name" autocomplete="off" aria-label="Connection name" data-field="name">
            <span class="field-label">Driver:</span>
            <select name="type" id="typeField" aria-label="Database type">
              <option value="postgres">PostgreSQL</option>
              <option value="redshift">Amazon Redshift</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
              <option value="sqlserver">Microsoft SQL Server</option>
              <option value="oracle">Oracle</option>
              <option value="redis">Redis</option>
              <option value="snowflake">Snowflake</option>
            </select>
            <span class="field-label">Color:</span>
            <select name="color" aria-label="Connection color">
              <option>green</option>
              <option>blue</option>
              <option>purple</option>
              <option>yellow</option>
              <option>red</option>
              <option>gray</option>
            </select>
          </div>
          <div class="tabs" role="tablist" aria-label="Connection settings">
            <button type="button" class="tab active" data-tab="general" role="tab" aria-selected="true">General</button>
            <button type="button" class="tab" data-tab="options" role="tab">Options</button>
            <button type="button" class="tab" data-tab="ssh" role="tab">SSH/SSL</button>
            <button type="button" class="tab" data-tab="schemas" role="tab">Schemas</button>
          </div>
          <div class="tab-panel active" data-panel="general">
            <div class="form-grid">
              <span class="field-label">Connection type:</span>
              <div class="segment full-row" role="group" aria-label="Connection type">
                <button type="button" data-db-type="postgres">PostgreSQL</button>
                <button type="button" data-db-type="redshift">Redshift</button>
                <button type="button" data-db-type="mysql">MySQL</button>
                <button type="button" data-db-type="sqlite">SQLite</button>
                <button type="button" data-db-type="sqlserver">SQL Server</button>
                <button type="button" data-db-type="oracle">Oracle</button>
                <button type="button" data-db-type="redis">Redis</button>
                <button type="button" data-db-type="snowflake">Snowflake</button>
              </div>
              <span class="field-label" data-field-label="host">Host:</span>
              <div class="field-stack full-row">
                <div class="inline-row">
                  <input name="host" autocomplete="off" aria-label="Host" data-field="host">
                  <input name="port" inputmode="numeric" aria-label="Port" data-field="port">
                </div>
                <div class="field-help" data-help="host"></div>
              </div>
              <span class="field-label" data-field-label="username">User:</span>
              <div class="field-stack full-row">
                <input name="username" autocomplete="off" aria-label="Username" data-field="username">
                <div class="field-help" data-help="username"></div>
              </div>
              <span class="field-label" data-field-label="password">Password:</span>
              <div class="field-stack full-row">
                <div class="password-row">
                  <input name="password" type="password" placeholder="${form.id ? "Leave blank to keep existing password" : ""}" aria-label="Password" data-field="password">
                </div>
                <div class="field-help" data-help="auth"></div>
              </div>
              <span class="field-label" data-field-label="database">Database:</span>
              <div class="field-stack full-row">
                <div class="path-row">
                  <input name="database" autocomplete="off" aria-label="Database" data-field="database">
                  <button type="button" id="sqlitePick" class="icon-button" title="Choose SQLite database file" aria-label="Choose SQLite database file"><i class="codicon codicon-folder-opened"></i></button>
                </div>
                <div class="field-help" data-help="database"></div>
              </div>
              <span class="field-label">URL:</span>
              <input class="full-row url-field" id="urlPreview" readonly aria-label="JDBC URL preview">
            </div>
          </div>
          <div class="tab-panel" data-panel="options">
            <div class="advanced-grid">
              <span class="field-label">Read mode:</span>
              <label class="check"><input name="readOnlyDefault" type="checkbox">Read-only by default</label>
              <span class="field-label">Environment:</span>
              <label class="check"><input name="production" type="checkbox">Production connection</label>
              <span class="field-label">Connect timeout ms:</span>
              <input name="connectTimeoutMs" inputmode="numeric" aria-label="Connect timeout milliseconds">
              <span class="field-label">Query timeout ms:</span>
              <input name="queryTimeoutMs" inputmode="numeric" aria-label="Query timeout milliseconds">
            </div>
          </div>
          <div class="tab-panel" data-panel="ssh">
            <div class="advanced-grid">
              <span class="field-label">SSH tunnel:</span>
              <label class="check"><input name="sshTunnelEnabled" type="checkbox">Use SSH tunnel</label>
              <span class="field-label">Bastion host:</span>
              <div class="inline-row full-row">
                <input name="sshTunnelHost" autocomplete="off" aria-label="SSH tunnel host">
                <input name="sshTunnelPort" inputmode="numeric" aria-label="SSH tunnel port">
              </div>
              <span class="field-label">Bastion user:</span>
              <input class="full-row" name="sshTunnelUser" autocomplete="off" aria-label="SSH tunnel username">
              <span class="field-label">Private key:</span>
              <input class="full-row" name="sshTunnelKeyPath" autocomplete="off" aria-label="SSH private key path">
              <span class="field-label">Local bind:</span>
              <div class="inline-row full-row">
                <input name="sshTunnelLocalHost" autocomplete="off" aria-label="SSH tunnel local host">
                <input name="sshTunnelLocalPort" inputmode="numeric" aria-label="SSH tunnel local port">
              </div>
              <span class="field-label">SSL mode:</span>
              <div class="field-stack">
                <select name="sslMode" aria-label="SSL mode" data-field="sslMode"><option>disable</option><option>prefer</option><option>require</option></select>
                <div class="field-help" data-help="ssl"></div>
              </div>
            </div>
          </div>
          <div class="tab-panel" data-panel="schemas">
            <div class="advanced-grid">
              <span class="field-label" data-field-label="defaultSchema">Default schema:</span>
              <div class="field-stack">
                <input name="defaultSchema" autocomplete="off" aria-label="Default schema" data-field="defaultSchema">
                <div class="field-help" data-help="defaultSchema"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="dialog-actions">
        <button type="button" id="test" class="secondary">Test Connection</button>
        <div id="status" aria-live="polite"></div>
        <div class="button-row">
          <button type="button" id="cancel" class="secondary">Cancel</button>
          <button type="button" id="save" class="primary">OK</button>
        </div>
      </div>
    </form>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const formData = ${data};
    const allConnections = ${connections};
    const defaultsByType = ${defaults};
    const engineGuidance = ${guidance};
    const form = document.getElementById('form');
    const connectionList = allConnections.map((connection) => ({ ...connection }));
    let selectedId = formData.id ?? (connectionList[0]?.id || 'new');
    let draftActive = !formData.id;
    for (const [key, value] of Object.entries(formData)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value ?? '';
    }
    let previousType = formData.type || 'postgres';
    const typeField = form.elements.namedItem('type');
    const sourceName = document.getElementById('sourceName');
    const urlPreview = document.getElementById('urlPreview');
    const typeButtons = Array.from(document.querySelectorAll('[data-db-type]'));
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const fieldLabels = Object.fromEntries(Array.from(document.querySelectorAll('[data-field-label]')).map((label) => [label.dataset.fieldLabel, label]));
    const fieldHelp = Object.fromEntries(Array.from(document.querySelectorAll('[data-help]')).map((help) => [help.dataset.help, help]));
    const sqlitePickButton = document.getElementById('sqlitePick');
    const addButton = document.querySelector('.rail-toolbar button[title="Add data source"]');
    const removeButton = document.querySelector('.rail-toolbar button[title="Remove data source"]');
    const sourceRows = document.querySelector('.data-source-list');
    function connectionLabel(connection) {
      return connection.name || defaultsByType[connection.type || 'postgres'].name;
    }
    function guidanceFor(type) {
      return engineGuidance[type] || engineGuidance.postgres;
    }
    function defaultsFor(type) {
      return defaultsByType[type] || defaultsByType.postgres;
    }
    function setLabel(name, text) {
      if (fieldLabels[name]) {
        fieldLabels[name].textContent = text;
      }
    }
    function setHelp(name, text) {
      if (fieldHelp[name]) {
        fieldHelp[name].textContent = text || '';
      }
    }
    function setRequired(name, required) {
      const label = fieldLabels[name];
      const field = form.elements.namedItem(name);
      if (label) {
        label.classList.toggle('required', required);
      }
      if (field) {
        field.toggleAttribute('required', required);
        field.setAttribute('aria-required', required ? 'true' : 'false');
      }
    }
    function setDisabled(name, disabled) {
      const field = form.elements.namedItem(name);
      if (field) {
        field.disabled = disabled;
      }
    }
    function applyEngineGuidance() {
      const type = typeField.value || 'postgres';
      const guidance = guidanceFor(type);
      const defaults = defaultsFor(type);
      setLabel('host', guidance.hostLabel);
      setLabel('database', guidance.databaseLabel);
      setLabel('username', guidance.usernameLabel);
      setLabel('defaultSchema', guidance.defaultSchemaLabel);
      setRequired('name', true);
      setRequired('host', guidance.required.host === true);
      setRequired('username', guidance.required.username === true);
      setRequired('database', guidance.required.database === true);
      setHelp('host', guidance.hostHelp || '');
      setHelp('username', guidance.usernameHelp);
      setHelp('auth', guidance.authHelp);
      setHelp('database', guidance.databaseHelp);
      setHelp('ssl', guidance.sslHelp);
      setHelp('defaultSchema', guidance.defaultSchemaHelp);
      const hostField = form.elements.namedItem('host');
      const portField = form.elements.namedItem('port');
      const databaseField = form.elements.namedItem('database');
      const usernameField = form.elements.namedItem('username');
      if (hostField) {
        hostField.placeholder = guidance.hostPlaceholder || defaults.host || '';
        hostField.setAttribute('aria-label', guidance.hostLabel.replace(/:$/, ''));
      }
      if (portField) {
        portField.placeholder = defaults.port || '';
      }
      if (databaseField) {
        databaseField.placeholder = guidance.databasePlaceholder || defaults.database || '';
        databaseField.inputMode = type === 'redis' ? 'numeric' : 'text';
        databaseField.setAttribute('aria-label', guidance.databaseLabel.replace(/:$/, ''));
      }
      if (usernameField) {
        usernameField.placeholder = guidance.usernamePlaceholder || defaults.username || '';
        usernameField.setAttribute('aria-label', guidance.usernameLabel.replace(/:$/, ''));
      }
      for (const field of ['host', 'port', 'username', 'password', 'sslMode']) {
        setDisabled(field, guidance.disabled?.[field] === true);
      }
      sqlitePickButton.hidden = type !== 'sqlite';
    }
    function renderSourceList() {
      const selected = selectedId;
      sourceRows.innerHTML = '';
      const draftRow = document.createElement('button');
      draftRow.type = 'button';
      draftRow.className = 'source-row' + (selected === 'new' ? ' active' : '');
      draftRow.innerHTML = '<span class="db-icon"><i class="codicon codicon-add"></i></span><span class="source-name">New connection</span><span class="status-dot" title="Draft"></span>';
      draftRow.addEventListener('click', () => selectConnection('new'));
      sourceRows.appendChild(draftRow);
      for (const connection of connectionList) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'source-row' + (selected === connection.id ? ' active' : '');
        row.innerHTML = '<span class="db-icon"><i class="codicon codicon-database"></i></span><span class="source-name"></span><span class="status-dot" title="Configured"></span>';
        row.querySelector('.source-name').textContent = connectionLabel(connection);
        row.addEventListener('click', () => selectConnection(connection.id));
        sourceRows.appendChild(row);
      }
    }
    function loadConnection(connection) {
      const selectedType = form.elements.namedItem('type').value || 'postgres';
      const selectedDefaults = defaultsFor(selectedType);
      const next = connection || {
        id: undefined,
        name: selectedDefaults.name,
        type: selectedType,
        host: selectedDefaults.host,
        port: selectedDefaults.port,
        database: selectedDefaults.database,
        username: selectedDefaults.username,
        password: '',
        sslMode: selectedDefaults.sslMode,
        defaultSchema: selectedDefaults.defaultSchema,
        color: selectedDefaults.color,
        sshTunnelEnabled: false,
        sshTunnelHost: '',
        sshTunnelPort: '22',
        sshTunnelUser: '',
        sshTunnelKeyPath: '',
        sshTunnelLocalHost: '127.0.0.1',
        sshTunnelLocalPort: ''
      };
      for (const [key, value] of Object.entries(next)) {
        const field = form.elements.namedItem(key);
        if (!field) continue;
        if (field.type === 'checkbox') field.checked = value === true;
        else field.value = value ?? '';
      }
      formData.id = next.id;
      previousType = form.elements.namedItem('type').value || 'postgres';
      draftActive = !next.id;
      applyEngineGuidance();
      syncDerivedFields();
      renderSourceList();
    }
    function selectConnection(id) {
      selectedId = id;
      if (id === 'new') {
        const type = typeField.value || 'postgres';
        const defaults = defaultsFor(type);
        loadConnection({
          type,
          name: defaults.name,
          host: defaults.host,
          port: defaults.port,
          database: defaults.database,
          username: defaults.username,
          password: '',
          sslMode: defaults.sslMode,
          defaultSchema: defaults.defaultSchema,
          color: defaults.color,
          sshTunnelEnabled: false,
          sshTunnelHost: '',
          sshTunnelPort: '22',
          sshTunnelUser: '',
          sshTunnelKeyPath: '',
          sshTunnelLocalHost: '127.0.0.1',
          sshTunnelLocalPort: ''
        });
        return;
      }
      const existing = connectionList.find((connection) => connection.id === id);
      if (existing) {
        loadConnection({
          ...existing,
          password: '',
          sshTunnelEnabled: existing.sshTunnel?.enabled ?? false,
          sshTunnelHost: existing.sshTunnel?.host ?? '',
          sshTunnelPort: existing.sshTunnel?.port ? String(existing.sshTunnel.port) : '22',
          sshTunnelUser: existing.sshTunnel?.username ?? '',
          sshTunnelKeyPath: existing.sshTunnel?.privateKeyPath ?? '',
          sshTunnelLocalHost: existing.sshTunnel?.localHost ?? '127.0.0.1',
          sshTunnelLocalPort: existing.sshTunnel?.localPort ? String(existing.sshTunnel.localPort) : ''
        });
      }
    }
    function syncDerivedFields() {
      applyEngineGuidance();
      const name = form.elements.namedItem('name').value || 'Connection';
      const type = typeField.value;
      const host = form.elements.namedItem('host').value || 'host';
      const port = form.elements.namedItem('port').value || '';
      const database = form.elements.namedItem('database').value || 'database';
      sourceName.textContent = name;
      const scheme = {
        postgres: 'postgresql',
        redshift: 'redshift',
        mysql: 'mysql',
        sqlite: 'sqlite',
        sqlserver: 'sqlserver',
        oracle: 'oracle',
        redis: 'redis',
        snowflake: 'snowflake'
      }[type] || type;
      urlPreview.value = type === 'sqlite'
        ? 'sqlite:' + database
        : scheme + '://' + host + (port ? ':' + port : '') + '/' + database;
      typeButtons.forEach((button) => button.classList.toggle('active', button.dataset.dbType === type));
      renderSourceList();
    }
    function applyDefaultsForType(nextType) {
      const previousDefaults = defaultsFor(previousType);
      const nextDefaults = defaultsFor(nextType);
      for (const name of ['name', 'host', 'port', 'database', 'sslMode', 'color', 'defaultSchema']) {
        const field = form.elements.namedItem(name);
        if (!field) continue;
        if (!field.value || field.value === previousDefaults[name]) {
          field.value = nextDefaults[name];
        }
      }
      previousType = nextType;
      applyEngineGuidance();
    }
    typeField.addEventListener('change', () => {
      const nextType = typeField.value;
      applyDefaultsForType(nextType);
      syncDerivedFields();
    });
    typeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        typeField.value = button.dataset.dbType;
        typeField.dispatchEvent(new Event('change'));
      });
    });
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        tabs.forEach((item) => {
          item.classList.toggle('active', item === tab);
          item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
        });
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === id));
      });
    });
    for (const name of ['name', 'host', 'port', 'database', 'defaultSchema']) {
      form.elements.namedItem(name)?.addEventListener('input', syncDerivedFields);
    }
    form.elements.namedItem('type')?.addEventListener('change', syncDerivedFields);
    sqlitePickButton.addEventListener('click', () => vscode.postMessage({ type: 'pickSqliteFile' }));
    addButton.addEventListener('click', () => selectConnection('new'));
    removeButton.addEventListener('click', () => {
      if (selectedId === 'new') {
        const fallback = connectionList[0];
        selectedId = fallback?.id || 'new';
        selectConnection(selectedId);
        return;
      }
      const id = selectedId;
      if (!id) return;
      vscode.postMessage({ type: 'delete', id });
    });
    function collect() {
      const data = {};
      for (const element of form.elements) {
        if (!element.name) continue;
        if (element.disabled) {
          data[element.name] = element.type === 'checkbox' ? false : '';
          continue;
        }
        data[element.name] = element.type === 'checkbox' ? element.checked : element.value;
      }
      data.id = formData.id;
      return data;
    }
    document.getElementById('save').addEventListener('click', () => vscode.postMessage({ type: 'save', config: collect() }));
    document.getElementById('test').addEventListener('click', () => vscode.postMessage({ type: 'test', config: collect() }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('cancelTop').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    window.addEventListener('message', event => {
      if (event.data?.type === 'sqliteFile') {
        const databaseField = form.elements.namedItem('database');
        if (databaseField && typeof event.data.path === 'string') {
          databaseField.value = event.data.path;
          syncDerivedFields();
        }
        return;
      }
      if (event.data?.type === 'connections') {
        connectionList.splice(0, connectionList.length, ...(event.data.connections || []));
        if (event.data.selectedId) {
          selectedId = event.data.selectedId;
        }
        if (selectedId === 'new' || !connectionList.some((connection) => connection.id === selectedId)) {
          selectedId = connectionList[0]?.id || 'new';
        }
        renderSourceList();
        if (selectedId === 'new') {
          selectConnection('new');
        } else {
          const active = connectionList.find((connection) => connection.id === selectedId);
          if (active) {
            loadConnection({ ...active, password: '' });
          }
        }
        return;
      }
      const status = document.getElementById('status');
      status.className = event.data.state || '';
      status.textContent = event.data.message || '';
      const testing = event.data.state === 'testing';
      document.getElementById('save').disabled = testing;
      document.getElementById('test').disabled = testing;
    });
    renderSourceList();
    if (formData.id) {
      selectConnection(formData.id);
    } else {
      selectConnection('new');
    }
  </script>
</body>
</html>`;
  }
};
function toOptionalNumber(value) {
  if (!value) {
    return void 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : void 0;
}
function toSslMode(value, fallback) {
  return value === "disable" || value === "prefer" || value === "require" ? value : fallback;
}
function engineDisplayName(type) {
  return {
    postgres: "PostgreSQL",
    redshift: "Amazon Redshift",
    mysql: "MySQL",
    sqlite: "SQLite",
    sqlserver: "Microsoft SQL Server",
    oracle: "Oracle",
    redis: "Redis",
    snowflake: "Snowflake"
  }[type];
}
function databaseFieldLabel(type) {
  return {
    postgres: "Database",
    redshift: "Database",
    mysql: "Database",
    sqlite: "SQLite database file",
    sqlserver: "Database",
    oracle: "Oracle service name",
    redis: "Redis database index",
    snowflake: "Database"
  }[type];
}
function hostFieldLabel(type) {
  return type === "snowflake" ? "Snowflake account" : type === "redshift" ? "cluster endpoint" : "host";
}
function friendlyConnectionError(error, type) {
  const message = error instanceof Error ? error.message : String(error);
  const hint = connectionTestHint(type);
  return hint ? `${message} ${hint}` : message;
}
function connectionTestHint(type) {
  return {
    postgres: "Hint: check host, port, database, username, password, and whether SSL should be require for managed providers.",
    redshift: "Hint: use the cluster endpoint, port 5439, database name, and SSL mode require.",
    mysql: "Hint: check that the MySQL user can access this database from your client host, and use SSL require when the server enforces TLS.",
    sqlite: "Hint: choose a readable .db/.sqlite file, or use :memory: for a temporary in-memory database.",
    sqlserver: "Hint: SSL mode prefer encrypts while trusting the server certificate; use require only when the certificate chain is trusted.",
    oracle: "Hint: the database field is the Oracle service name in host:port/service, for example ORCLPDB1.",
    redis: "Hint: Redis database must be a zero-based number such as 0; username is optional unless ACLs are enabled.",
    snowflake: "Hint: enter the Snowflake account identifier rather than a full URL, and keep SSL mode require."
  }[type];
}
function getNonce() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

// src/webviews/queryMap/QueryMapProvider.ts
var vscode22 = __toESM(require("vscode"));
var PROJECT_SQL_SESSION_PREFIX = "project-sql:";
var QueryMapProvider = class {
  constructor(extensionUri, sectionService, revealSection, runSection, getHistoryItems, openHistoryItem, setConsolePinned, untrackConsole, moveConsole, touchConsoleDocument, updateHistoryItem, deleteHistoryItem, clearActiveSessions, clearHistoryItems, refreshData) {
    this.extensionUri = extensionUri;
    this.sectionService = sectionService;
    this.revealSection = revealSection;
    this.runSection = runSection;
    this.getHistoryItems = getHistoryItems;
    this.openHistoryItem = openHistoryItem;
    this.setConsolePinned = setConsolePinned;
    this.untrackConsole = untrackConsole;
    this.moveConsole = moveConsole;
    this.touchConsoleDocument = touchConsoleDocument;
    this.updateHistoryItem = updateHistoryItem;
    this.deleteHistoryItem = deleteHistoryItem;
    this.clearActiveSessions = clearActiveSessions;
    this.clearHistoryItems = clearHistoryItems;
    this.refreshData = refreshData;
  }
  static viewType = "databaseQueryMap";
  view;
  groups = [];
  historyGroups = [];
  consoleRecords = [];
  connections = [];
  activeConnectionIds = /* @__PURE__ */ new Set();
  runningDocumentUris = /* @__PURE__ */ new Set();
  resultTabs = [];
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => void this.onMessage(message));
    this.postState();
  }
  updateConsoles(records, connections, activeConnectionIds = []) {
    this.consoleRecords = records;
    this.connections = connections;
    this.activeConnectionIds = new Set(activeConnectionIds);
    this.refreshGroups();
  }
  updateRunningDocuments(documentUris) {
    this.runningDocumentUris = new Set(documentUris);
    this.refreshGroups();
  }
  updateFromEditor(_editor) {
    this.refreshGroups();
  }
  refreshGroups() {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groupsByConnection = /* @__PURE__ */ new Map();
    const todayStart = this.todayStart();
    for (const record of this.consoleRecords) {
      const connection = connectionById.get(record.connectionId);
      const touchedAt = record.lastTouchedAt ?? record.updatedAt;
      const isActiveConnection = this.activeConnectionIds.has(record.connectionId);
      const isToday = touchedAt >= todayStart;
      if (!record.pinned && !isActiveConnection && !isToday) {
        continue;
      }
      const connectionId = record.connectionId;
      const connectionName = connection?.name ?? "Unknown connection";
      const databaseName = connection?.database;
      const running = this.runningDocumentUris.has(record.documentUri);
      const group = groupsByConnection.get(connectionId) ?? {
        id: connectionId,
        connectionName,
        databaseName,
        documents: []
      };
      const latestResult = this.latestResultForDocument(record.documentUri);
      group.documents.push({
        id: record.id,
        documentUri: record.documentUri,
        documentTitle: this.documentTitle(record.documentUri),
        pinned: record.pinned === true,
        sortOrder: this.consoleSortValue(record),
        lastTouchedAt: touchedAt,
        isActiveConnection,
        isToday,
        running,
        projectFile: record.id.startsWith(PROJECT_SQL_SESSION_PREFIX),
        status: running ? "running" : latestResult?.executionStatus,
        durationMs: running ? void 0 : latestResult?.executionTimeMs,
        rowCount: running ? void 0 : latestResult?.rowCount,
        items: []
      });
      groupsByConnection.set(connectionId, group);
    }
    this.groups = [...groupsByConnection.values()].map((group) => ({
      ...group,
      documents: group.documents.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.documentTitle.localeCompare(b.documentTitle))
    })).sort((a, b) => `${a.connectionName}:${a.databaseName ?? ""}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ""}`));
    this.historyGroups = this.toHistoryGroups(this.getHistoryItems(), todayStart);
    this.postState();
  }
  documentTitle(documentUri) {
    try {
      const uri = vscode22.Uri.parse(documentUri);
      return uri.fsPath.split(/[\\/]/).pop() || uri.toString();
    } catch {
      return documentUri.split(/[\\/]/).pop() || documentUri;
    }
  }
  updateResults(tabs) {
    this.resultTabs = tabs;
    this.refreshGroups();
  }
  async onMessage(message) {
    if (message.type === "ready") {
      this.postState();
      return;
    }
    if (message.type === "refreshQuerySessions") {
      await this.refreshData();
      return;
    }
    if (message.type === "newConsole") {
      await vscode22.commands.executeCommand("database.openSqlConsole");
      return;
    }
    if (message.type === "clearActiveSessions") {
      const ids = this.groups.flatMap((group) => group.documents.map((document) => document.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode22.window.showWarningMessage("Clear active query sessions?", { modal: true }, "Clear");
      if (answer === "Clear") {
        await this.clearActiveSessions(ids);
      }
      return;
    }
    if (message.type === "clearConsoleHistory") {
      const ids = this.historyGroups.flatMap((group) => group.items.map((item) => item.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode22.window.showWarningMessage("Clear console history?", { modal: true }, "Clear");
      if (answer === "Clear") {
        await this.clearHistoryItems(ids);
      }
      return;
    }
    if (message.type === "togglePin") {
      await this.setConsolePinned(message.consoleId, message.pinned);
      return;
    }
    if (message.type === "untrackConsole") {
      await this.untrackConsole(message.consoleId);
      return;
    }
    if (message.type === "moveConsole") {
      await this.moveConsole(message.consoleId, message.direction);
      return;
    }
    if (message.type === "openHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.openHistoryItem(item);
      }
      return;
    }
    if (message.type === "toggleFavoriteHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.updateHistoryItem({ ...item, favorite: message.favorite });
      }
      return;
    }
    if (message.type === "copyHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await vscode22.env.clipboard.writeText(item.sql);
      }
      return;
    }
    if (message.type === "deleteHistory") {
      await this.deleteHistoryItem(message.historyId);
      return;
    }
    if (message.type === "openConsole") {
      const opened2 = await this.openDocument(message.documentUri, { showMissingWarning: false });
      if (opened2.editor) {
        await this.touchConsoleDocument(message.documentUri);
      } else if (opened2.missing) {
        await this.untrackConsole(message.consoleId);
        void vscode22.window.showInformationMessage("SQL console file no longer exists. Removed it from Active Session.");
      }
      return;
    }
    if (!message.documentUri) {
      return;
    }
    const opened = await this.openDocument(message.documentUri);
    if (!opened.editor) {
      return;
    }
    const editor = opened.editor;
    const node = this.findNodeById(this.sectionService.getTree(editor.document), message.nodeId);
    if (!node || !node.sql.trim()) {
      void vscode22.window.showInformationMessage("No SQL section to run.");
      return;
    }
    const section = this.toSectionNode(node);
    if (message.type === "reveal") {
      await this.revealSection(message.documentUri, section);
      return;
    }
    if (message.type === "run") {
      await this.revealSection(message.documentUri, section);
      await this.runSection(message.documentUri, section);
    }
  }
  async openDocument(documentUri, options = {}) {
    try {
      const document = await vscode22.workspace.openTextDocument(vscode22.Uri.parse(documentUri));
      const editor = await vscode22.window.showTextDocument(document, { preview: false, viewColumn: vscode22.ViewColumn.Active });
      return { editor, missing: false };
    } catch (error) {
      if (this.isFileNotFound(error)) {
        if (options.showMissingWarning !== false) {
          void vscode22.window.showWarningMessage("Source SQL file no longer exists.");
        }
        return { missing: true };
      }
      void vscode22.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return { missing: false };
    }
  }
  isFileNotFound(error) {
    const code = error instanceof vscode22.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
  toItem(documentUri, section) {
    const lastRun = this.resultFor(documentUri, section);
    return {
      id: section.id,
      documentUri,
      index: section.index,
      kind: section.kind,
      name: section.name,
      title: this.itemTitle(section),
      preview: this.previewSql(section.sql, 160),
      line: section.range.start.line + 1,
      disabled: !section.sql.trim(),
      range: {
        startLine: section.range.start.line,
        startColumn: section.range.start.character,
        endLine: section.range.end.line,
        endColumn: section.range.end.character
      },
      children: section.children.map((child) => this.toItem(documentUri, child)),
      ...lastRun
    };
  }
  resultFor(documentUri, section) {
    const tab = [...this.resultTabs].filter((item) => item.sourceDocumentUri === documentUri && (item.sourceQueryId === section.id || item.sourceSectionIndex === section.index)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!tab) {
      return {};
    }
    return {
      status: tab.executionStatus,
      durationMs: tab.executionTimeMs,
      rowCount: tab.rowCount
    };
  }
  previewSql(sql, maxLength) {
    return sql.split(/\r?\n/).map((line) => line.replace(/--.*$/, "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, maxLength);
  }
  itemTitle(section) {
    if (section.kind === "cte") {
      return section.name ? `CTE ${section.name}` : `CTE ${section.index + 1}`;
    }
    if (section.kind === "subquery") {
      return `Subquery ${section.index + 1}`;
    }
    return `Query ${section.index + 1}`;
  }
  postState() {
    void this.view?.webview.postMessage({
      type: "state",
      groups: this.groups,
      historyGroups: this.historyGroups
    });
  }
  latestResultForDocument(documentUri) {
    return [...this.resultTabs].filter((item) => item.sourceDocumentUri === documentUri).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  toHistoryGroups(items, todayStart) {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groups = /* @__PURE__ */ new Map();
    for (const item of [...items].filter((history) => history.executedAt < todayStart).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.executedAt - a.executedAt).slice(0, 100)) {
      const connection = connectionById.get(item.connectionId);
      const group = groups.get(item.connectionId) ?? {
        id: item.connectionId,
        connectionName: connection?.name ?? "Unknown connection",
        databaseName: connection?.database,
        items: []
      };
      group.items.push({
        id: item.id,
        connectionId: item.connectionId,
        sql: item.sql,
        preview: this.previewSql(item.sql, 180),
        status: item.status,
        favorite: item.favorite === true,
        rowCount: item.rowCount,
        executedAt: item.executedAt,
        sourceFile: item.sourceFile
      });
      groups.set(item.connectionId, group);
    }
    return [...groups.values()].sort((a, b) => `${a.connectionName}:${a.databaseName ?? ""}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ""}`));
  }
  todayStart() {
    const now = /* @__PURE__ */ new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  consoleSortValue(record) {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
  }
  findNodeById(nodes, nodeId) {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      const child = this.findNodeById(node.children, nodeId);
      if (child) {
        return child;
      }
    }
    return void 0;
  }
  toSectionNode(node) {
    return {
      ...node,
      aliases: this.sectionService.extractAliases(node.sql),
      tables: this.sectionService.extractTables(node.sql)
    };
  }
  html(webview) {
    const nonce = Date.now().toString();
    const codicons = webview.asWebviewUri(vscode22.Uri.joinPath(this.extensionUri, "media", "codicons", "codicon.css"));
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicons}" rel="stylesheet">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --text-disabled: var(--vscode-disabledForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    .codicon[class*='codicon-'] { font-size: var(--icon-size); line-height: 1; color: inherit; vertical-align: middle; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-panel);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation-duration: 0.001ms !important; }
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .55;
    }
    .services-shell {
      height: 100vh;
      min-width: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-panel);
    }
    .services-header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .toolbar {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
    }
    .icon {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      display: inline-grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .tree-toggle {
      position: relative;
      width: var(--icon-size);
      display: inline-block;
      color: currentColor;
      flex: 0 0 auto;
    }
    .tree-toggle {
      height: var(--icon-size);
    }
    .toolbar-svg {
      width: calc(var(--icon-size) * 1.1);
      height: calc(var(--icon-size) * 1.1);
      display: block;
      color: currentColor;
      pointer-events: none;
    }
    .tree-toggle::before {
      content: '';
      position: absolute;
      width: .42rem;
      height: .42rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
    }
    .tree-toggle::before {
      top: 50%;
      left: 50%;
      transform: translate(-55%, -50%) rotate(-45deg);
    }
    .tree-toggle.expanded::before {
      transform: translate(-55%, -62%) rotate(45deg);
    }
    .tabs {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      padding: var(--space-xxs) var(--space-sm) 0;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      min-width: 0;
      padding: 0 var(--space-sm);
      color: var(--text-muted);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      white-space: nowrap;
    }
    .tab.active {
      color: var(--text-main);
      background: var(--bg-main);
      border-color: var(--border);
      border-bottom-color: var(--bg-main);
    }
    .panel-layout {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .services-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
      background: var(--bg-panel);
      scrollbar-width: thin;
    }
    .tree-group,
    .connection-header {
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      font-weight: 600;
    }
    .connection-header {
      width: 100%;
      padding-left: calc(var(--space-md) + var(--space-sm));
      border: 0;
      border-radius: 0;
      text-align: left;
      font-weight: 500;
    }
    .connection-header span:nth-child(2),
    .tree-group span:nth-child(2) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .tree-count {
      color: var(--text-muted);
      font-weight: 400;
      font-size: .9em;
    }
    .session-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: .55rem minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm) 0 calc(var(--space-md) * 1.7);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .session-row:hover,
    .session-row.selected {
      background: var(--bg-hover);
    }
    .session-row.selected {
      background: var(--bg-selected);
    }
    .session-icon {
      display: none;
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .session-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .duration {
      color: var(--text-muted);
      font-size: .88em;
      font-variant-numeric: tabular-nums;
      justify-self: end;
    }
    .row-action {
      width: calc(var(--toolbar-button-size) * .92);
      height: calc(var(--toolbar-button-size) * .92);
      display: inline-grid;
      place-items: center;
      padding: 0;
      opacity: .35;
    }
    .session-row:hover .row-action,
    .row-action:focus-visible {
      opacity: 1;
    }
    .pin {
      color: var(--vscode-charts-yellow);
      opacity: 1;
    }
    .status {
      width: .48rem;
      height: .48rem;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--text-muted);
      justify-self: center;
    }
    .status-completed { background: var(--success); }
    .status-failed { background: var(--vscode-testing-iconFailed, var(--danger)); }
    .status-running,
    .status-queued {
      background: var(--vscode-progressBar-background, var(--accent));
      animation: pulse 1.1s ease-in-out infinite;
    }
    .status-cancelled { background: var(--vscode-testing-iconSkipped, var(--text-muted)); }
    .loader {
      width: .72rem;
      height: .72rem;
      flex: 0 0 auto;
      border-radius: 50%;
      border: 2px solid var(--vscode-progressBar-background, var(--accent));
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    .output {
      min-height: 0;
      display: grid;
      grid-template-rows: var(--tab-height) minmax(0, 1fr);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
      overflow: hidden;
    }
    .output-tabs {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .output-tabs span:first-child {
      color: var(--text-main);
      font-weight: 600;
    }
    .output-title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--text-muted);
    }
    .output-log {
      margin: 0;
      padding: var(--space-sm);
      overflow: auto;
      color: var(--text-main);
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.72rem, 0.7rem + 0.12vw, 0.86rem);
      white-space: pre-wrap;
      scrollbar-width: thin;
    }
    .log-time { color: var(--text-muted); }
    .log-success { color: var(--success); }
    .log-error { color: var(--danger); }
    .empty {
      min-height: 8rem;
      display: grid;
      place-items: center;
      padding: var(--space-md);
      color: var(--text-muted);
      text-align: center;
    }
    .menu {
      position: fixed;
      z-index: 20;
      min-width: 13rem;
      max-width: min(22rem, calc(100vw - 1rem));
      padding: var(--space-xxs) 0;
      background: var(--vscode-menu-background, var(--bg-elevated));
      color: var(--vscode-menu-foreground, var(--text-main));
      border: 1px solid var(--vscode-menu-border, var(--border));
      box-shadow: 0 .55rem 1.35rem color-mix(in srgb, black 32%, transparent);
    }
    .menu button {
      width: 100%;
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: 1.25rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .menu button:hover:not(:disabled),
    .menu button:focus-visible {
      background: var(--vscode-menu-selectionBackground, var(--bg-hover));
      color: var(--vscode-menu-selectionForeground, var(--text-main));
    }
    .menu kbd {
      color: var(--text-muted);
      font: inherit;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @media (min-width: 42rem) {
      .panel-layout {
        grid-template-rows: minmax(0, 1fr);
      }
      .output {
        border-top: 0;
        border-left: 1px solid var(--border);
      }
    }
    @media (max-width: 25rem) {
      .duration,
      .row-action {
        display: none;
      }
      .session-row {
        grid-template-columns: .55rem minmax(0, 1fr);
        padding-left: calc(var(--space-md) * 1.35);
      }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let saved = vscode.getState() || {};
    let currentState = { groups: [], historyGroups: [] };
    let activeTab = saved.activeTab || 'active';
    let selected = saved.selected || undefined;
    let expanded = saved.expanded || {};
    let openMenuNode;

    function saveState() {
      vscode.setState({ activeTab, selected, expanded });
    }

    function render(state) {
      currentState = state || { groups: [], historyGroups: [] };
      root.innerHTML = '';
      closeMenu();
      const shell = document.createElement('div');
      shell.className = 'services-shell';
      shell.appendChild(renderHeader());
      shell.appendChild(renderTabs());
      shell.appendChild(activeTab === 'history' ? renderHistory() : renderActive());
      root.appendChild(shell);
    }

    function renderHeader() {
      const header = document.createElement('div');
      header.className = 'services-header';
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'Query session actions');
      toolbar.appendChild(icon('add', 'New query console', () => vscode.postMessage({ type: 'newConsole' })));
      toolbar.appendChild(icon('refresh', 'Refresh', () => vscode.postMessage({ type: 'refreshQuerySessions' })));
      toolbar.appendChild(toolbarIcon('expand-all', 'Expand all', () => setAllExpanded(true)));
      toolbar.appendChild(toolbarIcon('collapse-all', 'Collapse all', () => setAllExpanded(false)));
      header.appendChild(toolbar);
      return header;
    }

    function renderTabs() {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.appendChild(tabButton('active', 'Database'));
      tabs.appendChild(tabButton('history', 'History'));
      return tabs;
    }

    function tabButton(id, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab' + (activeTab === id ? ' active' : '');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', activeTab === id ? 'true' : 'false');
      button.textContent = label;
      button.onclick = () => {
        activeTab = id;
        saveState();
        render(currentState);
      };
      return button;
    }

    function hasActiveItems() {
      return (currentState.groups || []).some(group => (group.documents || []).length);
    }

    function hasHistoryItems() {
      return (currentState.historyGroups || []).some(group => (group.items || []).length);
    }

    function openNewest(id) {
      if (id === 'history') {
        const item = newestHistoryItem();
        if (item) vscode.postMessage({ type: 'openHistory', historyId: item.id });
        return;
      }
      const item = newestActiveItem();
      if (item) vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
    }

    function renderActive() {
      const groups = currentState.groups || [];
      if (!groups.length) return empty('No active or recent query consoles.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Database query sessions');
      for (const group of groups) {
        const key = groupKey('active', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const documentGroup of group.documents) {
            list.appendChild(consoleRow(documentGroup));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function renderHistory() {
      const groups = currentState.historyGroups || [];
      if (!groups.length) return empty('Older query console executions will appear here.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Query session history');
      for (const group of groups) {
        const key = groupKey('history', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const item of group.items) {
            list.appendChild(historyRow(item));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function consoleRow(item) {
      const row = sessionRow(item.documentTitle, item.running ? 'running...' : durationText(item.durationMs, item.status), item.running ? 'running' : item.status, selected && selected.type === 'active' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'active', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
      };
      row.oncontextmenu = (event) => openMenu(event, consoleActions(item));
      row.appendChild(icon('ellipsis', 'Console actions', (event) => openMenu(event, consoleActions(item)), item.pinned ? 'row-action pin' : 'row-action'));
      return row;
    }

    function historyRow(item) {
      const row = sessionRow(item.preview || item.sql, historyMeta(item), item.status, selected && selected.type === 'history' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'history', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openHistory', historyId: item.id });
      };
      row.oncontextmenu = (event) => openMenu(event, historyActions(item));
      row.appendChild(icon('ellipsis', 'Console history actions', (event) => openMenu(event, historyActions(item)), item.favorite ? 'row-action pin' : 'row-action'));
      return row;
    }

    function treeHeader(chevron, label, count) {
      const node = document.createElement('div');
      node.className = 'tree-group';
      node.innerHTML = '<span>' + chevron + '</span><span>' + escapeHtml(label) + '</span><span class="tree-count">' + escapeHtml(count) + '</span>';
      return node;
    }

    function connectionHeader(group, key) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'connection-header';
      const count = group.documents ? group.documents.length : (group.items ? group.items.length : 0);
      const open = isExpanded(key);
      node.setAttribute('aria-expanded', open ? 'true' : 'false');
      node.title = open ? 'Collapse connection' : 'Expand connection';
      node.onclick = () => toggleExpanded(key);
      node.appendChild(treeToggle(open));
      const label = document.createElement('span');
      label.textContent = group.connectionName + (group.databaseName ? ' / ' + group.databaseName : '');
      node.appendChild(label);
      const countNode = document.createElement('span');
      countNode.className = 'tree-count';
      countNode.textContent = String(count);
      node.appendChild(countNode);
      return node;
    }

    function groupKey(scope, group) {
      return scope + ':' + (group.id || group.connectionName + '/' + (group.databaseName || ''));
    }

    function isExpanded(key) {
      return expanded[key] !== false;
    }

    function toggleExpanded(key) {
      expanded = { ...expanded, [key]: !isExpanded(key) };
      saveState();
      render(currentState);
    }

    function setAllExpanded(value) {
      const scope = activeTab === 'history' ? 'history' : 'active';
      const groups = activeTab === 'history' ? (currentState.historyGroups || []) : (currentState.groups || []);
      const next = { ...expanded };
      for (const group of groups) {
        next[groupKey(scope, group)] = value;
      }
      expanded = next;
      saveState();
      render(currentState);
    }

    function treeToggle(open) {
      const node = document.createElement('span');
      node.className = 'tree-toggle' + (open ? ' expanded' : '');
      node.setAttribute('aria-hidden', 'true');
      return node;
    }

    function sessionRow(name, duration, status, isSelected) {
      const row = document.createElement('div');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.className = 'session-row' + (isSelected ? ' selected' : '');
      row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      };
      row.appendChild(status === 'running' ? loader() : statusDot(status || 'completed'));
      const iconNode = document.createElement('span');
      iconNode.className = 'session-icon';
      iconNode.innerHTML = '<i class="codicon codicon-output"></i>';
      row.appendChild(iconNode);
      const nameNode = document.createElement('span');
      nameNode.className = 'session-name';
      nameNode.textContent = name;
      row.appendChild(nameNode);
      const durationNode = document.createElement('span');
      durationNode.className = 'duration';
      durationNode.textContent = duration || '';
      row.appendChild(durationNode);
      return row;
    }

    function consoleActions(item) {
      if (item.projectFile) {
        return [
          { icon: 'close', label: 'Remove from active session', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
        ];
      }
      return [
        { icon: item.pinned ? 'pinned' : 'pin', label: item.pinned ? 'Unpin console' : 'Pin console', run: () => vscode.postMessage({ type: 'togglePin', consoleId: item.id, pinned: !item.pinned }) },
        { icon: 'arrow-up', label: 'Move up', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'up' }) },
        { icon: 'arrow-down', label: 'Move down', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'down' }) },
        { icon: 'trash', label: 'Untrack console', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
      ];
    }

    function historyActions(item) {
      return [
        { icon: item.favorite ? 'star-full' : 'star-empty', label: item.favorite ? 'Remove favorite' : 'Favorite', run: () => vscode.postMessage({ type: 'toggleFavoriteHistory', historyId: item.id, favorite: !item.favorite }) },
        { icon: 'copy', label: 'Copy SQL', shortcut: 'Ctrl+C', run: () => vscode.postMessage({ type: 'copyHistory', historyId: item.id }) },
        { icon: 'trash', label: 'Delete history item', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'deleteHistory', historyId: item.id }) }
      ];
    }

    function openMenu(event, actions) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      const menu = document.createElement('div');
      menu.className = 'menu';
      for (const action of actions) {
        const item = document.createElement('button');
        item.type = 'button';
        item.innerHTML = '<i class="codicon codicon-' + (action.icon || 'blank') + '"></i><span>' + escapeHtml(action.label) + '</span><kbd>' + escapeHtml(action.shortcut || '') + '</kbd>';
        item.disabled = action.disabled === true;
        item.onclick = () => {
          if (action.disabled === true) return;
          closeMenu();
          action.run();
        };
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      menu.style.left = Math.max(4, Math.min(event.clientX, window.innerWidth - width - 4)) + 'px';
      menu.style.top = Math.max(4, Math.min(event.clientY, window.innerHeight - height - 4)) + 'px';
      openMenuNode = menu;
      const first = menu.querySelector('button');
      if (first) first.focus();
    }

    function closeMenu() {
      if (openMenuNode) {
        openMenuNode.remove();
        openMenuNode = undefined;
      }
    }

    function icon(name, title, onclick, extraClass) {
      const button = document.createElement('button');
      button.className = 'icon' + (extraClass ? ' ' + extraClass : '');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      if (name) button.innerHTML = '<i class="codicon codicon-' + name + '"></i>';
      button.onclick = (event) => {
        event.stopPropagation();
        onclick(event);
      };
      return button;
    }

    function toolbarIcon(kind, title, onclick) {
      const button = icon('', title, onclick);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('toolbar-svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const paths = kind === 'expand-all'
        ? ['M5 6 L8 3 L11 6', 'M5 10 L8 13 L11 10']
        : ['M5 4 L8 7 L11 4', 'M5 12 L8 9 L11 12'];
      for (const d of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
      }
      button.appendChild(svg);
      return button;
    }

    function statusDot(status) {
      const dot = document.createElement('span');
      dot.className = 'status status-' + status;
      dot.title = status;
      return dot;
    }

    function loader() {
      const spinner = document.createElement('span');
      spinner.className = 'loader';
      spinner.title = 'running';
      return spinner;
    }

    function selectedActiveItem() {
      if (!selected || selected.type !== 'active') return undefined;
      return (currentState.groups || []).flatMap(group => group.documents || []).find(item => item.id === selected.id);
    }

    function newestActiveItem() {
      return (currentState.groups || []).flatMap(group => group.documents || []).sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)[0];
    }

    function selectedHistoryItem() {
      if (!selected || selected.type !== 'history') return undefined;
      return (currentState.historyGroups || []).flatMap(group => group.items || []).find(item => item.id === selected.id);
    }

    function newestHistoryItem() {
      return (currentState.historyGroups || []).flatMap(group => group.items || []).sort((a, b) => b.executedAt - a.executedAt)[0];
    }

    function renderOutput(item) {
      const output = document.createElement('section');
      output.className = 'output';
      const header = document.createElement('div');
      header.className = 'output-tabs';
      const label = document.createElement('span');
      label.textContent = 'Output';
      const title = document.createElement('span');
      title.className = 'output-title';
      title.textContent = item ? (item.documentTitle || item.preview || item.sql || 'Session') : 'No session selected';
      header.appendChild(label);
      header.appendChild(title);
      output.appendChild(header);
      const log = document.createElement('pre');
      log.className = 'output-log';
      if (!item) {
        log.textContent = 'Select a session to inspect its latest state.';
      } else if (item.documentTitle) {
        log.innerHTML = activeLog(item);
      } else {
        log.innerHTML = historyLog(item);
      }
      output.appendChild(log);
      return output;
    }

    function activeLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> Session ' + escapeHtml(item.documentTitle));
      if (item.running) rows.push('<span class="log-time">[' + shortTime(Date.now()) + ']</span> running...');
      if (item.status) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> status: ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      if (item.durationMs !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> execution: ' + formatDuration(item.durationMs));
      return rows.join('\\n');
    }

    function historyLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      rows.push('');
      rows.push(escapeHtml(item.sql || item.preview || ''));
      return rows.join('\\n');
    }

    function statusClassText(status) {
      if (status === 'failed') return '<span class="log-error">' + escapeHtml(status) + '</span>';
      if (status === 'completed') return '<span class="log-success">' + escapeHtml(status) + '</span>';
      return escapeHtml(status || 'unknown');
    }

    function historyMeta(item) {
      return shortDate(item.executedAt);
    }

    function durationText(durationMs, status) {
      if (status === 'failed') return 'failed';
      if (durationMs === undefined || durationMs === null) return '';
      return formatDuration(durationMs);
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + ' ms';
      const seconds = Math.floor(ms / 1000);
      return seconds + ' s ' + (ms % 1000) + ' ms';
    }

    function shortDate(value) {
      if (!value) return '';
      const date = new Date(value);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + date.getFullYear();
    }

    function shortTime(value) {
      const date = new Date(value || Date.now());
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function empty(text) {
      const node = document.createElement('div');
      node.className = 'empty';
      node.textContent = text;
      return node;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'state') render(event.data);
    });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
};

// src/webviews/results/ResultsPanelProvider.ts
var vscode23 = __toESM(require("vscode"));
var ResultsPanelProvider = class _ResultsPanelProvider {
  constructor(context, connectionManager, sessionStore, executor, revealSource, onTabsChanged, runActiveEditorSelection, onCancelRequest, onCompareRequest) {
    this.context = context;
    this.connectionManager = connectionManager;
    this.sessionStore = sessionStore;
    this.executor = executor;
    this.revealSource = revealSource;
    this.onTabsChanged = onTabsChanged;
    this.runActiveEditorSelection = runActiveEditorSelection;
    this.onCancelRequest = onCancelRequest;
    this.onCompareRequest = onCompareRequest;
    this.tabs = this.sessionStore.getTabs();
    this.activeTabId = this.tabs[0]?.id;
    this.activeConnectionId = this.tabs.find((tab) => tab.id === this.activeTabId)?.connectionId;
  }
  static viewType = "sqlResults";
  view;
  tabs;
  activeTabId;
  activeConnectionId;
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode23.Uri.joinPath(this.context.extensionUri, "media")]
    };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
  }
  async show(connectionId) {
    if (connectionId) {
      this.selectConnection(connectionId);
    }
    await vscode23.commands.executeCommand(`${_ResultsPanelProvider.viewType}.focus`);
    this.postHydrate();
  }
  setActiveConnection(connectionId) {
    this.selectConnection(connectionId);
    this.postHydrate();
  }
  async addTab(tab, options = {}) {
    this.activeConnectionId = tab.connectionId;
    let storedTab = tab;
    if (options.replaceTabId) {
      const existing = this.tabs.find((item) => item.id === options.replaceTabId);
      storedTab = { ...tab, id: existing?.id ?? options.replaceTabId };
      this.tabs = existing ? this.tabs.map((item) => item.id === storedTab.id ? storedTab : item) : [...this.tabs, storedTab];
      this.activeTabId = storedTab.id;
    } else {
      const active = options.forceNew ? void 0 : this.reusableTabFor(tab);
      if (active && !active.pinned) {
        storedTab = { ...tab, id: active.id };
        this.tabs = this.tabs.map((item) => item.id === active.id ? storedTab : item);
        this.activeTabId = active.id;
      } else {
        this.tabs.push(tab);
        this.activeTabId = tab.id;
      }
    }
    await this.sessionStore.saveTabs(this.tabs);
    this.onTabsChanged?.(this.tabs);
    await this.show();
    return storedTab;
  }
  getTabs() {
    return this.tabs;
  }
  getTab(id) {
    return this.tabs.find((tab) => tab.id === id);
  }
  getActiveTab() {
    return this.getTab(this.activeTabId ?? "");
  }
  async onMessage(message) {
    if (message.type === "ready") {
      this.postHydrate();
      return;
    }
    if (message.type === "activateTab") {
      this.activeTabId = message.tabId;
      const tab = this.getTab(message.tabId);
      if (tab) {
        this.activeConnectionId = tab.connectionId;
        await this.revealSource?.(tab);
      }
      return;
    }
    if (message.type === "pinTab") {
      this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, pinned: message.pinned, updatedAt: Date.now() } : tab);
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      return;
    }
    if (message.type === "closeTab") {
      this.tabs = this.tabs.filter((tab) => tab.id !== message.tabId);
      this.activeTabId = this.visibleTabs()[0]?.id;
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      this.postHydrate();
      return;
    }
    if (message.type === "renameTab") {
      this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, customTitle: message.title, updatedAt: Date.now() } : tab);
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      this.postHydrate();
      return;
    }
    if (message.type === "rerunTab") {
      const tab = this.getTab(message.tabId);
      if (tab) {
        const maxRows = typeof message.maxRows === "number" ? message.maxRows : message.maxRows === null ? void 0 : tab.maxRows;
        const offset = typeof message.offset === "number" ? message.offset : message.offset === null ? 0 : tab.rowOffset ?? 0;
        if (await this.runActiveEditorSelection?.(maxRows)) {
          return;
        }
        const started = Date.now();
        await this.addTab({
          ...tab,
          executionStatus: "running",
          executionStartedAt: started,
          executionFinishedAt: void 0,
          executionTimeMs: void 0,
          rowCount: void 0,
          maxRows,
          rowOffset: offset,
          error: void 0,
          resultSets: [],
          activeResultSetIndex: 0,
          updatedAt: started
        }, { replaceTabId: tab.id });
        const next = await this.executor.execute({
          connectionId: tab.connectionId,
          sql: tab.queryText,
          maxRows,
          offset,
          source: {
            origin: tab.sourceOrigin,
            fileName: tab.sourceFile,
            documentUri: tab.sourceDocumentUri,
            sectionIndex: tab.sourceSectionIndex,
            range: tab.sourceRange
          }
        });
        await this.addTab({ ...next, id: tab.id, pinned: tab.pinned, customTitle: tab.customTitle }, { replaceTabId: tab.id });
      }
      return;
    }
    if (message.type === "cancelTab") {
      await this.onCancelRequest?.(message.tabId);
      return;
    }
    if (message.type === "setTransactionMode") {
      const tab = this.getTab(message.tabId);
      if (tab) {
        await this.applyTransactionMode(tab.connectionId, message.mode);
      }
      return;
    }
    if (message.type === "commitTransaction") {
      const tab = this.getTab(message.tabId);
      if (tab) {
        await this.connectionManager.commitTransaction(tab.connectionId);
        await this.syncTransactionState(tab.connectionId);
      }
      return;
    }
    if (message.type === "rollbackTransaction") {
      const tab = this.getTab(message.tabId);
      if (tab) {
        await this.connectionManager.rollbackTransaction(tab.connectionId);
        await this.syncTransactionState(tab.connectionId);
      }
      return;
    }
    if (message.type === "copy") {
      await vscode23.env.clipboard.writeText(message.text);
      return;
    }
    if (message.type === "compareTabs") {
      const tab = this.getTab(this.activeTabId ?? "");
      if (tab) {
        await this.onCompareRequest?.(tab, message.resultSetIndex);
      }
      return;
    }
  }
  post(message) {
    void this.view?.webview.postMessage(message);
  }
  postHydrate() {
    const tabs = this.visibleTabs().map((tab) => this.withTransactionState(tab));
    this.post({ type: "hydrate", tabs, activeTabId: this.activeTabId && tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : tabs[0]?.id });
  }
  selectConnection(connectionId) {
    this.activeConnectionId = connectionId;
    const tabs = this.visibleTabs();
    this.activeTabId = tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : [...tabs].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  }
  visibleTabs() {
    if (!this.activeConnectionId) {
      return this.tabs;
    }
    return this.tabs.filter((tab) => tab.connectionId === this.activeConnectionId);
  }
  withTransactionState(tab) {
    return {
      ...tab,
      transaction: {
        mode: this.connectionManager.getTransactionMode(tab.connectionId),
        open: this.connectionManager.isTransactionOpen(tab.connectionId)
      }
    };
  }
  async applyTransactionMode(connectionId, mode) {
    this.connectionManager.setTransactionMode(connectionId, mode);
    if (mode === "manual") {
      if (!this.connectionManager.isTransactionOpen(connectionId)) {
        await this.connectionManager.beginTransaction(connectionId);
      }
    } else if (this.connectionManager.isTransactionOpen(connectionId)) {
      const answer = await vscode23.window.showWarningMessage(
        "Switching to auto-commit will close the current transaction.",
        { modal: true },
        "Commit",
        "Rollback",
        "Cancel"
      );
      if (answer === "Cancel" || !answer) {
        this.connectionManager.setTransactionMode(connectionId, "manual");
        return;
      }
      if (answer === "Commit") {
        await this.connectionManager.commitTransaction(connectionId);
      } else {
        await this.connectionManager.rollbackTransaction(connectionId);
      }
    }
    await this.syncTransactionState(connectionId);
  }
  async syncTransactionState(connectionId) {
    this.tabs = this.tabs.map((tab) => tab.connectionId === connectionId ? this.withTransactionState(tab) : tab);
    await this.sessionStore.saveTabs(this.tabs);
    this.onTabsChanged?.(this.tabs);
    this.postHydrate();
  }
  reusableTabFor(tab) {
    if (tab.pinned) {
      return void 0;
    }
    const sameConnectionTabs = this.tabs.filter((item) => item.connectionId === tab.connectionId);
    const active = sameConnectionTabs.find((item) => item.id === this.activeTabId);
    if (active && !active.pinned) {
      return active;
    }
    return sameConnectionTabs.filter((item) => !item.pinned).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  html(webview) {
    const script = webview.asWebviewUri(vscode23.Uri.joinPath(this.context.extensionUri, "media", "results", "results.js"));
    const style = webview.asWebviewUri(vscode23.Uri.joinPath(this.context.extensionUri, "media", "results", "results.css"));
    const codicons = webview.asWebviewUri(vscode23.Uri.joinPath(this.context.extensionUri, "media", "codicons", "codicon.css"));
    const nonce = Date.now().toString();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicons}" rel="stylesheet">
  <link href="${style}" rel="stylesheet">
  <title>SQL Results</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
  }
};

// src/webviews/table/TableDataPanel.ts
var vscode24 = __toESM(require("vscode"));

// node_modules/fflate/esm/index.mjs
var import_module = require("module");
var require2 = (0, import_module.createRequire)("/");
var _a;
var Worker;
var isMarkedAsUntransferable;
try {
  _a = require2("worker_threads"), Worker = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
};
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm2, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm2 = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm2 = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm2[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm2[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm2[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
}();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (ArrayBuffer.isView(val))
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i = 0; i < str.length; ++i)
      ar_1[i] = str.charCodeAt(i);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i = 0; i < files.length; ++i) {
    var f = files[i];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}

// src/services/xlsxExport.ts
function rowsToXlsxBuffer(rows, columns, sheetName) {
  const safeColumns = columns.length ? columns : inferColumns(rows);
  const files = {
    "[Content_Types].xml": xmlFile(contentTypesXml()),
    "_rels/.rels": xmlFile(rootRelationshipsXml()),
    "xl/workbook.xml": xmlFile(workbookXml(sheetName)),
    "xl/_rels/workbook.xml.rels": xmlFile(workbookRelationshipsXml()),
    "xl/styles.xml": xmlFile(stylesXml()),
    "xl/worksheets/sheet1.xml": xmlFile(worksheetXml(rows, safeColumns))
  };
  return Buffer.from(zipSync(files));
}
function worksheetXml(rows, columns) {
  const header = rowXml(1, columns.map((column) => cellXml(column, true)));
  const body = rows.map((row, index) => rowXml(index + 2, columns.map((column) => cellXml(row[column], false))));
  const lastColumn = columnName(Math.max(columns.length, 1));
  const lastRow = Math.max(rows.length + 1, 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetData>
    ${header}
    ${body.join("\n    ")}
  </sheetData>
</worksheet>`;
}
function rowXml(rowIndex, cells) {
  return `<row r="${rowIndex}">${cells.map((cell, index) => cell.replace("{ref}", `${columnName(index + 1)}${rowIndex}`)).join("")}</row>`;
}
function cellXml(value, header) {
  if (value === null || value === void 0) {
    return '<c r="{ref}"/>';
  }
  if (!header && typeof value === "number" && Number.isFinite(value)) {
    return `<c r="{ref}"><v>${value}</v></c>`;
  }
  if (!header && typeof value === "boolean") {
    return `<c r="{ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="{ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}
function columnName(index) {
  let current = index;
  let name = "";
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + current % 26) + name;
    current = Math.floor(current / 26);
  }
  return name;
}
function inferColumns(rows) {
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    Object.keys(row).forEach((key) => seen.add(key));
  }
  return [...seen];
}
function xmlFile(value) {
  return strToU8(value);
}
function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}
function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}
function workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}
function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}
function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;
}
function sanitizeSheetName(name) {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}
function escapeXml(value) {
  return removeInvalidXmlChars(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function removeInvalidXmlChars(value) {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "");
}

// src/webviews/table/TableDataPanel.ts
var TableDataPanel = class {
  static async open(context, connectionManager, node) {
    const configuredMaxRows = vscode24.workspace.getConfiguration("database").get("defaultMaxRows", 500);
    const maxRows = Number.isFinite(configuredMaxRows) && configuredMaxRows && configuredMaxRows > 0 ? Math.floor(configuredMaxRows) : 500;
    const panel = vscode24.window.createWebviewPanel(
      "databaseTableData",
      node.table.name,
      vscode24.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode24.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.html(panel.webview, context.extensionUri, node, [], [], 0, maxRows, false, true);
    let initialFetchStarted = false;
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "ready") {
        if (!initialFetchStarted) {
          initialFetchStarted = true;
          void this.postTableState(panel, connectionManager, node, maxRows);
        }
        return;
      }
      if (message.type === "copy" && typeof message.text === "string") {
        await vscode24.env.clipboard.writeText(message.text);
        return;
      }
      if (message.type === "export" && message.format) {
        const target = await vscode24.window.showSaveDialog({
          defaultUri: vscode24.Uri.file(`${node.table.name}.${message.format === "insert" ? "sql" : message.format === "markdown" ? "md" : message.format}`),
          filters: {
            "Data files": [message.format === "insert" ? "sql" : message.format === "markdown" ? "md" : message.format]
          }
        });
        if (target) {
          if (message.format === "xlsx") {
            const rows = message.rows ?? [];
            const columns = message.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
            await vscode24.workspace.fs.writeFile(target, rowsToXlsxBuffer(rows, columns, node.table.name));
          } else if (typeof message.text === "string") {
            await vscode24.workspace.fs.writeFile(target, Buffer.from(message.text, "utf8"));
          }
        }
        return;
      }
      if (message.type === "command") {
        if (message.command === "ddl") {
          await vscode24.commands.executeCommand("database.showObjectDdl", node);
        }
        if (message.command === "select") {
          await vscode24.commands.executeCommand("database.generateSelect", node);
        }
        if (message.command === "import") {
          await vscode24.commands.executeCommand("database.importTableData", node);
        }
        if (message.command === "copyToConnection") {
          await vscode24.commands.executeCommand("database.copyTableToConnection", node);
        }
        return;
      }
      if (message.type === "fetch") {
        const limit = Number.isFinite(message.limit) && message.limit && message.limit > 0 ? Math.floor(message.limit) : 0;
        const offset = Number.isFinite(message.offset) && message.offset && message.offset > 0 ? Math.floor(message.offset) : 0;
        await this.postTableState(panel, connectionManager, node, limit, {
          where: message.where,
          offset,
          orderBySql: message.orderBySql,
          orderBy: message.orderBy
        });
        return;
      }
    });
  }
  static async openPerformanceAdvisor(context, node, report, openSql) {
    const panel = vscode24.window.createWebviewPanel(
      "databaseTablePerformance",
      `Advisor: ${node.table.name}`,
      vscode24.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode24.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.advisorHtml(panel.webview, context.extensionUri, node, report);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "copy" && typeof message.text === "string") {
        await vscode24.env.clipboard.writeText(message.text);
      }
      if (message.type === "openSql" && typeof message.sql === "string") {
        await openSql(message.title || `Advisor DDL ${node.table.name}`, `${message.sql.trim()}
`);
      }
    });
  }
  static async openDataProfile(context, node, report) {
    const panel = vscode24.window.createWebviewPanel(
      "databaseTableProfile",
      `Profile: ${node.table.name}`,
      vscode24.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode24.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.profileHtml(panel.webview, context.extensionUri, node, report);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "copy" && typeof message.text === "string") {
        await vscode24.env.clipboard.writeText(message.text);
      }
    });
  }
  static async postTableState(panel, connectionManager, node, limit, options = {}) {
    try {
      if (!connectionManager.isConnected(node.connection.id)) {
        await connectionManager.connect(node.connection.id);
      }
      const nextResult = await connectionManager.getDriver(node.connection.type).getTablePreview(node.connection.id, node.table.schema, node.table.name, limit, options);
      const hasMore = limit > 0 && nextResult.rows.length > limit;
      await panel.webview.postMessage({
        type: "state",
        rows: hasMore ? nextResult.rows.slice(0, limit) : nextResult.rows,
        columns: nextResult.fields.map((field) => field.name),
        columnTypes: Object.fromEntries(nextResult.fields.map((field) => [field.name, { dataTypeId: field.dataTypeId, dataTypeName: field.dataTypeName }])),
        durationMs: nextResult.durationMs,
        limit,
        offset: options.offset ?? 0,
        hasMore
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  /** Shared <head> tags: CSP (allowing the codicon font/stylesheet) and the codicon stylesheet link. */
  static headTags(webview, extensionUri, nonce) {
    const codicon = webview.asWebviewUri(vscode24.Uri.joinPath(extensionUri, "media", "codicons", "codicon.css"));
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicon}" rel="stylesheet">`;
  }
  static html(webview, extensionUri, node, rows, columns, durationMs, maxRows, hasMore, initialLoading = false) {
    const nonce = Date.now().toString();
    const tableSqlName = qualifiedSqlName(node.connection.type, node.table.schema, node.table.name);
    const safeTable = escapeHtml2(tableSqlName);
    const insertTargetJson = JSON.stringify(tableSqlName).replace(/</g, "\\u003c");
    const identifierDialectJson = JSON.stringify(node.connection.type).replace(/</g, "\\u003c");
    const canGenerateSqlJson = JSON.stringify(node.connection.type !== "redis");
    const booleanLiteralModeJson = JSON.stringify(node.connection.type === "sqlserver" || node.connection.type === "oracle" ? "numeric" : "keyword");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${this.headTags(webview, extensionUri, nonce)}
  <title>${safeTable}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(1.05rem, 0.98rem + 0.25vw, 1.25rem);
      --toolbar-button-size: clamp(1.85rem, 1.65rem + 0.55vw, 2.25rem);
      --row-height: 32px;
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.88rem, 0.84rem + 0.15vw, 1rem);
      line-height: 1.35;
    }
    * {
      box-sizing: border-box;
    }
    .codicon[class*='codicon-'] {
      font-size: var(--icon-size);
      line-height: 1;
      color: inherit;
      vertical-align: middle;
    }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .toolbar-separator {
      width: 1px;
      height: 1.15rem;
      margin: 0 var(--space-xs);
      background: var(--border);
    }
    .toolbar-spacer {
      flex: 1;
    }
    .criteria-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      border-bottom: 1px solid var(--border);
      background: var(--bg-header);
    }
    .criteria {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      min-height: clamp(1.8rem, 1.6rem + 0.45vw, 2.2rem);
      padding: var(--space-xxs) var(--space-sm);
      color: var(--text-muted);
      background: var(--bg-header);
      border-right: 1px solid var(--border);
    }
    .criteria strong {
      color: var(--vscode-editor-foreground);
      font-weight: 500;
      letter-spacing: .04em;
      white-space: nowrap;
    }
    .criteria-icon {
      color: var(--vscode-descriptionForeground);
      font-size: 19px;
      line-height: 1;
      display: inline-grid;
      place-items: center;
    }
    .criteria:first-child .criteria-icon {
      color: var(--vscode-charts-blue);
    }
    .criteria:nth-child(2) .criteria-icon {
      color: var(--vscode-charts-purple);
    }
    .criteria input {
      flex: 1;
      min-width: 120px;
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      font: inherit;
      outline: 0;
    }
    .criteria input:focus {
      background: var(--vscode-input-background);
      box-shadow: inset 0 -1px 0 var(--vscode-focusBorder);
    }
    .column-suggest {
      position: fixed;
      z-index: 30;
      width: min(26rem, calc(100vw - 1rem));
      max-height: min(18rem, 46vh);
      overflow: auto;
      padding: var(--space-xxs) 0;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      scrollbar-width: thin;
    }
    .column-suggest[hidden] {
      display: none;
    }
    .column-suggest button {
      width: 100%;
      min-height: 1.8rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      color: inherit;
      text-align: left;
    }
    .column-suggest button:hover,
    .column-suggest button.active {
      background: var(--vscode-list-hoverBackground);
    }
    .column-suggest-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
    }
    .column-suggest-type {
      color: var(--text-muted);
      font-size: .9em;
    }
    button,
    select {
      height: var(--toolbar-button-size);
      align-self: center;
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      font: inherit;
      padding: 0 var(--space-sm);
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation-duration: 0.001ms !important; }
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .icon-button[data-tone="blue"] {
      color: var(--vscode-charts-blue);
    }
    .icon-button[data-tone="green"] {
      color: var(--vscode-charts-green);
    }
    .icon-button[data-tone="orange"] {
      color: var(--vscode-charts-orange);
    }
    .icon-button[data-tone="purple"] {
      color: var(--vscode-charts-purple);
    }
    .icon-button[data-tone="red"] {
      color: var(--vscode-charts-red);
    }
    .icon-button.active {
      color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tool-select {
      width: auto;
      min-width: 78px;
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border);
    }
    button:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--vscode-panel-border);
    }
    .grid-wrap {
      position: relative;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-main);
    }
    .grid {
      height: 100%;
      overflow: auto;
      padding-bottom: 44px;
      box-sizing: border-box;
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
      table-layout: fixed;
    }
    col.rownum-col {
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
    }
    col.data-col {
      width: clamp(10rem, 18vw, 15rem);
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--bg-header);
      color: var(--text-main);
      font-weight: 600;
      text-align: left;
      vertical-align: top;
    }
    th,
    td {
      height: var(--row-height);
      box-sizing: border-box;
      max-width: none;
      padding: 0.18rem var(--space-sm);
      border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.94rem, 0.9rem + 0.12vw, 1.05rem);
    }
    .header-button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
      text-align: left;
      border: 0;
      font-size: 0.98rem;
      font-weight: 600;
    }
    .header-cell-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      width: 100%;
      min-width: 0;
    }
    .header-cell-actions .header-button {
      flex: 1 1 auto;
      width: auto;
    }
    .header-button span:nth-child(2) {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .column-type-icon {
      width: calc(var(--icon-size) * 0.9);
      height: calc(var(--icon-size) * 0.9);
      flex: 0 0 auto;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 0.18rem;
      box-sizing: border-box;
      opacity: .85;
      position: relative;
    }
    thead th:nth-child(4n + 2) .column-type-icon {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon {
      border-color: var(--vscode-charts-orange);
    }
    .column-type-icon::before {
      content: "";
      position: absolute;
      left: -0.28rem;
      top: 0.25rem;
      width: 0.35rem;
      height: 0.35rem;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      background: var(--vscode-editorWidget-background);
    }
    thead th:nth-child(4n + 2) .column-type-icon::before {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon::before {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon::before {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon::before {
      border-color: var(--vscode-charts-orange);
    }
    .sort-mark {
      margin-left: auto;
      padding-left: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .sort-button,
    .filter-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-main));
      border: 0;
      opacity: .92;
    }
    .sort-button.active,
    .filter-button.active {
      color: var(--accent);
      background: color-mix(in srgb, var(--bg-active) 32%, transparent);
      opacity: 1;
    }
    .sort-neutral {
      opacity: 0.4;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: -0.28rem;
      bottom: 0;
      z-index: 4;
      width: 0.55rem;
      cursor: col-resize;
    }
    .resize-handle:hover,
    .resize-handle.resizing {
      background: var(--accent);
    }
    .resize-handle::after {
      content: "\u2194";
      position: absolute;
      top: 50%;
      right: -0.65rem;
      z-index: 5;
      width: 1.2rem;
      height: 1.2rem;
      display: none;
      place-items: center;
      transform: translateY(-50%);
      color: var(--vscode-button-foreground);
      background: var(--accent);
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      line-height: 1;
      pointer-events: none;
    }
    .resize-handle:hover::after,
    .resize-handle.resizing::after {
      display: grid;
    }
    th:first-child {
      position: sticky;
      left: 0;
      z-index: 3;
      min-width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      color: var(--text-muted);
      text-align: right;
      background: var(--bg-header);
    }
    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
    }
    tbody tr.selected-row td,
    tbody tr.selected-row th {
      background: var(--bg-selected);
    }
    th.selected-column,
    td.selected-column {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 55%, transparent);
    }
    td.selected-cell {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground);
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    td.null {
      color: var(--text-muted);
      font-style: italic;
    }
    .pager {
      position: absolute;
      left: 50%;
      bottom: var(--space-sm);
      z-index: 5;
      transform: translateX(-50%);
      font-size: .86em;
    }
    .pager-group {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      height: clamp(1.9rem, 1.65rem + 0.45vw, 2.35rem);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .28);
    }
    .page-size {
      min-width: 86px;
      border: 0;
      background: transparent;
    }
    .pager-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
    }
    .pager-button:disabled {
      opacity: .38;
    }
    .pager-separator {
      width: 1px;
      height: 24px;
      background: var(--vscode-panel-border);
    }
    #fetchInfo {
      display: none;
    }
    .filter-popover {
      position: fixed;
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      width: min(28rem, 82vw);
      max-height: min(34rem, 72vh);
      padding: var(--space-md);
      border: 1px solid var(--accent);
      background: var(--vscode-dropdown-background);
      border-radius: var(--radius-sm);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      overflow: hidden;
      box-sizing: border-box;
    }
    .filter-popover[hidden] {
      display: none;
    }
    .filter-title {
      color: var(--text-main);
      font-size: 1.05rem;
      font-weight: 600;
    }
    .filter-search {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: calc(var(--toolbar-button-size) * 1.25);
      padding: 0 var(--space-sm);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-input-background);
    }
    .filter-search span {
      color: var(--text-muted);
      font-size: 1.15rem;
    }
    .filter-search input {
      width: 100%;
      min-width: 0;
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      outline: 0;
      font: inherit;
    }
    .filter-option-list {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    .filter-option {
      min-height: calc(var(--row-height) * 1.25);
      display: grid;
      grid-template-columns: 1.45rem minmax(0, 1fr) 5rem;
      align-items: center;
      gap: var(--space-sm);
      color: var(--text-main);
    }
    .filter-option input {
      width: 1rem;
      height: 1rem;
    }
    .filter-option span:not(.filter-count) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .filter-option-heading {
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
    .filter-count {
      color: var(--text-muted);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .filter-live-status {
      color: var(--text-muted);
      text-align: right;
      font-weight: 600;
    }
    .selection-summary {
      position: absolute;
      right: var(--space-sm);
      bottom: var(--space-sm);
      z-index: 6;
      max-width: min(48rem, calc(50vw - 2rem));
      min-height: clamp(2.15rem, 1.9rem + 0.45vw, 2.65rem);
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      color: var(--text-muted);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.98rem;
    }
    .selection-summary[hidden] {
      display: none;
    }
    .selection-summary span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .summary-column {
      color: var(--text-main);
      font-weight: 600;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: grid;
      place-items: center;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-main) 70%, transparent);
    }
    .loading-overlay[hidden] {
      display: none;
    }
    .loading-panel {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: var(--toolbar-button-size);
      padding: 0 var(--space-md);
      color: var(--text-main);
      background: var(--bg-header);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
    }
    .loading-spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid color-mix(in srgb, var(--vscode-charts-yellow) 35%, transparent);
      border-top-color: var(--vscode-charts-yellow);
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
    }
    .loading-spinner[hidden] {
      display: none;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button class="icon-button" id="refresh" data-tone="blue" title="Refresh data" aria-label="Refresh data"><i class="codicon codicon-refresh"></i></button>
      <button class="icon-button" id="copyRows" data-tone="purple" title="Copy visible rows as TSV" aria-label="Copy visible rows as TSV"><i class="codicon codicon-copy"></i></button>
      <button class="icon-button" id="focusWhere" data-tone="blue" title="Focus WHERE" aria-label="Focus WHERE"><i class="codicon codicon-search"></i></button>
      <span class="toolbar-separator"></span>
      <span class="toolbar-separator"></span>
      <button class="icon-button" id="generateSelect" data-tone="green" title="Generate SELECT" aria-label="Generate SELECT"><i class="codicon codicon-file-code"></i></button>
      <button class="icon-button" id="copyTable" data-tone="purple" title="Copy table to another connection" aria-label="Copy table to another connection"><i class="codicon codicon-arrow-swap"></i></button>
      <button class="icon-button" id="importData" data-tone="blue" title="Import CSV or JSON" aria-label="Import CSV or JSON"><i class="codicon codicon-cloud-upload"></i></button>
      <button class="icon-button" id="clearCriteria" data-tone="red" title="Clear WHERE, ORDER BY, and column filters" aria-label="Clear WHERE, ORDER BY, and column filters"><i class="codicon codicon-discard"></i></button>
      <button class="icon-button" id="resetRows" data-tone="orange" title="Reset to 500 rows" aria-label="Reset to 500 rows"><i class="codicon codicon-history"></i></button>
      <button id="showDdl" title="Show DDL">DDL</button>
      <button class="icon-button" id="applyWhere" data-tone="green" title="Apply WHERE" aria-label="Apply WHERE"><i class="codicon codicon-play"></i></button>
      <button class="icon-button" id="toggleFilters" data-tone="blue" title="Show or hide per-column filters" aria-label="Show or hide per-column filters"><i class="codicon codicon-list-filter"></i></button>
      <button class="icon-button" id="clearFilters" data-tone="orange" title="Clear column filters" aria-label="Clear column filters"><i class="codicon codicon-clear-all"></i></button>
      <span class="toolbar-spacer"></span>
      <select id="exportFormat" class="tool-select" title="Export visible rows">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
        <option value="tsv">TSV</option>
        <option value="markdown">Markdown</option>
        <option value="insert">INSERT</option>
        <option value="xlsx">XLSX</option>
      </select>
      <button class="icon-button" id="export" data-tone="green" title="Export" aria-label="Export"><i class="codicon codicon-desktop-download"></i></button>
    </div>
    <div class="criteria-row">
      <div class="criteria">
        <span class="criteria-icon"><i class="codicon codicon-filter"></i></span>
        <strong>WHERE</strong>
        <input id="where" aria-label="Filter rows">
      </div>
      <div class="criteria">
        <span class="criteria-icon"><i class="codicon codicon-list-ordered"></i></span>
        <strong>ORDER BY</strong>
        <input id="orderBy" aria-label="Order rows">
      </div>
    </div>
    <div id="columnSuggest" class="column-suggest" hidden></div>
    <div id="gridWrap" class="grid-wrap">
      <div class="grid">
        <table id="table">
          <colgroup id="colgroup"></colgroup>
          <thead id="thead"></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      <div class="pager">
        <span class="pager-group">
          <button id="firstPage" class="pager-button" title="First page">|\u2039</button>
          <button id="prevPage" class="pager-button" title="Previous page">\u2039</button>
          <select id="pageSize" class="page-size" title="Rows requested from the database">
            <option value="500">1-500</option>
            <option value="1000">1-1,000</option>
            <option value="5000">1-5,000</option>
            <option value="0">All</option>
          </select>
          <span id="rowCount">of 0</span>
          <button id="nextPage" class="pager-button" title="Next page">\u203A</button>
          <span id="fetchInfo" class="muted"></span>
        </span>
      </div>
      <div id="selectionSummary" class="selection-summary" hidden></div>
      <div id="filterPopover" class="filter-popover" hidden></div>
      <div id="loadingOverlay" class="loading-overlay" aria-live="polite">
        <span class="loading-panel">
          <span id="loadingSpinner" class="loading-spinner" aria-hidden="true"></span>
          <span id="loadingText">Loading table data...</span>
        </span>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_COLUMN_WIDTH = 220;
    const MIN_COLUMN_WIDTH = 112;
    const MAX_FILTER_OPTIONS = 250;
    let rows = ${JSON.stringify(rows).replace(/</g, "\\u003c")};
    let columns = ${JSON.stringify(columns)};
    let columnTypes = {};
    let columnWidths = {};
    let durationMs = ${JSON.stringify(durationMs)};
    let currentLimit = ${JSON.stringify(maxRows)};
    let currentOffset = 0;
    let hasMore = ${JSON.stringify(hasMore)};
    let sort = null;
    let loading = ${JSON.stringify(initialLoading)};
    let errorMessage = '';
    let selectedCell = null;
    let selectedRow = null;
    let currentRows = [];
    let selectedColumn = null;
    let columnFiltersVisible = true;
    const columnFilters = new Map();
    let activeFilterColumn = null;
    let filterDraft = new Set();
    let filterSearch = '';
    let suggestInput = null;
    let suggestContext = null;
    let suggestItems = [];
    let suggestIndex = 0;
    const NUMERIC_TYPE_IDS = new Set([20, 21, 23, 700, 701, 790, 1700]);
    const NUMERIC_TYPE_NAMES = [
      'bigint',
      'bigserial',
      'decimal',
      'double precision',
      'float',
      'float4',
      'float8',
      'int',
      'int2',
      'int4',
      'int8',
      'integer',
      'money',
      'numeric',
      'real',
      'serial',
      'serial2',
      'serial4',
      'serial8',
      'smallint'
    ];
    const where = document.getElementById('where');
    const tbody = document.getElementById('tbody');
    const thead = document.getElementById('thead');
    const colgroup = document.getElementById('colgroup');
    const rowCount = document.getElementById('rowCount');
    const fetchInfo = document.getElementById('fetchInfo');
    const orderBy = document.getElementById('orderBy');
    const columnSuggest = document.getElementById('columnSuggest');
    const pageSize = document.getElementById('pageSize');
    const toggleFilters = document.getElementById('toggleFilters');
    const firstPage = document.getElementById('firstPage');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const gridWrap = document.getElementById('gridWrap');
    const filterPopover = document.getElementById('filterPopover');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    const selectionSummary = document.getElementById('selectionSummary');
    pageSize.value = String(currentLimit || 0);

    function cell(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
    function html(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
    function csvValue(value) {
      return '"' + cell(value).replaceAll('"', '""') + '"';
    }
    function markdownValue(value) {
      return cell(value).replaceAll('|', '\\|').replaceAll('\\r', ' ').replaceAll('\\n', ' ');
    }
    const insertTarget = ${insertTargetJson};
    const identifierDialect = ${identifierDialectJson};
    const canGenerateSql = ${canGenerateSqlJson};
    const booleanLiteralMode = ${booleanLiteralModeJson};
    function sqlLiteral(value) {
      if (value === null || value === undefined) return 'null';
      if (typeof value === 'number' || typeof value === 'bigint') return String(value);
      if (typeof value === 'boolean') {
        return booleanLiteralMode === 'numeric'
          ? (value ? '1' : '0')
          : (value ? 'true' : 'false');
      }
      if (value instanceof Date) return "'" + value.toISOString().replace(/'/g, "''") + "'";
      if (typeof value === 'object') return "'" + JSON.stringify(value).replace(/'/g, "''") + "'";
      return "'" + String(value).replace(/'/g, "''") + "'";
    }
    function filterKey(value) {
      if (value === null || value === undefined) return '<NULL>';
      return cell(value);
    }
    function filterLabel(value) {
      if (value === null || value === undefined) return 'NULL';
      const next = cell(value);
      return next === '' ? '(empty)' : next;
    }
    function sqlIdentifier(column) {
      if (identifierDialect === 'mysql') {
        const tick = String.fromCharCode(96);
        return tick + column.replaceAll(tick, tick + tick) + tick;
      }
      if (identifierDialect === 'sqlserver') {
        return '[' + column.replaceAll(']', ']]') + ']';
      }
      return '"' + column.replaceAll('"', '""') + '"';
    }
    function suggestColumnContext(input) {
      const cursor = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, cursor);
      const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
      const partial = match ? match[0] : '';
      return {
        start: cursor - partial.length,
        end: cursor,
        partial
      };
    }
    function matchingColumns(partial) {
      const lower = partial.toLowerCase();
      return columns
        .filter((column) => !lower || column.toLowerCase().includes(lower))
        .slice(0, 30);
    }
    function positionColumnSuggest(input) {
      const rect = input.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
      columnSuggest.style.width = width + 'px';
      columnSuggest.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
      columnSuggest.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 80)) + 'px';
    }
    function renderColumnSuggest(input) {
      if (!columns.length) {
        closeColumnSuggest();
        return;
      }
      suggestInput = input;
      suggestContext = suggestColumnContext(input);
      if (!suggestContext.partial.trim()) {
        closeColumnSuggest();
        return;
      }
      suggestItems = matchingColumns(suggestContext.partial);
      suggestIndex = Math.min(suggestIndex, Math.max(0, suggestItems.length - 1));
      if (!suggestItems.length) {
        closeColumnSuggest();
        return;
      }
      positionColumnSuggest(input);
      columnSuggest.hidden = false;
      columnSuggest.innerHTML = suggestItems.map((column, index) => {
        const type = columnTypes[column]?.dataTypeName || '';
        return '<button type="button" class="' + (index === suggestIndex ? 'active' : '') + '" data-suggest-index="' + index + '"><span class="column-suggest-name">' + html(column) + '</span><span class="column-suggest-type">' + html(type) + '</span></button>';
      }).join('');
      columnSuggest.querySelectorAll('[data-suggest-index]').forEach((button) => {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          applyColumnSuggest(Number(button.getAttribute('data-suggest-index')));
        });
      });
    }
    function closeColumnSuggest() {
      suggestInput = null;
      suggestContext = null;
      suggestItems = [];
      suggestIndex = 0;
      columnSuggest.hidden = true;
      columnSuggest.innerHTML = '';
    }
    function applyColumnSuggest(index = suggestIndex) {
      if (!suggestInput || !suggestContext || !suggestItems[index]) return;
      const column = sqlIdentifier(suggestItems[index]);
      const before = suggestInput.value.slice(0, suggestContext.start);
      const after = suggestInput.value.slice(suggestContext.end);
      suggestInput.value = before + column + after;
      const nextCursor = before.length + column.length;
      suggestInput.focus();
      suggestInput.setSelectionRange(nextCursor, nextCursor);
      closeColumnSuggest();
    }
    function moveColumnSuggest(delta) {
      if (columnSuggest.hidden || !suggestItems.length) return;
      suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
      renderColumnSuggest(suggestInput);
    }
    function handleCriteriaSuggestKeydown(event, input, onSubmit, onClear) {
      if (!columnSuggest.hidden && suggestInput === input) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveColumnSuggest(1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveColumnSuggest(-1);
          return;
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          applyColumnSuggest();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeColumnSuggest();
          return;
        }
      }
      if (event.key === 'Enter') {
        onSubmit();
      }
      if (event.key === 'Escape') {
        onClear();
      }
    }
    function columnFilterOptions(column) {
      const counts = new Map();
      rows.forEach((row) => {
        const key = filterKey(row[column]);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { key, label: filterLabel(row[column]), count: 1 });
        }
      });
      return [...counts.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
    }
    function filteredRows() {
      let nextRows = rows.filter((row) => {
        return columns.every((column) => {
          const selected = columnFilters.get(column);
          return !selected || selected.has(filterKey(row[column]));
        });
      });
      return nextRows;
    }
    function exportRows(format) {
      const visibleRows = filteredRows();
      if (format === 'json') {
        return JSON.stringify(visibleRows, null, 2);
      }
      if (format === 'markdown') {
        if (!visibleRows.length) {
          return '';
        }
        const header = '| ' + columns.map((column) => markdownValue(column)).join(' | ') + ' |';
        const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
        const body = visibleRows.map((row) => '| ' + columns.map((column) => markdownValue(row[column])).join(' | ') + ' |');
        return [header, separator, ...body].join('\\n');
      }
      if (format === 'insert') {
        if (!visibleRows.length) {
          return '';
        }
        if (!canGenerateSql) {
          return '-- INSERT export is not available for Redis connections. Use Redis commands instead.\\n';
        }
        return 'insert into ' + insertTarget + ' (' + columns.map((column) => sqlIdentifier(column)).join(', ') + ')\\nvalues\\n' + visibleRows.map((row) => '  (' + columns.map((column) => sqlLiteral(row[column])).join(', ') + ')').join(',\\n') + ';';
      }
      if (format === 'xlsx') {
        return '';
      }
      const separator = format === 'tsv' ? '\\t' : ',';
      const encode = format === 'tsv' ? cell : csvValue;
      return [columns.join(separator), ...visibleRows.map((row) => columns.map((column) => encode(row[column])).join(separator))].join('\\n');
    }
    function pageSizeValue() {
      return Number(pageSize.value) || 0;
    }
    function pageEnd() {
      return currentOffset + filteredRows().length;
    }
    function isIdentifierColumn(column) {
      return column.toLowerCase() === 'id'
        || /^id[_\\-\\s]/i.test(column)
        || /[_\\-\\s]id$/i.test(column)
        || /Id$/.test(column)
        || /ID$/.test(column);
    }
    function isNumericAggregateColumn(column) {
      if (isIdentifierColumn(column)) return false;
      const field = columnTypes[column] || {};
      if (typeof field.dataTypeId === 'number' && NUMERIC_TYPE_IDS.has(field.dataTypeId)) return true;
      const typeName = typeof field.dataTypeName === 'string' ? field.dataTypeName.toLowerCase().replace(/\\s+/g, ' ').trim() : '';
      return !!typeName && NUMERIC_TYPE_NAMES.some((numericType) => typeName === numericType || typeName.startsWith(numericType + '(') || typeName.startsWith(numericType + ' '));
    }
    function numericValue(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'bigint') {
        const next = Number(value);
        return Number.isFinite(next) ? next : undefined;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || !/^-?(?:\\d+|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(trimmed)) return undefined;
        const next = Number(trimmed);
        return Number.isFinite(next) ? next : undefined;
      }
      return undefined;
    }
    function formatNumber(value) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
    }
    function selectedColumnStats() {
      if (!selectedColumn || !isNumericAggregateColumn(selectedColumn)) return null;
      const values = filteredRows()
        .map((row) => numericValue(row[selectedColumn]))
        .filter((value) => value !== undefined);
      if (!values.length) return null;
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        sum,
        average: sum / values.length,
        count: values.length
      };
    }
    function updateSelectionSummary() {
      if (!selectedColumn) {
        selectionSummary.hidden = true;
        selectionSummary.innerHTML = '';
        return;
      }
      const stats = selectedColumnStats();
      selectionSummary.hidden = false;
      selectionSummary.title = stats
        ? selectedColumn + ': sum ' + formatNumber(stats.sum) + ', average ' + formatNumber(stats.average)
        : selectedColumn + ': ' + filteredRows().length.toLocaleString() + ' rows selected';
      selectionSummary.innerHTML = '<span class="summary-column">' + html(selectedColumn) + '</span>' + (
        stats
          ? '<span>' + stats.count.toLocaleString() + ' values</span><span>Sum ' + html(formatNumber(stats.sum)) + '</span><span>Avg ' + html(formatNumber(stats.average)) + '</span>'
          : '<span>' + filteredRows().length.toLocaleString() + ' rows selected</span>'
      );
    }
    function positionFilterPopover(anchor) {
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(448, Math.max(260, window.innerWidth - viewportPadding * 2));
      const below = window.innerHeight - rect.bottom - viewportPadding;
      const above = rect.top - viewportPadding;
      const openBelow = below >= 240 || below >= above;
      const availableHeight = Math.max(96, openBelow ? below - 4 : above - 4);
      const maxHeight = Math.min(544, availableHeight);
      const top = openBelow
        ? rect.bottom + 4
        : Math.max(viewportPadding, rect.top - maxHeight - 4);
      filterPopover.style.width = width + 'px';
      filterPopover.style.maxHeight = maxHeight + 'px';
      filterPopover.style.left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding)) + 'px';
      filterPopover.style.top = top + 'px';
    }
    function openColumnFilter(column, anchor) {
      activeFilterColumn = column;
      filterSearch = '';
      const allKeys = columnFilterOptions(column).map((option) => option.key);
      filterDraft = new Set(columnFilters.get(column) || allKeys);
      positionFilterPopover(anchor);
      renderFilterPopover();
    }
    function closeColumnFilter() {
      activeFilterColumn = null;
      filterPopover.hidden = true;
      filterPopover.innerHTML = '';
    }
    function commitFilterDraft() {
      if (!activeFilterColumn) return;
      const allKeys = columnFilterOptions(activeFilterColumn).map((option) => option.key);
      if (filterDraft.size === allKeys.length) {
        columnFilters.delete(activeFilterColumn);
      } else {
        columnFilters.set(activeFilterColumn, new Set(filterDraft));
      }
      renderHeader();
      renderBody();
    }
    function renderFilterPopover(restoreSearchFocus = false) {
      if (!activeFilterColumn) {
        closeColumnFilter();
        return;
      }
      const options = columnFilterOptions(activeFilterColumn);
      const allKeys = options.map((option) => option.key);
      const visibleOptions = options
        .filter((option) => option.label.toLowerCase().includes(filterSearch.trim().toLowerCase()))
        .slice(0, MAX_FILTER_OPTIONS);
      const visibleKeys = visibleOptions.map((option) => option.key);
      const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => filterDraft.has(key));
      filterPopover.hidden = false;
      filterPopover.innerHTML =
        '<div class="filter-title">Local Filter For \\'' + html(activeFilterColumn) + '\\'</div>' +
        '<label class="filter-search"><i class="codicon codicon-search"></i><input id="filterSearchInput" value="' + html(filterSearch) + '"></label>' +
        '<label class="filter-option filter-option-heading"><input id="filterSelectVisible" type="checkbox" ' + (allVisibleSelected ? 'checked' : '') + '><span>Value</span><span class="filter-count">Count</span></label>' +
        '<div class="filter-option-list">' + visibleOptions.map((option) => {
          return '<label class="filter-option"><input type="checkbox" data-filter-value="' + html(option.key) + '" ' + (filterDraft.has(option.key) ? 'checked' : '') + '><span title="' + html(option.label) + '">' + html(option.label) + '</span><span class="filter-count">' + option.count.toLocaleString() + '</span></label>';
        }).join('') + '</div>' +
        '<div class="filter-live-status">' + filterDraft.size.toLocaleString() + ' selected</div>';

      const searchInput = document.getElementById('filterSearchInput');
      searchInput.addEventListener('input', () => {
        filterSearch = searchInput.value;
        renderFilterPopover(true);
      });
      if (restoreSearchFocus) {
        const nextSearchInput = document.getElementById('filterSearchInput');
        nextSearchInput.focus();
        nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length);
      }
      document.getElementById('filterSelectVisible').addEventListener('change', () => {
        if (allVisibleSelected) {
          visibleKeys.forEach((key) => filterDraft.delete(key));
        } else {
          visibleKeys.forEach((key) => filterDraft.add(key));
        }
        commitFilterDraft();
        renderFilterPopover();
      });
      filterPopover.querySelectorAll('[data-filter-value]').forEach((input) => {
        input.addEventListener('change', () => {
          const key = input.getAttribute('data-filter-value');
          if (input.checked) {
            filterDraft.add(key);
          } else {
            filterDraft.delete(key);
          }
          commitFilterDraft();
          renderFilterPopover();
        });
      });
    }
    function updatePager() {
      const visibleCount = filteredRows().length;
      const start = visibleCount ? currentOffset + 1 : currentOffset;
      const end = currentOffset + visibleCount;
      const totalHint = hasMore ? end + 1 + '+' : String(end);
      rowCount.textContent = loading ? 'Loading...' : 'of ' + totalHint;
      const label = currentLimit ? start.toLocaleString() + '-' + end.toLocaleString() : 'All';
      const option = pageSize.querySelector('option[value="' + String(currentLimit || 0) + '"]');
      if (option) {
        option.textContent = label;
      }
      firstPage.disabled = loading || currentOffset === 0;
      prevPage.disabled = loading || currentOffset === 0 || !currentLimit;
      nextPage.disabled = loading || !hasMore || !currentLimit;
    }
    function updateLoadingOverlay() {
      const visible = loading || errorMessage;
      loadingOverlay.hidden = !visible;
      loadingSpinner.hidden = !loading;
      loadingText.textContent = loading ? 'Loading table data...' : errorMessage;
    }
    const filterIconMarkup = '<i class="codicon codicon-filter"></i>';
    function renderHeader() {
      colgroup.innerHTML = '<col class="rownum-col">' + columns.map((column) => '<col class="data-col" style="width: ' + (columnWidths[column] || DEFAULT_COLUMN_WIDTH) + 'px">').join('');
      thead.innerHTML = '<tr><th>#</th>' + columns.map((column) => {
        const mark = sort?.column === column ? '<i class="codicon codicon-arrow-' + (sort.direction === 'asc' ? 'up' : 'down') + '"></i>' : '<i class="codicon codicon-fold sort-neutral"></i>';
        const filterButton = columnFiltersVisible ? '<button class="filter-button ' + (columnFilters.has(column) ? 'active' : '') + '" data-filter-button="' + html(column) + '" title="Filter ' + html(column) + '">' + filterIconMarkup + '</button>' : '';
        return '<th class="' + (selectedColumn === column ? 'selected-column' : '') + '"><div class="header-cell-actions"><button class="header-button" data-select-column="' + html(column) + '" title="Select column ' + html(column) + '"><span class="column-type-icon"></span><span>' + html(column) + '</span></button><button class="sort-button ' + (sort?.column === column ? 'active' : '') + '" data-sort="' + html(column) + '" title="Order by ' + html(column) + '">' + mark + '</button>' + filterButton + '</div><span class="resize-handle" data-resize-column="' + html(column) + '" title="Resize column"></span></th>';
      }).join('') + '</tr>';
      toggleFilters.classList.toggle('active', columnFiltersVisible);
      document.querySelectorAll('[data-select-column]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedColumn = button.getAttribute('data-select-column');
          selectedCell = null;
          selectedRow = null;
          render();
        });
      });
      document.querySelectorAll('[data-sort]').forEach((button) => {
        button.addEventListener('click', () => {
          const column = button.getAttribute('data-sort');
          selectedColumn = column;
          selectedCell = null;
          selectedRow = null;
          sort = sort?.column === column && sort.direction === 'asc' ? { column, direction: 'desc' } : { column, direction: 'asc' };
          orderBy.value = sort.column + ' ' + sort.direction;
          fetchRows();
        });
      });
      document.querySelectorAll('[data-filter-button]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const column = button.getAttribute('data-filter-button');
          if (activeFilterColumn === column) {
            closeColumnFilter();
          } else {
            openColumnFilter(column, button);
          }
        });
      });
      document.querySelectorAll('[data-resize-column]').forEach((handle) => {
        handle.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const column = handle.getAttribute('data-resize-column');
          const startX = event.clientX;
          const startWidth = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
          handle.classList.add('resizing');
          const onMove = (moveEvent) => {
            columnWidths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
            renderHeader();
          };
          const onUp = () => {
            handle.classList.remove('resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }
    function renderBody() {
      const nextRows = filteredRows();
      currentRows = nextRows;
      tbody.innerHTML = nextRows.map((row, index) => '<tr class="' + (selectedRow === index ? 'selected-row' : '') + '"><th data-row="' + index + '">' + (currentOffset + index + 1) + '</th>' + columns.map((column) => {
        const value = row[column];
        const text = html(cell(value));
        const classes = [
          value === null ? 'null' : '',
          selectedColumn === column ? 'selected-column' : '',
          selectedCell?.row === index && selectedCell?.column === column ? 'selected-cell' : ''
        ].filter(Boolean).join(' ');
        return '<td class="' + classes + '" data-row="' + index + '" data-column="' + html(column) + '" title="' + text + '">' + (value === null ? 'NULL' : text) + '</td>';
      }).join('') + '</tr>').join('');
      fetchInfo.textContent = loading ? 'Loading...' : durationMs + 'ms';
      updatePager();
      updateLoadingOverlay();
      updateSelectionSummary();
    }
    function render() {
      renderHeader();
      renderBody();
    }
    function fetchRows(nextOffset = currentOffset) {
      currentOffset = Math.max(0, nextOffset);
      loading = true;
      errorMessage = '';
      renderBody();
      vscode.postMessage({
        type: 'fetch',
        limit: pageSizeValue(),
        offset: currentOffset,
        where: where.value.trim(),
        orderBySql: orderBy.value.trim(),
        orderBy: orderBy.value.trim() ? [] : sort ? [sort] : []
      });
    }
    where.addEventListener('keydown', (event) => {
      handleCriteriaSuggestKeydown(event, where, () => fetchRows(0), () => {
        where.value = '';
        fetchRows(0);
      });
    });
    where.addEventListener('input', () => renderColumnSuggest(where));
    where.addEventListener('focus', () => renderColumnSuggest(where));
    orderBy.addEventListener('keydown', (event) => {
      handleCriteriaSuggestKeydown(event, orderBy, () => {
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      }, () => {
        orderBy.value = '';
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      });
    });
    orderBy.addEventListener('input', () => renderColumnSuggest(orderBy));
    orderBy.addEventListener('focus', () => renderColumnSuggest(orderBy));
    toggleFilters.addEventListener('click', () => {
      columnFiltersVisible = !columnFiltersVisible;
      if (!columnFiltersVisible) {
        closeColumnFilter();
      }
      render();
    });
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    document.addEventListener('click', (event) => {
      if (activeFilterColumn && !filterPopover.contains(event.target) && !event.target.closest('[data-filter-button]')) {
        closeColumnFilter();
      }
      if (!columnSuggest.contains(event.target) && event.target !== where && event.target !== orderBy) {
        closeColumnSuggest();
      }
    });
    document.getElementById('export').addEventListener('click', () => {
      const format = document.getElementById('exportFormat').value;
      const visibleRows = filteredRows();
      vscode.postMessage({
        type: 'export',
        format,
        text: format === 'xlsx' ? undefined : exportRows(format),
        rows: format === 'xlsx' ? visibleRows : undefined,
        columns: format === 'xlsx' ? columns : undefined
      });
    });
    document.getElementById('copyRows').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: exportRows('tsv') });
    });
    document.getElementById('focusWhere').addEventListener('click', () => {
      where.focus();
    });
    document.getElementById('applyWhere').addEventListener('click', () => fetchRows(0));
    document.getElementById('showDdl').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'ddl' });
    });
    document.getElementById('generateSelect').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'select' });
    });
    document.getElementById('copyTable').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'copyToConnection' });
    });
    document.getElementById('importData').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'import' });
    });
    document.getElementById('clearCriteria').addEventListener('click', () => {
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      closeColumnFilter();
      fetchRows(0);
    });
    document.getElementById('clearFilters').addEventListener('click', () => {
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    document.getElementById('resetRows').addEventListener('click', () => {
      pageSize.value = '500';
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      closeColumnFilter();
      fetchRows(0);
    });
    pageSize.addEventListener('change', () => {
      fetchRows(0);
    });
    document.getElementById('refresh').addEventListener('click', () => {
      fetchRows();
    });
    firstPage.addEventListener('click', () => fetchRows(0));
    prevPage.addEventListener('click', () => fetchRows(Math.max(0, currentOffset - pageSizeValue())));
    nextPage.addEventListener('click', () => fetchRows(currentOffset + pageSizeValue()));
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      const cellElement = target.closest('td');
      const rowHeader = target.closest('th[data-row]');
      if (cellElement) {
        selectedCell = { row: Number(cellElement.dataset.row), column: cellElement.dataset.column };
        selectedRow = null;
        selectedColumn = null;
        render();
      } else if (rowHeader) {
        selectedRow = Number(rowHeader.dataset.row);
        selectedCell = null;
        selectedColumn = null;
        render();
      }
    });
    tbody.addEventListener('dblclick', (event) => {
      const target = event.target;
      const cellElement = target.closest('td');
      if (!cellElement) {
        return;
      }
      const rowIndex = Number(cellElement.dataset.row);
      const column = cellElement.dataset.column;
      selectedCell = { row: rowIndex, column };
      selectedRow = null;
      selectedColumn = null;
      render();
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'error') {
        loading = false;
        errorMessage = event.data.message || 'Query failed';
        renderBody();
        return;
      }
      if (event.data?.type !== 'state') return;
      rows = event.data.rows || [];
      columns = event.data.columns || [];
      columnTypes = event.data.columnTypes || {};
      durationMs = event.data.durationMs || 0;
      currentLimit = event.data.limit || 0;
      currentOffset = event.data.offset || 0;
      hasMore = !!event.data.hasMore;
      pageSize.value = String(currentLimit);
      loading = false;
      errorMessage = '';
      selectedCell = null;
      selectedRow = null;
      if (selectedColumn && !columns.includes(selectedColumn)) {
        selectedColumn = null;
      }
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    render();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
  static advisorHtml(webview, extensionUri, node, report) {
    const nonce = Date.now().toString();
    const table = qualifiedName(node.table.schema, node.table.name);
    const recommendations = report.advice.recommendations;
    const data = JSON.stringify({
      recommendations: recommendations.map((item, index) => ({
        index,
        title: `${item.kind.toUpperCase()} (${item.impact})`,
        ddl: item.ddl
      }))
    }).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${this.headTags(webview, extensionUri, nonce)}
  <title>Advisor ${escapeHtml2(table)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --success: var(--vscode-testing-iconPassed);
      --warning: var(--vscode-charts-yellow);
      --danger: var(--vscode-errorForeground);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 15px;
      font-weight: 600;
    }
    .meta {
      color: var(--text-muted);
      white-space: nowrap;
    }
    main {
      min-width: 0;
      overflow: auto;
      padding: 12px;
    }
    section {
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .list {
      margin: 0;
      padding-left: 18px;
    }
    .list li {
      margin: 0 0 6px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
    }
    .stat,
    .recommendation,
    .note {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
    }
    .stat {
      padding: 8px;
    }
    .stat strong {
      display: block;
      margin-bottom: 3px;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .stat span {
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }
    .recommendation {
      margin-bottom: 10px;
      overflow: hidden;
    }
    .recommendation-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg-header) 82%, var(--bg-main));
    }
    .recommendation-header strong {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .impact {
      color: var(--warning);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .impact.high { color: var(--danger); }
    .impact.low { color: var(--success); }
    .recommendation p {
      margin: 0;
      padding: 10px;
    }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      border-top: 1px solid var(--border);
      background: var(--vscode-textCodeBlock-background, var(--bg-main));
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    button {
      height: 26px;
      padding: 0 8px;
      color: var(--text-main);
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: var(--bg-hover);
    }
    .empty,
    .note {
      padding: 10px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>${escapeHtml2(table)} Performance Advisor</h1>
      <span class="meta">${escapeHtml2(node.connection.name)} | ${escapeHtml2(node.connection.type)}</span>
    </header>
    <main>
      ${report.aiError ? `<section><div class="note">AI advisor unavailable: ${escapeHtml2(report.aiError)}. Showing deterministic findings.</div></section>` : ""}
      <section>
        <h2>Workload</h2>
        <div class="stats">
          <div class="stat"><strong>Queries</strong><span>${report.request.workload.queryCount.toLocaleString()}</span></div>
          <div class="stat"><strong>Runs</strong><span>${report.request.workload.totalRunCount.toLocaleString()}</span></div>
          <div class="stat"><strong>Duration</strong><span>${report.request.workload.totalDurationMs.toLocaleString()}ms</span></div>
          <div class="stat"><strong>Rows</strong><span>${formatOptionalNumber(report.request.stats.redshift?.rowCount ?? report.request.stats.liveRows ?? report.request.stats.rowEstimate)}</span></div>
        </div>
      </section>
      <section>
        <h2>Findings</h2>
        ${report.advice.findings.length ? `<ul class="list">${report.advice.findings.map((finding) => `<li>${escapeHtml2(finding)}</li>`).join("")}</ul>` : '<div class="empty">No findings returned.</div>'}
      </section>
      <section>
        <h2>Deterministic Flags</h2>
        ${report.request.prepassFlags.length ? `<ul class="list">${report.request.prepassFlags.map((flag) => `<li><strong>${escapeHtml2(flag.impact)}</strong> ${escapeHtml2(flag.message)} <span class="meta">${escapeHtml2(flag.evidence)}</span></li>`).join("")}</ul>` : '<div class="empty">No deterministic flags crossed thresholds.</div>'}
      </section>
      <section>
        <h2>Recommendations</h2>
        ${recommendations.length ? recommendations.map((item, index) => `
          <article class="recommendation">
            <div class="recommendation-header">
              <strong>${escapeHtml2(item.kind)}</strong>
              <span class="impact ${escapeHtml2(item.impact)}">${escapeHtml2(item.impact)}</span>
              <button data-copy="${index}">Copy DDL</button>
              <button data-open="${index}">Open In Console</button>
            </div>
            <p>${escapeHtml2(item.rationale)}</p>
            <pre>${escapeHtml2(item.ddl)}</pre>
          </article>
        `).join("") : '<div class="empty">No ready-to-run recommendations returned.</div>'}
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${data};
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = data.recommendations[Number(button.getAttribute('data-copy'))];
        if (item) vscode.postMessage({ type: 'copy', text: item.ddl });
      });
    });
    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = data.recommendations[Number(button.getAttribute('data-open'))];
        if (item) vscode.postMessage({ type: 'openSql', title: item.title, sql: item.ddl });
      });
    });
  </script>
</body>
</html>`;
  }
  static profileHtml(webview, extensionUri, node, report) {
    const nonce = Date.now().toString();
    const table = qualifiedName(node.table.schema, node.table.name);
    const json = JSON.stringify(report, null, 2);
    const scriptData = JSON.stringify({ json }).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${this.headTags(webview, extensionUri, nonce)}
  <title>Profile ${escapeHtml2(table)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--text-main); background: var(--bg-main); }
    .shell { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 15px;
      font-weight: 600;
    }
    button {
      height: 26px;
      padding: 0 8px;
      color: var(--text-main);
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: var(--bg-hover); }
    main { min-width: 0; overflow: auto; padding: 12px; }
    section { margin-bottom: 16px; }
    h2 {
      margin: 0 0 8px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .summary, .note {
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
    }
    .note { color: var(--text-muted); }
    .anomalies { margin: 8px 0 0; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      padding: 6px 8px;
      border: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--bg-header);
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      z-index: 1;
    }
    td code, .mono {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .hist {
      display: grid;
      gap: 3px;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(5rem, 1fr) minmax(2rem, auto);
      gap: 6px;
      align-items: center;
    }
    .bar-track {
      height: 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--accent);
    }
    .danger { color: var(--danger); }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>${escapeHtml2(table)} Data Profile</h1>
      <span class="note">${report.sampleRows.toLocaleString()} sampled rows</span>
      <button id="copyJson">Copy JSON</button>
    </header>
    <main>
      ${report.aiError ? `<section><div class="note">AI narrative unavailable: ${escapeHtml2(report.aiError)}. Showing deterministic narrative.</div></section>` : ""}
      <section>
        <h2>Narrative</h2>
        <div class="summary">
          <div>${escapeHtml2(report.narrative?.summary ?? `Profiled ${report.columns.length} columns.`)}</div>
          ${report.narrative?.anomalies?.length ? `<ul class="anomalies">${report.narrative.anomalies.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ul>` : ""}
        </div>
      </section>
      <section>
        <h2>Columns</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 16%">Column</th>
              <th style="width: 12%">Type</th>
              <th style="width: 9%">Null</th>
              <th style="width: 9%">Distinct</th>
              <th style="width: 16%">Min / Max</th>
              <th style="width: 18%">Top Values</th>
              <th style="width: 20%">Histogram</th>
            </tr>
          </thead>
          <tbody>
            ${report.columns.map((column) => `
              <tr>
                <td><code>${escapeHtml2(column.name)}</code></td>
                <td>${escapeHtml2(column.dataType ?? "")}</td>
                <td class="${column.nullPct >= 50 ? "danger" : ""}">${column.nullPct}%</td>
                <td>${column.distinctCount.toLocaleString()}</td>
                <td class="mono">${escapeHtml2(column.min ?? "")}<br>${escapeHtml2(column.max ?? "")}</td>
                <td>${column.topValues.map((item) => `<div><span class="mono">${escapeHtml2(item.value)}</span> <span class="note">${item.count}</span></div>`).join("")}</td>
                <td><div class="hist">${histogramHtml(column.histogram)}</div></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${scriptData};
    document.getElementById('copyJson').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: data.json });
    });
  </script>
</body>
</html>`;
  }
};
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatOptionalNumber(value) {
  return value === void 0 ? "unknown" : value.toLocaleString();
}
function histogramHtml(histogram) {
  const max = Math.max(...histogram.map((bucket) => bucket.count), 1);
  return histogram.map((bucket) => {
    const pct = Math.max(3, Math.round(bucket.count / max * 100));
    return `<div class="bar"><span class="mono" title="${escapeHtml2(bucket.label)}">${escapeHtml2(bucket.label)}</span><span>${bucket.count}</span><span class="bar-track" style="grid-column: 1 / -1"><span class="bar-fill" style="width: ${pct}%"></span></span></div>`;
  }).join("");
}

// src/webviews/table/TableImportPanel.ts
var vscode25 = __toESM(require("vscode"));
var TableImportPanel = class {
  static async open(context, request, onImport) {
    return new Promise((resolve) => {
      let settled = false;
      const panel = vscode25.window.createWebviewPanel(
        "databaseTableImport",
        `Import ${request.table}`,
        vscode25.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      context.subscriptions.push(panel);
      panel.iconPath = vscode25.Uri.joinPath(context.extensionUri, "media", "database.svg");
      panel.webview.html = this.html(panel.webview, context.extensionUri, request);
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      panel.onDidDispose(settle);
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === "cancel") {
          panel.dispose();
          return;
        }
        if (message.type !== "import") {
          return;
        }
        try {
          await panel.webview.postMessage({ type: "state", state: "running", message: "Importing data..." });
          const result = await onImport(message.mapping ?? []);
          await panel.webview.postMessage({
            type: "state",
            state: "success",
            message: `Imported ${result.rowCount.toLocaleString()} rows into ${qualifiedName(request.schema, request.table)}.`
          });
          settle();
        } catch (error) {
          await panel.webview.postMessage({
            type: "state",
            state: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      });
    });
  }
  static html(webview, extensionUri, request) {
    const nonce = Date.now().toString();
    const codicon = webview.asWebviewUri(vscode25.Uri.joinPath(extensionUri, "media", "codicons", "codicon.css"));
    const stateJson = JSON.stringify({
      connectionName: request.connectionName,
      databaseType: request.databaseType,
      schema: request.schema,
      table: request.table,
      filePath: request.filePath,
      preview: request.preview
    }).replace(/</g, "\\u003c");
    const title = `Import ${qualifiedName(request.schema, request.table)}`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicon}" rel="stylesheet">
  <title>${escapeHtml3(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-sideBar-background);
      --header: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --text: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-text: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
    }
    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      height: 100vh;
      min-width: 760px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      padding: 12px 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      color: var(--muted);
      min-width: 0;
    }
    .meta span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 360px;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      white-space: nowrap;
    }
    main {
      display: grid;
      grid-template-columns: 42% 58%;
      min-height: 0;
    }
    section {
      min-width: 0;
      min-height: 0;
      border-right: 1px solid var(--border);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    section:last-child { border-right: 0; }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
      padding: 0 12px;
      background: var(--header);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .scroll {
      overflow: auto;
      min-height: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
      text-align: left;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--header);
      color: var(--muted);
      font-weight: 500;
    }
    .mapping-table th:nth-child(1), .mapping-table td:nth-child(1) { width: 34%; }
    .mapping-table th:nth-child(2), .mapping-table td:nth-child(2) { width: 24%; }
    .mapping-table th:nth-child(3), .mapping-table td:nth-child(3) { width: 42%; }
    select {
      width: 100%;
      height: 26px;
      color: var(--text);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      padding: 2px 22px 2px 6px;
      font-family: inherit;
      font-size: inherit;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 11px;
    }
    .warnings {
      display: none;
      padding: 8px 12px;
      color: var(--vscode-editorWarning-foreground);
      border-bottom: 1px solid var(--border);
      background: var(--vscode-inputValidation-warningBackground);
    }
    .warnings.visible { display: block; }
    .warnings div + div { margin-top: 4px; }
    footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: var(--panel);
      border-top: 1px solid var(--border);
    }
    .status {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status.error { color: var(--danger); }
    .status.success { color: var(--success); }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 84px;
      height: 30px;
      padding: 0 12px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 0;
      border-radius: 3px;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
    }
    button.primary {
      color: var(--accent-text);
      background: var(--accent);
    }
    button:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .empty {
      padding: 24px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${escapeHtml3(title)}</h1>
        <div class="meta">
          <span id="sourceMeta"></span>
          <span id="targetMeta"></span>
          <span id="connectionMeta"></span>
        </div>
      </div>
      <div class="summary">
        <span class="codicon codicon-table"></span>
        <span id="rowSummary"></span>
      </div>
    </header>
    <main>
      <section>
        <div class="section-title">
          <span>Mapping</span>
          <span class="badge" id="mappingSummary"></span>
        </div>
        <div class="warnings" id="warnings"></div>
        <div class="scroll">
          <table class="mapping-table">
            <thead>
              <tr>
                <th>to: Column</th>
                <th>to: Type</th>
                <th>from: Column</th>
              </tr>
            </thead>
            <tbody id="mappingRows"></tbody>
          </table>
        </div>
      </section>
      <section>
        <div class="section-title">
          <span>Data Preview</span>
          <span class="badge" id="previewSummary"></span>
        </div>
        <div class="scroll" id="previewHost"></div>
      </section>
    </main>
    <footer>
      <div class="status" id="status"></div>
      <div class="actions">
        <button id="cancelButton">Cancel</button>
        <button class="primary" id="importButton"><span class="codicon codicon-cloud-upload"></span>Import</button>
      </div>
    </footer>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const mapping = state.preview.mapping.map((item) => ({ ...item }));
    const sourceColumns = state.preview.sourceColumns;
    const targetByName = new Map(state.preview.targetColumns.map((column) => [column.name, column]));

    const sourceMeta = document.getElementById('sourceMeta');
    const targetMeta = document.getElementById('targetMeta');
    const connectionMeta = document.getElementById('connectionMeta');
    const rowSummary = document.getElementById('rowSummary');
    const mappingSummary = document.getElementById('mappingSummary');
    const previewSummary = document.getElementById('previewSummary');
    const mappingRows = document.getElementById('mappingRows');
    const previewHost = document.getElementById('previewHost');
    const warnings = document.getElementById('warnings');
    const status = document.getElementById('status');
    const importButton = document.getElementById('importButton');
    const cancelButton = document.getElementById('cancelButton');

    sourceMeta.textContent = 'from: ' + state.filePath;
    targetMeta.textContent = 'to: ' + state.schema + '.' + state.table;
    connectionMeta.textContent = state.connectionName + ' (' + state.databaseType + ')';
    rowSummary.textContent = state.preview.rowCount.toLocaleString() + ' rows';
    previewSummary.textContent = Math.min(state.preview.sampleRows.length, 50) + ' shown';
    status.textContent = 'Review mappings, then import directly into the table.';

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
    }

    function formatCell(value) {
      if (value === null || value === undefined) {
        return '<span style="color: var(--muted)">null</span>';
      }
      if (typeof value === 'object') {
        return escapeHtml(JSON.stringify(value));
      }
      return escapeHtml(value);
    }

    function optionHtml(selected) {
      const options = ['<option value="">Not mapped</option>'];
      for (const column of sourceColumns) {
        options.push('<option value="' + escapeHtml(column) + '"' + (column === selected ? ' selected' : '') + '>' + escapeHtml(column) + '</option>');
      }
      return options.join('');
    }

    function renderMapping() {
      mappingRows.innerHTML = mapping.map((item, index) => {
        const target = targetByName.get(item.target) ?? {};
        const badge = item.source && item.auto ? ' <span class="badge">Auto</span>' : '';
        return '<tr>' +
          '<td title="' + escapeHtml(item.target) + '">' + escapeHtml(item.target) + badge + '</td>' +
          '<td title="' + escapeHtml(target.dataType ?? '') + '">' + escapeHtml(target.dataType ?? '') + '</td>' +
          '<td><select data-index="' + index + '">' + optionHtml(item.source) + '</select></td>' +
          '</tr>';
      }).join('');
      mappingRows.querySelectorAll('select').forEach((select) => {
        select.addEventListener('change', (event) => {
          const index = Number(event.currentTarget.dataset.index);
          mapping[index].source = event.currentTarget.value || null;
          mapping[index].auto = false;
          renderMapping();
        });
      });
      const mapped = mapping.filter((item) => item.source).length;
      mappingSummary.textContent = mapped + ' of ' + mapping.length + ' mapped';
      importButton.disabled = mapped === 0;
    }

    function renderWarnings() {
      const items = state.preview.warnings ?? [];
      warnings.className = items.length ? 'warnings visible' : 'warnings';
      warnings.innerHTML = items.map((item) => '<div>' + escapeHtml(item) + '</div>').join('');
    }

    function renderPreview() {
      if (!state.preview.sampleRows.length || !sourceColumns.length) {
        previewHost.innerHTML = '<div class="empty">No preview rows.</div>';
        return;
      }
      const head = '<thead><tr>' + sourceColumns.map((column) => '<th title="' + escapeHtml(column) + '">' + escapeHtml(column) + '</th>').join('') + '</tr></thead>';
      const body = '<tbody>' + state.preview.sampleRows.map((row) => (
        '<tr>' + sourceColumns.map((column) => '<td title="' + escapeHtml(row[column] ?? '') + '">' + formatCell(row[column]) + '</td>').join('') + '</tr>'
      )).join('') + '</tbody>';
      previewHost.innerHTML = '<table>' + head + body + '</table>';
    }

    importButton.addEventListener('click', () => {
      importButton.disabled = true;
      cancelButton.disabled = true;
      status.className = 'status';
      status.textContent = 'Importing data...';
      vscode.postMessage({
        type: 'import',
        mapping: mapping.map((item) => ({ target: item.target, source: item.source }))
      });
    });

    cancelButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data ?? {};
      if (message.type !== 'state') {
        return;
      }
      status.className = 'status ' + (message.state === 'error' || message.state === 'success' ? message.state : '');
      status.textContent = message.message ?? '';
      if (message.state === 'error') {
        importButton.disabled = mapping.filter((item) => item.source).length === 0;
        cancelButton.disabled = false;
      }
      if (message.state === 'success') {
        importButton.disabled = true;
        cancelButton.textContent = 'Close';
        cancelButton.disabled = false;
      }
    });

    renderWarnings();
    renderMapping();
    renderPreview();
  </script>
</body>
</html>`;
  }
};
function escapeHtml3(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

// src/utils/logger.ts
var vscode26 = __toESM(require("vscode"));
var Logger = class {
  output = vscode26.window.createOutputChannel("Database");
  info(message) {
    this.output.appendLine(`[info] ${message}`);
  }
  error(message, error) {
    this.output.appendLine(`[error] ${message}`);
    if (error instanceof Error) {
      this.output.appendLine(error.stack ?? error.message);
    } else if (error !== void 0) {
      this.output.appendLine(String(error));
    }
  }
  show() {
    this.output.show();
  }
};

// src/extension.ts
var PROJECT_SQL_SESSION_PREFIX2 = "project-sql:";
function activate(context) {
  const logger = new Logger();
  const connectionStore = new ConnectionStore(context);
  const connectionManager = new ConnectionManager(connectionStore);
  const historyStore = new QueryHistoryStore(context);
  const consoleStore = new QueryConsoleStore(context);
  const sqlDocumentConnections = new SqlDocumentConnectionStore(context);
  const resultStore = new ResultSessionStore(context);
  const schemaContext = new SchemaContextService(connectionManager, new SchemaMetadataCacheStore(context));
  const sectionService = new SqlSectionService();
  const highlighter = new SqlSectionHighlighter();
  const sqlDiagnostics = vscode27.languages.createDiagnosticCollection("database-sql");
  const diagnosticsService = new SqlDiagnosticsService(connectionManager, schemaContext, sectionService);
  const parameterPrompt = new SqlParameterPrompt();
  const aiAdapter = new VsCodeLanguageModelSqlAdapter();
  const refreshAiAvailability = () => {
    void aiAdapter.isAvailable().then((available) => {
      void vscode27.commands.executeCommand("setContext", "database.aiAvailable", available);
    });
  };
  void vscode27.commands.executeCommand("setContext", "database.aiAvailable", false);
  refreshAiAvailability();
  const memoryStore = new QueryMemoryStore(context);
  const memoryService = new QueryMemoryService(historyStore, memoryStore, consoleStore, connectionManager, aiAdapter);
  const tablePerformanceAdvisor = new TablePerformanceAdvisorService(connectionManager, memoryService, aiAdapter);
  const erDiagramService = new ErDiagramService(connectionManager, schemaContext);
  const queryPlanAnalyzer = new QueryPlanAnalyzerService(connectionManager, aiAdapter);
  const dataProfiler = new DataProfileService(connectionManager, aiAdapter);
  const executor = new QueryExecutor(connectionManager, historyStore, memoryService);
  const queryOutput = new QueryOutputService();
  const diagnosticTimers = /* @__PURE__ */ new Map();
  const diagnosticVersions = /* @__PURE__ */ new Map();
  const consoleAutoSaves = /* @__PURE__ */ new Map();
  const consoleAutoSaveQueued = /* @__PURE__ */ new Set();
  const runningDocuments = /* @__PURE__ */ new Map();
  const runningQueries = /* @__PURE__ */ new Map();
  void vscode27.commands.executeCommand("setContext", "database.queryRunning", false);
  const statementRunningDecoration = vscode27.window.createTextEditorDecorationType({
    before: {
      contentIconPath: vscode27.Uri.joinPath(context.extensionUri, "media", "sql-running.svg"),
      width: "12px",
      height: "12px",
      margin: "0 6px 0 0"
    }
  });
  const statementCompletedDecoration = vscode27.window.createTextEditorDecorationType({
    before: { contentText: "\u2713 ", color: new vscode27.ThemeColor("testing.iconPassed") }
  });
  const statementFailedDecoration = vscode27.window.createTextEditorDecorationType({
    before: { contentText: "\u2717 ", color: new vscode27.ThemeColor("testing.iconFailed") }
  });
  let pruningMissingConsoles = false;
  let pruningUnknownConnections = false;
  let queryMap;
  const results = new ResultsPanelProvider(
    context,
    connectionManager,
    resultStore,
    executor,
    async (tab) => revealSourceForTab(tab),
    (tabs) => queryMap?.updateResults(tabs),
    async (maxRows) => executeActiveMultiStatementSelection(maxRows),
    async (tabId) => cancelRunningQuery(tabId),
    async (tab, resultSetIndex) => compareResultTabs(tab, resultSetIndex)
  );
  queryMap = new QueryMapProvider(
    context.extensionUri,
    sectionService,
    async (documentUri, section) => {
      await highlighter.reveal(documentUri, rangeToPlain(section.range), section.sql);
    },
    async (documentUri, section) => {
      const editor = vscode27.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "sql" || editor.document.uri.toString() !== documentUri) {
        return;
      }
      await executeDetected(editor, section);
    },
    () => queryConsoleHistoryItems(),
    async (item) => openHistoryItem(item),
    async (id, pinned) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.setPinned(id, pinned);
      refreshQueryMap();
    },
    async (id) => {
      await untrackActiveSession(id);
      refreshQueryMap();
    },
    async (id, direction) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.move(id, direction);
      refreshQueryMap();
    },
    async (documentUri) => {
      if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
        await consoleStore.touchDocument(documentUri, { opened: true });
      } else {
        await sqlDocumentConnections.touch(documentUri);
      }
      await results.show(connectionIdForDocumentUri(documentUri));
      refreshQueryMap();
    },
    async (item) => {
      await historyStore.update(item);
      refreshQueryMap();
    },
    async (id) => {
      await historyStore.delete(id);
      refreshQueryMap();
    },
    async (ids) => {
      await clearActiveSessionsById(ids);
      refreshQueryMap();
    },
    async (ids) => {
      const idSet = new Set(ids);
      const memoryIds = memoryStore.getAll().filter((item) => item.historyIds?.some((id) => idSet.has(id)) || item.latestHistoryId !== void 0 && idSet.has(item.latestHistoryId)).map((item) => item.id);
      await historyStore.deleteMany(ids);
      await memoryStore.deleteMany(memoryIds);
      refreshQueryMap();
    },
    () => refreshQueryMap()
  );
  const tree = new DatabaseTreeProvider(connectionManager);
  context.subscriptions.push(connectionManager.onDidChangeActiveConnections(() => {
    refreshQueryMap();
    tree.refresh();
    updateSqlConnectionStatus(vscode27.window.activeTextEditor);
    const activeDocument = vscode27.window.activeTextEditor?.document;
    const connection = activeDocument?.languageId === "sql" ? connectionForDocument(activeDocument) : void 0;
    if (connection && connectionManager.isConnected(connection.id)) {
      schemaContext.refreshDefaultSchemaInBackground(connection);
    }
  }));
  const treeView = vscode27.window.createTreeView("databaseExplorer", { treeDataProvider: tree, showCollapseAll: true });
  context.subscriptions.push(
    treeView,
    highlighter,
    queryOutput,
    sqlDiagnostics,
    vscode27.window.registerWebviewViewProvider(ResultsPanelProvider.viewType, results),
    vscode27.window.registerWebviewViewProvider(QueryMapProvider.viewType, queryMap)
  );
  const status = vscode27.window.createStatusBarItem(vscode27.StatusBarAlignment.Left, 90);
  status.command = "database.pickConnection";
  status.text = "$(database) Database";
  status.show();
  context.subscriptions.push(status, statementRunningDecoration, statementCompletedDecoration, statementFailedDecoration);
  const sqlCodeLensRefresh = new vscode27.EventEmitter();
  context.subscriptions.push(sqlCodeLensRefresh);
  context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService, connectionForDocument, context));
  context.subscriptions.push(registerSqlConnectionCodeLens(sqlConnectionLensTitle, sectionService, sqlCodeLensRefresh.event));
  context.subscriptions.push(vscode27.window.onDidChangeActiveTextEditor((editor) => {
    queryMap.updateFromEditor(editor);
    syncResultsToEditor(editor);
    updateSqlConnectionStatus(editor);
    highlightActiveSqlSection(editor);
    highlighter.refreshVisibleEditors();
    updateSqlDiagnostics(editor?.document, editor?.selection);
  }));
  context.subscriptions.push(vscode27.window.onDidChangeTextEditorSelection((event) => {
    highlightActiveSqlSection(event.textEditor);
    updateSqlDiagnostics(event.textEditor.document, event.selections[0]);
  }));
  context.subscriptions.push(vscode27.workspace.onDidChangeTextDocument((event) => {
    autoSaveQueryConsoleDocument(event.document);
    const editor = vscode27.window.activeTextEditor;
    if (editor?.document.uri.toString() === event.document.uri.toString()) {
      queryMap.updateFromEditor(editor);
      highlightActiveSqlSection(editor);
    }
    updateSqlDiagnostics(event.document, editor?.selection);
  }));
  context.subscriptions.push(vscode27.workspace.onDidCloseTextDocument((document) => {
    const documentUri = document.uri.toString();
    consoleAutoSaves.delete(documentUri);
    consoleAutoSaveQueued.delete(documentUri);
    sqlDiagnostics.delete(document.uri);
  }));
  context.subscriptions.push(vscode27.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("database.ai")) {
      refreshAiAvailability();
    }
  }));
  const sqlFormatter = {
    async provideDocumentFormattingEdits(document) {
      return formatSqlDocument(document);
    },
    async provideDocumentRangeFormattingEdits(document, range) {
      return formatSqlDocument(document, range);
    }
  };
  context.subscriptions.push(
    vscode27.languages.registerDocumentFormattingEditProvider("sql", sqlFormatter),
    vscode27.languages.registerDocumentRangeFormattingEditProvider("sql", sqlFormatter)
  );
  refreshQueryMap();
  void schemaContext.warmFromDisk(connectionManager.getConnections());
  queryMap.updateFromEditor(vscode27.window.activeTextEditor);
  queryMap.updateResults(results.getTabs());
  highlightActiveSqlSection(vscode27.window.activeTextEditor);
  updateSqlConnectionStatus(vscode27.window.activeTextEditor);
  for (const document of vscode27.workspace.textDocuments) {
    updateSqlDiagnostics(document);
  }
  const register = (command, callback) => {
    context.subscriptions.push(vscode27.commands.registerCommand(command, async (...args) => {
      try {
        return await callback(...args);
      } catch (error) {
        logger.error(command, error);
        void vscode27.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return void 0;
      }
    }));
  };
  connectionManager.setConnectionCreator(createConnectionFromEditor);
  if (process.env.QUERYDECK_ENABLE_TEST_COMMANDS === "true") {
    register("database.internal.seedAndConnectForMarketplaceMedia", async (configsArg) => {
      const configs = configsArg;
      for (const config of configs) {
        await connectionManager.save(config);
      }
      for (const config of configs) {
        await connectionManager.connect(config.id);
      }
      refreshQueryMap();
      tree.refresh();
      return connectionManager.getActiveConnections().map((connection) => connection.config.id);
    });
  }
  async function createConnectionFromEditor() {
    const config = await ConnectionEditorPanel.open(context, connectionManager);
    if (!config) {
      return void 0;
    }
    await connectionManager.save(config);
    refreshQueryMap();
    tree.refresh();
    return connectionManager.getConnection(config.id) ?? config;
  }
  function refreshQueryMap() {
    const connections = connectionManager.getConnections();
    const knownConnectionIds = new Set(connections.map((connection) => connection.id));
    queryMap.updateConsoles(
      activeSessionRecords(knownConnectionIds),
      connections,
      connectionManager.getActiveConnections().map((connection) => connection.config.id)
    );
    void pruneMissingConsoleRecords();
    void pruneUnknownConnectionRecords();
  }
  async function collectDatabaseObjects() {
    const picks = [];
    for (const connection of connectionManager.getConnections()) {
      let entries = schemaContext.getAnyCached(connection.id);
      if (!entries.length && connectionManager.isConnected(connection.id)) {
        entries = [await schemaContext.loadDefaultSchema(connection)];
      }
      for (const entry of entries) {
        const schemaLabel = `${connection.name} \u2022 ${entry.schemaName}`;
        for (const table of entry.tables) {
          const node = new TableNode(connection, table);
          picks.push({
            objectKind: "table",
            node,
            label: table.name,
            description: `table \u2022 ${schemaLabel}`,
            detail: `${table.schema}.${table.name}`
          });
        }
        for (const view of entry.views) {
          const node = new ViewNode(connection, view);
          picks.push({
            objectKind: "view",
            node,
            label: view.name,
            description: `view \u2022 ${schemaLabel}`,
            detail: `${view.schema}.${view.name}`
          });
        }
        for (const [tableKey3, columns] of Object.entries(entry.columns)) {
          const [schemaName, tableName] = tableKey3.split(".");
          for (const column of columns) {
            const node = new ColumnNode(connection, column);
            picks.push({
              objectKind: "column",
              node,
              label: `${tableName}.${column.name}`,
              description: `column \u2022 ${schemaLabel}`,
              detail: `${schemaName}.${tableName}.${column.name}`
            });
          }
        }
      }
    }
    return picks.sort((left, right) => {
      const leftKey = `${left.description ?? ""} ${left.detail ?? ""} ${left.label}`;
      const rightKey = `${right.description ?? ""} ${right.detail ?? ""} ${right.label}`;
      return leftKey.localeCompare(rightKey, void 0, { numeric: true, sensitivity: "base" });
    });
  }
  function autoSaveQueryConsoleDocument(document) {
    const documentUri = document.uri.toString();
    if (!document.isDirty || !queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
      return;
    }
    if (consoleAutoSaves.has(documentUri)) {
      consoleAutoSaveQueued.add(documentUri);
      return;
    }
    const save = async () => {
      try {
        do {
          consoleAutoSaveQueued.delete(documentUri);
          if (document.isDirty) {
            try {
              await document.save();
            } catch (error) {
              logger.error("queryConsoleAutoSave", error);
              return;
            }
          }
        } while (consoleAutoSaveQueued.has(documentUri));
      } finally {
        consoleAutoSaves.delete(documentUri);
        consoleAutoSaveQueued.delete(documentUri);
      }
    };
    const promise = save();
    consoleAutoSaves.set(documentUri, promise);
  }
  function activeSessionRecords(knownConnectionIds = currentConnectionIds()) {
    const consoles = consoleStore.getAll();
    const knownConsoles = consoles.filter((record) => knownConnectionIds.has(record.connectionId));
    const consoleUris = new Set(knownConsoles.map((record) => record.documentUri));
    const projectSessions = sqlDocumentConnections.getAll().filter((record) => knownConnectionIds.has(record.connectionId) && !!record.lastTouchedAt && !consoleUris.has(record.documentUri)).map((record) => ({
      id: projectSqlSessionId(record.documentUri),
      connectionId: record.connectionId,
      documentUri: record.documentUri,
      lastExecutedRange: record.lastExecutedRange,
      lastTouchedAt: record.lastTouchedAt,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt
    }));
    return [
      ...knownConsoles,
      ...projectSessions
    ];
  }
  function projectSqlSessionId(documentUri) {
    return `${PROJECT_SQL_SESSION_PREFIX2}${encodeURIComponent(documentUri)}`;
  }
  function documentUriFromProjectSqlSessionId(id) {
    if (!id.startsWith(PROJECT_SQL_SESSION_PREFIX2)) {
      return void 0;
    }
    try {
      return decodeURIComponent(id.slice(PROJECT_SQL_SESSION_PREFIX2.length));
    } catch {
      return void 0;
    }
  }
  async function untrackActiveSession(id) {
    const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
    if (projectDocumentUri) {
      await sqlDocumentConnections.delete(projectDocumentUri);
      return;
    }
    await consoleStore.delete(id);
  }
  async function clearActiveSessionsById(ids) {
    const consoleIds = [];
    const projectDocumentUris = [];
    for (const id of ids) {
      const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
      if (projectDocumentUri) {
        projectDocumentUris.push(projectDocumentUri);
      } else {
        consoleIds.push(id);
      }
    }
    await consoleStore.deleteMany(consoleIds);
    await Promise.all(projectDocumentUris.map((documentUri) => sqlDocumentConnections.delete(documentUri)));
  }
  function beginDocumentExecution(documentUri) {
    runningDocuments.set(documentUri, (runningDocuments.get(documentUri) ?? 0) + 1);
    queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    return () => {
      const count = (runningDocuments.get(documentUri) ?? 1) - 1;
      if (count > 0) {
        runningDocuments.set(documentUri, count);
      } else {
        runningDocuments.delete(documentUri);
      }
      queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    };
  }
  function beginRunningQuery(tab, documentUri) {
    const running = {
      tabId: tab.id,
      connectionId: tab.connectionId,
      documentUri,
      title: tab.customTitle ?? tab.title,
      startedAt: tab.executionStartedAt,
      executionIds: /* @__PURE__ */ new Set(),
      cancelRequested: false
    };
    runningQueries.set(tab.id, running);
    updateQueryRunningContext();
    return running;
  }
  function finishRunningQuery(tabId) {
    runningQueries.delete(tabId);
    updateQueryRunningContext();
  }
  function updateQueryRunningContext() {
    void vscode27.commands.executeCommand("setContext", "database.queryRunning", runningQueries.size > 0);
  }
  function trackRunningProgress(running, progress) {
    if (!progress.executionId) {
      return;
    }
    if (progress.status === "started") {
      running.executionIds.add(progress.executionId);
      if (running.cancelRequested) {
        void cancelExecution(running, progress.executionId).catch((error) => logger.error("database.cancelCurrentQuery", error));
      }
      return;
    }
    running.executionIds.delete(progress.executionId);
  }
  async function cancelExecution(running, executionId) {
    await executor.cancel(running.connectionId, executionId);
  }
  function runningQueryForCancellation(tabId) {
    if (tabId) {
      return runningQueries.get(tabId);
    }
    const activeTab = results.getActiveTab();
    if (activeTab) {
      const runningTab = runningQueries.get(activeTab.id);
      if (runningTab) {
        return runningTab;
      }
    }
    const activeDocumentUri = vscode27.window.activeTextEditor?.document.uri.toString();
    if (activeDocumentUri) {
      const runningForDocument = [...runningQueries.values()].filter((running) => running.documentUri === activeDocumentUri).sort((a, b) => b.startedAt - a.startedAt)[0];
      if (runningForDocument) {
        return runningForDocument;
      }
    }
    return [...runningQueries.values()].sort((a, b) => b.startedAt - a.startedAt)[0];
  }
  async function cancelRunningQuery(tabId) {
    const running = runningQueryForCancellation(tabId);
    if (!running) {
      void vscode27.window.showInformationMessage("No query is currently running.");
      return;
    }
    running.cancelRequested = true;
    if (!running.executionIds.size) {
      void vscode27.window.showInformationMessage(`Cancel requested for ${running.title}.`);
      return;
    }
    const executionIds = [...running.executionIds];
    const settled = await Promise.allSettled(executionIds.map((executionId) => cancelExecution(running, executionId)));
    const failures = settled.filter((result) => result.status === "rejected");
    if (failures.length === settled.length) {
      throw new Error(`Could not cancel ${running.title}: ${failures[0]?.reason instanceof Error ? failures[0].reason.message : String(failures[0]?.reason)}`);
    }
    if (failures.length) {
      logger.error("database.cancelCurrentQuery", failures.map((failure) => failure.reason).join("\n"));
    }
    void vscode27.window.showInformationMessage(`Cancel requested for ${running.title}.`);
  }
  function createStatementStatusUpdater(editor, range, sql) {
    const statements = splitSqlStatements(sql);
    const sqlParts = statements.length ? statements : [{ sql, start: 0, end: sql.length }];
    const baseOffset = editor.document.offsetAt(range.start);
    const statuses = sqlParts.map((statement) => ({
      range: new vscode27.Range(
        editor.document.positionAt(baseOffset + statement.start),
        editor.document.positionAt(baseOffset + statement.start)
      ),
      status: void 0
    }));
    const apply = () => {
      editor.setDecorations(statementRunningDecoration, statuses.filter((item) => item.status === "running").map((item) => item.range));
      editor.setDecorations(statementCompletedDecoration, statuses.filter((item) => item.status === "completed").map((item) => item.range));
      editor.setDecorations(statementFailedDecoration, statuses.filter((item) => item.status === "failed").map((item) => item.range));
    };
    apply();
    return (progress) => {
      const item = statuses[progress.statementIndex];
      if (!item) {
        return;
      }
      item.status = progress.status === "started" ? "running" : progress.status === "completed" ? "completed" : "failed";
      apply();
    };
  }
  function queryConsoleHistoryItems(knownConnectionIds = currentConnectionIds()) {
    const consoleUris = queryConsoleDocumentUris(consoleStore.getAll().filter((record) => knownConnectionIds.has(record.connectionId)));
    return historyStore.getAll().filter((item) => knownConnectionIds.has(item.connectionId) && isQueryConsoleHistoryItem(item, consoleUris));
  }
  async function markActiveSessionExecuted(documentUri, connectionId, range) {
    if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
      await consoleStore.markExecuted(documentUri, range);
      return;
    }
    await sqlDocumentConnections.markExecuted(documentUri, connectionId, range);
  }
  async function pruneMissingConsoleRecords() {
    if (pruningMissingConsoles) {
      return;
    }
    pruningMissingConsoles = true;
    try {
      const removed = await consoleStore.pruneMissingDocuments();
      if (removed > 0) {
        queryMap.updateConsoles(
          activeSessionRecords(),
          connectionManager.getConnections(),
          connectionManager.getActiveConnections().map((connection) => connection.config.id)
        );
      }
    } finally {
      pruningMissingConsoles = false;
    }
  }
  function currentConnectionIds() {
    return new Set(connectionManager.getConnections().map((connection) => connection.id));
  }
  async function pruneUnknownConnectionRecords() {
    if (pruningUnknownConnections) {
      return;
    }
    pruningUnknownConnections = true;
    try {
      const knownConnectionIds = currentConnectionIds();
      const orphaned = orphanedConnectionRecordIds({
        consoles: consoleStore.getAll(),
        sqlDocuments: sqlDocumentConnections.getAll(),
        history: historyStore.getAll(),
        memory: memoryStore.getAll()
      }, knownConnectionIds);
      const removedCount = orphaned.consoleIds.length + orphaned.sqlDocumentUris.length + orphaned.historyIds.length + orphaned.memoryIds.length;
      if (!removedCount) {
        return;
      }
      await Promise.all([
        consoleStore.deleteMany(orphaned.consoleIds),
        sqlDocumentConnections.deleteMany(orphaned.sqlDocumentUris),
        historyStore.deleteMany(orphaned.historyIds),
        memoryStore.deleteMany(orphaned.memoryIds)
      ]);
      queryMap.updateConsoles(
        activeSessionRecords(currentConnectionIds()),
        connectionManager.getConnections(),
        connectionManager.getActiveConnections().map((connection) => connection.config.id)
      );
    } finally {
      pruningUnknownConnections = false;
    }
  }
  function documentConnectionBindings() {
    return [...consoleStore.getAll(), ...sqlDocumentConnections.getAll()];
  }
  function resolveConnectionForDocument(document) {
    return resolveDocumentConnection(
      document.uri.toString(),
      documentConnectionBindings(),
      connectionManager.getConnections()
    );
  }
  function connectionForDocument(document) {
    return resolveConnectionForDocument(document).connection;
  }
  async function formatSqlDocument(document, range) {
    if (document.lineCount === 0) {
      return [];
    }
    const targetRange = range ?? new vscode27.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character);
    const source = document.getText(targetRange);
    const formatted = await formatSqlText(source, sqlFormatterDialect(connectionForDocument(document)));
    if (formatted === source) {
      return [];
    }
    return [vscode27.TextEdit.replace(targetRange, formatted)];
  }
  function connectionFromArg(node) {
    const id = connectionIdFromArg(node);
    return id ? connectionManager.getConnection(id) : void 0;
  }
  function connectionIdForDocumentUri(documentUri) {
    return resolveDocumentConnection(
      documentUri,
      documentConnectionBindings(),
      connectionManager.getConnections()
    ).connection?.id;
  }
  function activeConnectionId() {
    const editor = vscode27.window.activeTextEditor;
    return editor?.document.languageId === "sql" ? connectionForDocument(editor.document)?.id : void 0;
  }
  function syncResultsToEditor(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      return;
    }
    const documentUri = editor.document.uri.toString();
    const isTrackedConsole = consoleStore.getAll().some((record) => record.documentUri === documentUri);
    const hasResults = results.getTabs().some((tab) => tab.sourceDocumentUri === documentUri);
    const connection = connectionForDocument(editor.document);
    if ((isTrackedConsole || hasResults) && connection) {
      results.setActiveConnection(connection.id);
    }
  }
  function updateSqlConnectionStatus(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      status.command = "database.pickConnection";
      status.text = "$(database) Database";
      return;
    }
    const resolved = resolveConnectionForDocument(editor.document);
    status.command = "database.setSqlFileConnection";
    if (resolved.connection) {
      status.text = `$(database) ${resolved.connection.name}`;
    } else if (resolved.isBound) {
      status.text = "$(warning) Missing database";
    } else {
      status.text = "$(database) Select Database";
    }
  }
  function sqlConnectionLensTitle(document) {
    const resolved = resolveConnectionForDocument(document);
    if (resolved.connection) {
      return `$(database) Database: ${resolved.connection.name}`;
    }
    if (resolved.isBound) {
      return "$(warning) Database: Missing connection";
    }
    return "$(database) Select Database Connection";
  }
  function recordQueryOutput(tab) {
    const connection = connectionManager.getConnection(tab.connectionId);
    if (connection) {
      queryOutput.record(connection, tab);
    }
  }
  new QueryMemoryController(context, memoryService, connectionManager, executor, aiAdapter, async (tab) => {
    await results.addTab(tab);
    recordQueryOutput(tab);
    queryMap.updateResults(results.getTabs());
  }).register(register);
  register("database.addConnection", async () => {
    await createConnectionFromEditor();
  });
  register("database.editConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const existing = connectionManager.getConnection(id);
    const next = existing ? await ConnectionEditorPanel.open(context, connectionManager, existing) : void 0;
    if (next) {
      await connectionManager.save(next);
      schemaContext.invalidate(id);
      refreshQueryMap();
      tree.refresh();
    }
  });
  register("database.deleteConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const answer = await vscode27.window.showWarningMessage("Delete this connection?", { modal: true }, "Delete");
    if (answer === "Delete") {
      await connectionManager.delete(id);
      await schemaContext.deletePersistent(id);
      refreshQueryMap();
      tree.refresh();
    }
  });
  register("database.testConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const message = await connectionManager.test(id);
    void vscode27.window.showInformationMessage(`Connection successful: ${message}`);
  });
  register("database.connect", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const connection = await connectionManager.connect(id);
    status.text = `$(database) ${connection.config.name}`;
    schemaContext.refreshDefaultSchemaInBackground(connection.config);
    refreshQueryMap();
    tree.refresh();
  });
  register("database.disconnect", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    await connectionManager.disconnect(id);
    schemaContext.invalidate(id);
    status.text = "$(database) Database";
    refreshQueryMap();
    tree.refresh();
  });
  register("database.refreshExplorer", (node) => {
    const target = databaseNodeFromArg(node) ?? treeView.selection[0];
    const connectionId = connectionIdFromArg(target);
    if (connectionId) {
      schemaContext.invalidate(connectionId);
      const connection = connectionManager.getConnection(connectionId);
      if (connection && connectionManager.isConnected(connection.id)) {
        schemaContext.refreshSchemaInBackground(connection, target ? schemaFromNode(target).schema : connection.defaultSchema ?? "public");
      }
      tree.refresh(target);
      return;
    }
    schemaContext.invalidate();
    for (const active of connectionManager.getActiveConnections()) {
      schemaContext.refreshDefaultSchemaInBackground(active.config);
    }
    tree.refresh();
  });
  register("database.showResults", () => results.show(activeConnectionId()));
  register("database.focusResults", () => results.show(activeConnectionId()));
  register("database.focusExplorer", () => vscode27.commands.executeCommand("databaseExplorer.focus"));
  register("database.goToDatabaseObject", async () => {
    const objects = await collectDatabaseObjects();
    if (!objects.length) {
      void vscode27.window.showInformationMessage("No cached database objects found yet.");
      return;
    }
    const picked = await vscode27.window.showQuickPick(objects, {
      placeHolder: "Go to database object",
      matchOnDetail: true,
      matchOnDescription: true
    });
    if (!picked) {
      return;
    }
    await treeView.reveal(picked.node, { expand: true, focus: true, select: true });
    if (picked.objectKind === "table") {
      await vscode27.commands.executeCommand("database.openTableData", picked.node);
    }
  });
  register("database.sessionMonitor", async (node) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode27.window.showInformationMessage("Pick a database connection first.");
      return;
    }
    await SessionMonitorPanel.open(context, connectionManager, connection);
  });
  register("database.showSqlMetadataStatus", () => showSqlMetadataStatus());
  register("database.setSqlFileConnection", (resource) => setSqlFileConnection(resource));
  register("database.pickConnection", async () => {
    const connection = await connectionManager.pickConnection();
    if (connection) {
      await connectionManager.setSelectedConnection(connection.id);
      status.text = `$(database) ${connection.name}`;
    }
  });
  register("database.openSqlConsole", async (node) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection() ?? await connectionManager.pickConnection();
    const doc = await consoleStore.openOrCreate(connection, "", { reuse: false });
    await vscode27.window.showTextDocument(doc, { viewColumn: vscode27.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, "Query console");
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode27.window.activeTextEditor);
  });
  register("database.openQueryFile", async (node) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection();
    const doc = await consoleStore.openOrCreate(connection, "", { reuse: false });
    await vscode27.window.showTextDocument(doc, { viewColumn: vscode27.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, "Query file");
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode27.window.activeTextEditor);
  });
  register("database.executeCurrentQuery", () => executeFromEditor("run"));
  register("database.executeSelection", () => executeFromEditor("selection"));
  register("database.executeFile", () => executeFromEditor("run"));
  register("database.cancelCurrentQuery", () => cancelRunningQuery());
  register("database.executeStatementRange", async (uriText, startLine, startCharacter, endLine, endCharacter) => {
    const editor = vscode27.window.activeTextEditor;
    if (!editor || typeof uriText !== "string" || editor.document.uri.toString() !== uriText) {
      return;
    }
    if (![startLine, startCharacter, endLine, endCharacter].every((value) => typeof value === "number")) {
      return;
    }
    const range = new vscode27.Range(
      new vscode27.Position(startLine, startCharacter),
      new vscode27.Position(endLine, endCharacter)
    );
    const selections = selectedSqlDetections(editor);
    if (shouldRunSelectionForStatement(selections, range)) {
      await executeFromEditor("selection");
      return;
    }
    const section = sectionService.getSections(editor.document).find((item) => item.range.isEqual(range));
    await executeDetected(editor, {
      sql: editor.document.getText(range),
      range,
      index: section?.index,
      id: section?.id
    });
  });
  register("database.openTableData", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    await TableDataPanel.open(context, connectionManager, node);
  });
  register("database.analyzeTablePerformance", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const report = await vscode27.window.withProgress({
      location: vscode27.ProgressLocation.Notification,
      title: `Analyzing ${qualifiedName(node.table.schema, node.table.name)}`,
      cancellable: false
    }, () => tablePerformanceAdvisor.analyzeTable(node.connection, node.table.schema, node.table.name));
    await TableDataPanel.openPerformanceAdvisor(context, node, report, (title, sql) => openSqlScript(title, sql, node.connection));
  });
  register("database.profileTableData", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const configuredSampleRows = vscode27.workspace.getConfiguration("database").get("dataProfile.sampleRows", 5e3);
    const sampleRows = Number.isFinite(configuredSampleRows) && configuredSampleRows && configuredSampleRows > 0 ? Math.floor(configuredSampleRows) : 5e3;
    const report = await vscode27.window.withProgress({
      location: vscode27.ProgressLocation.Notification,
      title: `Profiling ${qualifiedName(node.table.schema, node.table.name)}`,
      cancellable: false
    }, () => dataProfiler.profileTable(node.connection, node.table.schema, node.table.name, sampleRows));
    await TableDataPanel.openDataProfile(context, node, report);
  });
  register("database.generateTableMaintenanceSql", async (node) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    if (!connectionManager.isConnected(target.connection.id)) {
      await connectionManager.connect(target.connection.id);
    }
    const stats = await connectionManager.getDriver(target.connection.type).getTableStats(target.connection.id, target.schema, target.name);
    const sql = maintenanceScriptFromStats(stats);
    if (!sql) {
      void vscode27.window.showInformationMessage(`No Redshift maintenance SQL was generated for ${qualifiedName(target.schema, target.name)}.`);
      return;
    }
    await openSqlScript(`Maintenance ${target.name}`, `${sql}
`, target.connection);
  });
  register("database.compareSchemas", async (node) => {
    const source = schemaLikeTarget(node);
    if (!source) {
      return;
    }
    const targetConnection = await pickDestinationConnection(connectionManager, source.connection.id);
    if (!targetConnection) {
      return;
    }
    if (!connectionManager.isConnected(source.connection.id)) {
      await connectionManager.connect(source.connection.id);
    }
    if (!connectionManager.isConnected(targetConnection.id)) {
      await connectionManager.connect(targetConnection.id);
    }
    const sourceSchema = await schemaContext.loadSchema(source.connection, source.schema);
    if (sourceSchema.status !== "ready") {
      void vscode27.window.showWarningMessage(`Could not load source schema ${source.schema}: ${sourceSchema.errorMessage ?? "metadata unavailable"}`);
      return;
    }
    const targetSchemaName = await vscode27.window.showInputBox({
      title: "Target schema",
      prompt: "Schema to compare against",
      value: source.schema,
      ignoreFocusOut: true
    });
    if (!targetSchemaName) {
      return;
    }
    const targetSchema = await schemaContext.loadSchema(targetConnection, targetSchemaName.trim());
    if (targetSchema.status !== "ready") {
      void vscode27.window.showWarningMessage(`Could not load target schema ${targetSchemaName.trim()}: ${targetSchema.errorMessage ?? "metadata unavailable"}`);
      return;
    }
    const report = compareSchemas({
      sourceConnectionName: source.connection.name,
      targetConnectionName: targetConnection.name,
      targetDatabaseType: targetConnection.type,
      sourceSchema: snapshotFromSchemaEntry(sourceSchema),
      targetSchema: snapshotFromSchemaEntry(targetSchema)
    });
    const doc = await vscode27.workspace.openTextDocument({
      language: "markdown",
      content: formatSchemaDiffMarkdown(report)
    });
    await vscode27.window.showTextDocument(doc, { preview: true, viewColumn: vscode27.ViewColumn.Beside });
  });
  register("database.showErDiagram", async (node) => {
    const target = schemaLikeTarget(node);
    if (!target) {
      return;
    }
    const report = await vscode27.window.withProgress({
      location: vscode27.ProgressLocation.Notification,
      title: `Building ER diagram for ${target.schema}`,
      cancellable: false
    }, () => erDiagramService.build({ connection: target.connection, schemaName: target.schema }));
    await ErDiagramPanel.open(context, report);
  });
  register("database.insertQuerySnippet", async () => {
    const editor = vscode27.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") {
      void vscode27.window.showInformationMessage("Open a SQL editor before inserting a query snippet.");
      return;
    }
    const picked = await vscode27.window.showQuickPick(querySnippets().map((snippet) => ({
      label: snippet.label,
      description: snippet.description,
      snippet
    })), {
      placeHolder: "Insert query snippet"
    });
    if (!picked) {
      return;
    }
    await editor.insertSnippet(new vscode27.SnippetString(picked.snippet.snippet));
  });
  register("database.copyName", async (node) => {
    const name = objectName(node);
    if (name) {
      await vscode27.env.clipboard.writeText(name);
    }
  });
  register("database.copyQualifiedName", async (node) => {
    const name = qualifiedObjectName(node);
    if (name) {
      await vscode27.env.clipboard.writeText(name);
    }
  });
  register("database.importTableData", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    try {
      const files = await vscode27.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Import data",
        filters: {
          "Data files": ["csv", "json"]
        }
      });
      const file = files?.[0];
      if (!file) {
        return;
      }
      const fileBytes = await vscode27.workspace.fs.readFile(file);
      const fileText = Buffer.from(fileBytes).toString("utf8");
      if (!connectionManager.isConnected(node.connection.id)) {
        await connectionManager.connect(node.connection.id);
      }
      const columns = await schemaContext.getColumns(node.connection, node.table.schema, node.table.name);
      const preview = buildTableImportPreview(node.connection.type, node.table.schema, node.table.name, columns, file.path, fileText);
      await TableImportPanel.open(context, {
        connectionName: node.connection.name,
        databaseType: node.connection.type,
        schema: node.table.schema,
        table: node.table.name,
        filePath: file.fsPath,
        preview
      }, async (mapping) => {
        const data = buildTableImportData(file.path, fileText, mapping);
        const statements = buildTableImportStatements(node.connection.type, node.table.schema, node.table.name, data);
        await vscode27.window.withProgress({
          location: vscode27.ProgressLocation.Notification,
          title: `Importing ${data.rows.length.toLocaleString()} rows into ${qualifiedName(node.table.schema, node.table.name)}`,
          cancellable: false
        }, async (progress) => {
          const driver = connectionManager.getDriver(node.connection.type);
          for (const [index, sql] of statements.entries()) {
            progress.report({ message: `Batch ${index + 1} of ${statements.length}` });
            await driver.executeQuery({ connectionId: node.connection.id, sql });
          }
        });
        void vscode27.window.showInformationMessage(`Imported ${data.rows.length.toLocaleString()} rows into ${qualifiedName(node.table.schema, node.table.name)}.`);
        tree.refresh(node);
        return { rowCount: data.rows.length };
      });
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.copyTableToConnection", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const sourceConnection = node.connection;
    if (!canGenerateSqlScript(sourceConnection, "Copy table")) {
      return;
    }
    const destination = await pickDestinationConnection(connectionManager, sourceConnection.id);
    if (!destination) {
      return;
    }
    if (!canGenerateSqlScript(destination, "Copy table")) {
      return;
    }
    const targetSchema = await vscode27.window.showInputBox({
      title: "Target schema",
      prompt: "Schema to create the copied table in",
      value: destination.defaultSchema ?? sourceConnection.defaultSchema ?? node.table.schema,
      ignoreFocusOut: true
    });
    if (!targetSchema) {
      return;
    }
    const targetTable = await vscode27.window.showInputBox({
      title: "Target table",
      prompt: "Name of the copied table",
      value: `${node.table.name}_copy`,
      ignoreFocusOut: true
    });
    if (!targetTable) {
      return;
    }
    if (!connectionManager.isConnected(sourceConnection.id)) {
      await connectionManager.connect(sourceConnection.id);
    }
    try {
      const [columns, sourceRows, sourceDdl] = await vscode27.window.withProgress({
        location: vscode27.ProgressLocation.Notification,
        title: `Copying ${qualifiedName(node.table.schema, node.table.name)}`,
        cancellable: false
      }, async () => Promise.all([
        schemaContext.getColumns(sourceConnection, node.table.schema, node.table.name),
        connectionManager.getDriver(sourceConnection.type).executeQuery({
          connectionId: sourceConnection.id,
          sql: selectAllTableSql(sourceConnection.type, node.table.schema, node.table.name)
        }),
        connectionManager.getDriver(sourceConnection.type).getTableDDL(sourceConnection.id, node.table.schema, node.table.name)
      ]));
      const preview = buildTableCopyPreview(
        node.table.schema,
        node.table.name,
        targetSchema.trim(),
        targetTable.trim(),
        columns,
        sourceRows.rows,
        sourceConnection.name,
        destination.name,
        destination.type
      );
      const header = [
        `-- Source connection: ${sourceConnection.name}`,
        `-- Destination connection: ${destination.name}`,
        `-- Source table: ${qualifiedName(node.table.schema, node.table.name)}`,
        `-- Source DDL:`,
        ...sourceDdl.trim().split("\n").map((line) => `-- ${line}`),
        ""
      ].join("\n");
      await openSqlScript(`Copy ${node.table.name} to ${destination.name}`, `${header}${preview.sql}
`, destination);
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  async function openSqlScript(title, content, connection) {
    const doc = await openSqlEditor(connectionManager, title, content, connection);
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(doc.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode27.window.activeTextEditor);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }
  async function openGeneratedObjectScript(title, node, kind) {
    const target = schemaFromNode(node);
    if (!target.connection) {
      return;
    }
    try {
      await openSqlScript(title, newObjectTemplate(node, kind), target.connection);
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  }
  register("database.showObjectDdl", async (node) => {
    try {
      const sql = await objectDdl(connectionManager, node);
      if (sql) {
        await openSqlScript(`${objectName(node) ?? "Object"} DDL`, `${sql}
`, schemaFromNode(node).connection);
      }
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.generateSelect", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      try {
        await openSqlScript(`SELECT ${target.name}`, selectTableSql(target.connection.type, target.schema, target.name, 100), target.connection);
      } catch (error) {
        void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      }
    }
  });
  register("database.generateInsert", async (node) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    const columns = await connectionManager.getDriver(target.connection.type).getColumns(target.connection.id, target.schema, target.name);
    try {
      await openSqlScript(`INSERT ${target.name}`, insertTemplateSql(target.connection.type, target.schema, target.name, columns), target.connection);
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.generateUpdate", async (node) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    try {
      await openSqlScript(`UPDATE ${target.name}`, updateTemplateSql(target.connection.type, target.schema, target.name), target.connection);
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.generateDelete", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      try {
        await openSqlScript(`DELETE ${target.name}`, deleteTemplateSql(target.connection.type, target.schema, target.name), target.connection);
      } catch (error) {
        void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      }
    }
  });
  register("database.modifyTable", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      try {
        await openSqlScript(`ALTER ${target.name}`, addColumnSql(target.connection.type, target.schema, target.name), target.connection);
      } catch (error) {
        void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      }
    }
  });
  register("database.renameObject", async (node) => {
    try {
      const sql = renameTemplate(node);
      if (sql) {
        await openSqlScript(`Rename ${objectName(node)}`, sql, schemaFromNode(node).connection);
      }
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.dropObject", async (node) => {
    try {
      const sql = dropTemplate(node);
      if (sql) {
        await openSqlScript(`Drop ${objectName(node)}`, sql, schemaFromNode(node).connection);
      }
    } catch (error) {
      void vscode27.window.showWarningMessage(error instanceof Error ? error.message : String(error));
    }
  });
  register("database.newObject", async (node) => {
    const picked = await vscode27.window.showQuickPick([
      { label: "Query Console", command: "database.openSqlConsole" },
      { label: "Query File", command: "database.openQueryFile" },
      { label: "CREATE TABLE script", command: "database.newTable" },
      { label: "CREATE VIEW script", command: "database.newView" },
      { label: "CREATE MATERIALIZED VIEW script", command: "database.newMaterializedView" },
      { label: "ADD COLUMN script", command: "database.newColumn" },
      { label: "CREATE INDEX script", command: "database.newIndex" },
      { label: "UNIQUE KEY script", command: "database.newUniqueKey" },
      { label: "FOREIGN KEY script", command: "database.newForeignKey" },
      { label: "CHECK script", command: "database.newCheck" },
      { label: "CREATE SCHEMA script", command: "database.newSchema" },
      { label: "CREATE SEQUENCE script", command: "database.newSequence" }
    ], { placeHolder: "Generate database SQL script" });
    if (picked) {
      await vscode27.commands.executeCommand(picked.command, node);
    }
  });
  register("database.newTable", async (node) => openGeneratedObjectScript("New Table", node, "table"));
  register("database.newView", async (node) => openGeneratedObjectScript("New View", node, "view"));
  register("database.newMaterializedView", async (node) => openGeneratedObjectScript("New Materialized View", node, "materialized_view"));
  register("database.newColumn", async (node) => openGeneratedObjectScript("New Column", node, "column"));
  register("database.newIndex", async (node) => openGeneratedObjectScript("New Index", node, "index"));
  register("database.newUniqueKey", async (node) => openGeneratedObjectScript("New Unique Key", node, "unique_key"));
  register("database.newForeignKey", async (node) => openGeneratedObjectScript("New Foreign Key", node, "foreign_key"));
  register("database.newCheck", async (node) => openGeneratedObjectScript("New Check", node, "check"));
  register("database.newSchema", async (node) => openGeneratedObjectScript("New Schema", node, "schema"));
  register("database.newSequence", async (node) => openGeneratedObjectScript("New Sequence", node, "sequence"));
  register("database.quickDocumentation", async (node) => {
    const docs = await quickDocumentation(connectionManager, node);
    if (docs) {
      void vscode27.window.showInformationMessage(docs, { modal: true });
    }
  });
  register("database.showQueryHistory", async () => {
    const connection = connectionManager.getPreferredConnection();
    const picked = await vscode27.window.showQuickPick(queryConsoleHistoryItems().filter((item) => !connection || item.connectionId === connection.id).map((item) => ({
      label: `${item.favorite ? "$(star-full) " : ""}${item.sql.replace(/\s+/g, " ").slice(0, 90)}`,
      description: `${item.status}${item.rowCount !== void 0 ? ` - ${item.rowCount} rows` : ""}`,
      detail: `${new Date(item.executedAt).toLocaleString()}${item.sourceFile ? ` - ${item.sourceFile}` : ""}`,
      item
    })), { placeHolder: "Query console history", matchOnDetail: true });
    if (picked) {
      const action = await vscode27.window.showQuickPick([
        { label: "Open in Console", action: "open" },
        { label: picked.item.favorite ? "Remove Favorite" : "Favorite", action: "favorite" },
        { label: "Copy SQL", action: "copy" },
        { label: "Delete", action: "delete" }
      ], { placeHolder: "History action" });
      if (action?.action === "open") {
        await openHistoryItem(picked.item);
      } else if (action?.action === "favorite") {
        await historyStore.update({ ...picked.item, favorite: !picked.item.favorite });
      } else if (action?.action === "copy") {
        await vscode27.env.clipboard.writeText(picked.item.sql);
      } else if (action?.action === "delete") {
        await historyStore.delete(picked.item.id);
      }
    }
  });
  register("database.aiFixSql", () => runAi("fix"));
  register("database.aiExplainSql", () => runAi("explain"));
  register("database.visualExplainSql", () => runVisualExplain(false));
  register("database.visualExplainAnalyzeSql", () => runVisualExplain(true));
  async function executeFromEditor(mode, options = {}) {
    const editor = vscode27.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const selectedDetections = mode === "file" ? [] : selectedSqlDetections(editor);
    let detections;
    if (mode === "file") {
      detections = [{ sql: editor.document.getText(), range: new vscode27.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === "run") {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = selectedDetections.length > 0 ? selectedDetections : detected ? [detected] : [{ sql: editor.document.getText(), range: new vscode27.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === "selection" || selectedDetections.length > 0) {
      detections = selectedDetections;
    } else {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = detected ? [detected] : [];
    }
    if (!detections.some((detected) => detected.sql.trim())) {
      void vscode27.window.showInformationMessage("No SQL section to run.");
      return;
    }
    const forceNewResultTab = detections.length > 1;
    for (const detected of detections) {
      await executeDetected(editor, detected, { forceNewResultTab, maxRows: options.maxRows });
    }
  }
  async function compareResultTabs(sourceTab, resultSetIndex) {
    const sourceResultSet = sourceTab.resultSets[resultSetIndex] ?? sourceTab.resultSets[0];
    if (!sourceResultSet) {
      void vscode27.window.showInformationMessage("This result tab does not contain rows to compare.");
      return;
    }
    const candidates = results.getTabs().filter((tab) => tab.id !== sourceTab.id && tab.resultSets.length > 0);
    if (!candidates.length) {
      void vscode27.window.showInformationMessage("Open another result tab on the same connection to compare against.");
      return;
    }
    const picked = await vscode27.window.showQuickPick(candidates.map((tab) => ({
      label: tab.customTitle ?? tab.title,
      description: `${tab.executionStatus}${tab.executionTimeMs !== void 0 ? ` - ${tab.executionTimeMs}ms` : ""}`,
      detail: `${tab.databaseName ?? "database"} \u2022 ${tab.resultSets[0]?.rowCount ?? 0} rows`,
      tab
    })), {
      placeHolder: `Compare ${sourceTab.customTitle ?? sourceTab.title} against`
    });
    if (!picked) {
      return;
    }
    const targetResultSet = picked.tab.resultSets[resultSetIndex] ?? picked.tab.resultSets[0];
    if (!targetResultSet) {
      void vscode27.window.showInformationMessage("The selected comparison tab does not contain a matching result set.");
      return;
    }
    const report = compareResultSets(
      sourceResultSet,
      targetResultSet,
      sourceTab.customTitle ?? sourceTab.title,
      picked.tab.customTitle ?? picked.tab.title
    );
    const doc = await vscode27.workspace.openTextDocument({
      language: "markdown",
      content: formatResultSetDiffMarkdown(report)
    });
    await vscode27.window.showTextDocument(doc, { preview: true, viewColumn: vscode27.ViewColumn.Beside });
  }
  async function runVisualExplain(analyze) {
    const editor = vscode27.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") {
      void vscode27.window.showInformationMessage("Open a SQL editor before running Visual Explain.");
      return;
    }
    const resolved = resolveConnectionForDocument(editor.document);
    if (resolved.isBound && !resolved.connection) {
      void vscode27.window.showErrorMessage(`This SQL console is bound to a connection that no longer exists: ${resolved.boundConnectionId}`);
      return;
    }
    const connection = resolved.connection ?? await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    if (analyze) {
      const answer = await vscode27.window.showWarningMessage(
        "EXPLAIN ANALYZE executes the SQL to collect runtime timings.",
        { modal: true },
        "Run EXPLAIN ANALYZE"
      );
      if (answer !== "Run EXPLAIN ANALYZE") {
        return;
      }
    }
    if (!resolved.isBound) {
      await sqlDocumentConnections.set(editor.document.uri.toString(), connection.id);
      results.setActiveConnection(connection.id);
      updateSqlConnectionStatus(editor);
      sqlCodeLensRefresh.fire();
    }
    const detected = selectedSqlDetections(editor)[0] ?? sectionService.detectExecutable(editor.document, editor.selection);
    if (!detected?.sql.trim()) {
      void vscode27.window.showInformationMessage("No SQL section to explain.");
      return;
    }
    const sourceSql = detected.sql;
    const executableSql = await parameterPrompt.resolve(sourceSql);
    if (executableSql === void 0) {
      return;
    }
    const documentUri = editor.document.uri.toString();
    const sourceOrigin = executionOriginForDocument(documentUri, queryConsoleDocumentUris(consoleStore.getAll()));
    const sourceRange = rangeToPlain(detected.range);
    const runningTab = await results.addTab(createRunningResultTab(connection, executableSql, void 0, {
      origin: sourceOrigin,
      fileName: editor.document.fileName,
      documentUri,
      queryId: detected.id,
      sectionIndex: detected.index,
      range: sourceRange
    }), { forceNew: true });
    try {
      const plan = await vscode27.window.withProgress({
        location: vscode27.ProgressLocation.Notification,
        title: `${analyze ? "Running EXPLAIN ANALYZE" : "Running EXPLAIN"} for ${connection.name}`,
        cancellable: false
      }, () => queryPlanAnalyzer.explain(connection, executableSql, { analyze }));
      const tab = createPlanResultTab(connection, executableSql, plan, {
        origin: sourceOrigin,
        fileName: editor.document.fileName,
        documentUri,
        queryId: detected.id,
        sectionIndex: detected.index,
        range: sourceRange
      });
      await results.addTab({ ...tab, id: runningTab.id, pinned: runningTab.pinned, customTitle: runningTab.customTitle }, { replaceTabId: runningTab.id });
      await highlighter.reveal(documentUri, sourceRange, sourceSql);
      queryMap.updateResults(results.getTabs());
      refreshQueryMap();
    } catch (error) {
      const failed = {
        ...runningTab,
        executionStatus: "failed",
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - runningTab.executionStartedAt,
        error: {
          message: error instanceof Error ? error.message : String(error)
        },
        updatedAt: Date.now()
      };
      await results.addTab(failed, { replaceTabId: runningTab.id });
    }
  }
  async function executeActiveMultiStatementSelection(maxRows) {
    const editor = vscode27.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") {
      return false;
    }
    const selections = selectedSqlDetections(editor);
    if (!selections.some((selection) => splitSqlStatements(selection.sql).length > 1)) {
      return false;
    }
    await executeFromEditor("selection", { maxRows });
    return true;
  }
  function highlightActiveSqlSection(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      return;
    }
    const section = selectedSqlDetections(editor)[0] ?? sectionService.detectExecutable(editor.document, editor.selection);
    if (!section?.sql.trim()) {
      highlighter.clear(editor.document.uri.toString());
      return;
    }
    highlighter.highlight(editor, {
      startLine: section.range.start.line,
      startColumn: section.range.start.character,
      endLine: section.range.end.line,
      endColumn: section.range.end.character
    });
  }
  function selectedSqlDetections(editor) {
    return editor.selections.filter((selection) => !selection.isEmpty).map((selection) => trimSelection(editor.document, selection)).filter((range) => !range.isEmpty).sort(compareRanges).filter((range, index, ranges) => index === 0 || !range.isEqual(ranges[index - 1])).map((range) => ({
      sql: editor.document.getText(range),
      range
    }));
  }
  function updateSqlDiagnostics(document, selection) {
    if (!document || document.languageId !== "sql") {
      return;
    }
    const documentUri = document.uri.toString();
    const version = (diagnosticVersions.get(documentUri) ?? 0) + 1;
    diagnosticVersions.set(documentUri, version);
    const existingTimer = diagnosticTimers.get(documentUri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    sqlDiagnostics.set(document.uri, sectionService.getSyntaxIssues(document));
    const timer = setTimeout(() => {
      diagnosticTimers.delete(documentUri);
      const resolved = resolveConnectionForDocument(document);
      void diagnosticsService.getDiagnostics(document, selection, resolved.connection ?? null).then((diagnostics) => {
        if (diagnosticVersions.get(documentUri) === version) {
          sqlDiagnostics.set(document.uri, diagnostics);
        }
      });
    }, 450);
    diagnosticTimers.set(documentUri, timer);
  }
  async function showSqlMetadataStatus() {
    const editor = vscode27.window.activeTextEditor;
    const connection = editor?.document.languageId === "sql" ? connectionForDocument(editor.document) : connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode27.window.showInformationMessage("No database connection is selected for this SQL editor.");
      return;
    }
    const status2 = await schemaContext.metadataStatus(connection);
    const entry = status2.entry;
    const age = entry?.loadedAt ? formatAge(Date.now() - entry.loadedAt) : "never";
    const tableCount = entry ? entry.tables.length + entry.views.length : 0;
    const columnCount = entry ? Object.values(entry.columns).reduce((sum, columns) => sum + columns.length, 0) : 0;
    const problem = metadataProblem(status2);
    const cause = metadataCause(status2);
    const fix = metadataFix(status2);
    const content = [
      "# SQL Metadata Status",
      "",
      `Problem: ${problem}`,
      `Cause: ${cause}`,
      `Fix: ${fix}`,
      "",
      "## Details",
      "",
      `- Connection: ${connection.name} (${connection.id})`,
      `- Connected: ${status2.connected ? "yes" : "no"}`,
      `- Schema: ${status2.schemaName}`,
      `- Cache status: ${entry?.status ?? "empty"}`,
      `- Fresh enough for diagnostics: ${status2.freshForDiagnostics ? "yes" : "no"}`,
      `- Refresh running: ${status2.refreshRunning ? "yes" : "no"}`,
      `- Source: ${entry?.source ?? "none"}`,
      `- Age: ${age}`,
      `- Schemas cached: ${entry?.schemas.length ?? 0}`,
      `- Tables/views cached: ${tableCount}`,
      `- Columns cached: ${columnCount}`,
      `- Last error: ${entry?.errorMessage ?? "none"}`,
      `- Storage fallback: ${status2.storageError ? `in-memory only (${status2.storageError})` : "disk cache available"}`,
      ""
    ].join("\n");
    const doc = await vscode27.workspace.openTextDocument({ language: "markdown", content });
    await vscode27.window.showTextDocument(doc, { preview: true, viewColumn: vscode27.ViewColumn.Beside });
  }
  async function warmSqlMetadata(connection, surface) {
    try {
      await connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection);
    } catch (error) {
      void vscode27.window.showWarningMessage(`${surface} is bound to ${connection.name}, but metadata refresh could not connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function setSqlFileConnection(resource) {
    const document = await sqlDocumentFromArg(resource);
    if (!document) {
      void vscode27.window.showInformationMessage("Open a SQL file before selecting a database connection.");
      return;
    }
    const connection = await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(document.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    try {
      if (!connectionManager.isConnected(connection.id)) {
        await connectionManager.connect(connection.id);
      }
    } catch (error) {
      void vscode27.window.showWarningMessage(`SQL file is bound to ${connection.name}, but connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    schemaContext.invalidate(connection.id);
    schemaContext.refreshDefaultSchemaInBackground(connection);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode27.window.activeTextEditor);
    updateSqlDiagnostics(document, vscode27.window.activeTextEditor?.document.uri.toString() === document.uri.toString() ? vscode27.window.activeTextEditor.selection : void 0);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }
  async function sqlDocumentFromArg(resource) {
    const document = resource instanceof vscode27.Uri ? await vscode27.workspace.openTextDocument(resource) : vscode27.window.activeTextEditor?.document;
    if (!document) {
      return void 0;
    }
    const isSqlFile = document.languageId === "sql" || document.uri.fsPath.toLowerCase().endsWith(".sql");
    return isSqlFile ? document : void 0;
  }
  async function executeDetected(editor, detected, options = {}) {
    const resolved = resolveConnectionForDocument(editor.document);
    if (resolved.isBound && !resolved.connection) {
      void vscode27.window.showErrorMessage(`This SQL console is bound to a connection that no longer exists: ${resolved.boundConnectionId}`);
      return;
    }
    const connection = resolved.connection ?? await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    if (!resolved.isBound) {
      await sqlDocumentConnections.set(editor.document.uri.toString(), connection.id);
      results.setActiveConnection(connection.id);
      updateSqlConnectionStatus(editor);
      sqlCodeLensRefresh.fire();
    }
    const sourceSql = detected.sql;
    const executableSql = await parameterPrompt.resolve(sourceSql);
    if (executableSql === void 0) {
      return;
    }
    const decoration = vscode27.window.createTextEditorDecorationType({ backgroundColor: new vscode27.ThemeColor("editor.findMatchHighlightBackground") });
    editor.setDecorations(decoration, [detected.range]);
    let endDocumentExecution;
    let runningTabId;
    let elapsedTimer;
    try {
      const maxRows = options.maxRows ?? configuredDefaultMaxRows();
      const documentUri = editor.document.uri.toString();
      const sourceOrigin = executionOriginForDocument(documentUri, queryConsoleDocumentUris(consoleStore.getAll()));
      const executedRange = {
        startLine: detected.range.start.line,
        startColumn: detected.range.start.character,
        endLine: detected.range.end.line,
        endColumn: detected.range.end.character
      };
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      endDocumentExecution = beginDocumentExecution(documentUri);
      const statementCount = splitSqlStatements(executableSql).length || 1;
      const updateStatementStatus = createStatementStatusUpdater(editor, detected.range, sourceSql);
      const outputStartedAt = Date.now();
      queryOutput.recordExecutionStarted(connection, editor.document.fileName, statementCount, outputStartedAt);
      elapsedTimer = setInterval(() => {
        queryOutput.recordExecutionElapsed(connection, outputStartedAt);
      }, 5e3);
      const runningTab = await results.addTab(createRunningResultTab(connection, executableSql, maxRows, {
        origin: sourceOrigin,
        fileName: editor.document.fileName,
        documentUri,
        queryId: detected.id,
        sectionIndex: detected.index,
        range: executedRange
      }), { forceNew: options.forceNewResultTab });
      runningTabId = runningTab.id;
      const runningQuery = beginRunningQuery(runningTab, documentUri);
      queryMap.updateResults(results.getTabs());
      const tab = await executor.execute({
        connectionId: connection.id,
        sql: executableSql,
        isCancellationRequested: () => runningQuery.cancelRequested,
        onProgress: (progress) => {
          trackRunningProgress(runningQuery, progress);
          updateStatementStatus(progress);
          queryOutput.recordProgress(connection, progress);
        },
        maxRows,
        source: {
          origin: sourceOrigin,
          fileName: editor.document.fileName,
          documentUri,
          queryId: detected.id,
          sectionIndex: detected.index,
          range: {
            startLine: detected.range.start.line,
            startColumn: detected.range.start.character,
            endLine: detected.range.end.line,
            endColumn: detected.range.end.character
          }
        }
      });
      await results.addTab({ ...tab, id: runningTab.id, pinned: runningTab.pinned, customTitle: runningTab.customTitle }, { replaceTabId: runningTab.id });
      recordQueryOutput(tab);
      await highlighter.reveal(documentUri, rangeToPlain(detected.range), sourceSql);
      queryMap.updateResults(results.getTabs());
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
    } finally {
      if (runningTabId) {
        finishRunningQuery(runningTabId);
      }
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
      }
      endDocumentExecution?.();
      decoration.dispose();
    }
  }
  function createRunningResultTab(connection, sql, maxRows, source) {
    const now = Date.now();
    return {
      id: createId("tab"),
      title: resultTitle(sql, source.fileName),
      pinned: false,
      connectionId: connection.id,
      databaseType: connection.type,
      databaseName: connection.database,
      schemaName: connection.defaultSchema,
      queryText: sql,
      sourceOrigin: source.origin,
      sourceFile: source.fileName,
      sourceDocumentUri: source.documentUri,
      sourceQueryId: source.queryId,
      sourceSectionIndex: source.sectionIndex,
      sourceRange: source.range,
      executionStatus: "running",
      executionStartedAt: now,
      maxRows,
      resultSets: [],
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: now,
      updatedAt: now
    };
  }
  function createPlanResultTab(connection, sql, plan, source) {
    const now = Date.now();
    return {
      id: createId("tab"),
      title: `${plan.analyze ? "EXPLAIN ANALYZE" : "EXPLAIN"} ${resultTitle(sql, source.fileName)}`,
      pinned: false,
      connectionId: connection.id,
      databaseType: connection.type,
      databaseName: connection.database,
      schemaName: connection.defaultSchema,
      queryText: sql,
      sourceOrigin: source.origin,
      sourceFile: source.fileName,
      sourceDocumentUri: source.documentUri,
      sourceQueryId: source.queryId,
      sourceSectionIndex: source.sectionIndex,
      sourceRange: source.range,
      executionStatus: "completed",
      executionStartedAt: now,
      executionFinishedAt: now,
      executionTimeMs: plan.executionTimeMs,
      rowCount: plan.root ? 1 : void 0,
      resultSets: [],
      plan,
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: now,
      updatedAt: now
    };
  }
  function resultTitle(sql, fileName) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? "SQL";
    if (from) {
      return `${keyword} ${from.replace(/"/g, "")}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? "SQL";
  }
  async function runAi(action) {
    if (!await aiAdapter.isAvailable()) {
      void vscode27.window.showInformationMessage("AI SQL actions need a VS Code language model provider or configured database.ai.openAiCompatible settings.");
      return;
    }
    const editor = vscode27.window.activeTextEditor;
    const connection = editor ? connectionForDocument(editor.document) : void 0;
    if (!editor || !connection) {
      void vscode27.window.showInformationMessage("Open a SQL editor and select a connection first.");
      return;
    }
    const section = sectionService.detect(editor.document, editor.selection);
    const entry = await schemaContext.loadDefaultSchema(connection);
    const sql = await aiAdapter.send({
      action,
      selectedSql: section?.sql,
      relevantSchema: {
        connectionName: connection.name,
        databaseType: connection.type,
        databaseName: connection.database,
        defaultSchema: connection.defaultSchema,
        tables: [...entry.tables, ...entry.views].slice(0, 50).map((table) => ({
          schema: table.schema,
          name: table.name,
          type: table.type
        }))
      }
    });
    const doc = await vscode27.workspace.openTextDocument({ language: "sql", content: `${sql}
` });
    await vscode27.window.showTextDocument(doc, { preview: true, viewColumn: vscode27.ViewColumn.Beside });
  }
  async function openHistoryItem(item) {
    if (item.documentUri) {
      try {
        const doc2 = await vscode27.workspace.openTextDocument(vscode27.Uri.parse(item.documentUri));
        const editor2 = await vscode27.window.showTextDocument(doc2, { preview: false });
        const currentText = doc2.getText();
        if (item.sourceRange && currentText.includes(item.sql.trim())) {
          const range = rangeFromPlain2(item.sourceRange);
          editor2.selection = new vscode27.Selection(range.start, range.end);
          editor2.revealRange(range);
        } else {
          const fullRange = new vscode27.Range(doc2.positionAt(0), doc2.positionAt(currentText.length));
          await editor2.edit((edit) => edit.replace(fullRange, `${item.sql}
`));
        }
        results.setActiveConnection(item.connectionId);
        refreshQueryMap();
        return;
      } catch {
      }
    }
    const doc = await consoleStore.openOrCreate(connectionManager.getConnection(item.connectionId), `${item.sql}
`, { reuse: false });
    const editor = await vscode27.window.showTextDocument(doc, { preview: false });
    results.setActiveConnection(item.connectionId);
    refreshQueryMap();
  }
  async function revealSourceForTab(tab) {
    if (!tab.sourceDocumentUri || !tab.sourceRange) {
      return;
    }
    await highlighter.reveal(tab.sourceDocumentUri, tab.sourceRange, tab.queryText);
    const editor = vscode27.window.activeTextEditor;
    queryMap.updateFromEditor(editor?.document.uri.toString() === tab.sourceDocumentUri ? editor : void 0);
  }
}
function deactivate() {
}
function connectionIdFromArg(value) {
  const maybe = value;
  return maybe?.connection?.id ?? maybe?.id;
}
function databaseNodeFromArg(value) {
  if (value instanceof CatalogNode || value instanceof ColumnNode || value instanceof ConnectionNode || value instanceof FolderNode || value instanceof SchemaNode || value instanceof SchemasNode || value instanceof TableNode || value instanceof ViewNode) {
    return value;
  }
  return void 0;
}
function trimSelection(document, selection) {
  const text = document.getText(selection);
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const trailing = text.match(/\s*$/)?.[0].length ?? 0;
  const startOffset = document.offsetAt(selection.start) + leading;
  const endOffset = document.offsetAt(selection.end) - trailing;
  return new vscode27.Range(document.positionAt(startOffset), document.positionAt(Math.max(startOffset, endOffset)));
}
function compareRanges(a, b) {
  return a.start.compareTo(b.start) || a.end.compareTo(b.end);
}
function metadataProblem(status) {
  if (!status.entry) {
    return "No metadata snapshot is available for this connection and schema.";
  }
  if (status.entry.status === "ready") {
    return "Metadata is fresh enough for schema diagnostics and autocomplete.";
  }
  if (status.entry.status === "stale") {
    return "Metadata exists, but it is stale, so autocomplete may use it and diagnostics stay quiet.";
  }
  if (status.entry.status === "loading") {
    return "Metadata refresh is currently running.";
  }
  return "The last metadata refresh failed, so diagnostics stay quiet.";
}
function metadataCause(status) {
  if (!status.entry) {
    return status.connected ? "The cache has not finished warming yet." : "The connection is not active and no disk snapshot was found.";
  }
  if (status.entry.status === "ready") {
    return "The cache was loaded from disk or live database metadata within the freshness window.";
  }
  if (status.entry.status === "stale") {
    return "The last successful metadata load is older than the freshness window.";
  }
  if (status.entry.status === "loading") {
    return "The extension is refreshing schema metadata in the background.";
  }
  return status.entry.errorMessage ?? "The database driver could not refresh metadata.";
}
function metadataFix(status) {
  if (status.entry?.status === "ready") {
    return "No action needed.";
  }
  if (status.connected) {
    return "Wait for the background refresh or run Database: Refresh Database Explorer.";
  }
  return "Connect this database, then open a query console or run Database: Refresh Database Explorer.";
}
function formatAge(ageMs) {
  if (ageMs < 6e4) {
    return `${Math.max(0, Math.round(ageMs / 1e3))}s`;
  }
  if (ageMs < 60 * 6e4) {
    return `${Math.round(ageMs / 6e4)}m`;
  }
  return `${Math.round(ageMs / (60 * 6e4))}h`;
}
function registerSqlCompletions(connectionManager, schemaContext, sectionService, getConnectionForDocument, context) {
  const keywords = [
    "select",
    "from",
    "where",
    "join",
    "left join",
    "inner join",
    "group by",
    "order by",
    "limit",
    "with",
    "insert into",
    "update",
    "delete from",
    "create table",
    "alter table",
    "drop table",
    "case",
    "when",
    "then",
    "else",
    "end",
    "distinct",
    "having",
    "union all"
  ];
  return vscode27.languages.registerCompletionItemProvider("sql", {
    async provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position).text.slice(0, position.character);
      const items = keywords.map((keyword) => {
        const item = new vscode27.CompletionItem(keyword, vscode27.CompletionItemKind.Keyword);
        item.insertText = keyword;
        return item;
      });
      const connection = getConnectionForDocument(document);
      if (!connection) {
        return items;
      }
      try {
        const metadataItems = await getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connection, document, position, linePrefix);
        if (metadataItems.length > 0) {
          await showFirstSchemaCompletionMessage(context, connection);
        }
        items.push(...metadataItems);
      } catch {
        return items;
      }
      return items;
    }
  }, ".", " ", '"');
}
async function getMetadataCompletionItems(connectionManager, schemaContext, sectionService, config, document, position, linePrefix) {
  const defaultSchema = config.defaultSchema ?? "public";
  if (connectionManager.isConnected(config.id)) {
    schemaContext.refreshDefaultSchemaInBackground(config);
  }
  const section = sectionService.detect(document, new vscode27.Selection(position, position));
  const statementPrefix = section ? document.getText(new vscode27.Range(section.range.start, position)) : linePrefix;
  const relationContext = relationCompletionContext(linePrefix);
  if (relationContext?.schema) {
    const entry2 = await schemaContext.getCachedForConnection(config, defaultSchema);
    if (!entry2 || !["ready", "stale", "error"].includes(entry2.status)) {
      return [];
    }
    return relationCompletionCandidates(entry2, relationContext).slice(0, 300).map((relation) => {
      const item = new vscode27.CompletionItem(relation.name, vscode27.CompletionItemKind.Struct);
      item.detail = `${relation.schema}.${relation.name}`;
      item.insertText = relation.name;
      return item;
    });
  }
  const aliasTarget = linePrefix.match(/(?:"([^"]+)"|(\w+))\.$/);
  if (aliasTarget) {
    const alias = stripQuotes3(aliasTarget[1] ?? aliasTarget[2]);
    const target = section?.aliases.find((item) => item.alias === alias || item.table === alias);
    const schema = target?.schema ?? defaultSchema;
    const table = target?.table ?? alias;
    const columns = await schemaContext.getCachedColumns(config, schema, table);
    if (!columns) {
      return [];
    }
    return columns.slice(0, 300).map((column) => {
      const item = new vscode27.CompletionItem(column.name, vscode27.CompletionItemKind.Field);
      item.detail = column.dataType;
      item.insertText = column.name;
      return item;
    });
  }
  if (section && unqualifiedColumnCompletionContext(statementPrefix)) {
    return getSectionColumnCompletionItems(schemaContext, config, section.tables, defaultSchema);
  }
  const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
  if (!entry || !["ready", "stale", "error"].includes(entry.status)) {
    return [];
  }
  const items = [];
  for (const schema of entry.schemas.slice(0, 30)) {
    items.push(new vscode27.CompletionItem(schema.name, vscode27.CompletionItemKind.Module));
  }
  for (const table of [...entry.tables, ...entry.views].slice(0, 300)) {
    const tableItem = new vscode27.CompletionItem(table.name, vscode27.CompletionItemKind.Struct);
    tableItem.detail = `${table.schema}.${table.name}`;
    tableItem.insertText = table.name;
    items.push(tableItem);
  }
  return filterMetadataItems(items, linePrefix);
}
async function getSectionColumnCompletionItems(schemaContext, config, tables, defaultSchema) {
  const items = [];
  for (const table of tables.slice(0, 8)) {
    const columns = await schemaContext.getCachedColumns(config, table.schema ?? defaultSchema, table.table) ?? [];
    for (const column of columns) {
      if (items.some((item2) => item2.label === column.name)) {
        continue;
      }
      const item = new vscode27.CompletionItem(column.name, vscode27.CompletionItemKind.Field);
      item.detail = `${table.schema ?? defaultSchema}.${table.table} ${column.dataType}`;
      item.insertText = column.name;
      items.push(item);
    }
  }
  return items.slice(0, 300);
}
async function showFirstSchemaCompletionMessage(context, connection) {
  const key = `database.schemaCompletionReady.${connection.id}`;
  if (context.globalState.get(key)) {
    return;
  }
  await context.globalState.update(key, true);
  void vscode27.window.showInformationMessage(`Schema-backed SQL completions are ready for ${connection.name}.`);
}
function filterMetadataItems(items, linePrefix) {
  if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
    return items;
  }
  return items.filter((item) => item.kind === vscode27.CompletionItemKind.Keyword);
}
function registerSqlConnectionCodeLens(connectionLensTitle, sectionService, refreshEvent) {
  const emitter = new vscode27.EventEmitter();
  const documentEvents = vscode27.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "sql") {
      emitter.fire();
    }
  });
  const refreshEvents = refreshEvent?.(() => emitter.fire());
  const provider = vscode27.languages.registerCodeLensProvider("sql", {
    onDidChangeCodeLenses: emitter.event,
    provideCodeLenses(document) {
      const top = new vscode27.Range(0, 0, 0, 0);
      const lenses = [
        new vscode27.CodeLens(top, {
          title: connectionLensTitle(document),
          tooltip: "Select the database connection for this SQL file",
          command: "database.setSqlFileConnection",
          arguments: [document.uri]
        })
      ];
      for (const section of sectionService.getSections(document)) {
        if (!section.sql.trim()) {
          continue;
        }
        const range = new vscode27.Range(section.range.start, section.range.start);
        lenses.push(new vscode27.CodeLens(range, {
          title: "$(play) Execute SQL Section",
          tooltip: "Run this SQL section.",
          command: "database.executeStatementRange",
          arguments: [
            document.uri.toString(),
            section.range.start.line,
            section.range.start.character,
            section.range.end.line,
            section.range.end.character
          ]
        }));
      }
      return lenses;
    }
  });
  return refreshEvents ? vscode27.Disposable.from(documentEvents, refreshEvents, provider, emitter) : vscode27.Disposable.from(documentEvents, provider, emitter);
}
function stripQuotes3(value) {
  return value.replace(/^"|"$/g, "");
}
function rangeFromPlain2(range) {
  return rangeFromPlain(range);
}
function rangeToPlain(range) {
  return {
    startLine: range.start.line,
    startColumn: range.start.character,
    endLine: range.end.line,
    endColumn: range.end.character
  };
}
async function openSqlEditor(connectionManager, title, content = "", connection = connectionManager.getPreferredConnection()) {
  const uri = vscode27.Uri.parse(`untitled:${title}${connection ? ` - ${connection.name}` : ""}.sql`);
  const doc = await vscode27.workspace.openTextDocument(uri);
  const editor = await vscode27.window.showTextDocument(doc, {
    viewColumn: vscode27.ViewColumn.Active,
    preview: false
  });
  await vscode27.languages.setTextDocumentLanguage(doc, "sql");
  if (content && doc.getText().length === 0) {
    await editor.edit((edit) => edit.insert(new vscode27.Position(0, 0), content));
  }
  return doc;
}
function configuredDefaultMaxRows() {
  const maxRows = vscode27.workspace.getConfiguration("database").get("defaultMaxRows", 500);
  return Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
}
function objectName(node) {
  if (node instanceof ConnectionNode) {
    return node.connection.name;
  }
  if (node instanceof CatalogNode) {
    return node.connection.database;
  }
  if (node instanceof SchemaNode) {
    return node.schema.name;
  }
  if (node instanceof FolderNode) {
    return node.tableName ?? node.schema;
  }
  if (node instanceof TableNode) {
    return node.table.name;
  }
  if (node instanceof ViewNode) {
    return node.view.name;
  }
  if (node instanceof RoutineNode) {
    return node.routine.name;
  }
  if (node instanceof TriggerNode) {
    return node.trigger.name;
  }
  if (node instanceof ColumnNode) {
    return node.column.name;
  }
  return void 0;
}
function qualifiedObjectName(node) {
  if (node instanceof SchemaNode) {
    return logicalIdentifier(node.connection, node.schema.name);
  }
  if (node instanceof FolderNode && node.tableName) {
    return logicalQualifiedName(node.connection, node.schema, node.tableName);
  }
  if (node instanceof TableNode) {
    return logicalQualifiedName(node.connection, node.table.schema, node.table.name);
  }
  if (node instanceof ViewNode) {
    return logicalQualifiedName(node.connection, node.view.schema, node.view.name);
  }
  if (node instanceof RoutineNode) {
    return logicalQualifiedName(node.connection, node.routine.schema, node.routine.name);
  }
  if (node instanceof TriggerNode) {
    return `${logicalQualifiedName(node.connection, node.trigger.schema, node.trigger.table)}.${logicalIdentifier(node.connection, node.trigger.name)}`;
  }
  if (node instanceof ColumnNode) {
    return `${logicalQualifiedName(node.connection, node.column.schema, node.column.table)}.${logicalIdentifier(node.connection, node.column.name)}`;
  }
  if (node instanceof CatalogNode || node instanceof ConnectionNode) {
    return node.connection.database;
  }
  return objectName(node);
}
function logicalIdentifier(connection, identifier) {
  return connection.type === "redis" ? identifier : quoteSqlIdentifier(connection.type, identifier);
}
function logicalQualifiedName(connection, schema, name) {
  return connection.type === "redis" ? `${schema}.${name}` : qualifiedSqlName(connection.type, schema, name);
}
function tableLikeTarget(node) {
  if (node instanceof TableNode) {
    return { connection: node.connection, schema: node.table.schema, name: node.table.name, kind: "table" };
  }
  if (node instanceof ViewNode) {
    return { connection: node.connection, schema: node.view.schema, name: node.view.name, kind: "view" };
  }
  if (node instanceof FolderNode && node.tableName) {
    return { connection: node.connection, schema: node.schema, name: node.tableName, kind: "table" };
  }
  if (node instanceof ColumnNode) {
    return { connection: node.connection, schema: node.column.schema, name: node.column.table, kind: "table" };
  }
  return void 0;
}
async function pickDestinationConnection(connectionManager, sourceConnectionId) {
  const connections = connectionManager.getConnections().filter((connection) => connection.id !== sourceConnectionId);
  if (!connections.length) {
    void vscode27.window.showInformationMessage("Add another database connection before copying a table.");
    return void 0;
  }
  const picked = await vscode27.window.showQuickPick(connections.map((connection) => ({
    label: connection.name,
    description: `${connection.type}${connection.production ? " - prod" : ""}`,
    detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
    connection
  })), { placeHolder: "Copy table to which connection?" });
  return picked?.connection;
}
function maintenanceScriptFromStats(stats) {
  if (stats.databaseType !== "redshift") {
    return void 0;
  }
  const flags = buildTablePerformancePrepassFlags(stats, emptyWorkload()).filter((flag) => flag.kind === "redshift_unsorted_rows" || flag.kind === "redshift_stale_stats");
  if (!flags.length) {
    return void 0;
  }
  const statements = [];
  const table = qualifiedName(stats.schema, stats.table);
  if (flags.some((flag) => flag.kind === "redshift_unsorted_rows")) {
    statements.push(`vacuum sort only ${table};`);
  }
  if (flags.some((flag) => flag.kind === "redshift_stale_stats")) {
    statements.push(`analyze ${table};`);
  }
  return statements.join("\n");
}
function emptyWorkload() {
  return {
    connectionId: "",
    table: "",
    queryCount: 0,
    totalRunCount: 0,
    totalDurationMs: 0,
    topQueries: [],
    columns: []
  };
}
function canGenerateSqlScript(connection, feature) {
  if (connection.type !== "redis") {
    return true;
  }
  void vscode27.window.showWarningMessage(`${feature} is not available for Redis connections because Redis uses commands instead of SQL scripts.`);
  return false;
}
async function objectDdl(connectionManager, node) {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    return connectionManager.getDriver(node.connection.type).getTableDDL(node.connection.id, node.table.schema, node.table.name);
  }
  if (node instanceof SchemaNode) {
    return createSchemaSql(node.connection.type, node.schema.name, { ifNotExists: true });
  }
  return void 0;
}
function schemaFromNode(node) {
  if (node instanceof SchemaNode) {
    return { schema: node.schema.name, connection: node.connection };
  }
  if (node instanceof FolderNode) {
    return { schema: node.schema, connection: node.connection };
  }
  if (node instanceof TableNode) {
    return { schema: node.table.schema, connection: node.connection };
  }
  if (node instanceof ViewNode) {
    return { schema: node.view.schema, connection: node.connection };
  }
  if (node instanceof ColumnNode) {
    return { schema: node.column.schema, connection: node.connection };
  }
  if (node instanceof RoutineNode) {
    return { schema: node.routine.schema, connection: node.connection };
  }
  if (node instanceof TriggerNode) {
    return { schema: node.trigger.schema, connection: node.connection };
  }
  const connection = node instanceof ConnectionNode || node instanceof CatalogNode ? node.connection : void 0;
  return { schema: connection?.defaultSchema ?? "public", connection };
}
function schemaLikeTarget(node) {
  if (node instanceof SchemaNode) {
    return { connection: node.connection, schema: node.schema.name };
  }
  if (node instanceof FolderNode) {
    return { connection: node.connection, schema: node.schema };
  }
  if (node instanceof TableNode) {
    return { connection: node.connection, schema: node.table.schema };
  }
  if (node instanceof ViewNode) {
    return { connection: node.connection, schema: node.view.schema };
  }
  if (node instanceof ColumnNode) {
    return { connection: node.connection, schema: node.column.schema };
  }
  if (node instanceof RoutineNode) {
    return { connection: node.connection, schema: node.routine.schema };
  }
  if (node instanceof TriggerNode) {
    return { connection: node.connection, schema: node.trigger.schema };
  }
  if (node instanceof ConnectionNode || node instanceof CatalogNode) {
    return { connection: node.connection, schema: node.connection.defaultSchema ?? "public" };
  }
  return void 0;
}
function snapshotFromSchemaEntry(entry) {
  return {
    schemaName: entry.schemaName,
    tables: entry.tables,
    views: entry.views,
    columns: entry.columns
  };
}
function newObjectTemplate(node, type) {
  const { schema, connection } = schemaFromNode(node);
  if (!connection) {
    return "";
  }
  const table = tableLikeTarget(node);
  return newObjectSql(connection.type, type, schema, table ? { schema: table.schema, name: table.name } : void 0);
}
function renameTemplate(node) {
  if (node instanceof TableNode) {
    return renameObjectSql(node.connection.type, { kind: "table", schema: node.table.schema, name: node.table.name });
  }
  if (node instanceof ViewNode) {
    return renameObjectSql(node.connection.type, { kind: "view", schema: node.view.schema, name: node.view.name });
  }
  if (node instanceof SchemaNode) {
    return renameObjectSql(node.connection.type, { kind: "schema", schema: node.schema.name, name: node.schema.name });
  }
  if (node instanceof ColumnNode) {
    return renameObjectSql(node.connection.type, { kind: "column", schema: node.column.schema, name: node.column.table, column: node.column.name });
  }
  return void 0;
}
function dropTemplate(node) {
  if (node instanceof TableNode) {
    return dropObjectSql(node.connection.type, { kind: "table", schema: node.table.schema, name: node.table.name });
  }
  if (node instanceof ViewNode) {
    return dropObjectSql(node.connection.type, { kind: "view", schema: node.view.schema, name: node.view.name });
  }
  if (node instanceof SchemaNode) {
    return dropObjectSql(node.connection.type, { kind: "schema", schema: node.schema.name, name: node.schema.name });
  }
  if (node instanceof ColumnNode) {
    return dropObjectSql(node.connection.type, { kind: "column", schema: node.column.schema, name: node.column.table, column: node.column.name });
  }
  return void 0;
}
async function quickDocumentation(connectionManager, node) {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    const columns = await connectionManager.getDriver(node.connection.type).getColumns(node.connection.id, node.table.schema, node.table.name);
    return `${qualifiedName(node.table.schema, node.table.name)}
${columns.map((column) => `${column.name} ${column.dataType}${column.nullable ? "" : " not null"}`).join("\n")}`;
  }
  if (node instanceof ColumnNode) {
    return `${qualifiedName(node.column.schema, node.column.table)}.${quoteIdentifier(node.column.name)}
${node.column.dataType}${node.column.nullable ? "" : " not null"}`;
  }
  if (node instanceof RoutineNode) {
    return [
      `${qualifiedName(node.routine.schema, node.routine.name)}`,
      node.routine.kind === "procedure" ? "Procedure" : "Function",
      node.routine.returnType ? `Returns: ${node.routine.returnType}` : void 0,
      node.routine.language ? `Language: ${node.routine.language}` : void 0,
      node.routine.comment
    ].filter(Boolean).join("\n");
  }
  if (node instanceof TriggerNode) {
    return [
      `${qualifiedName(node.trigger.schema, node.trigger.table)}.${quoteIdentifier(node.trigger.name)}`,
      node.trigger.timing ? `Timing: ${node.trigger.timing}` : void 0,
      node.trigger.orientation ? `Orientation: ${node.trigger.orientation}` : void 0,
      node.trigger.events?.length ? `Events: ${node.trigger.events.join(", ")}` : void 0,
      node.trigger.enabled ? `Enabled: ${node.trigger.enabled}` : void 0
    ].filter(Boolean).join("\n");
  }
  return qualifiedObjectName(node);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
