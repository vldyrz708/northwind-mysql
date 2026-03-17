-- =============================================================================
-- Migration 003 – Inventory exit traceability
-- Adds StockBefore / StockAfter / ReferenceType to stock_movements so every
-- movement records the exact stock level before and after it was applied,
-- and so ReferenceID can be distinguished by type (order | purchase_request).
--
-- Run once:
--   mysql -u <user> -p northwind < migrations/003_inventory_exit_traceability.sql
-- =============================================================================

USE northwind;

-- Add traceability columns (safe to run on a fresh install that already has the
-- columns defined via this migration – duplicate-column errors indicate the
-- migration was already applied, which is harmless to ignore).

ALTER TABLE `stock_movements`
  ADD COLUMN `StockBefore`   INT         NULL DEFAULT NULL
    COMMENT 'UnitsInStock before this movement was applied'
    AFTER `EmployeeID`,
  ADD COLUMN `StockAfter`    INT         NULL DEFAULT NULL
    COMMENT 'UnitsInStock after this movement was applied'
    AFTER `StockBefore`,
  ADD COLUMN `ReferenceType` VARCHAR(30) NULL DEFAULT NULL
    COMMENT 'order | purchase_request – qualifies the ReferenceID'
    AFTER `ReferenceID`;

-- Index to speed up lookups by ReferenceID (e.g. "all movements for order X")
ALTER TABLE `stock_movements`
  ADD INDEX `idx_sm_reference` (`ReferenceID`);
