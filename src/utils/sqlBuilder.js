import tableConfig from '../data/tableConfig.js';

export const getDefinition = (tableKey) => {
  const def = tableConfig[tableKey];
  if (!def) {
    throw new Error(`Tabla desconocida: ${tableKey}`);
  }
  return def;
};

export const pickWritableColumns = (def, payload = {}) => {
  const pkNames = def.primaryKey.map((pk) => pk.column);
  return [
    ...def.primaryKey.map((pk) => ({ ...pk, isPrimary: true })),
    ...(def.columns || []).map((col) => ({ ...col, isPrimary: false }))
  ]
    .filter((col) => payload[col.column] !== undefined || col.isPrimary)
    .map((col) => ({ ...col, isPrimary: pkNames.includes(col.column) }));
};

const normalizeValue = (descriptor, value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (descriptor.type === 'number') {
    return Number(value);
  }
  if (descriptor.type === 'boolean') {
    return value === true || value === '1' || value === 1 ? 1 : 0;
  }
  if (descriptor.type === 'date') {
    return value;
  }
  if (descriptor.type === 'file') {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return Buffer.from(value);
    }
    if (typeof value === 'string') {
      const base64 = value.includes(',') ? value.split(',').pop() : value;
      return base64 ? Buffer.from(base64, 'base64') : null;
    }
    return null;
  }
  return value;
};

export const buildInsert = (def, payload) => {
  const allowed = (def.columns || [])
    .filter((col) => !col.auto)
    .filter((col) => payload[col.column] !== undefined);
  const pkToInsert = def.primaryKey.filter((pk) => !pk.auto && payload[pk.column] !== undefined);
  const columns = [...pkToInsert, ...allowed];
  if (!columns.length) {
    throw new Error('No hay campos para insertar.');
  }
  const params = {};
  const columnNames = columns.map((col) => {
    params[col.column] = normalizeValue(col, payload[col.column]);
    return col.column;
  });
  const placeholders = columnNames.map((col) => `:${col}`);
  const sql = `INSERT INTO ${def.table} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
  return { sql, params };
};

export const buildUpdate = (def, payload) => {
  const pkClause = buildPkClause(def, payload);
  const editable = (def.columns || [])
    .filter((col) => payload[col.column] !== undefined)
    .map((col) => ({ ...col, value: normalizeValue(col, payload[col.column]) }));
  if (!editable.length) {
    throw new Error('No hay campos para actualizar.');
  }
  const setSegments = editable.map((col, idx) => {
    const name = `${col.column}_${idx}`;
    col.param = name;
    return `${col.column} = :${name}`;
  });
  const params = editable.reduce((acc, col) => ({
    ...acc,
    [col.param]: col.value
  }), { ...pkClause.params });
  const sql = `UPDATE ${def.table} SET ${setSegments.join(', ')} WHERE ${pkClause.where}`;
  return { sql, params };
};

export const buildDelete = (def, payload) => {
  const pkClause = buildPkClause(def, payload);
  const sql = `DELETE FROM ${def.table} WHERE ${pkClause.where}`;
  return { sql, params: pkClause.params };
};

export const buildPkClause = (def, payload) => {
  const missing = def.primaryKey.filter((pk) => payload[pk.column] === undefined);
  if (missing.length) {
    throw new Error(`Faltan campos de llave primaria: ${missing.map((m) => m.column).join(', ')}`);
  }
  const whereParts = def.primaryKey.map((pk, idx) => {
    const name = `pk_${pk.column}_${idx}`;
    return {
      where: `${pk.column} = :${name}`,
      param: { [name]: normalizeValue(pk, payload[pk.column]) }
    };
  });
  const where = whereParts.map((item) => item.where).join(' AND ');
  const params = whereParts.reduce((acc, part) => ({ ...acc, ...part.param }), {});
  return { where, params };
};

export const buildListQuery = (def, { page = 1, pageSize = 25, search } = {}) => {
  // File/BLOB columns are excluded from list queries for performance.
  // They are replaced with a boolean existence flag (1 or 0).
  const columns = [
    ...def.primaryKey.map((pk) => pk.column),
    ...(def.columns || []).map((col) => {
      if (col.type === 'file') {
        return `IF(\`${col.column}\` IS NOT NULL AND LENGTH(\`${col.column}\`) > 0, 1, 0) AS \`${col.column}\``;
      }
      return col.column;
    })
  ];
  const select = `SELECT ${columns.join(', ')} FROM ${def.table}`;
  const baseParams = {};
  let where = '';
  if (search) {
    const likeable = (def.columns || []).filter((col) => col.type === 'string' || col.type === 'text');
    if (likeable.length) {
      const clauses = likeable.map((col, idx) => {
        const key = `search_${idx}`;
        baseParams[key] = `%${search}%`;
        return `${col.column} LIKE :${key}`;
      });
      where = ` WHERE ${clauses.join(' OR ')}`;
    }
  }
  const limit = Number(pageSize) || 25;
  const offset = ((Number(page) || 1) - 1) * limit;
  const params = { ...baseParams, limit, offset };
  const sql = `${select}${where} LIMIT :limit OFFSET :offset`;
  return { sql, params, whereClause: where, filterParams: baseParams };
};
