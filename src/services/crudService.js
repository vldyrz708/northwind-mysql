import tableConfig from '../data/tableConfig.js';
import { execute, executeRaw } from '../config/db.js';
import {
  getDefinition,
  buildInsert,
  buildUpdate,
  buildDelete,
  buildPkClause,
  buildListQuery
} from '../utils/sqlBuilder.js';

const getFileColumns = (def) => [
  ...(def.primaryKey || []).filter((pk) => pk.type === 'file'),
  ...((def.columns || []).filter((col) => col.type === 'file') || [])
];

const rowToClient = (def, row) => {
  if (!row) {
    return null;
  }
  const fileColumns = getFileColumns(def);
  if (!fileColumns.length) {
    return row;
  }
  const normalized = { ...row };
  fileColumns.forEach((col) => {
    const value = row[col.column];
    if (value && Buffer.isBuffer(value)) {
      normalized[col.column] = value.toString('base64');
    }
  });
  return normalized;
};

export const getMetadata = () => tableConfig;

export const listRecords = async (tableKey, options = {}) => {
  const def = getDefinition(tableKey);
  const { sql, params, whereClause, filterParams } = buildListQuery(def, options);
  const rawRows = await execute(sql, params);
  const data = rawRows.map((row) => rowToClient(def, row));
  const countSql = `SELECT COUNT(*) AS total FROM ${def.table}${whereClause}`;
  const [countRow] = await execute(countSql, filterParams);
  return {
    data,
    page: Number(options.page) || 1,
    pageSize: Number(options.pageSize) || 25,
    total: countRow?.total ?? data.length
  };
};

export const getRecord = async (tableKey, pkPayload = {}) => {
  const def = getDefinition(tableKey);
  const { where, params } = buildPkClause(def, pkPayload);
  const columns = [
    ...def.primaryKey.map((pk) => pk.column),
    ...(def.columns || []).map((col) => col.column)
  ];
  const sql = `SELECT ${columns.join(', ')} FROM ${def.table} WHERE ${where} LIMIT 1`;
  const rows = await execute(sql, params);
  return rowToClient(def, rows[0] || null);
};

export const createRecord = async (tableKey, payload = {}) => {
  const def = getDefinition(tableKey);
  const { sql, params } = buildInsert(def, payload);
  const [result] = await executeRaw(sql, params);
  const pkPayload = {};
  const autoPk = def.primaryKey.find((pk) => pk.auto);
  if (autoPk) {
    pkPayload[autoPk.column] = result.insertId;
  }
  def.primaryKey.forEach((pk) => {
    if (!pk.auto && payload[pk.column] !== undefined) {
      pkPayload[pk.column] = payload[pk.column];
    }
  });
  return getRecord(tableKey, pkPayload);
};

export const updateRecord = async (tableKey, payload = {}) => {
  const def = getDefinition(tableKey);
  const { sql, params } = buildUpdate(def, payload);
  await execute(sql, params);
  const pkPayload = {};
  def.primaryKey.forEach((pk) => {
    pkPayload[pk.column] = payload[pk.column];
  });
  return getRecord(tableKey, pkPayload);
};

export const deleteRecord = async (tableKey, payload = {}) => {
  const def = getDefinition(tableKey);
  const { sql, params } = buildDelete(def, payload);
  await execute(sql, params);
  return { success: true };
};

export const getForeignOptions = async (tableKey) => {
  const def = getDefinition(tableKey);
  const fkMap = {};
  const fkDefs = [
    ...((def.columns || []).filter((col) => col.foreignKey) || []),
    ...Object.entries(def.foreignKeyDefaults || {}).map(([column, meta]) => ({
      column,
      foreignKey: meta
    }))
  ];
  for (const descriptor of fkDefs) {
    const { foreignKey } = descriptor;
    if (!foreignKey?.tableKey) {
      continue;
    }
    const targetDef = getDefinition(foreignKey.tableKey);
    const valueColumn = foreignKey.value || targetDef.primaryKey[0].column;
    const labelColumn = foreignKey.label || valueColumn;
    const sql = `SELECT ${valueColumn} AS value, ${labelColumn} AS label FROM ${targetDef.table} ORDER BY ${labelColumn} LIMIT 200`;
    fkMap[descriptor.column] = await execute(sql);
  }
  return fkMap;
};
