import { Router } from 'express';
import { listRequests, getRequest, createRequest, updateRequestStatus } from '../services/purchaseRequestService.js';

const router = Router();

/** GET /api/purchase-requests?page=&pageSize= */
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize } = req.query;
    res.json(await listRequests({ page, pageSize }));
  } catch (e) { next(e); }
});

/** GET /api/purchase-requests/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const request = await getRequest(Number(req.params.id));
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    res.json(request);
  } catch (e) { next(e); }
});

/**
 * POST /api/purchase-requests
 * Body: {
 *   SupplierID, EmployeeID, Notes,
 *   items: [{ ProductID, Quantity, UnitPrice, Notes }]
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { SupplierID, EmployeeID, Notes, items } = req.body;
    if (!SupplierID) return res.status(400).json({ message: 'SupplierID es requerido' });
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Se requiere al menos un producto' });
    }
    const request = await createRequest({ SupplierID: Number(SupplierID), EmployeeID: EmployeeID ? Number(EmployeeID) : null, Notes, items });
    res.status(201).json(request);
  } catch (e) { next(e); }
});

/**
 * PUT /api/purchase-requests/:id/status
 * Body: { status: 'pending'|'sent'|'received'|'cancelled' }
 */
router.put('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'sent', 'received', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: `Estado inválido. Use: ${valid.join(', ')}` });
    }
    const updated = await updateRequestStatus(Number(req.params.id), status);
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
