/**
 * firebaseSync.js
 * Sincronización en paralelo con Firestore.
 * Todas las operaciones son "fire-and-forget": si Firebase falla,
 * el error solo se registra en consola y MySQL continúa normalmente.
 */

import { getDb } from '../config/firebase.js';

/**
 * Convierte un pk payload a un string para usar como ID de documento.
 * Ejemplo: { CustomerID: 5 } → "5"
 *          { OrderID: 10, ProductID: 3 } → "10_3"
 */
const buildDocId = (pkPayload) =>
  Object.values(pkPayload).join('_');

/**
 * Guarda o actualiza un documento en Firestore.
 * @param {string} collection  - Nombre de la colección (= nombre de la tabla)
 * @param {string} docId       - ID del documento
 * @param {object} data        - Datos a guardar
 */
const upsert = async (collection, docId, data) => {
  const db = getDb();
  if (!db) return;                          // Firebase desactivado
  try {
    // merge: true → actualiza solo los campos enviados sin borrar los demás
    await db.collection(collection).doc(docId).set(data, { merge: true });
  } catch (err) {
    console.error(`[Firebase] Error al guardar ${collection}/${docId}:`, err.message);
  }
};

/**
 * Elimina un documento de Firestore.
 * @param {string} collection
 * @param {string} docId
 */
const remove = async (collection, docId) => {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection(collection).doc(docId).delete();
  } catch (err) {
    console.error(`[Firebase] Error al eliminar ${collection}/${docId}:`, err.message);
  }
};

/**
 * Sincroniza un registro creado/actualizado con Firestore.
 * @param {string} tableKey   - Clave de la tabla (ej: "customers")
 * @param {string} tableName  - Nombre real de la tabla MySQL (ej: "Customers")
 * @param {object} pkPayload  - Valores de la clave primaria
 * @param {object} record     - Registro completo a guardar
 */
export const syncUpsert = (tableKey, tableName, pkPayload, record) => {
  const docId = buildDocId(pkPayload);
  // Ejecutar sin await para no bloquear la respuesta HTTP
  upsert(tableName, docId, record);
};

/**
 * Sincroniza una eliminación con Firestore.
 * @param {string} tableName  - Nombre real de la tabla MySQL
 * @param {object} pkPayload  - Valores de la clave primaria
 */
export const syncDelete = (tableName, pkPayload) => {
  const docId = buildDocId(pkPayload);
  remove(tableName, docId);
};
