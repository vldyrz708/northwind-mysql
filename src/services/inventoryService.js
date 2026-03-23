import { execute, pool } from '../config/db.js';
import { syncUpsert } from './firebaseSync.js';
import {
  getFirebaseDataMode,
  ensureFirebaseDb,
  getRecord,
  createRecord
} from './crudService.js';
import { adjustProductStock } from './firebaseStockService.js';

const paginateArray = (rows, page = 1, pageSize = 25) => {
  const limit = Math.max(1, Number(pageSize) || 25);
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    page: currentPage,
    pageSize: limit,
    total: rows.length
  };
};

const normalizeTerm = (value) => {
  const term = String(value ?? '').trim().toLowerCase();
  return term || null;
};

const filterStockRows = (rows, search) => {
  const term = normalizeTerm(search);
  if (!term) {
    return rows;
  }
  return rows.filter((row) =>
    [row.ProductName, row.CategoryName, row.SupplierName]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(term))
  );
};

const formatEmployeeName = (employee) => {
  if (!employee) {
    return null;
  }
  const name = `${employee.FirstName || ''} ${employee.LastName || ''}`.trim();
  return name || null;
};

const loadCollectionMap = async (db, collection, keyField) => {
  const snapshot = await db.collection(collection).get();
  const map = new Map();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const key = data[keyField] ?? Number(doc.id) ?? doc.id;
    if (key !== undefined && key !== null) {
      map.set(Number.isNaN(Number(key)) ? key : Number(key), data);
    }
  });
  return map;
};

const getFirebaseDbOrThrow = () => ensureFirebaseDb();
const isFirebaseOnly = () => getFirebaseDataMode().firebaseOnly;

const getStockFromFirebase = async ({ page = 1, pageSize = 25, search } = {}) => {
  const db = getFirebaseDbOrThrow();
  const [productsSnap, categoriesMap, suppliersMap] = await Promise.all([
    db.collection('products').get(),
    loadCollectionMap(db, 'categories', 'CategoryID'),
    loadCollectionMap(db, 'suppliers', 'SupplierID')
  ]);
  const rows = productsSnap.docs.map((doc) => {
    const data = doc.data();
    const category = data.CategoryID ? categoriesMap.get(Number(data.CategoryID)) : null;
    const supplier = data.SupplierID ? suppliersMap.get(Number(data.SupplierID)) : null;
    return {
      ProductID: Number(data.ProductID ?? doc.id),
      ProductName: data.ProductName || null,
      UnitsInStock: Number(data.UnitsInStock ?? 0),
      UnitsOnOrder: Number(data.UnitsOnOrder ?? 0),
      ReorderLevel: Number(data.ReorderLevel ?? 0),
      UnitPrice: data.UnitPrice != null ? Number(data.UnitPrice) : null,
      Discontinued: Boolean(data.Discontinued),
      CategoryName: category?.CategoryName || null,
      SupplierName: supplier?.CompanyName || null
    };
  });
  const filtered = filterStockRows(rows, search)
    .sort((a, b) => String(a.ProductName || '').localeCompare(String(b.ProductName || '')));
  return paginateArray(filtered, page, pageSize);
};

const getStockFromMySql = async ({ page = 1, pageSize = 25, search } = {}) => {
  const limit  = Math.max(1, Number(pageSize) || 25);
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const params = { limit, offset };
  let where = '';
  if (search) {
    where = ' WHERE (p.ProductName LIKE :search OR c.CategoryName LIKE :search2)';
    params.search  = `%${search}%`;
    params.search2 = `%${search}%`;
  }
  const sql = `
    SELECT p.ProductID, p.ProductName, p.UnitsInStock, p.UnitsOnOrder, p.ReorderLevel,
           p.UnitPrice, p.Discontinued, c.CategoryName, s.CompanyName AS SupplierName
    FROM products p
    LEFT JOIN categories c ON p.CategoryID = c.CategoryID
    LEFT JOIN suppliers  s ON p.SupplierID = s.SupplierID
    ${where}
    ORDER BY p.ProductName
    LIMIT :limit OFFSET :offset`;
  const countSql = `
    SELECT COUNT(*) AS total FROM products p
    LEFT JOIN categories c ON p.CategoryID = c.CategoryID
    ${where}`;
  const [countRow] = await execute(countSql, params);
  const data = await execute(sql, params);
  return { data, page: Number(page) || 1, pageSize: limit, total: countRow?.total ?? 0 };
};

export const getStock = async (options = {}) => (
  isFirebaseOnly() ? getStockFromFirebase(options) : getStockFromMySql(options)
);

const listMovementsFromFirebase = async ({ page = 1, pageSize = 25 } = {}) => {
  const db = getFirebaseDbOrThrow();
  const [movementsSnap, productsMap, employeesMap] = await Promise.all([
    db.collection('stock_movements').get(),
    loadCollectionMap(db, 'products', 'ProductID'),
    loadCollectionMap(db, 'employees', 'EmployeeID')
  ]);
  const rows = movementsSnap.docs
    .map((doc) => doc.data())
    .sort((a, b) => new Date(b.CreatedAt || b.createdAt || 0) - new Date(a.CreatedAt || a.createdAt || 0))
    .map((movement) => ({
      ...movement,
      PID: movement.ProductID ?? null,
      ProductName: movement.ProductID ? productsMap.get(Number(movement.ProductID))?.ProductName || null : null,
      EmployeeName: movement.EmployeeID ? formatEmployeeName(employeesMap.get(Number(movement.EmployeeID))) : null
    }));
  return paginateArray(rows, page, pageSize);
};

const listMovementsFromMySql = async ({ page = 1, pageSize = 25 } = {}) => {
  const limit  = Math.max(1, Number(pageSize) || 25);
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const sql = `
    SELECT m.MovementID, m.MovementType, m.Quantity, m.Reason, m.CreatedAt,
           m.ReferenceID, m.ReferenceType, m.StockBefore, m.StockAfter,
           p.ProductName, p.ProductID AS PID,
           NULLIF(TRIM(CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,''))), '') AS EmployeeName
    FROM stock_movements m
    LEFT JOIN products  p ON m.ProductID  = p.ProductID
    LEFT JOIN employees e ON m.EmployeeID = e.EmployeeID
    ORDER BY m.CreatedAt DESC
    LIMIT :limit OFFSET :offset`;
  const [countRow] = await execute('SELECT COUNT(*) AS total FROM stock_movements');
  const data = await execute(sql, { limit, offset });
  return { data, page: Number(page) || 1, pageSize: limit, total: countRow?.total ?? 0 };
};

export const listMovements = async (options = {}) => (
  isFirebaseOnly() ? listMovementsFromFirebase(options) : listMovementsFromMySql(options)
);

const registerExitFirebase = async ({
  ProductID,
  Quantity,
  Reason = '',
  EmployeeID = null,
  type = 'warehouse_exit',
  referenceId = null,
  referenceType = null
}) => {
  const qty = Number(Quantity);
  if (!ProductID || !qty || qty <= 0) {
    throw Object.assign(new Error('ProductID y Quantity > 0 son requeridos'), { status: 400 });
  }
  const adjustment = await adjustProductStock(ProductID, -qty, { forbidNegative: true });
  const movement = await createRecord('stock_movements', {
    ProductID: Number(ProductID),
    Quantity: qty,
    MovementType: type,
    Reason: Reason || null,
    ReferenceID: referenceId || null,
    ReferenceType: referenceType || null,
    EmployeeID: EmployeeID ? Number(EmployeeID) : null,
    StockBefore: adjustment.previousStock,
    StockAfter: adjustment.updatedStock,
    CreatedAt: new Date().toISOString()
  });
  const employee = EmployeeID ? await getRecord('employees', { EmployeeID: Number(EmployeeID) }) : null;
  return {
    ...movement,
    PID: Number(ProductID),
    ProductName: adjustment.product.ProductName,
    EmployeeName: formatEmployeeName(employee)
  };
};

const registerExitMySql = async ({
  ProductID,
  Quantity,
  Reason = '',
  EmployeeID = null,
  type = 'warehouse_exit',
  referenceId = null,
  referenceType = null
}) => {
  const qty = Number(Quantity);
  if (!ProductID || !qty || qty <= 0) {
    throw Object.assign(new Error('ProductID y Quantity > 0 son requeridos'), { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[product]] = await conn.execute(
      'SELECT ProductID, ProductName, UnitsInStock FROM products WHERE ProductID = ?',
      [ProductID]
    );
    if (!product) {
      throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    }

    const current = Number(product.UnitsInStock ?? 0);
    if (current < qty) {
      throw Object.assign(
        new Error(`Stock insuficiente. Disponible: ${current}, solicitado: ${qty}`),
        { status: 422 }
      );
    }

    await conn.execute(
      'UPDATE products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?',
      [qty, ProductID]
    );

    const stockBefore = current;
    const stockAfter  = current - qty;

    const [res] = await conn.execute(
      `INSERT INTO stock_movements
         (ProductID, Quantity, MovementType, Reason, ReferenceID, ReferenceType, EmployeeID, StockBefore, StockAfter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ProductID, qty, type, Reason || null, referenceId || null, referenceType || null, EmployeeID || null, stockBefore, stockAfter]
    );

    await conn.commit();

    const [[movement]] = await conn.execute(
      `SELECT m.*, p.ProductName,
              CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,'')) AS EmployeeName
       FROM stock_movements m
       LEFT JOIN products  p ON m.ProductID  = p.ProductID
       LEFT JOIN employees e ON m.EmployeeID = e.EmployeeID
       WHERE m.MovementID = ?`,
      [res.insertId]
    );
    syncUpsert('stock_movements', 'stock_movements', { MovementID: res.insertId }, movement);
    return movement;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const registerExit = async (params) => (
  isFirebaseOnly() ? registerExitFirebase(params) : registerExitMySql(params)
);
