import { execute, pool } from '../config/db.js';
import { syncUpsert } from './firebaseSync.js';
import {
  getFirebaseDataMode,
  ensureFirebaseDb,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord
} from './crudService.js';
import { adjustProductStock } from './firebaseStockService.js';

const VALID_STATUSES = ['pending', 'sent', 'received', 'cancelled'];

const paginateArray = (rows, page = 1, pageSize = 15) => {
  const limit = Math.max(1, Number(pageSize) || 15);
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    page: currentPage,
    pageSize: limit,
    total: rows.length
  };
};

const formatEmployeeName = (employee) => {
  if (!employee) {
    return null;
  }
  const name = `${employee.FirstName || ''} ${employee.LastName || ''}`.trim();
  return name || null;
};

const getFirebaseDbOrThrow = () => ensureFirebaseDb();
const isFirebaseOnly = () => getFirebaseDataMode().firebaseOnly;

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

const summarizeRequestsFirebase = async ({ page = 1, pageSize = 15 } = {}) => {
  const db = getFirebaseDbOrThrow();
  const [requestsSnap, suppliersMap, employeesMap, detailsSnap] = await Promise.all([
    db.collection('purchase_requests').get(),
    loadCollectionMap(db, 'suppliers', 'SupplierID'),
    loadCollectionMap(db, 'employees', 'EmployeeID'),
    db.collection('purchase_request_details').get()
  ]);

  const detailCounts = new Map();
  detailsSnap.forEach((doc) => {
    const data = doc.data();
    const requestId = Number(data.RequestID);
    if (!detailCounts.has(requestId)) {
      detailCounts.set(requestId, 0);
    }
    detailCounts.set(requestId, detailCounts.get(requestId) + 1);
  });

  const rows = requestsSnap.docs
    .map((doc) => doc.data())
    .sort((a, b) => Number(b.RequestID ?? 0) - Number(a.RequestID ?? 0))
    .map((request) => ({
      RequestID: Number(request.RequestID),
      RequestDate: request.RequestDate || null,
      Status: request.Status || 'pending',
      Notes: request.Notes || null,
      SupplierID: request.SupplierID ?? null,
      SupplierName: request.SupplierID ? suppliersMap.get(Number(request.SupplierID))?.CompanyName || null : null,
      EmployeeID: request.EmployeeID ?? null,
      EmployeeName: request.EmployeeID ? formatEmployeeName(employeesMap.get(Number(request.EmployeeID))) : null,
      ItemCount: detailCounts.get(Number(request.RequestID)) || 0
    }));

  return paginateArray(rows, page, pageSize);
};

const listRequestsFromMySql = async ({ page = 1, pageSize = 15 } = {}) => {
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

export const listRequests = async (options = {}) => (
  isFirebaseOnly() ? summarizeRequestsFirebase(options) : listRequestsFromMySql(options)
);

const getRequestFromMySql = async (requestId) => {
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
    { requestId }
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
      Notes:           r.ItemNotes
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
    items
  };
};

const fetchRequestFirebase = async (requestId) => {
  const db = getFirebaseDbOrThrow();
  const snap = await db.collection('purchase_requests').doc(String(requestId)).get();
  if (!snap.exists) {
    return null;
  }
  const request = snap.data();
  const supplier = request.SupplierID ? await getRecord('suppliers', { SupplierID: Number(request.SupplierID) }) : null;
  const employee = request.EmployeeID ? await getRecord('employees', { EmployeeID: Number(request.EmployeeID) }) : null;

  const detailsSnap = await db.collection('purchase_request_details')
    .where('RequestID', '==', Number(requestId))
    .orderBy('RequestDetailID')
    .get()
    .catch(async () => {
      const fallbackSnap = await db.collection('purchase_request_details').get();
      return {
        docs: fallbackSnap.docs.filter((doc) => Number(doc.data().RequestID) === Number(requestId))
      };
    });

  const productIds = Array.from(new Set(detailsSnap.docs.map((doc) => Number(doc.data().ProductID)).filter(Boolean)));
  const products = await Promise.all(productIds.map((id) => getRecord('products', { ProductID: id })));
  const productMap = new Map(products.filter(Boolean).map((prod) => [Number(prod.ProductID), prod]));

  const items = detailsSnap.docs.map((doc) => {
    const data = doc.data();
    const product = data.ProductID ? productMap.get(Number(data.ProductID)) : null;
    return {
      RequestDetailID: Number(data.RequestDetailID ?? doc.id),
      ProductID: data.ProductID ?? null,
      ProductName: product?.ProductName || null,
      Quantity: Number(data.Quantity ?? 0),
      UnitPrice: data.UnitPrice != null ? Number(data.UnitPrice) : null,
      Notes: data.Notes || null
    };
  });

  return {
    RequestID: Number(request.RequestID),
    RequestDate: request.RequestDate || null,
    Status: request.Status || 'pending',
    Notes: request.Notes || null,
    SupplierID: request.SupplierID ?? null,
    SupplierName: supplier?.CompanyName || null,
    ContactName: supplier?.ContactName || null,
    SupplierAddress: supplier?.Address || null,
    SupplierCity: supplier?.City || null,
    SupplierCountry: supplier?.Country || null,
    SupplierPhone: supplier?.Phone || null,
    EmployeeID: request.EmployeeID ?? null,
    EmployeeName: formatEmployeeName(employee),
    items
  };
};

export const getRequest = async (requestId) => (
  isFirebaseOnly() ? fetchRequestFirebase(requestId) : getRequestFromMySql(requestId)
);

const createRequestFirebase = async ({ SupplierID, EmployeeID, Notes, items }) => {
  if (!SupplierID) {
    throw Object.assign(new Error('SupplierID es requerido'), { status: 400 });
  }
  if (!items?.length) {
    throw Object.assign(new Error('Se requiere al menos un producto'), { status: 400 });
  }

  const detailIds = [];
  let requestRecord = null;
  try {
    requestRecord = await createRecord('purchase_requests', {
      SupplierID: Number(SupplierID),
      EmployeeID: EmployeeID ? Number(EmployeeID) : null,
      Notes: Notes || null,
      Status: 'pending',
      RequestDate: new Date().toISOString()
    });

    for (const item of items) {
      const qty = Number(item.Quantity);
      if (!item.ProductID || !qty || qty <= 0) {
        throw Object.assign(new Error(`Línea inválida: ProductID=${item.ProductID} Qty=${qty}`), { status: 400 });
      }
      const detail = await createRecord('purchase_request_details', {
        RequestID: Number(requestRecord.RequestID),
        ProductID: Number(item.ProductID),
        Quantity: qty,
        UnitPrice: item.UnitPrice != null ? Number(item.UnitPrice) : null,
        Notes: item.Notes || null
      });
      detailIds.push(detail.RequestDetailID);
    }

    return fetchRequestFirebase(requestRecord.RequestID);
  } catch (error) {
    await Promise.all(detailIds.map((id) => deleteRecord('purchase_request_details', { RequestDetailID: id })));
    if (requestRecord?.RequestID) {
      await deleteRecord('purchase_requests', { RequestID: requestRecord.RequestID }).catch(() => {});
    }
    throw error;
  }
};

const createRequestMySql = async (payload) => {
  const { SupplierID, EmployeeID, Notes, items } = payload;
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
      [SupplierID, EmployeeID || null, Notes || null]
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
        [requestId, item.ProductID, qty, item.UnitPrice || null, item.Notes || null]
      );
    }

    await conn.commit();
    conn.release();
    const request = await getRequestFromMySql(requestId);
    syncUpsert('purchase_requests', 'purchase_requests', { RequestID: requestId }, request);
    return request;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

export const createRequest = async (payload) => (
  isFirebaseOnly() ? createRequestFirebase(payload) : createRequestMySql(payload)
);

const updateRequestStatusFirebase = async (requestId, status) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(`Estado inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}`),
      { status: 400 }
    );
  }

  const existing = await fetchRequestFirebase(requestId);
  if (!existing) {
    throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });
  }

  const stockRollbacks = [];
  const createdMovements = [];
  let statusUpdated = false;
  try {
    await updateRecord('purchase_requests', { RequestID: Number(requestId), Status: status });
    statusUpdated = true;

    if (status === 'received' && existing.Status !== 'received') {
      for (const item of existing.items) {
        const qty = Number(item.Quantity);
        const adjustment = await adjustProductStock(item.ProductID, qty, { forbidNegative: false });
        stockRollbacks.push({ ProductID: item.ProductID, previousStock: adjustment.previousStock });
        const movement = await createRecord('stock_movements', {
          ProductID: Number(item.ProductID),
          Quantity: qty,
          MovementType: 'purchase_entry',
          Reason: 'Recepción de compra',
          ReferenceID: Number(requestId),
          ReferenceType: 'purchase_request',
          EmployeeID: existing.EmployeeID ? Number(existing.EmployeeID) : null,
          StockBefore: adjustment.previousStock,
          StockAfter: adjustment.updatedStock,
          CreatedAt: new Date().toISOString()
        });
        createdMovements.push(movement.MovementID);
      }
    }

    return fetchRequestFirebase(requestId);
  } catch (error) {
    await Promise.all(createdMovements.map((id) => deleteRecord('stock_movements', { MovementID: id })));
    for (const rollback of stockRollbacks.reverse()) {
      await updateRecord('products', { ProductID: rollback.ProductID, UnitsInStock: rollback.previousStock }).catch(() => {});
    }
    if (statusUpdated) {
      await updateRecord('purchase_requests', { RequestID: Number(requestId), Status: existing.Status }).catch(() => {});
    }
    throw error;
  }
};

const updateRequestStatusMySql = async (requestId, status) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(`Estado inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}`),
      { status: 400 }
    );
  }

  const req = await getRequestFromMySql(requestId);
  if (!req) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE purchase_requests SET Status = ? WHERE RequestID = ?',
      [status, requestId]
    );

    if (status === 'received' && req.Status !== 'received') {
      for (const item of req.items) {
        await conn.execute(
          'UPDATE products SET UnitsInStock = UnitsInStock + ? WHERE ProductID = ?',
          [item.Quantity, item.ProductID]
        );
        await conn.execute(
          `INSERT INTO stock_movements
             (ProductID, Quantity, MovementType, Reason, ReferenceID, EmployeeID)
           VALUES (?, ?, 'purchase_entry', 'Recepción de compra', ?, ?)`,
          [item.ProductID, item.Quantity, requestId, req.EmployeeID]
        );
      }
    }

    await conn.commit();
    conn.release();
    const updated = await getRequestFromMySql(requestId);
    syncUpsert('purchase_requests', 'purchase_requests', { RequestID: requestId }, updated);
    return updated;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

export const updateRequestStatus = async (requestId, status) => (
  isFirebaseOnly() ? updateRequestStatusFirebase(requestId, status) : updateRequestStatusMySql(requestId, status)
);
