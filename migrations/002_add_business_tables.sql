-- =============================================================================
-- Migration 002 – Business operation tables
-- Run once:  mysql -u <user> -p northwind < migrations/002_add_business_tables.sql
-- =============================================================================

USE northwind;

-- -----------------------------------------------------------------------------
-- stock_movements: audit trail for every inventory change
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `MovementID`   INT          NOT NULL AUTO_INCREMENT,
  `ProductID`    INT          NOT NULL,
  `Quantity`     INT          NOT NULL COMMENT 'Always positive; direction determined by MovementType',
  `MovementType` VARCHAR(30)  NOT NULL COMMENT 'warehouse_exit | sale_exit | adjustment | purchase_entry',
  `Reason`       VARCHAR(255)              DEFAULT NULL,
  `ReferenceID`  INT                       DEFAULT NULL COMMENT 'OrderID for sale_exit; RequestID for purchase_entry',
  `EmployeeID`   INT                       DEFAULT NULL,
  `CreatedAt`    DATETIME     NOT NULL     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MovementID`),
  KEY `idx_sm_product`  (`ProductID`),
  KEY `idx_sm_employee` (`EmployeeID`),
  KEY `idx_sm_created`  (`CreatedAt`),
  CONSTRAINT `FK_StockMovements_Products`  FOREIGN KEY (`ProductID`)  REFERENCES `products`  (`ProductID`),
  CONSTRAINT `FK_StockMovements_Employees` FOREIGN KEY (`EmployeeID`) REFERENCES `employees` (`EmployeeID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Inventory movement audit log';

-- -----------------------------------------------------------------------------
-- purchase_requests: solicitudes de compra a proveedor
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchase_requests` (
  `RequestID`   INT         NOT NULL AUTO_INCREMENT,
  `SupplierID`  INT         NOT NULL,
  `EmployeeID`  INT                  DEFAULT NULL,
  `RequestDate` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Status`      VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending | sent | received | cancelled',
  `Notes`       TEXT                 DEFAULT NULL,
  PRIMARY KEY (`RequestID`),
  KEY `idx_pr_supplier` (`SupplierID`),
  KEY `idx_pr_employee` (`EmployeeID`),
  KEY `idx_pr_status`   (`Status`),
  CONSTRAINT `FK_PurchaseRequests_Suppliers` FOREIGN KEY (`SupplierID`) REFERENCES `suppliers` (`SupplierID`),
  CONSTRAINT `FK_PurchaseRequests_Employees` FOREIGN KEY (`EmployeeID`) REFERENCES `employees` (`EmployeeID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Purchase requests to suppliers';

-- -----------------------------------------------------------------------------
-- purchase_request_details: line items per request
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchase_request_details` (
  `RequestDetailID` INT            NOT NULL AUTO_INCREMENT,
  `RequestID`       INT            NOT NULL,
  `ProductID`       INT            NOT NULL,
  `Quantity`        INT            NOT NULL,
  `UnitPrice`       DECIMAL(10,2)           DEFAULT NULL,
  `Notes`           VARCHAR(255)            DEFAULT NULL,
  PRIMARY KEY (`RequestDetailID`),
  KEY `idx_prd_request` (`RequestID`),
  KEY `idx_prd_product`  (`ProductID`),
  CONSTRAINT `FK_PRDetails_Requests` FOREIGN KEY (`RequestID`) REFERENCES `purchase_requests` (`RequestID`) ON DELETE CASCADE,
  CONSTRAINT `FK_PRDetails_Products` FOREIGN KEY (`ProductID`) REFERENCES `products`          (`ProductID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Line items for purchase requests';
