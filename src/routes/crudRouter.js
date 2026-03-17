import { Router } from 'express';
import {
  getMetadata,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getForeignOptions,
  getImageBlob
} from '../services/crudService.js';

const router = Router();

router.get('/meta', (_req, res) => {
  res.json(getMetadata());
});

router.get('/:table/image/:column', async (req, res, next) => {
  try {
    const { table, column } = req.params;
    let buf = await getImageBlob(table, column, req.query);
    if (!buf || !buf.length) { return res.status(404).end(); }
    // Strip OLE object header present in some Northwind exports (78-byte prefix)
    if (buf.length > 78 && buf[0] === 0x15 && buf[1] === 0x1c) { buf = buf.subarray(78); }
    // Detect image type from magic bytes
    let contentType = 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) { contentType = 'image/png'; }
    else if (buf[0] === 0x47 && buf[1] === 0x49) { contentType = 'image/gif'; }
    else if (buf[0] === 0x42 && buf[1] === 0x4d) { contentType = 'image/bmp'; }
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' });
    return res.send(buf);
  } catch (error) {
    next(error);
  }
});

router.get('/:table/options', async (req, res, next) => {
  try {
    const options = await getForeignOptions(req.params.table);
    res.json(options);
  } catch (error) {
    next(error);
  }
});

router.get('/:table', async (req, res, next) => {
  try {
    const { table } = req.params;
    const { page, pageSize, search } = req.query;
    const payload = await listRecords(table, { page, pageSize, search });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/:table/record', async (req, res, next) => {
  try {
    const payload = await getRecord(req.params.table, req.query);
    if (!payload) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/:table', async (req, res, next) => {
  try {
    const record = await createRecord(req.params.table, req.body);
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.put('/:table', async (req, res, next) => {
  try {
    const record = await updateRecord(req.params.table, req.body);
    res.json(record);
  } catch (error) {
    next(error);
  }
});

router.delete('/:table', async (req, res, next) => {
  try {
    const result = await deleteRecord(req.params.table, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
