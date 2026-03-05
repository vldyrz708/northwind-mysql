const tableConfig = {
  categories: {
    table: 'categories',
    label: 'Categorías',
    primaryKey: [{ column: 'CategoryID', type: 'number', auto: true }],
    columns: [
      { column: 'CategoryName', label: 'Nombre', type: 'string', required: true },
      { column: 'Description', label: 'Descripción', type: 'text' },
      { column: 'Picture', label: 'Imagen', type: 'file', accept: 'image/*' }
    ]
  },
  suppliers: {
    table: 'suppliers',
    label: 'Proveedores',
    primaryKey: [{ column: 'SupplierID', type: 'number', auto: true }],
    columns: [
      { column: 'CompanyName', label: 'Empresa', type: 'string', required: true },
      { column: 'ContactName', label: 'Nombre del contacto', type: 'string' },
      { column: 'ContactTitle', label: 'Cargo del contacto', type: 'string' },
      { column: 'Address', label: 'Dirección', type: 'string' },
      { column: 'City', label: 'Ciudad', type: 'string' },
      { column: 'Region', label: 'Región', type: 'string' },
      { column: 'PostalCode', label: 'Código postal', type: 'string' },
      { column: 'Country', label: 'País', type: 'string' },
      { column: 'Phone', label: 'Teléfono', type: 'string' },
      { column: 'Fax', label: 'Fax', type: 'string' },
      { column: 'HomePage', label: 'Sitio web', type: 'text' }
    ]
  },
  products: {
    table: 'products',
    label: 'Productos',
    primaryKey: [{ column: 'ProductID', type: 'number', auto: true }],
    columns: [
      { column: 'ProductName', label: 'Nombre', type: 'string', required: true },
      { column: 'SupplierID', label: 'Proveedor', type: 'number', required: true, foreignKey: { tableKey: 'suppliers', value: 'SupplierID', label: 'CompanyName' } },
      { column: 'CategoryID', label: 'Categoría', type: 'number', required: true, foreignKey: { tableKey: 'categories', value: 'CategoryID', label: 'CategoryName' } },
      { column: 'QuantityPerUnit', label: 'Presentación', type: 'string' },
      { column: 'UnitPrice', label: 'Precio unitario', type: 'number' },
      { column: 'UnitsInStock', label: 'Unidades en inventario', type: 'number' },
      { column: 'UnitsOnOrder', label: 'Unidades en pedido', type: 'number' },
      { column: 'ReorderLevel', label: 'Nivel de reorden', type: 'number' },
      { column: 'Discontinued', label: 'Descontinuado', type: 'boolean', default: 0 }
    ]
  },
  customers: {
    table: 'customers',
    label: 'Clientes',
    primaryKey: [{ column: 'CustomerID', type: 'string', length: 5 }],
    columns: [
      { column: 'CompanyName', label: 'Compañía', type: 'string', required: true },
      { column: 'ContactName', label: 'Nombre del contacto', type: 'string' },
      { column: 'ContactTitle', label: 'Cargo del contacto', type: 'string' },
      { column: 'Address', label: 'Dirección', type: 'string' },
      { column: 'City', label: 'Ciudad', type: 'string' },
      { column: 'Region', label: 'Región', type: 'string' },
      { column: 'PostalCode', label: 'Código postal', type: 'string' },
      { column: 'Country', label: 'País', type: 'string' },
      { column: 'Phone', label: 'Teléfono', type: 'string' },
      { column: 'Fax', label: 'Fax', type: 'string' }
    ]
  },
  shippers: {
    table: 'shippers',
    label: 'Transportistas',
    primaryKey: [{ column: 'ShipperID', type: 'number', auto: true }],
    columns: [
      { column: 'CompanyName', label: 'Empresa', type: 'string', required: true },
      { column: 'Phone', label: 'Teléfono', type: 'string' }
    ]
  },
  employees: {
    table: 'employees',
    label: 'Empleados',
    primaryKey: [{ column: 'EmployeeID', type: 'number', auto: true }],
    columns: [
      { column: 'LastName', label: 'Apellido', type: 'string', required: true },
      { column: 'FirstName', label: 'Nombre', type: 'string', required: true },
      { column: 'Title', label: 'Puesto', type: 'string' },
      { column: 'TitleOfCourtesy', label: 'Tratamiento', type: 'string' },
      { column: 'BirthDate', label: 'Fecha de nacimiento', type: 'date' },
      { column: 'HireDate', label: 'Fecha de contratación', type: 'date' },
      { column: 'Address', label: 'Dirección', type: 'string' },
      { column: 'City', label: 'Ciudad', type: 'string' },
      { column: 'Region', label: 'Región', type: 'string' },
      { column: 'PostalCode', label: 'Código postal', type: 'string' },
      { column: 'Country', label: 'País', type: 'string' },
      { column: 'HomePhone', label: 'Teléfono casa', type: 'string' },
      { column: 'Extension', label: 'Extensión', type: 'string' },
      { column: 'Photo', label: 'Foto', type: 'file', accept: 'image/*' },
      { column: 'Notes', label: 'Notas', type: 'text' },
      { column: 'ReportsTo', label: 'Reporta a', type: 'number', foreignKey: { tableKey: 'employees', value: 'EmployeeID', label: 'LastName' } },
      { column: 'PhotoPath', label: 'Ruta de foto', type: 'string' }
    ]
  },
  orders: {
    table: 'orders',
    label: 'Órdenes',
    primaryKey: [{ column: 'OrderID', type: 'number', auto: true }],
    columns: [
      { column: 'CustomerID', label: 'Cliente', type: 'string', foreignKey: { tableKey: 'customers', value: 'CustomerID', label: 'CompanyName' } },
      { column: 'EmployeeID', label: 'Empleado', type: 'number', foreignKey: { tableKey: 'employees', value: 'EmployeeID', label: 'LastName' } },
      { column: 'OrderDate', label: 'Fecha de orden', type: 'date' },
      { column: 'RequiredDate', label: 'Fecha requerida', type: 'date' },
      { column: 'ShippedDate', label: 'Fecha de envío', type: 'date' },
      { column: 'ShipVia', label: 'Envío vía', type: 'number', foreignKey: { tableKey: 'shippers', value: 'ShipperID', label: 'CompanyName' } },
      { column: 'Freight', label: 'Flete', type: 'number' },
      { column: 'ShipName', label: 'Nombre destino', type: 'string' },
      { column: 'ShipAddress', label: 'Dirección destino', type: 'string' },
      { column: 'ShipCity', label: 'Ciudad destino', type: 'string' },
      { column: 'ShipRegion', label: 'Región destino', type: 'string' },
      { column: 'ShipPostalCode', label: 'Código postal destino', type: 'string' },
      { column: 'ShipCountry', label: 'País destino', type: 'string' }
    ]
  },
  order_details: {
    table: 'order_details',
    label: 'Detalle de órdenes',
    primaryKey: [
      { column: 'OrderID', type: 'number' },
      { column: 'ProductID', type: 'number' }
    ],
    columns: [
      { column: 'UnitPrice', label: 'Precio unitario', type: 'number', required: true },
      { column: 'Quantity', label: 'Cantidad', type: 'number', required: true },
      { column: 'Discount', label: 'Descuento', type: 'number', step: 0.01 }
    ],
    foreignKeyDefaults: {
      OrderID: { tableKey: 'orders', value: 'OrderID', label: 'OrderID' },
      ProductID: { tableKey: 'products', value: 'ProductID', label: 'ProductName' }
    }
  },
  regions: {
    table: 'region',
    label: 'Regiones',
    primaryKey: [{ column: 'RegionID', type: 'number' }],
    columns: [
      { column: 'RegionDescription', label: 'Descripción', type: 'string', required: true }
    ]
  },
  territories: {
    table: 'territories',
    label: 'Territorios',
    primaryKey: [{ column: 'TerritoryID', type: 'string', length: 20 }],
    columns: [
      { column: 'TerritoryDescription', label: 'Descripción', type: 'string', required: true },
      { column: 'RegionID', label: 'Región', type: 'number', required: true, foreignKey: { tableKey: 'regions', value: 'RegionID', label: 'RegionDescription' } }
    ]
  },
  employee_territories: {
    table: 'employee_territories',
    label: 'Zonas por empleado',
    primaryKey: [
      { column: 'EmployeeID', type: 'number' },
      { column: 'TerritoryID', type: 'string' }
    ],
    columns: [],
    foreignKeyDefaults: {
      EmployeeID: { tableKey: 'employees', value: 'EmployeeID', label: 'LastName' },
      TerritoryID: { tableKey: 'territories', value: 'TerritoryID', label: 'TerritoryDescription' }
    }
  },
  customerdemographics: {
    table: 'customerdemographics',
    label: 'Segmentos de clientes',
    primaryKey: [{ column: 'CustomerTypeID', type: 'string' }],
    columns: [
      { column: 'CustomerDesc', label: 'Descripción', type: 'text' }
    ]
  },
  customercustomerdemo: {
    table: 'customercustomerdemo',
    label: 'Relación cliente-segmento',
    primaryKey: [
      { column: 'CustomerID', type: 'string' },
      { column: 'CustomerTypeID', type: 'string' }
    ],
    columns: [],
    foreignKeyDefaults: {
      CustomerID: { tableKey: 'customers', value: 'CustomerID', label: 'CompanyName' },
      CustomerTypeID: { tableKey: 'customerdemographics', value: 'CustomerTypeID', label: 'CustomerTypeID' }
    }
  }
};

export default tableConfig;
