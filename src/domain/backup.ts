import { DEFAULT_SETTINGS, normalizeMethod, type Backup, type Settings } from './types';

export class BackupError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));

function requireArray(data: Obj, key: string): Obj[] {
  const v = data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new BackupError(`"${key}" deveria ser uma lista`);
  return v.filter(isObj);
}

function requireId(o: Obj, where: string, i: number): string {
  const id = o.id;
  if (typeof id !== 'string' || !id) throw new BackupError(`${where} #${i + 1} sem "id"`);
  return id;
}

/**
 * Lê e valida um backup do app antigo (ou deste app). Mantém todos os campos originais de
 * cada registro (inclusive campos desconhecidos) para que exportar de novo gere o mesmo
 * conteúdo; só converte tipos numéricos e preenche o que for obrigatório e estiver faltando.
 */
export function parseBackup(input: string | unknown): Backup {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new BackupError('Arquivo não é um JSON válido');
    }
  }
  if (!isObj(data)) throw new BackupError('Formato de backup inválido');
  if (!('products' in data) && !('sales' in data)) {
    throw new BackupError('Este arquivo não parece um backup de vendas (faltam "products" e "sales")');
  }

  const products = requireArray(data, 'products').map((p, i) => ({
    ...p,
    id: requireId(p, 'Produto', i),
    type: str(p.type),
    name: str(p.name),
    price: num(p.price),
    cost: num(p.cost),
    createdAt: str(p.createdAt, new Date(0).toISOString()),
  })) as Backup['products'];

  const sales = requireArray(data, 'sales').map((s, i) => {
    const date = str(s.date);
    if (Number.isNaN(Date.parse(date))) throw new BackupError(`Venda #${i + 1} com data inválida`);
    const out: Obj = {
      ...s,
      id: requireId(s, 'Venda', i),
      batchId: str(s.batchId) || str(s.id),
      productId: str(s.productId),
      productName: str(s.productName),
      qty: num(s.qty, 1),
      method: normalizeMethod(str(s.method, 'dinheiro')),
      grossValue: num(s.grossValue),
      costValue: num(s.costValue),
      feeValue: num(s.feeValue),
      netProfit: num(s.netProfit),
      date,
    };
    if (Array.isArray(s.payments)) {
      out.payments = s.payments.filter(isObj).map((p) => ({ ...p, method: normalizeMethod(str(p.method)), value: num(p.value) }));
    }
    return out;
  }) as unknown as Backup['sales'];

  const insumos = requireArray(data, 'insumos').map((x, i) => ({
    ...x,
    id: requireId(x, 'Insumo', i),
    name: str(x.name),
    price: num(x.price),
    weight: num(x.weight, 1),
    unit: (['g', 'ml', 'un'].includes(str(x.unit)) ? x.unit : 'g') as 'g' | 'ml' | 'un',
  })) as Backup['insumos'];

  const recipes = requireArray(data, 'recipes').map((r, i) => ({
    ...r,
    id: requireId(r, 'Ficha técnica', i),
    name: str(r.name),
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients.filter(isObj) : []).map((g) => ({
      ...g,
      insumoId: str(g.insumoId),
      qty: num(g.qty),
    })),
    opFeePercentage: num(r.opFeePercentage),
    markup: num(r.markup, 1),
    packagingCost: num(r.packagingCost),
    yieldQty: num(r.yieldQty, 1),
    unitCost: num(r.unitCost),
    suggestedPrice: num(r.suggestedPrice),
  })) as Backup['recipes'];

  const rawSettings = isObj(data.settings) ? data.settings : {};
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    feeDebit: num(rawSettings.feeDebit, DEFAULT_SETTINGS.feeDebit),
    feeCredit: num(rawSettings.feeCredit, DEFAULT_SETTINGS.feeCredit),
    feePix: num(rawSettings.feePix, DEFAULT_SETTINGS.feePix),
    storeName: str(rawSettings.storeName, DEFAULT_SETTINGS.storeName),
    userName: str(rawSettings.userName),
    categories: Array.isArray(rawSettings.categories)
      ? rawSettings.categories.map((c) => str(c)).filter(Boolean)
      : [...DEFAULT_SETTINGS.categories],
  };
  // categorias usadas em produtos mas ausentes da lista continuam selecionáveis
  for (const p of products) if (p.type && !settings.categories.includes(p.type)) settings.categories.push(p.type);

  const auth =
    isObj(data.auth) && typeof data.auth.passwordHash === 'string' && data.auth.passwordHash
      ? { ...data.auth, passwordHash: data.auth.passwordHash, createdAt: str(data.auth.createdAt) }
      : null;

  return { products, sales, insumos, recipes, settings, auth, exportDate: str(data.exportDate) };
}

export function summarizeBackup(b: Backup) {
  const dates = b.sales.map((s) => s.date).sort();
  return {
    products: b.products.length,
    sales: b.sales.length,
    batches: new Set(b.sales.map((s) => s.batchId)).size,
    insumos: b.insumos.length,
    recipes: b.recipes.length,
    firstSale: dates[0] ?? null,
    lastSale: dates[dates.length - 1] ?? null,
    hasPassword: !!b.auth,
    storeName: b.settings.storeName,
    exportDate: b.exportDate,
  };
}

export function backupFileName(d = new Date()) {
  return `backup_ambulante_${d.getTime()}.json`;
}
