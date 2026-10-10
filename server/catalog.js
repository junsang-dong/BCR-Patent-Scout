import catalog from "../data/product-features.json" with { type: "json" };
export default catalog;
export const productOf = code => catalog.products.find(p => p.code === code);
export const featuresOf = (code, ids) => {
  const p = productOf(code);
  return ids.map(id => p?.features.find(f => f.id === id)).filter(Boolean);
};
