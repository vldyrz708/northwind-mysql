import { Router } from 'express';
import { listSales, getSale, createSale } from '../services/salesService.js';

const router = Router();

/** GET /api/sales?page=&pageSize=&search= */
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.query;
    res.json(await listSales({ page, pageSize, search }));
  } catch (e) { next(e); }
});

/** GET /api/sales/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const sale = await getSale(Number(req.params.id));
    if (!sale) return res.status(404).json({ message: 'Venta no encontrada' });
    res.json(sale);
  } catch (e) { next(e); }
});

/**
 * POST /api/sales
 * Body: {
 *   order: { CustomerID, EmployeeID, OrderDate, RequiredDate, ShipVia, Freight,
 *             ShipName, ShipAddress, ShipCity, ShipRegion, ShipPostalCode, ShipCountry },
 *   items: [{ ProductID, UnitPrice, Quantity, Discount }]
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { order, items } = req.body;
    if (!order?.CustomerID) {
      return res.status(400).json({ message: 'CustomerID es requerido' });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Se requiere al menos un producto' });
    }
    const sale = await createSale(order, items);
    res.status(201).json(sale);
  } catch (e) { next(e); }
});

export default router;
