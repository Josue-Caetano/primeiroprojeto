import Dexie, { type Table } from 'dexie';
import { computeRecipe } from '../domain/calc';
import {
  DEFAULT_SETTINGS,
  normalizeMethod,
  type Auth,
  type Backup,
  type Insumo,
  type Payment,
  type Product,
  type Recipe,
  type Sale,
  type Settings,
} from '../domain/types';

interface KV {
  key: 'settings' | 'auth';
  value: unknown;
}

// IndexedDB em vez de localStorage: o backup real já passa de 2,5 MB e o localStorage
// costuma travar em ~5 MB.
export class AppDB extends Dexie {
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  insumos!: Table<Insumo, string>;
  recipes!: Table<Recipe, string>;
  kv!: Table<KV, string>;

  constructor(name = 'vendas-ambulante') {
    super(name);
    this.version(1).stores({
      products: 'id, type, name',
      sales: 'id, batchId, productId, date',
      insumos: 'id, name',
      recipes: 'id, linkedProductId',
      kv: 'key',
    });
    // v2: Pix da maquininha passa a usar o mesmo código do app antigo ("pix_mq")
    this.version(2).upgrade((tx) =>
      tx
        .table('sales')
        .toCollection()
        .modify((s: Sale) => {
          s.method = normalizeMethod(s.method) as Sale['method'];
          s.payments?.forEach((p) => (p.method = normalizeMethod(p.method) as Payment['method']));
        }),
    );
  }
}

export let db = new AppDB();

/** Só para testes: troca o banco por outro (ex.: fake-indexeddb com nome isolado). */
export function useDatabase(instance: AppDB) {
  db = instance;
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(s: Settings) {
  await db.kv.put({ key: 'settings', value: s });
}

export async function getAuth(): Promise<Auth | null> {
  const row = await db.kv.get('auth');
  return (row?.value as Auth) ?? null;
}

export async function saveAuth(a: Auth | null) {
  if (a) await db.kv.put({ key: 'auth', value: a });
  else await db.kv.delete('auth');
}

export async function exportBackup(): Promise<Backup> {
  const [products, sales, insumos, recipes, settings, auth] = await Promise.all([
    db.products.toArray(),
    db.sales.orderBy('date').toArray(),
    db.insumos.toArray(),
    db.recipes.toArray(),
    getSettings(),
    getAuth(),
  ]);
  const byCreated = (a: Product, b: Product) => a.createdAt.localeCompare(b.createdAt);
  return {
    products: products.sort(byCreated),
    sales,
    insumos,
    recipes,
    settings,
    ...(auth ? { auth } : {}),
    exportDate: new Date().toISOString(),
  };
}

export type RestoreMode = 'replace' | 'merge';

/**
 * replace: apaga tudo e carrega o backup (igual ao app antigo).
 * merge: mantém o que já existe e acrescenta/atualiza os registros do backup pelo id
 *        (útil para juntar vendas de dois aparelhos). Configurações e senha atuais são mantidas.
 */
export async function restoreBackup(b: Backup, mode: RestoreMode = 'replace') {
  await db.transaction('rw', [db.products, db.sales, db.insumos, db.recipes, db.kv], async () => {
    if (mode === 'replace') {
      await Promise.all([db.products.clear(), db.sales.clear(), db.insumos.clear(), db.recipes.clear(), db.kv.clear()]);
      await saveSettings(b.settings);
      if (b.auth) await saveAuth(b.auth);
    } else {
      const cur = await getSettings();
      const categories = [...new Set([...cur.categories, ...b.settings.categories])];
      await saveSettings({ ...cur, categories });
    }
    await db.products.bulkPut(b.products);
    await db.sales.bulkPut(b.sales);
    await db.insumos.bulkPut(b.insumos);
    await db.recipes.bulkPut(b.recipes);
  });
}

export async function wipeAll() {
  await db.transaction('rw', [db.products, db.sales, db.insumos, db.recipes, db.kv], async () => {
    await Promise.all([db.products.clear(), db.sales.clear(), db.insumos.clear(), db.recipes.clear(), db.kv.clear()]);
  });
}

/**
 * Recalcula as fichas técnicas que usam algum dos insumos informados (ou todas) e atualiza
 * o custo dos produtos vinculados. Vendas já registradas não mudam.
 */
export async function recalcRecipes(insumoIds?: string[]) {
  const insumos = new Map((await db.insumos.toArray()).map((i) => [i.id, i]));
  const recipes = await db.recipes.toArray();
  let changed = 0;
  for (const r of recipes) {
    if (insumoIds && !r.ingredients.some((g) => insumoIds.includes(g.insumoId))) continue;
    const c = computeRecipe(r, insumos);
    if (c.unitCost === r.unitCost && c.suggestedPrice === r.suggestedPrice) continue;
    await saveRecipe({ ...r, unitCost: c.unitCost, suggestedPrice: c.suggestedPrice });
    changed++;
  }
  return changed;
}

export async function saveRecipe(r: Recipe) {
  await db.transaction('rw', [db.recipes, db.products], async () => {
    await db.recipes.put(r);
    if (r.linkedProductId) {
      await db.products.update(r.linkedProductId, { cost: r.unitCost });
    }
  });
}
