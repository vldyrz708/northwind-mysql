import { Router } from 'express';
import { generateSalePdf, generatePurchaseRequestPdf } from '../services/pdfService.js';

const router = Router();

/** GET /api/pdf/sale/:orderId — Nota de venta */
router.get('/sale/:orderId', async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) return res.status(400).json({ message: 'orderId inválido' });
    const doc = await generateSalePdf(orderId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nota-venta-${orderId}.pdf"`,
    });
    doc.pipe(res);
    doc.end();
  } catch (e) { next(e); }
});

/** GET /api/pdf/purchase-request/:requestId — Solicitud de compra */
router.get('/purchase-request/:requestId', async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!requestId) return res.status(400).json({ message: 'requestId inválido' });
    const doc = await generatePurchaseRequestPdf(requestId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="solicitud-compra-${requestId}.pdf"`,
    });
    doc.pipe(res);
    doc.end();
  } catch (e) { next(e); }
});

export default router;
