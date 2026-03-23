/**
 * test-firebase.js
 * Script de prueba de conexión con Firebase Firestore.
 * Ejecutar con: node test-firebase.js
 * No modifica ningún dato de producción (usa la colección "_test_conexion").
 */

import dotenv from 'dotenv';
dotenv.config();

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY
} = process.env;

console.log('\n══════════════════════════════════════════');
console.log('  PRUEBA DE CONEXIÓN FIREBASE FIRESTORE');
console.log('══════════════════════════════════════════\n');

// 1. Validar variables de entorno
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('❌ Variables de entorno de Firebase no encontradas en .env');
  process.exit(1);
}

console.log(`✅ Variables cargadas`);
console.log(`   Proyecto  : ${FIREBASE_PROJECT_ID}`);
console.log(`   Email     : ${FIREBASE_CLIENT_EMAIL}\n`);

// 2. Inicializar Firebase Admin
let app, db;
try {
  app = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  db = getFirestore(app);
  console.log('✅ Firebase Admin inicializado\n');
} catch (err) {
  console.error('❌ Error al inicializar Firebase:', err.message);
  process.exit(1);
}

// 3. Escribir documento de prueba
const COLLECTION = '_test_conexion';
const DOC_ID = 'ping';
const payload = {
  mensaje: 'Conexión exitosa desde el proyecto Northwind-MySQL',
  proyecto: FIREBASE_PROJECT_ID,
  timestamp: new Date().toISOString()
};

try {
  console.log(`📝 Escribiendo documento en ${COLLECTION}/${DOC_ID} ...`);
  await db.collection(COLLECTION).doc(DOC_ID).set(payload);
  console.log('✅ Documento escrito correctamente\n');
} catch (err) {
  console.error('❌ Error al escribir en Firestore:', err.message);
  process.exit(1);
}

// 4. Leer el documento de vuelta
try {
  console.log(`📖 Leyendo documento ${COLLECTION}/${DOC_ID} ...`);
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) throw new Error('El documento no existe después de escribirlo');
  const data = snap.data();
  console.log('✅ Documento leído correctamente:');
  console.log('  ', JSON.stringify(data, null, 2).replace(/\n/g, '\n   '), '\n');
} catch (err) {
  console.error('❌ Error al leer de Firestore:', err.message);
  process.exit(1);
}

// 5. Eliminar el documento de prueba
try {
  console.log(`🗑️  Eliminando documento de prueba ...`);
  await db.collection(COLLECTION).doc(DOC_ID).delete();
  console.log('✅ Documento eliminado\n');
} catch (err) {
  console.error('❌ Error al eliminar documento:', err.message);
  process.exit(1);
}

console.log('══════════════════════════════════════════');
console.log('  🎉 CONEXIÓN CON FIREBASE VERIFICADA OK');
console.log('══════════════════════════════════════════\n');
process.exit(0);
