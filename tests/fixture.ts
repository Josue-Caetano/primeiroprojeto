// Backup sintético pequeno que cobre as três gerações de venda do app antigo
// (sem payments; com payments; com payments + productType + saleMode) e "Múltiplos".
export const fixture = {
  products: [
    { id: 'p1', type: 'Suco', name: 'Suco de maracujá ', price: 10, cost: 2.16, createdAt: '2026-04-18T19:43:34.476Z' },
    { id: 'p2', type: 'Salgado', name: 'Salgado Assado ', price: 10, cost: 2.7, createdAt: '2026-04-19T19:19:10.073Z', saleMode: 'unit' },
  ],
  sales: [
    { id: 's1', batchId: 'b1', productId: 'p2', productName: 'Salgado Assado ', qty: 4, method: 'pix', grossValue: 36, costValue: 10.12, feeValue: 0, netProfit: 25.880000000000003, date: '2026-04-20T11:35:17.571Z' },
    { id: 's2', batchId: 'b1', productId: 'p1', productName: 'Suco de maracujá ', qty: 1, method: 'pix', grossValue: 9, costValue: 2.25, feeValue: 0, netProfit: 6.75, date: '2026-04-20T11:35:17.596Z' },
    { id: 's3', batchId: 'b2', productId: 'p1', productName: 'Suco de maracujá ', qty: 1, method: 'Múltiplos', payments: [{ method: 'pix', value: 5 }, { method: 'debito', value: 5 }], grossValue: 10, costValue: 2.2, feeValue: 0.06, netProfit: 7.74, date: '2026-06-08T11:49:44.379Z' },
    { id: 's4', batchId: 'b3', productId: 'p2', productName: 'Salgado Assado ', productType: 'Salgado', qty: 2, saleMode: 'unit', method: 'credito', payments: [{ method: 'credito', value: 20 }], grossValue: 20, costValue: 5.4, feeValue: 0.98, netProfit: 13.62, date: '2026-10-06T21:17:34.237Z' },
  ],
  insumos: [
    { id: 'i1', name: 'Maracujá ', price: 50, weight: 1950, unit: 'g' },
    { id: 'i2', name: 'Açúcar ', price: 13.99, weight: 5000, unit: 'g' },
    { id: 'i3', name: 'Limão ', price: 5.99, weight: 1000, unit: 'g' },
    { id: 'i4', name: 'Maionese ', price: 15.6, weight: 1000, unit: 'g' },
  ],
  recipes: [
    { id: 'r1', name: 'Suco de maracujá ', ingredients: [{ insumoId: 'i1', qty: 1350 }, { insumoId: 'i2', qty: 2000 }, { insumoId: 'i3', qty: 180 }], opFeePercentage: 25, markup: 4, packagingCost: 1.065, yieldQty: 47, unitCost: 2.16, suggestedPrice: 8.64, linkedProductId: 'p1' },
    { id: 'r2', name: 'Maionese caseira ', ingredients: [{ insumoId: 'i4', qty: 330 }], opFeePercentage: 25, markup: 2, packagingCost: 0.69, yieldQty: 1, unitCost: 7.13, suggestedPrice: 14.26 },
  ],
  settings: { feeDebit: 1.91, feeCredit: 4.91, feePix: 0.49, storeName: 'Loja Teste', userName: 'Fulano', categories: ['Salgado', 'Suco'] },
  auth: { passwordHash: btoa('1234'), createdAt: '2026-06-18T22:03:27.776Z' },
  exportDate: '2026-10-06T22:56:13.815Z',
};
