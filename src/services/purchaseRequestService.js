import { execute, pool } from '../config/db.js';

const VALID_STATUSES = ['pending', 'sent', 'received', 'cancelled'];

/**
 * Paginated list of purchase requests with supplier/employee info.
 */
export const listRequests = async ({ page = 1, pageSize = 15 } = {}) => {
  const limit  = Math.max(1, Number(pageSize) || 15);
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const sql = `
    SELECT pr.RequestID, pr.RequestDate, pr.Status, pr.Notes,
           pr.SupplierID, s.CompanyName AS SupplierName,
           pr.EmployeeID,
           NULLIF(TRIM(CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,''))), '') AS EmployeeName,
           COUNT(prd.RequestDetailID) AS ItemCount
    FROM purchase_requests pr
    LEFT JOIN suppliers s  ON pr.SupplierID = s.SupplierID
    LEFT JOIN employees e  ON pr.EmployeeID = e.EmployeeID
    LEFT JOIN purchase_request_details prd ON pr.RequestID = prd.RequestID
    GROUP BY pr.RequestID, pr.RequestDate, pr.Status, pr.Notes,
             pr.SupplierID, s.CompanyName, pr.EmployeeID, e.FirstName, e.LastName
    ORDER BY pr.RequestID DESC
    LIMIT :limit OFFSET :offset`;
  const [countRow] = await execute('SELECT COUNT(*) AS total FROM purchase_requests');
  const data = await execute(sql, { limit, offset });
  return { data, page: Number(page) || 1, pageSize: limit, total: countRow?.total ?? 0 };
};

/**
 * Returns a single purchase request with its line items.
 */
export const getRequest = async (requestId) => {
  const rows = await execute(
    `SELECT pr.RequestID, pr.RequestDate, pr.Status, pr.Notes,
            pr.SupplierID, s.CompanyName AS SupplierName, s.ContactName,
            s.Address AS SupplierAddress, s.City AS SupplierCity,
            s.Country AS SupplierCountry, s.Phone AS SupplierPhone,
            pr.EmployeeID,
            NULLIF(TRIM(CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,''))), '') AS EmployeeName,
            prd.RequestDetailID, prd.ProductID, p.ProductName,
            prd.Quantity, prd.UnitPrice, prd.Notes AS ItemNotes
     FROM purchase_requests pr
     LEFT JOIN suppliers s  ON pr.SupplierID = s.SupplierID
     LEFT JOIN employees e  ON pr.EmployeeID = e.EmployeeID
     LEFT JOIN purchase_request_details prd ON pr.RequestID  = prd.RequestID
     LEFT JOIN products p  ON prd.ProductID = p.ProductID
     WHERE pr.RequestID = :requestId
     ORDER BY prd.RequestDetailID`,
    { requestId },
  );
  if (!rows.length) return null;
  const first = rows[0];
  const items = rows
    .filter((r) => r.RequestDetailID != null)
    .map((r) => ({
      RequestDetailID: r.RequestDetailID,
      ProductID:       r.ProductID,
      ProductName:     r.ProductName,
      Quantity:        Number(r.Quantity),
      UnitPrice:       r.UnitPrice != null ? Number(r.UnitPrice) : null,
      Notes:           r.ItemNotes,
    }));
  return {
    RequestID:       first.RequestID,
    RequestDate:     first.RequestDate,
    Status:          first.Status,
    Notes:           first.Notes,
    SupplierID:      first.SupplierID,
    SupplierName:    first.SupplierName,
    ContactName:     first.ContactName,
    SupplierAddress: first.SupplierAddress,
    SupplierCity:    first.SupplierCity,
    SupplierCountry: first.SupplierCountry,
    SupplierPhone:   first.SupplierPhone,
    EmployeeID:      first.EmployeeID,
    EmployeeName:    first.EmployeeName,
    items,
  };
};

/**
 * Creates a purchase request with its line items atomically.
 */
export const createRequest = async ({ SupplierID, EmployeeID, Notes, items }) => {
  if (!SupplierID) {
    throw Object.assign(new Error('SupplierID es requerido'), { status: 400 });
  }
  if (!items?.length) {
    throw Object.assign(new Error('Se requiere al menos un producto'), { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO purchase_requests (SupplierID, EmployeeID, Notes)
       VALUES (?, ?, ?)`,
      [SupplierID, EmployeeID || null, Notes || null],
    );
    const requestId = result.insertId;

    for (const item of items) {
      const qty = Number(item.Quantity);
      if (!item.ProductID || !qty || qty <= 0) {
        throw Object.assign(new Error(`Línea inválida: ProductID=${item.ProductID} Qty=${qty}`), { status: 400 });
      }
      await conn.execute(
        `INSERT INTO purchase_request_details
           (RequestID, ProductID, Quantity, UnitPrice, Notes)
         VALUES (?, ?, ?, ?, ?)`,
        [requestId, item.ProductID, qty, item.UnitPrice || null, item.Notes || null],
      );
    }

    await conn.commit();
    conn.release();
    return getRequest(requestId);
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

/**
 * Updates the status of a purchase request.
 * When received, increments UnitsInStock for each item (purchase_entry movement).
 */
export const updateRequestStatus = async (requestId, status) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(`Estado inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}`),
      { status: 400 },
    );
  }

  const req = await getRequest(requestId);
  if (!req) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE purchase_requests SET Status = ? WHERE RequestID = ?',
      [status, requestId],
    );

    // When received: credit stock and record entry movements
    if (status === 'received' && req.Status !== 'received') {
      for (const item of req.items) {
        await conn.execute(
          'UPDATE products SET UnitsInStock = UnitsInStock + ? WHERE ProductID = ?',
          [item.Quantity, item.ProductID],
        );
        await conn.execute(
          `INSERT INTO stock_movements
             (ProductID, Quantity, MovementType, Reason, ReferenceID, EmployeeID)
           VALUES (?, ?, 'purchase_entry', 'Recepción de compra', ?, ?)`,
          [item.ProductID, item.Quantity, requestId, req.EmployeeID],
        );
      }
    }

    await conn.commit();
    conn.release();
    return getRequest(requestId);
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};
