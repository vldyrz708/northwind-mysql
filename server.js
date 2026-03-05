import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import crudRouter from './src/routes/crudRouter.js';
import { testConnection } from './src/config/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.APP_PORT || 3000;

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

app.use('/api', crudRouter);

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor'
  });
});

const start = async () => {
  try {
    await testConnection();
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
