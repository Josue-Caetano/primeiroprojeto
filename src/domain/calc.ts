import {
  MULTIPLE_METHODS,
  type Insumo,
  type Payment,
  type PaymentMethod,
  type Product,
  type Recipe,
  type RecipeIngredient,
  type Sale,
  type Settings,
} from './types';
import { newId } from './ids';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function feeRate(method: PaymentMethod, settings: Settings): number {
  switch (method) {
    case 'debito':
      return settings.feeDebit;
    case 'credito':
      return settings.feeCredit;
    case 'pix_mq':
      return settings.feePix;
    default:
      return 0;
  }
}

/** Pagamentos de uma linha de venda. Vendas antigas não têm `payments`: o método único cobre o valor todo. */
export function salePayments(sale: Sale): Payment[] {
  if (sale.payments && sale.payments.length > 0) return sale.payments;
  if (sale.method === MULTIPLE_METHODS) return [];
  return [{ method: sale.method, value: sale.grossValue }];
}

export interface CartItem {
  product: Product;
  qty: number;
  unitPrice: number;
}

export const cartTotal = (items: CartItem[]) => round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0));

/**
 * Divide um valor proporcionalmente aos pesos, em centavos, sem perder nem sobrar centavo
 * (a diferença de arredondamento vai para a última parcela).
 */
export function splitProportional(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return weights.map(() => 0);
  const totalCents = Math.round(total * 100);
  let acc = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return (totalCents - acc) / 100;
    const c = Math.round((totalCents * w) / sumW);
    acc += c;
    return c / 100;
  });
}

/**
 * Transforma o carrinho + pagamentos em linhas de venda no mesmo formato do app antigo:
 * uma linha por produto, todas com o mesmo batchId. Com mais de um pagamento, cada linha
 * recebe a sua fatia proporcional de cada pagamento e o método vira "Múltiplos".
 */
export function buildSales(
  items: CartItem[],
  payments: Payment[],
  settings: Settings,
  now: Date = new Date(),
): Sale[] {
  const active = items.filter((i) => i.qty > 0);
  if (active.length === 0) throw new Error('Carrinho vazio');
  const pays = payments.filter((p) => p.value > 0);
  if (pays.length === 0) throw new Error('Informe o pagamento');

  const grosses = active.map((i) => round2(i.qty * i.unitPrice));
  const total = round2(grosses.reduce((a, b) => a + b, 0));
  const paid = round2(pays.reduce((a, p) => a + p.value, 0));
  if (Math.abs(paid - total) > 0.009) {
    throw new Error(`Pagamentos (${paid.toFixed(2)}) diferente do total (${total.toFixed(2)})`);
  }

  // shares[p][i] = parte do pagamento p que cabe ao item i
  const shares = pays.map((p) => splitProportional(p.value, grosses));
  const batchId = newId(now);
  const method = pays.length === 1 ? pays[0].method : MULTIPLE_METHODS;

  return active.map((item, i) => {
    const itemPayments: Payment[] = pays.map((p, pi) => ({ method: p.method, value: shares[pi][i] }));
    const feeValue = round2(itemPayments.reduce((s, p) => s + (p.value * feeRate(p.method, settings)) / 100, 0));
    const grossValue = grosses[i];
    const costValue = round2(item.product.cost * item.qty);
    return {
      id: newId(new Date(now.getTime() + i)),
      batchId,
      productId: item.product.id,
      productName: item.product.name,
      productType: item.product.type,
      qty: item.qty,
      saleMode: item.product.saleMode ?? 'unit',
      method,
      payments: itemPayments,
      grossValue,
      costValue,
      feeValue,
      netProfit: round2(grossValue - costValue - feeValue),
      date: new Date(now.getTime() + i).toISOString(),
    };
  });
}

// ---------- Ficha técnica ----------

export function ingredientCost(ing: RecipeIngredient, insumos: Map<string, Insumo>): number {
  const ins = insumos.get(ing.insumoId);
  if (!ins || !ins.weight) return 0;
  return (ing.qty * ins.price) / ins.weight;
}

/**
 * custo unitário = (soma dos insumos × (1 + custo operacional%)) / rendimento + embalagem
 * preço sugerido = custo unitário × markup
 * (fórmula conferida contra todas as fichas do backup original)
 */
export function computeRecipe(
  r: Pick<Recipe, 'ingredients' | 'opFeePercentage' | 'markup' | 'packagingCost' | 'yieldQty'>,
  insumos: Map<string, Insumo>,
) {
  const ingredientsTotal = r.ingredients.reduce((s, ing) => s + ingredientCost(ing, insumos), 0);
  const withOp = ingredientsTotal * (1 + (r.opFeePercentage || 0) / 100);
  const yieldQty = r.yieldQty > 0 ? r.yieldQty : 1;
  const unitCost = round2(withOp / yieldQty + (r.packagingCost || 0));
  const suggestedPrice = round2(unitCost * (r.markup || 0));
  return { ingredientsTotal: round2(ingredientsTotal), batchCost: round2(withOp), unitCost, suggestedPrice };
}

// ---------- Relatórios ----------

export interface Totals {
  batches: number;
  items: number;
  gross: number;
  cost: number;
  fees: number;
  net: number;
}

export function totals(sales: Sale[]): Totals {
  const batches = new Set<string>();
  let items = 0, gross = 0, cost = 0, fees = 0, net = 0;
  for (const s of sales) {
    batches.add(s.batchId);
    items += s.qty;
    gross += s.grossValue;
    cost += s.costValue;
    fees += s.feeValue;
    net += s.netProfit;
  }
  return { batches: batches.size, items, gross: round2(gross), cost: round2(cost), fees: round2(fees), net: round2(net) };
}

export function groupSum<K>(sales: Sale[], key: (s: Sale) => K) {
  const m = new Map<K, { qty: number; gross: number; cost: number; fees: number; net: number; batches: Set<string> }>();
  for (const s of sales) {
    const k = key(s);
    const cur = m.get(k) ?? { qty: 0, gross: 0, cost: 0, fees: 0, net: 0, batches: new Set<string>() };
    cur.qty += s.qty;
    cur.gross += s.grossValue;
    cur.cost += s.costValue;
    cur.fees += s.feeValue;
    cur.net += s.netProfit;
    cur.batches.add(s.batchId);
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([k, v]) => ({
      key: k,
      qty: v.qty,
      gross: round2(v.gross),
      cost: round2(v.cost),
      fees: round2(v.fees),
      net: round2(v.net),
      sales: v.batches.size,
    }))
    .sort((a, b) => b.gross - a.gross);
}

/** Recebido por forma de pagamento (vendas "Múltiplos" são separadas pelos seus pagamentos). */
export function byPaymentMethod(sales: Sale[]) {
  const m = new Map<string, number>();
  for (const s of sales) {
    const pays = salePayments(s);
    if (pays.length === 0) {
      m.set(s.method, (m.get(s.method) ?? 0) + s.grossValue);
      continue;
    }
    for (const p of pays) m.set(p.method, (m.get(p.method) ?? 0) + p.value);
  }
  return [...m.entries()].map(([method, value]) => ({ method, value: round2(value) })).sort((a, b) => b.value - a.value);
}

/** Data local AAAA-MM-DD (o dia do vendedor, não o dia UTC). */
export function localDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
