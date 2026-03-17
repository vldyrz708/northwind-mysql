-- =============================================================================
-- Migration 001 – Restore AUTO_INCREMENT on Northwind identity columns
-- =============================================================================
-- In the original Northwind model (SQL Server IDENTITY / Access AutoNumber),
-- these six columns are auto-generated surrogate keys. The MariaDB/MySQL import
-- that was used to load this database omitted the AUTO_INCREMENT attribute.
-- As a result, tableConfig.js marks them as `auto: true` but the database
-- cannot generate a new value on INSERT, causing every CREATE operation for
-- these entities to fail.
--
-- MariaDB 10.4 requires the AUTO_INCREMENT starting value to be set in the
-- same ALTER TABLE statement; otherwise it resequences from 1 and causes a
-- duplicate-key error on the existing row with id=1.
-- Replace the AUTO_INCREMENT=N values with MAX(pk)+1 for your actual data.
--
-- Run once:
--   mysql -u <user> -p northwind < migrations/001_add_auto_increment.sql
-- =============================================================================

USE northwind;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. categories.CategoryID
--    Replace N with SELECT MAX(CategoryID)+1 FROM categories
ALTER TABLE `categories`
  MODIFY `CategoryID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 9;

-- 2. suppliers.SupplierID
ALTER TABLE `suppliers`
  MODIFY `SupplierID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 30;

-- 3. products.ProductID
ALTER TABLE `products`
  MODIFY `ProductID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 78;

-- 4. shippers.ShipperID
ALTER TABLE `shippers`
  MODIFY `ShipperID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 4;

-- 5. employees.EmployeeID
ALTER TABLE `employees`
  MODIFY `EmployeeID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 10;

-- 6. orders.OrderID
ALTER TABLE `orders`
  MODIFY `OrderID` INT NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT = 11078;

SET FOREIGN_KEY_CHECKS = 1;

-- Verify results
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_KEY = 'PRI'
  AND TABLE_NAME IN ('categories','suppliers','products','shippers','employees','orders')
ORDER BY TABLE_NAME;
