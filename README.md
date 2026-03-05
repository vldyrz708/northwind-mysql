# Northwind CRUD (Node.js + MySQL)

Aplicación full-stack construida con Express y MySQL que expone un CRUD completo y dinámico para todas las tablas del clásico esquema Northwind. Incluye una colección de interfaces web (`public/*.html`) para administrar entidades específicas o trabajar en modo multi-tabla.

## Requisitos

- Node.js 18+
- Una instancia MySQL con la base de datos `northwind` cargada

## Configuración

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Crea el archivo `.env` a partir de `.env.example` y ajusta las credenciales:
   ```bash
   cp .env.example .env
   # Edita DB_USER, DB_PASSWORD, etc.
   ```
3. Ejecuta el servidor:
   ```bash
   npm run dev
   # o npm start
   ```
4. Abre http://localhost:3000 para ver el nuevo **Northwind Control Room** y elige el módulo (productos, órdenes, clientes, etc.).

### Frontend disponible

- `public/index.html` → landing con accesos rápidos a cada módulo.
- `public/studio.html` → panel universal que permite cambiar de tabla desde un solo lugar.
- `public/products.html`, `orders.html`, `order-details.html`, `customers.html`, `suppliers.html`, `employees.html`, `categories.html`, `shippers.html` → vistas dedicadas con el CRUD totalmente operativo.

## Endpoints principales

- `GET /api/meta` → devuelve el catálogo de tablas/columnas disponible.
- `GET /api/:table` → lista paginada con filtros `page`, `pageSize`, `search`.
- `GET /api/:table/record?pk=value` → obtiene un registro por llave primaria.
- `POST /api/:table` → crea un registro.
- `PUT /api/:table` → actualiza (el cuerpo debe incluir la llave primaria).
- `DELETE /api/:table` → elimina (requiere llave primaria en el cuerpo).
- `GET /api/:table/options` → opciones precargadas para campos foráneos.

Las llaves primarias compuestas se envían como pares `campo=valor` (en query o cuerpo). Ejemplo para `order_details`:
```json
{
  "OrderID": 10248,
  "ProductID": 11,
  "Quantity": 20,
  "UnitPrice": 14.0
}
```

## Personalización

- Ajusta `src/data/tableConfig.js` para agregar, renombrar o restringir columnas.
- Modifica `src/utils/sqlBuilder.js` si necesitas reglas SQL avanzadas (joins, filtros, etc.).
- El frontend usa fetch y componentes nativos; puedes conectar otro framework o generar páginas adicionales duplicando la estructura base en `public`.

## Seguridad

- Este proyecto es sólo una base educativa. Para producción añade autenticación, validación avanzada, versionado de migraciones y pruebas automatizadas.
