import { execute, pool } from '../config/db.js';

/**
 * Returns paginated stock list from products table with category/supplier info.
 */
export const getStock = async ({ page = 1, pageSize = 25, search } = {}) => {
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

/**
 * Paginated list of stock movements with product/employee names.
 */
export const listMovements = async ({ page = 1, pageSize = 25 } = {}) => {
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

/**
 * Registers a stock exit (warehouse_exit type by default).
 * Validates stock availability, deducts UnitsInStock, writes movement record.
 * Uses a transaction to guarantee atomicity.
 *
 * @param {object} opts
 * @param {number} opts.ProductID
 * @param {number} opts.Quantity  - must be > 0
 * @param {string} [opts.Reason]
 * @param {number} [opts.EmployeeID]
 * @param {string} [opts.type]        - MovementType, default 'warehouse_exit'
 * @param {number} [opts.referenceId] - e.g., OrderID for sale_exit
 */
export const registerExit = async ({
  ProductID,
  Quantity,
  Reason = '',
  EmployeeID = null,
  type = 'warehouse_exit',
  referenceId = null,
  referenceType = null,
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
      [ProductID],
    );
    if (!product) {
      throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    }

    const current = Number(product.UnitsInStock ?? 0);
    if (current < qty) {
      throw Object.assign(
        new Error(`Stock insuficiente. Disponible: ${current}, solicitado: ${qty}`),
        { status: 422 },
      );
    }

    await conn.execute(
      'UPDATE products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?',
      [qty, ProductID],
    );

    const stockBefore = current;
    const stockAfter  = current - qty;

    const [res] = await conn.execute(
      `INSERT INTO stock_movements
         (ProductID, Quantity, MovementType, Reason, ReferenceID, ReferenceType, EmployeeID, StockBefore, StockAfter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ProductID, qty, type, Reason || null, referenceId || null, referenceType || null, EmployeeID || null, stockBefore, stockAfter],
    );

    await conn.commit();

    const [[movement]] = await conn.execute(
      `SELECT m.*, p.ProductName,
              CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,'')) AS EmployeeName
       FROM stock_movements m
       LEFT JOIN products  p ON m.ProductID  = p.ProductID
       LEFT JOIN employees e ON m.EmployeeID = e.EmployeeID
       WHERE m.MovementID = ?`,
      [res.insertId],
    );
    return movement;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
