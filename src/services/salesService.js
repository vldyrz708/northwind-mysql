import { execute, pool } from '../config/db.js';

const ORDER_FIELDS = `
  o.OrderID, o.OrderDate, o.RequiredDate, o.ShippedDate, o.Freight,
  o.CustomerID, c.CompanyName AS CustomerName, c.ContactName,
  c.Address AS CustomerAddress, c.City AS CustomerCity,
  c.Country AS CustomerCountry, c.Phone AS CustomerPhone,
  o.EmployeeID,
  NULLIF(TRIM(CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,''))), '') AS EmployeeName`;

/**
 * Paginated list of orders (= sales) enriched with total from order_details.
 */
export const listSales = async ({ page = 1, pageSize = 15, search } = {}) => {
  const limit  = Math.max(1, Number(pageSize) || 15);
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const params = { limit, offset };
  let where = '';
  if (search) {
    where = ` WHERE (c.CompanyName LIKE :search OR CAST(o.OrderID AS CHAR) LIKE :search2)`;
    params.search  = `%${search}%`;
    params.search2 = `%${search}%`;
  }
  const sql = `
    SELECT o.OrderID, o.OrderDate, o.ShippedDate, o.CustomerID,
           c.CompanyName AS CustomerName,
           o.EmployeeID,
           CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,'')) AS EmployeeName,
           COALESCE(SUM(od.UnitPrice * od.Quantity * (1 - COALESCE(od.Discount,0))), 0) AS Total,
           COUNT(od.ProductID) AS ItemCount
    FROM orders o
    LEFT JOIN customers    c  ON o.CustomerID  = c.CustomerID
    LEFT JOIN employees    e  ON o.EmployeeID  = e.EmployeeID
    LEFT JOIN order_details od ON o.OrderID    = od.OrderID
    ${where}
    GROUP BY o.OrderID, o.OrderDate, o.ShippedDate, o.CustomerID,
             c.CompanyName, o.EmployeeID, e.FirstName, e.LastName
    ORDER BY o.OrderID DESC
    LIMIT :limit OFFSET :offset`;
  const countSql = `
    SELECT COUNT(DISTINCT o.OrderID) AS total
    FROM orders o
    LEFT JOIN customers c ON o.CustomerID = c.CustomerID
    ${where}`;
  const [countRow] = await execute(countSql, params);
  const data = await execute(sql, params);
  return { data, page: Number(page) || 1, pageSize: limit, total: countRow?.total ?? 0 };
};

/**
 * Returns a single order with its line items and grand total.
 */
export const getSale = async (orderId) => {
  const rows = await execute(
    `SELECT ${ORDER_FIELDS},
            od.ProductID, p.ProductName, od.UnitPrice, od.Quantity,
            COALESCE(od.Discount, 0) AS Discount,
            (od.UnitPrice * od.Quantity * (1 - COALESCE(od.Discount, 0))) AS LineTotal
     FROM orders o
     LEFT JOIN customers     c  ON o.CustomerID = c.CustomerID
     LEFT JOIN employees     e  ON o.EmployeeID = e.EmployeeID
     LEFT JOIN order_details od ON o.OrderID    = od.OrderID
     LEFT JOIN products      p  ON od.ProductID = p.ProductID
     WHERE o.OrderID = :orderId
     ORDER BY od.ProductID`,
    { orderId },
  );
  if (!rows.length) return null;
  const first = rows[0];
  const items = rows
    .filter((r) => r.ProductID != null)
    .map((r) => ({
      ProductID:   r.ProductID,
      ProductName: r.ProductName,
      UnitPrice:   Number(r.UnitPrice),
      Quantity:    Number(r.Quantity),
      Discount:    Number(r.Discount),
      LineTotal:   Number(r.LineTotal),
    }));
  const total = items.reduce((s, i) => s + i.LineTotal, 0);
  return {
    OrderID:         first.OrderID,
    OrderDate:       first.OrderDate,
    RequiredDate:    first.RequiredDate,
    ShippedDate:     first.ShippedDate,
    Freight:         first.Freight,
    CustomerID:      first.CustomerID,
    CustomerName:    first.CustomerName,
    ContactName:     first.ContactName,
    CustomerAddress: first.CustomerAddress,
    CustomerCity:    first.CustomerCity,
    CustomerCountry: first.CustomerCountry,
    CustomerPhone:   first.CustomerPhone,
    EmployeeID:      first.EmployeeID,
    EmployeeName:    first.EmployeeName,
    items,
    Total: total,
  };
};

/**
 * Creates a complete sale atomically:
 *   1. Inserts order header.
 *   2. For each item: validates stock, inserts order_detail, deducts UnitsInStock,
 *      and records a 'sale_exit' movement.
 *
 * @param {object} orderData  - CustomerID, EmployeeID, OrderDate, etc.
 * @param {Array}  items      - [{ProductID, Quantity, UnitPrice, Discount?}]
 */
export const createSale = async (orderData, items) => {
  if (!items?.length) {
    throw Object.assign(new Error('Se requiere al menos un producto'), { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insert order header
    const [result] = await conn.execute(
      `INSERT INTO orders
         (CustomerID, EmployeeID, OrderDate, RequiredDate, ShippedDate,
          ShipVia, Freight, ShipName, ShipAddress, ShipCity,
          ShipRegion, ShipPostalCode, ShipCountry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderData.CustomerID    || null,
        orderData.EmployeeID    || null,
        orderData.OrderDate     || new Date().toISOString().split('T')[0],
        orderData.RequiredDate  || null,
        orderData.ShippedDate   || null,
        orderData.ShipVia       || null,
        orderData.Freight       || 0,
        orderData.ShipName      || null,
        orderData.ShipAddress   || null,
        orderData.ShipCity      || null,
        orderData.ShipRegion    || null,
        orderData.ShipPostalCode|| null,
        orderData.ShipCountry   || null,
      ],
    );
    const orderId = result.insertId;

    // 2. Process each line item
    for (const item of items) {
      const qty = Number(item.Quantity);
      if (!item.ProductID || !qty || qty <= 0) {
        throw Object.assign(new Error(`Línea inválida: ProductID=${item.ProductID} Qty=${qty}`), { status: 400 });
      }

      // Stock check
      const [[product]] = await conn.execute(
        'SELECT UnitsInStock, ProductName FROM products WHERE ProductID = ? FOR UPDATE',
        [item.ProductID],
      );
      if (!product) {
        throw Object.assign(new Error(`Producto ${item.ProductID} no encontrado`), { status: 404 });
      }
      const stock = Number(product.UnitsInStock ?? 0);
      if (stock < qty) {
        throw Object.assign(
          new Error(`Stock insuficiente para "${product.ProductName}". Disponible: ${stock}, solicitado: ${qty}`),
          { status: 422 },
        );
      }

      // Insert line
      await conn.execute(
        `INSERT INTO order_details (OrderID, ProductID, UnitPrice, Quantity, Discount)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.ProductID, Number(item.UnitPrice), qty, Number(item.Discount ?? 0)],
      );

      // Deduct stock
      await conn.execute(
        'UPDATE products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?',
        [qty, item.ProductID],
      );

      // Record movement
      await conn.execute(
        `INSERT INTO stock_movements
           (ProductID, Quantity, MovementType, Reason, ReferenceID, EmployeeID)
         VALUES (?, ?, 'sale_exit', 'Venta confirmada', ?, ?)`,
        [item.ProductID, qty, orderId, orderData.EmployeeID || null],
      );
    }

    await conn.commit();
    conn.release();
    return getSale(orderId);
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};
