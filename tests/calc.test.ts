import { describe, expect, it } from 'vitest';
import { buildSales, byPaymentMethod, computeRecipe, salePayments, splitProportional, totals } from '../src/domain/calc';
import { parseBackup } from '../src/domain/backup';
import type { Product } from '../src/domain/types';
import { fixture } from './fixture';

const b = parseBackup(fixture);
const insumos = new Map(b.insumos.map((i) => [i.id, i]));
const suco = b.products[0] as Product;
const salgado = b.products[1] as Product;

describe('ficha técnica', () => {
  it('reproduz custo unitário e preço sugerido do app antigo', () => {
    for (const r of b.recipes) {
      const c = computeRecipe(r, insumos);
      expect(c.unitCost).toBe(r.unitCost);
      expect(c.suggestedPrice).toBe(r.suggestedPrice);
    }
  });
});

describe('venda', () => {
  it('pagamento único: taxa do método, custo e lucro', () => {
    const sales = buildSales([{ product: salgado, qty: 2, unitPrice: 10 }], [{ method: 'credito', value: 20 }], b.settings);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ method: 'credito', grossValue: 20, costValue: 5.4, feeValue: 0.98, netProfit: 13.62, productType: 'Salgado', saleMode: 'unit' });
  });

  it('carrinho com vários itens compartilha o batchId', () => {
    const sales = buildSales(
      [{ product: salgado, qty: 1, unitPrice: 10 }, { product: suco, qty: 1, unitPrice: 10 }],
      [{ method: 'dinheiro', value: 20 }],
      b.settings,
    );
    expect(new Set(sales.map((s) => s.batchId)).size).toBe(1);
    expect(new Set(sales.map((s) => s.id)).size).toBe(2);
  });

  it('pagamento múltiplo é distribuído proporcionalmente entre os itens', () => {
    const sales = buildSales(
      [{ product: salgado, qty: 3, unitPrice: 10 }, { product: suco, qty: 1, unitPrice: 10 }],
      [{ method: 'dinheiro', value: 8 }, { method: 'credito', value: 32 }],
      b.settings,
    );
    expect(sales.every((s) => s.method === 'Múltiplos')).toBe(true);
    expect(sales[0].payments).toEqual([{ method: 'dinheiro', value: 6 }, { method: 'credito', value: 24 }]);
    expect(sales[1].payments).toEqual([{ method: 'dinheiro', value: 2 }, { method: 'credito', value: 8 }]);
    expect(sales[0].feeValue).toBe(1.18); // 24 × 4,91%
  });

  it('Pix na chave não tem taxa; Pix na maquininha cobra a taxa de Pix', () => {
    const item = [{ product: salgado, qty: 2, unitPrice: 10 }];
    expect(buildSales(item, [{ method: 'pix', value: 20 }], b.settings)[0].feeValue).toBe(0);
    const maq = buildSales(item, [{ method: 'pix_mq', value: 20 }], b.settings)[0];
    expect(maq).toMatchObject({ method: 'pix_mq', feeValue: 0.1 }); // 20 × 0,49%
  });

  it('recusa pagamento diferente do total', () => {
    expect(() => buildSales([{ product: suco, qty: 1, unitPrice: 10 }], [{ method: 'pix', value: 9 }], b.settings)).toThrow();
  });

  it('divisão proporcional não perde centavos', () => {
    const parts = splitProportional(10, [1, 1, 1]);
    expect(parts.reduce((a, c) => a + c, 0)).toBeCloseTo(10, 10);
  });
});

describe('relatórios', () => {
  it('vendas antigas sem payments contam no método da venda', () => {
    expect(salePayments(b.sales[0])).toEqual([{ method: 'pix', value: 36 }]);
    const m = Object.fromEntries(byPaymentMethod(b.sales).map((x) => [x.method, x.value]));
    expect(m).toEqual({ pix: 50, debito: 5, credito: 20 });
  });

  it('totais', () => {
    expect(totals(b.sales)).toMatchObject({ batches: 3, items: 8, gross: 75, fees: 1.04 });
  });
});

describe('Pix maquininha com código antigo', () => {
  it('"pixMaquina" e "pix_mq" somam juntos no relatório e cobram a taxa de Pix', async () => {
    const { feeRate } = await import('../src/domain/calc');
    const base = { batchId: 'z', productId: 'p1', productName: 'S', qty: 1, grossValue: 10, costValue: 2, feeValue: 0, netProfit: 8, date: '2026-10-07T10:00:00.000Z' };
    const sales = [
      { ...base, id: 'a', method: 'pixMaquina', payments: [{ method: 'pixMaquina', value: 10 }] },
      { ...base, id: 'b', method: 'pix_mq', payments: [{ method: 'pix_mq', value: 10 }] },
    ] as unknown as Parameters<typeof byPaymentMethod>[0];
    expect(byPaymentMethod(sales)).toEqual([{ method: 'pix_mq', value: 20 }]);
    expect(feeRate('pixMaquina' as never, b.settings)).toBe(b.settings.feePix);
  });
});
