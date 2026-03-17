import { Router } from 'express';
import { getStock, listMovements, registerExit } from '../services/inventoryService.js';

const router = Router();

/** GET /api/inventory/stock?page=&pageSize=&search= */
router.get('/stock', async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.query;
    res.json(await getStock({ page, pageSize, search }));
  } catch (e) { next(e); }
});

/** GET /api/inventory/movements?page=&pageSize= */
router.get('/movements', async (req, res, next) => {
  try {
    const { page, pageSize } = req.query;
    res.json(await listMovements({ page, pageSize }));
  } catch (e) { next(e); }
});

/**
 * POST /api/inventory/exit
 * Body: { ProductID, Quantity, Reason, EmployeeID, MovementType, ReferenceID, ReferenceType }
 *
 * MovementType: warehouse_exit | adjustment | sale_exit  (default: warehouse_exit)
 * ReferenceID:  optional OrderID or RequestID this exit is linked to
 * ReferenceType: 'order' | 'purchase_request' – qualifies ReferenceID
 */
router.post('/exit', async (req, res, next) => {
  try {
    const { ProductID, Quantity, Reason, EmployeeID, MovementType, ReferenceID, ReferenceType } = req.body;
    if (!ProductID || !Quantity || Number(Quantity) <= 0) {
      return res.status(400).json({ message: 'ProductID y Quantity > 0 son requeridos' });
    }
    const validTypes = ['warehouse_exit', 'adjustment', 'sale_exit'];
    const movType = validTypes.includes(MovementType) ? MovementType : 'warehouse_exit';
    const movement = await registerExit({
      ProductID:     Number(ProductID),
      Quantity:      Number(Quantity),
      Reason,
      EmployeeID:    EmployeeID    ? Number(EmployeeID)    : null,
      type:          movType,
      referenceId:   ReferenceID  ? Number(ReferenceID)   : null,
      referenceType: ReferenceType || null,
    });
    res.status(201).json(movement);
  } catch (e) { next(e); }
});

export default router;
