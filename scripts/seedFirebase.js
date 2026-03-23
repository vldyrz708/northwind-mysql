import dotenv from 'dotenv';
import tableConfig from '../src/data/tableConfig.js';
import { getDb } from '../src/config/firebase.js';

dotenv.config();

const sampleData = {
  categories: [
    { CategoryID: 501, CategoryName: 'Bebidas funcionales', Description: 'Infusiones frias con extractos naturales', Picture: null },
    { CategoryID: 502, CategoryName: 'Snacks artesanales', Description: 'Botanas horneadas con ingredientes locales', Picture: null },
    { CategoryID: 503, CategoryName: 'Panaderia creativa', Description: 'Masas madre y panes especiados', Picture: null },
    { CategoryID: 504, CategoryName: 'Cuidado personal eco', Description: 'Productos zero waste para spa', Picture: null },
    { CategoryID: 505, CategoryName: 'Gourmet vegano', Description: 'Bases y toppings premium sin lactosa', Picture: null }
  ],
  suppliers: [
    { SupplierID: 401, CompanyName: 'Andes Botanicals', ContactName: 'Lucia Campos', ContactTitle: 'Compras', Address: 'Av. Nevado 120', City: 'Quito', Region: 'Pichincha', PostalCode: '170170', Country: 'Ecuador', Phone: '+593-2-456789', Fax: '+593-2-456780', HomePage: 'https://andesbotanicals.example.com' },
    { SupplierID: 402, CompanyName: 'Pacifica Ferment', ContactName: 'Mateo Rios', ContactTitle: 'Director ventas', Address: 'Calle 45 #18', City: 'Lima', Region: 'Lima', PostalCode: '15074', Country: 'Peru', Phone: '+51-1-5507788', Fax: null, HomePage: 'https://pacificaferment.example.com' },
    { SupplierID: 403, CompanyName: 'Altiplano Mills', ContactName: 'Sofia Vega', ContactTitle: 'Gerente comercial', Address: 'Ruta 5 Km 14', City: 'La Paz', Region: 'LP', PostalCode: '0002', Country: 'Bolivia', Phone: '+591-2-334455', Fax: null, HomePage: null },
    { SupplierID: 404, CompanyName: 'Bosque Azul', ContactName: 'Julian Perez', ContactTitle: 'Owner', Address: 'Carrera 9 #21', City: 'Bogota', Region: 'Cundinamarca', PostalCode: '110221', Country: 'Colombia', Phone: '+57-1-7830091', Fax: null, HomePage: 'https://bosqueazul.example.com' },
    { SupplierID: 405, CompanyName: 'Delta Coastal', ContactName: 'Isabel Miro', ContactTitle: 'Export manager', Address: 'Pier 12 Warehouse', City: 'Valparaiso', Region: 'V', PostalCode: '2360000', Country: 'Chile', Phone: '+56-32-221144', Fax: '+56-32-221199', HomePage: null }
  ],
  products: [
    { ProductID: 701, ProductName: 'Mate Spark 250ml', SupplierID: 401, CategoryID: 501, QuantityPerUnit: 'Caja 24 latas', UnitPrice: 22.5, UnitsInStock: 140, UnitsOnOrder: 30, ReorderLevel: 25, Discontinued: 0 },
    { ProductID: 702, ProductName: 'Chips de yuca chili', SupplierID: 402, CategoryID: 502, QuantityPerUnit: 'Paquete 12 bolsas', UnitPrice: 32, UnitsInStock: 80, UnitsOnOrder: 18, ReorderLevel: 20, Discontinued: 0 },
    { ProductID: 703, ProductName: 'Pan de cacao nibs', SupplierID: 403, CategoryID: 503, QuantityPerUnit: 'Caja 6 piezas', UnitPrice: 48, UnitsInStock: 54, UnitsOnOrder: 12, ReorderLevel: 15, Discontinued: 0 },
    { ProductID: 704, ProductName: 'Serum botanico 50ml', SupplierID: 404, CategoryID: 504, QuantityPerUnit: 'Caja 10 frascos', UnitPrice: 95, UnitsInStock: 38, UnitsOnOrder: 10, ReorderLevel: 8, Discontinued: 0 },
    { ProductID: 705, ProductName: 'Salsa miso maracuya', SupplierID: 405, CategoryID: 505, QuantityPerUnit: 'Caja 15 botellas', UnitPrice: 68, UnitsInStock: 62, UnitsOnOrder: 16, ReorderLevel: 12, Discontinued: 0 }
  ],
  customers: [
    { CustomerID: 'ALFMX', CompanyName: 'Alfiler MX Studio', ContactName: 'Andrea Lara', ContactTitle: 'Directora creativa', Address: 'Cordoba 77', City: 'CDMX', Region: 'CDMX', PostalCode: '06700', Country: 'Mexico', Phone: '+52-55-3899-1122', Fax: null },
    { CustomerID: 'BRTBR', CompanyName: 'Brote Barista', ContactName: 'Paulo Silva', ContactTitle: 'Head barista', Address: 'Rua Aurora 315', City: 'Sao Paulo', Region: 'SP', PostalCode: '01310', Country: 'Brasil', Phone: '+55-11-3122-9988', Fax: null },
    { CustomerID: 'CHEDO', CompanyName: 'Chef Domo', ContactName: 'Daniel Ortega', ContactTitle: 'Chef ejecutivo', Address: 'Av. Las Lomas 640', City: 'Guadalajara', Region: 'JAL', PostalCode: '44660', Country: 'Mexico', Phone: '+52-33-2001-7788', Fax: null },
    { CustomerID: 'DUVUS', CompanyName: 'Dulce Viento USA', ContactName: 'Mia Cooper', ContactTitle: 'Buyer', Address: '2370 Polk St', City: 'San Francisco', Region: 'CA', PostalCode: '94109', Country: 'USA', Phone: '+1-415-555-8122', Fax: '+1-415-555-8100' },
    { CustomerID: 'ECOTI', CompanyName: 'Eco Tikal', ContactName: 'Renata Solis', ContactTitle: 'COO', Address: '6a Avenida 14-20', City: 'Antigua', Region: 'SAC', PostalCode: '03001', Country: 'Guatemala', Phone: '+502-7832-1122', Fax: null }
  ],
  employees: [
    { EmployeeID: 201, LastName: 'Ibarra', FirstName: 'Silvia', Title: 'Head of Ops', TitleOfCourtesy: 'Ms.', BirthDate: '1986-02-11', HireDate: '2020-04-01', Address: 'Monte Rosa 14', City: 'CDMX', Region: 'CDMX', PostalCode: '11000', Country: 'Mexico', HomePhone: '+52-55-7000-1111', Extension: '201', Photo: null, Notes: 'Coordina operaciones LATAM', ReportsTo: null, PhotoPath: null },
    { EmployeeID: 202, LastName: 'Navarro', FirstName: 'Luis', Title: 'Inventory Lead', TitleOfCourtesy: 'Mr.', BirthDate: '1990-07-19', HireDate: '2021-01-15', Address: 'Rio Sena 23', City: 'CDMX', Region: 'CDMX', PostalCode: '11520', Country: 'Mexico', HomePhone: '+52-55-4300-2222', Extension: '305', Photo: null, Notes: 'Responsable de inventarios', ReportsTo: 201, PhotoPath: null },
    { EmployeeID: 203, LastName: 'Rivas', FirstName: 'Patricia', Title: 'Account Manager', TitleOfCourtesy: 'Ms.', BirthDate: '1988-09-05', HireDate: '2022-03-21', Address: 'Diag. Norte 900', City: 'Monterrey', Region: 'NL', PostalCode: '64000', Country: 'Mexico', HomePhone: '+52-81-2200-3344', Extension: '322', Photo: null, Notes: 'Clientes retail premium', ReportsTo: 201, PhotoPath: null },
    { EmployeeID: 204, LastName: 'Lopez', FirstName: 'Ignacio', Title: 'Field Specialist', TitleOfCourtesy: 'Mr.', BirthDate: '1994-11-13', HireDate: '2023-06-10', Address: 'Caupolican 540', City: 'Santiago', Region: 'RM', PostalCode: '8320000', Country: 'Chile', HomePhone: '+56-2-2660-1122', Extension: '108', Photo: null, Notes: 'Visitas a proveedores', ReportsTo: 202, PhotoPath: null },
    { EmployeeID: 205, LastName: 'Palma', FirstName: 'Valeria', Title: 'Sales Analyst', TitleOfCourtesy: 'Ms.', BirthDate: '1996-04-28', HireDate: '2024-02-05', Address: 'Cra 12 66-20', City: 'Bogota', Region: 'CUN', PostalCode: '111211', Country: 'Colombia', HomePhone: '+57-1-322-8899', Extension: '212', Photo: null, Notes: 'Dashboards e insights', ReportsTo: 203, PhotoPath: null }
  ],
  shippers: [
    { ShipperID: 91, CompanyName: 'Altavoz Logistics', Phone: '+52-55-7100-4455' },
    { ShipperID: 92, CompanyName: 'NeoCargo Express', Phone: '+52-33-2134-9987' },
    { ShipperID: 93, CompanyName: 'Patagonia Air Freight', Phone: '+54-11-5090-7788' },
    { ShipperID: 94, CompanyName: 'Canal Verde Movers', Phone: '+57-1-889-3311' },
    { ShipperID: 95, CompanyName: 'Pacifica Courier', Phone: '+56-2-2711-0099' }
  ],
  orders: [
    { OrderID: 99001, CustomerID: 'ALFMX', EmployeeID: 203, OrderDate: '2025-03-05', RequiredDate: '2025-03-14', ShippedDate: '2025-03-07', ShipVia: 91, Freight: 320.5, ShipName: 'Alfiler MX Studio', ShipAddress: 'Cordoba 77', ShipCity: 'CDMX', ShipRegion: 'CDMX', ShipPostalCode: '06700', ShipCountry: 'Mexico' },
    { OrderID: 99002, CustomerID: 'BRTBR', EmployeeID: 205, OrderDate: '2025-03-06', RequiredDate: '2025-03-18', ShippedDate: '2025-03-09', ShipVia: 93, Freight: 510.2, ShipName: 'Brote Barista', ShipAddress: 'Rua Aurora 315', ShipCity: 'Sao Paulo', ShipRegion: 'SP', ShipPostalCode: '01310', ShipCountry: 'Brasil' },
    { OrderID: 99003, CustomerID: 'CHEDO', EmployeeID: 202, OrderDate: '2025-03-10', RequiredDate: '2025-03-20', ShippedDate: null, ShipVia: 92, Freight: 185, ShipName: 'Chef Domo', ShipAddress: 'Av. Las Lomas 640', ShipCity: 'Guadalajara', ShipRegion: 'JAL', ShipPostalCode: '44660', ShipCountry: 'Mexico' },
    { OrderID: 99004, CustomerID: 'DUVUS', EmployeeID: 201, OrderDate: '2025-03-12', RequiredDate: '2025-03-26', ShippedDate: null, ShipVia: 95, Freight: 780.75, ShipName: 'Dulce Viento USA', ShipAddress: '2370 Polk St', ShipCity: 'San Francisco', ShipRegion: 'CA', ShipPostalCode: '94109', ShipCountry: 'USA' },
    { OrderID: 99005, CustomerID: 'ECOTI', EmployeeID: 204, OrderDate: '2025-03-15', RequiredDate: '2025-03-28', ShippedDate: null, ShipVia: 94, Freight: 265.4, ShipName: 'Eco Tikal', ShipAddress: '6a Avenida 14-20', ShipCity: 'Antigua', ShipRegion: 'SAC', ShipPostalCode: '03001', ShipCountry: 'Guatemala' }
  ],
  order_details: [
    { OrderID: 99001, ProductID: 701, UnitPrice: 22.5, Quantity: 40, Discount: 0 },
    { OrderID: 99002, ProductID: 702, UnitPrice: 32, Quantity: 55, Discount: 0.05 },
    { OrderID: 99003, ProductID: 703, UnitPrice: 48, Quantity: 20, Discount: 0 },
    { OrderID: 99004, ProductID: 704, UnitPrice: 95, Quantity: 18, Discount: 0 },
    { OrderID: 99005, ProductID: 705, UnitPrice: 68, Quantity: 24, Discount: 0.02 }
  ],
  stock_movements: [
    { MovementID: 6001, ProductID: 701, Quantity: 60, MovementType: 'purchase_entry', Reason: 'Reabasto marzo', ReferenceID: 7801, ReferenceType: 'purchase_request', EmployeeID: 202, StockBefore: 80, StockAfter: 140, CreatedAt: '2025-03-04T08:30:00Z' },
    { MovementID: 6002, ProductID: 702, Quantity: 40, MovementType: 'warehouse_exit', Reason: 'Muestra feria', ReferenceID: null, ReferenceType: null, EmployeeID: 204, StockBefore: 120, StockAfter: 80, CreatedAt: '2025-03-05T16:10:00Z' },
    { MovementID: 6003, ProductID: 703, Quantity: 20, MovementType: 'sale_exit', Reason: 'Orden 99003', ReferenceID: 99003, ReferenceType: 'order', EmployeeID: 202, StockBefore: 74, StockAfter: 54, CreatedAt: '2025-03-10T15:45:00Z' },
    { MovementID: 6004, ProductID: 704, Quantity: 18, MovementType: 'sale_exit', Reason: 'Orden 99004', ReferenceID: 99004, ReferenceType: 'order', EmployeeID: 201, StockBefore: 56, StockAfter: 38, CreatedAt: '2025-03-12T19:05:00Z' },
    { MovementID: 6005, ProductID: 705, Quantity: 24, MovementType: 'sale_exit', Reason: 'Orden 99005', ReferenceID: 99005, ReferenceType: 'order', EmployeeID: 204, StockBefore: 86, StockAfter: 62, CreatedAt: '2025-03-15T13:20:00Z' }
  ],
  purchase_requests: [
    { RequestID: 7801, SupplierID: 401, EmployeeID: 202, RequestDate: '2025-03-02T10:00:00Z', Status: 'received', Notes: 'Lote energia frio listo' },
    { RequestID: 7802, SupplierID: 402, EmployeeID: 204, RequestDate: '2025-03-04T14:20:00Z', Status: 'sent', Notes: 'Snacks con etiqueta inglesa' },
    { RequestID: 7803, SupplierID: 403, EmployeeID: 202, RequestDate: '2025-03-07T09:15:00Z', Status: 'pending', Notes: 'Pan cacao nibs semana 12' },
    { RequestID: 7804, SupplierID: 404, EmployeeID: 205, RequestDate: '2025-03-09T11:05:00Z', Status: 'pending', Notes: 'Serum spa weekend' },
    { RequestID: 7805, SupplierID: 405, EmployeeID: 201, RequestDate: '2025-03-11T17:45:00Z', Status: 'sent', Notes: 'Salsa fusion costa' }
  ],
  purchase_request_details: [
    { RequestDetailID: 8801, RequestID: 7801, ProductID: 701, Quantity: 120, UnitPrice: 21, Notes: 'Incluye 10 por ciento bonificacion' },
    { RequestDetailID: 8802, RequestID: 7802, ProductID: 702, Quantity: 90, UnitPrice: 30.5, Notes: 'Empaque bilingue' },
    { RequestDetailID: 8803, RequestID: 7803, ProductID: 703, Quantity: 60, UnitPrice: 45, Notes: 'Agregar especias andinas' },
    { RequestDetailID: 8804, RequestID: 7804, ProductID: 704, Quantity: 40, UnitPrice: 88, Notes: 'Tester incluidos' },
    { RequestDetailID: 8805, RequestID: 7805, ProductID: 705, Quantity: 70, UnitPrice: 64, Notes: 'Botella con etiqueta marina' }
  ]
};

const resolvePkColumns = (tableKey) => {
  const def = tableConfig[tableKey];
  if (!def?.primaryKey?.length) {
    return [];
  }
  return def.primaryKey.map((pk) => pk.column);
};

const buildDocId = (tableKey, record) => {
  const pkColumns = resolvePkColumns(tableKey);
  if (!pkColumns.length) {
    const firstKey = Object.keys(record)[0];
    if (!firstKey) {
      throw new Error(`No se pudo determinar la PK para ${tableKey}`);
    }
    return String(record[firstKey]);
  }
  const parts = pkColumns.map((column) => {
    if (record[column] === undefined || record[column] === null) {
      throw new Error(`El registro de ${tableKey} no incluye la PK ${column}`);
    }
    return record[column];
  });
  return parts.join('_');
};

const main = async () => {
  const db = getDb();
  if (!db) {
    console.error('Firebase no esta configurado. Revisa tus variables de entorno.');
    process.exit(1);
  }
  const cliTables = process.argv.slice(2);
  const tablesToSeed = cliTables.length ? cliTables : Object.keys(sampleData);
  for (const tableKey of tablesToSeed) {
    const entries = sampleData[tableKey];
    if (!entries?.length) {
      console.warn(`No hay datos de prueba definidos para "${tableKey}"`);
      continue;
    }
    const collectionName = tableConfig[tableKey]?.table || tableKey;
    console.log(`\n==> ${collectionName}: escribiendo ${entries.length} documentos`);
    for (const entry of entries) {
      const docId = buildDocId(tableKey, entry);
      await db.collection(collectionName).doc(String(docId)).set(entry, { merge: false });
      console.log(`   guardado ${collectionName}/${docId}`);
    }
  }
  console.log('\nDatos de prueba cargados en Firestore.');
  process.exit(0);
};

main().catch((err) => {
  console.error('Error sembrando datos:', err);
  process.exit(1);
});
