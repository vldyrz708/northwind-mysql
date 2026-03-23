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

const ORDER_FIELDS = `
  o.OrderID, o.OrderDate, o.RequiredDate, o.ShippedDate, o.Freight,
  o.CustomerID, c.CompanyName AS CustomerName, c.ContactName,
  c.Address AS CustomerAddress, c.City AS CustomerCity,
  c.Country AS CustomerCountry, c.Phone AS CustomerPhone,
  o.EmployeeID,
  NULLIF(TRIM(CONCAT(COALESCE(e.FirstName,''), ' ', COALESCE(e.LastName,''))), '') AS EmployeeName`;

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

const normalizeSearch = (value) => {
  const term = String(value ?? '').trim().toLowerCase();
  return term || null;
};

const toKey = (value) => (value === undefined || value === null ? null : String(value));

const loadCollectionMap = async (db, collection, keyField) => {
  const snapshot = await db.collection(collection).get();
  const map = new Map();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const key = toKey(data[keyField] ?? doc.id);
    if (key !== null) {
      map.set(key, data);
    }
  });
  return map;
};

const getFirebaseDbOrThrow = () => ensureFirebaseDb();
const isFirebaseOnly = () => getFirebaseDataMode().firebaseOnly;

const listSalesFromMySql = async ({ page = 1, pageSize = 15, search } = {}) => {
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

const listSalesFirebase = async ({ page = 1, pageSize = 15, search } = {}) => {
  const db = getFirebaseDbOrThrow();
  const [ordersSnap, customersMap, employeesMap, detailsSnap] = await Promise.all([
    db.collection('orders').get(),
    loadCollectionMap(db, 'customers', 'CustomerID'),
    loadCollectionMap(db, 'employees', 'EmployeeID'),
    db.collection('order_details').get()
  ]);

  const aggregates = new Map();
  detailsSnap.forEach((doc) => {
    const data = doc.data();
    const orderKey = toKey(data.OrderID ?? doc.id);
    if (!orderKey) {
      return;
    }
    const total = Number(data.UnitPrice ?? 0) * Number(data.Quantity ?? 0) * (1 - Number(data.Discount ?? 0));
    if (!aggregates.has(orderKey)) {
      aggregates.set(orderKey, { total: 0, count: 0 });
    }
    const entry = aggregates.get(orderKey);
    entry.total += total;
    entry.count += 1;
  });

  const term = normalizeSearch(search);
  const rows = ordersSnap.docs
    .map((doc) => ({ ...doc.data(), __id: doc.id }))
    .sort((a, b) => Number(b.OrderID ?? b.__id ?? 0) - Number(a.OrderID ?? a.__id ?? 0))
    .map((order) => {
      const orderKey = toKey(order.OrderID ?? order.__id);
      const aggregate = aggregates.get(orderKey) || { total: 0, count: 0 };
      const customer = order.CustomerID ? customersMap.get(toKey(order.CustomerID)) : null;
      const employee = order.EmployeeID ? employeesMap.get(toKey(order.EmployeeID)) : null;
      return {
        OrderID: Number(order.OrderID ?? order.__id ?? 0),
        OrderDate: order.OrderDate || null,
        ShippedDate: order.ShippedDate || null,
        CustomerID: order.CustomerID ?? null,
        CustomerName: customer?.CompanyName || null,
        EmployeeID: order.EmployeeID ?? null,
        EmployeeName: formatEmployeeName(employee),
        Total: Number(aggregate.total.toFixed(2)),
        ItemCount: aggregate.count
      };
    })
    .filter((row) => {
      if (!term) return true;
      return (
        String(row.OrderID ?? '').toLowerCase().includes(term) ||
        String(row.CustomerName ?? '').toLowerCase().includes(term)
      );
    });

  return paginateArray(rows, page, pageSize);
};

export const listSales = async (options = {}) => (
  isFirebaseOnly() ? listSalesFirebase(options) : listSalesFromMySql(options)
);

const getSaleFromMySql = async (orderId) => {
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
    { orderId }
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
      LineTotal:   Number(r.LineTotal)
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
    Total: total
  };
};

const getSaleFirebase = async (orderId) => {
  const db = getFirebaseDbOrThrow();
  const snap = await db.collection('orders').doc(String(orderId)).get();
  if (!snap.exists) {
    return null;
  }
  const order = snap.data();
  const [customer, employee] = await Promise.all([
    order.CustomerID ? getRecord('customers', { CustomerID: order.CustomerID }) : Promise.resolve(null),
    order.EmployeeID ? getRecord('employees', { EmployeeID: order.EmployeeID }) : Promise.resolve(null)
  ]);

  const detailsSnap = await db.collection('order_details')
    .where('OrderID', '==', Number(orderId))
    .get()
    .catch(async () => {
      const fallbackSnap = await db.collection('order_details').get();
      return {
        docs: fallbackSnap.docs.filter((doc) => Number(doc.data().OrderID) === Number(orderId))
      };
    });

  const productIds = Array.from(new Set(detailsSnap.docs.map((doc) => Number(doc.data().ProductID)).filter(Boolean)));
  const products = await Promise.all(productIds.map((id) => getRecord('products', { ProductID: id })));
  const productMap = new Map(products.filter(Boolean).map((prod) => [Number(prod.ProductID), prod]));

  const items = detailsSnap.docs.map((doc) => {
    const data = doc.data();
    const quantity = Number(data.Quantity ?? 0);
    const unitPrice = Number(data.UnitPrice ?? 0);
    const discount = Number(data.Discount ?? 0);
    const product = data.ProductID ? productMap.get(Number(data.ProductID)) : null;
    const lineTotal = unitPrice * quantity * (1 - discount);
    return {
      ProductID: data.ProductID ?? null,
      ProductName: product?.ProductName || null,
      UnitPrice: unitPrice,
      Quantity: quantity,
      Discount: discount,
      LineTotal: Number(lineTotal.toFixed(2))
    };
  });
  const total = items.reduce((sum, item) => sum + item.LineTotal, 0);

  return {
    OrderID: Number(order.OrderID ?? orderId),
    OrderDate: order.OrderDate || null,
    RequiredDate: order.RequiredDate || null,
    ShippedDate: order.ShippedDate || null,
    Freight: order.Freight != null ? Number(order.Freight) : null,
    CustomerID: order.CustomerID ?? null,
    CustomerName: customer?.CompanyName || null,
    ContactName: customer?.ContactName || null,
    CustomerAddress: customer?.Address || null,
    CustomerCity: customer?.City || null,
    CustomerCountry: customer?.Country || null,
    CustomerPhone: customer?.Phone || null,
    EmployeeID: order.EmployeeID ?? null,
    EmployeeName: formatEmployeeName(employee),
    items,
    Total: Number(total.toFixed(2))
  };
};

export const getSale = async (orderId) => (
  isFirebaseOnly() ? getSaleFirebase(orderId) : getSaleFromMySql(orderId)
);

const mapOrderPayload = (order) => ({
  CustomerID: order.CustomerID ?? null,
  EmployeeID: order.EmployeeID ?? null,
  OrderDate: order.OrderDate || new Date().toISOString().split('T')[0],
  RequiredDate: order.RequiredDate || null,
  ShippedDate: order.ShippedDate || null,
  ShipVia: order.ShipVia || null,
  Freight: order.Freight != null ? Number(order.Freight) : 0,
  ShipName: order.ShipName || null,
  ShipAddress: order.ShipAddress || null,
  ShipCity: order.ShipCity || null,
  ShipRegion: order.ShipRegion || null,
  ShipPostalCode: order.ShipPostalCode || null,
  ShipCountry: order.ShipCountry || null
});

const createSaleFromMySql = async (orderData, items) => {
  if (!items?.length) {
    throw Object.assign(new Error('Se requiere al menos un producto'), { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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
        orderData.ShipCountry   || null
      ]
    );
    const orderId = result.insertId;

    for (const item of items) {
      const qty = Number(item.Quantity);
      if (!item.ProductID || !qty || qty <= 0) {
        throw Object.assign(new Error(`Línea inválida: ProductID=${item.ProductID} Qty=${qty}`), { status: 400 });
      }

      const [[product]] = await conn.execute(
        'SELECT UnitsInStock, ProductName FROM products WHERE ProductID = ? FOR UPDATE',
        [item.ProductID]
      );
      if (!product) {
        throw Object.assign(new Error(`Producto ${item.ProductID} no encontrado`), { status: 404 });
      }
      const stock = Number(product.UnitsInStock ?? 0);
      if (stock < qty) {
        throw Object.assign(
          new Error(`Stock insuficiente para "${product.ProductName}". Disponible: ${stock}, solicitado: ${qty}`),
          { status: 422 }
        );
      }

      await conn.execute(
        `INSERT INTO order_details (OrderID, ProductID, UnitPrice, Quantity, Discount)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.ProductID, Number(item.UnitPrice), qty, Number(item.Discount ?? 0)]
      );

      await conn.execute(
        'UPDATE products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?',
        [qty, item.ProductID]
      );

      await conn.execute(
        `INSERT INTO stock_movements
           (ProductID, Quantity, MovementType, Reason, ReferenceID, EmployeeID)
         VALUES (?, ?, 'sale_exit', 'Venta confirmada', ?, ?)`,
        [item.ProductID, qty, orderId, orderData.EmployeeID || null]
      );
    }

    await conn.commit();
    conn.release();
    const sale = await getSaleFromMySql(orderId);
    syncUpsert('orders', 'orders', { OrderID: orderId }, sale);
    return sale;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

const createSaleFirebase = async (orderData, items) => {
  if (!items?.length) {
    throw Object.assign(new Error('Se requiere al menos un producto'), { status: 400 });
  }

  const detailKeys = [];
  const movementIds = [];
  const stockRollbacks = [];
  let orderRecord = null;
  try {
    orderRecord = await createRecord('orders', mapOrderPayload(orderData));
    const orderId = Number(orderRecord.OrderID);

    for (const item of items) {
      const qty = Number(item.Quantity);
      if (!item.ProductID || !qty || qty <= 0) {
        throw Object.assign(new Error(`Línea inválida: ProductID=${item.ProductID} Qty=${qty}`), { status: 400 });
      }
      const unitPrice = Number(item.UnitPrice ?? 0);
      const discount = Number(item.Discount ?? 0);

      const adjustment = await adjustProductStock(item.ProductID, -qty, { forbidNegative: true });
      stockRollbacks.push({ ProductID: item.ProductID, previousStock: adjustment.previousStock });

      await createRecord('order_details', {
        OrderID: orderId,
        ProductID: Number(item.ProductID),
        UnitPrice: unitPrice,
        Quantity: qty,
        Discount: discount
      });
      detailKeys.push({ OrderID: orderId, ProductID: Number(item.ProductID) });

      const movement = await createRecord('stock_movements', {
        ProductID: Number(item.ProductID),
        Quantity: qty,
        MovementType: 'sale_exit',
        Reason: 'Venta confirmada',
        ReferenceID: orderId,
        ReferenceType: 'order',
        EmployeeID: orderData.EmployeeID ? Number(orderData.EmployeeID) : null,
        StockBefore: adjustment.previousStock,
        StockAfter: adjustment.updatedStock,
        CreatedAt: new Date().toISOString()
      });
      movementIds.push(movement.MovementID);
    }

    return getSaleFirebase(orderRecord.OrderID);
  } catch (error) {
    await Promise.all(
      movementIds.map((id) => deleteRecord('stock_movements', { MovementID: id }).catch(() => {}))
    );
    for (const rollback of stockRollbacks.reverse()) {
      await updateRecord('products', { ProductID: rollback.ProductID, UnitsInStock: rollback.previousStock }).catch(() => {});
    }
    await Promise.all(detailKeys.map((key) => deleteRecord('order_details', key).catch(() => {})));
    if (orderRecord?.OrderID) {
      await deleteRecord('orders', { OrderID: orderRecord.OrderID }).catch(() => {});
    }
    throw error;
  }
};

export const createSale = async (orderData, items) => (
  isFirebaseOnly() ? createSaleFirebase(orderData, items) : createSaleFromMySql(orderData, items)
);
