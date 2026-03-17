import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import crudRouter from './src/routes/crudRouter.js';
import inventoryRouter from './src/routes/inventoryRouter.js';
import salesRouter from './src/routes/salesRouter.js';
import purchaseRequestRouter from './src/routes/purchaseRequestRouter.js';
import pdfRouter from './src/routes/pdfRouter.js';
import { testConnection } from './src/config/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PREFERRED_PORT = Number(process.env.APP_PORT || process.env.PORT || 3000) || 3000;
const MAX_PORT_ATTEMPTS = 10;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', async (_req, res, next) => {
  try {
    await testConnection();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

// Specialized routers must be mounted BEFORE generic crudRouter
// to prevent /:table from swallowing their paths
app.use('/api/inventory', inventoryRouter);
app.use('/api/sales', salesRouter);
app.use('/api/purchase-requests', purchaseRequestRouter);
app.use('/api/pdf', pdfRouter);
// Generic CRUD router (handles /api/:table for all table configs)
app.use('/api', crudRouter);

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor'
  });
});

const listenOnPort = (port) => new Promise((resolve, reject) => {
  const server = http.createServer(app);
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      resolve(null);
    } else {
      reject(error);
    }
  });
  server.once('listening', () => resolve(server));
  server.listen(port);
});

const start = async () => {
  try {
    await testConnection();
    let port = PREFERRED_PORT;
    let attempt = 0;
    while (attempt < MAX_PORT_ATTEMPTS) {
      const server = await listenOnPort(port);
      if (server) {
        if (port !== PREFERRED_PORT) {
          console.warn(`Puerto ${PREFERRED_PORT} en uso, cambiando a ${port}`);
        }
        console.log(`Servidor listo en http://localhost:${port}`);
        server.on('close', () => console.log('Servidor detenido.'));
        return;
      }
      console.warn(`Puerto ${port} ocupado. Intentando ${port + 1}...`);
      port += 1;
      attempt += 1;
    }
    throw new Error(`No se encontró un puerto disponible tras ${MAX_PORT_ATTEMPTS} intentos.`);
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
