import tableConfig from '../data/tableConfig.js';
import { execute, executeRaw } from '../config/db.js';
import { getDb } from '../config/firebase.js';
import { syncUpsert, syncDelete } from './firebaseSync.js';
import {
  getDefinition,
  buildInsert,
  buildUpdate,
  buildDelete,
  buildPkClause,
  buildListQuery
} from '../utils/sqlBuilder.js';

const FIREBASE_READ_VALUES = new Set(['true', '1', 'firebase', 'firebase-only']);

export const getFirebaseDataMode = () => {
  const value = String(process.env.USE_FIREBASE_DATA || '').toLowerCase();
  return {
    useFirebase: FIREBASE_READ_VALUES.has(value),
    firebaseOnly: value === 'firebase-only'
  };
};

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

let firebaseReadDb = null;
let firebaseInitAttempted = false;

export const getFirebaseReadDb = () => {
  const { useFirebase } = getFirebaseDataMode();
  if (!useFirebase) {
    return null;
  }
  if (firebaseReadDb) {
    return firebaseReadDb;
  }
  if (firebaseInitAttempted && !firebaseReadDb) {
    return null;
  }
  firebaseInitAttempted = true;
  firebaseReadDb = getDb();
  if (!firebaseReadDb) {
    console.warn('[Firebase] USE_FIREBASE_DATA está activado, pero Firebase no está disponible. Se usará MySQL para las lecturas.');
  }
  return firebaseReadDb;
};

const applySearchFilter = (rows, search) => {
  if (!search) {
    return rows;
  }
  const term = String(search).trim().toLowerCase();
  if (!term) {
    return rows;
  }
  return rows.filter((row) => Object.values(row || {}).some((value) => {
    if (value === null || value === undefined) {
      return false;
    }
    return String(value).toLowerCase().includes(term);
  }));
};

const paginateRows = (rows, page, pageSize) => {
  const limit = Math.max(1, Number(pageSize) || 25);
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    currentPage,
    limit
  };
};

const buildFirebaseDocId = (def, payload) => {
  const pkColumns = (def.primaryKey || []).map((pk) => pk.column).filter(Boolean);
  if (!pkColumns.length) {
    const firstKey = Object.keys(payload || {})[0];
    if (!firstKey) {
      throw new Error(`La tabla ${def.table} no tiene una llave primaria configurada para construir el ID de Firebase.`);
    }
    return String(payload[firstKey]);
  }
  const parts = pkColumns.map((column) => {
    if (payload[column] === undefined || payload[column] === null) {
      throw new Error(`Falta el campo primario "${column}" para construir el ID de Firebase de ${def.table}.`);
    }
    return payload[column];
  });
  return parts.join('_');
};

const fetchFirebaseCollection = async (db, def) => {
  const snapshot = await db.collection(def.table).get();
  return snapshot.docs.map((doc) => doc.data());
};

const getFirebaseRecord = async (db, def, pkPayload) => {
  const docId = buildFirebaseDocId(def, pkPayload);
  const snap = await db.collection(def.table).doc(String(docId)).get();
  if (!snap.exists) {
    return null;
  }
  return snap.data();
};

export const ensureFirebaseDb = () => {
  const db = getFirebaseReadDb();
  if (!db) {
    throw Object.assign(new Error('Firebase no está configurado.'), { status: 500 });
  }
  return db;
};

const autoPkCache = new Map();

const sanitizePayload = (obj = {}) => Object.fromEntries(
  Object.entries(obj).filter(([, value]) => value !== undefined)
);

const getNextAutoValue = async (db, def, column) => {
  const cacheKey = `${def.table}:${column}`;
  if (!autoPkCache.has(cacheKey)) {
    const snapshot = await db.collection(def.table)
      .orderBy(column, 'desc')
      .limit(1)
      .get()
      .catch((err) => {
        console.warn(`[Firebase] No se pudo ordenar ${def.table} por ${column}:`, err.message);
        return null;
      });
    const current = !snapshot || snapshot.empty
      ? 0
      : Number(snapshot.docs[0].get(column) ?? 0);
    autoPkCache.set(cacheKey, current);
  }
  const next = Number(autoPkCache.get(cacheKey) ?? 0) + 1;
  autoPkCache.set(cacheKey, next);
  return next;
};

const ensurePkValues = async (def, payload, db) => {
  const pkPayload = {};
  for (const pk of def.primaryKey) {
    if (payload[pk.column] !== undefined && payload[pk.column] !== null && payload[pk.column] !== '') {
      pkPayload[pk.column] = payload[pk.column];
      continue;
    }
    if (!pk.auto) {
      throw Object.assign(new Error(`El campo ${pk.column} es requerido.`), { status: 400 });
    }
    pkPayload[pk.column] = await getNextAutoValue(db, def, pk.column);
  }
  return pkPayload;
};

const extractPkPayload = (def, payload) => {
  const pkPayload = {};
  for (const pk of def.primaryKey) {
    if (payload[pk.column] === undefined || payload[pk.column] === null) {
      throw Object.assign(new Error(`El campo ${pk.column} es requerido.`), { status: 400 });
    }
    pkPayload[pk.column] = payload[pk.column];
  }
  return pkPayload;
};

const createFirebaseRecord = async (def, payload) => {
  const db = ensureFirebaseDb();
  const pkPayload = await ensurePkValues(def, payload, db);
  const record = sanitizePayload({ ...payload, ...pkPayload });
  const docId = buildFirebaseDocId(def, record);
  await db.collection(def.table).doc(String(docId)).set(record, { merge: false });
  return rowToClient(def, record);
};

const updateFirebaseRecord = async (def, payload) => {
  const db = ensureFirebaseDb();
  const pkPayload = extractPkPayload(def, payload);
  const docId = buildFirebaseDocId(def, pkPayload);
  const ref = db.collection(def.table).doc(String(docId));
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
  }
  const updateData = sanitizePayload(payload);
  await ref.set(updateData, { merge: true });
  const updated = await ref.get();
  return rowToClient(def, updated.data());
};

const deleteFirebaseRecord = async (def, payload) => {
  const db = ensureFirebaseDb();
  const pkPayload = extractPkPayload(def, payload);
  const docId = buildFirebaseDocId(def, pkPayload);
  await db.collection(def.table).doc(String(docId)).delete();
  return { success: true };
};

export const getMetadata = () => tableConfig;

export const listRecords = async (tableKey, options = {}) => {
  const def = getDefinition(tableKey);
  const firebaseDb = getFirebaseReadDb();
  if (firebaseDb) {
    const rows = await fetchFirebaseCollection(firebaseDb, def);
    const normalized = rows.map((row) => rowToClient(def, row));
    const filtered = applySearchFilter(normalized, options.search);
    const { data, currentPage, limit } = paginateRows(filtered, options.page, options.pageSize);
    return {
      data,
      page: currentPage,
      pageSize: limit,
      total: filtered.length
    };
  }
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
  const firebaseDb = getFirebaseReadDb();
  if (firebaseDb) {
    const firebaseRecord = await getFirebaseRecord(firebaseDb, def, pkPayload);
    return rowToClient(def, firebaseRecord || null);
  }
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
  if (getFirebaseDataMode().firebaseOnly) {
    return createFirebaseRecord(def, payload);
  }
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
  const record = await getRecord(tableKey, pkPayload);
  syncUpsert(tableKey, def.table, pkPayload, record);
  return record;
};

export const updateRecord = async (tableKey, payload = {}) => {
  const def = getDefinition(tableKey);
  if (getFirebaseDataMode().firebaseOnly) {
    return updateFirebaseRecord(def, payload);
  }
  const { sql, params } = buildUpdate(def, payload);
  await execute(sql, params);
  const pkPayload = {};
  def.primaryKey.forEach((pk) => {
    pkPayload[pk.column] = payload[pk.column];
  });
  const record = await getRecord(tableKey, pkPayload);
  syncUpsert(tableKey, def.table, pkPayload, record);
  return record;
};

export const deleteRecord = async (tableKey, payload = {}) => {
  const def = getDefinition(tableKey);
  if (getFirebaseDataMode().firebaseOnly) {
    return deleteFirebaseRecord(def, payload);
  }
  const { sql, params } = buildDelete(def, payload);
  await execute(sql, params);
  const pkPayload = {};
  def.primaryKey.forEach((pk) => {
    pkPayload[pk.column] = payload[pk.column];
  });
  syncDelete(def.table, pkPayload);
  return { success: true };
};

export const getImageBlob = async (tableKey, columnName, pkPayload = {}) => {
  if (getFirebaseDataMode().firebaseOnly) {
    return null;
  }
  const def = getDefinition(tableKey);
  const allCols = [...(def.primaryKey || []), ...(def.columns || [])];
  const col = allCols.find((c) => c.column === columnName && c.type === 'file');
  if (!col) { return null; }
  const { where, params } = buildPkClause(def, pkPayload);
  const sql = `SELECT \`${columnName}\` FROM \`${def.table}\` WHERE ${where} LIMIT 1`;
  const rows = await execute(sql, params);
  const value = rows[0]?.[columnName];
  if (!value) { return null; }
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
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
  const firebaseDb = getFirebaseReadDb();
  if (firebaseDb) {
    for (const descriptor of fkDefs) {
      const { foreignKey } = descriptor;
      if (!foreignKey?.tableKey) {
        continue;
      }
      const targetDef = getDefinition(foreignKey.tableKey);
      const valueColumn = foreignKey.value || targetDef.primaryKey[0].column;
      const labelColumn = foreignKey.label || valueColumn;
      const rows = await fetchFirebaseCollection(firebaseDb, targetDef);
      fkMap[descriptor.column] = rows
        .map((row) => ({
          value: row[valueColumn],
          label: row[labelColumn] ?? row[valueColumn]
        }))
        .filter((option) => option.value !== undefined && option.value !== null)
        .sort((a, b) => String(a.label ?? a.value).localeCompare(String(b.label ?? b.value)))
        .slice(0, 200);
    }
    return fkMap;
  }
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
