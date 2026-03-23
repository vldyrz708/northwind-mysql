import { getRecord, updateRecord } from './crudService.js';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const fetchProductOrThrow = async (productId) => {
  const record = await getRecord('products', { ProductID: Number(productId) });
  if (!record) {
    throw Object.assign(new Error(`Producto ${productId} no encontrado`), { status: 404 });
  }
  return record;
};

export const adjustProductStock = async (productId, delta, { forbidNegative = true } = {}) => {
  const product = await fetchProductOrThrow(productId);
  const current = toNumber(product.UnitsInStock);
  const adjustment = toNumber(delta);
  const next = current + adjustment;
  if (forbidNegative && next < 0) {
    throw Object.assign(
      new Error(`Stock insuficiente para "${product.ProductName}". Disponible: ${current}, ajuste: ${adjustment}`),
      { status: 422 }
    );
  }
  await updateRecord('products', { ProductID: Number(productId), UnitsInStock: next });
  return { product, previousStock: current, updatedStock: next };
};
