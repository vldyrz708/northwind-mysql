import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db = null;

const initFirebase = () => {
  if (db) return db;

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY
  } = process.env;

  // Si no están configuradas las variables, Firebase queda desactivado
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('[Firebase] Variables de entorno no configuradas. La sincronización con Firebase está desactivada.');
    return null;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // Las variables de entorno escapan \n, hay que reemplazarlas
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }

  db = getFirestore();
  console.log('[Firebase] Conexión inicializada correctamente.');
  return db;
};

export const getDb = () => {
  if (!db) return initFirebase();
  return db;
};
