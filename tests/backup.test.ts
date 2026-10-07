import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppDB, db, exportBackup, getAuth, recalcRecipes, restoreBackup, useDatabase } from '../src/db/db';
import { BackupError, parseBackup, summarizeBackup } from '../src/domain/backup';
import { verifyPassword } from '../src/domain/auth';
import { computeRecipe } from '../src/domain/calc';
import { fixture } from './fixture';

const strip = (b: { exportDate?: string }) => ({ ...b, exportDate: undefined });

beforeAll(() => useDatabase(new AppDB('test-' + Math.random())));
afterAll(() => db.delete());

describe('backup', () => {
  it('rejeita arquivos que não são backup', () => {
    expect(() => parseBackup('{oops')).toThrow(BackupError);
    expect(() => parseBackup({ foo: 1 })).toThrow(BackupError);
  });

  it('restaura e exporta de volta o mesmo conteúdo', async () => {
    const parsed = parseBackup(JSON.stringify(fixture));
    await restoreBackup(parsed, 'replace');
    const out = await exportBackup();
    expect(strip(out)).toEqual(strip(parsed));
    expect(summarizeBackup(parsed)).toMatchObject({ products: 2, sales: 4, batches: 3 });
  });

  it('a senha do backup antigo continua funcionando', async () => {
    const auth = await getAuth();
    expect(await verifyPassword('1234', auth!.passwordHash)).toBe(true);
    expect(await verifyPassword('errada', auth!.passwordHash)).toBe(false);
  });

  it('merge não duplica registros com o mesmo id', async () => {
    await restoreBackup(parseBackup(fixture), 'merge');
    expect(await db.sales.count()).toBe(4);
  });

  it('alterar preço de insumo recalcula ficha e custo do produto vinculado', async () => {
    await db.insumos.update('i1', { price: 60 });
    expect(await recalcRecipes(['i1'])).toBe(1);
    const r = (await db.recipes.get('r1'))!;
    const p = (await db.products.get('p1'))!;
    expect(r.unitCost).toBeGreaterThan(2.16);
    expect(p.cost).toBe(r.unitCost);
  });

  // Validação opcional com um backup real: BACKUP_FILE=/caminho/backup.json npm test
  it.runIf(!!process.env.BACKUP_FILE)('backup real: importa, confere fichas e faz round-trip', async () => {
    const raw = JSON.parse(readFileSync(process.env.BACKUP_FILE!, 'utf8'));
    const parsed = parseBackup(raw);
    const ins = new Map(parsed.insumos.map((i) => [i.id, i]));
    for (const r of parsed.recipes) expect(computeRecipe(r, ins).unitCost, r.name).toBe(r.unitCost);
    await restoreBackup(parsed, 'replace');
    const out = await exportBackup();
    expect(out.sales.length).toBe(raw.sales.length);
    expect(strip(out)).toEqual(strip(parsed));
    // cada registro original volta idêntico
    const byId = new Map(out.sales.map((s) => [s.id, s]));
    for (const s of raw.sales) expect(byId.get(s.id)).toEqual(s);
  }, 60_000);
});

describe('Pix da maquininha', () => {
  it('"pixMaquina" (versão anterior) vira "pix_mq", o código do app antigo', () => {
    const raw = structuredClone(fixture) as { sales: Record<string, unknown>[] };
    raw.sales.push({
      id: 's5', batchId: 'b5', productId: 'p1', productName: 'Suco', qty: 1, method: 'pixMaquina',
      payments: [{ method: 'pixMaquina', value: 10 }], grossValue: 10, costValue: 2, feeValue: 0, netProfit: 8,
      date: '2026-10-07T10:00:00.000Z',
    });
    raw.sales.push({
      id: 's6', batchId: 'b6', productId: 'p1', productName: 'Suco', qty: 1, method: 'pix_mq',
      payments: [{ method: 'pix_mq', value: 10 }], grossValue: 10, costValue: 2, feeValue: 0, netProfit: 8,
      date: '2026-10-07T10:01:00.000Z',
    });
    const b = parseBackup(raw);
    for (const id of ['s5', 's6']) {
      const s = b.sales.find((x) => x.id === id)!;
      expect(s.method).toBe('pix_mq');
      expect(s.payments).toEqual([{ method: 'pix_mq', value: 10 }]);
    }
  });

  it('vendas "pixMaquina" já gravadas no aparelho são migradas ao abrir o banco', async () => {
    const name = 'migra-' + Math.random();
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({ products: 'id, type, name', sales: 'id, batchId, productId, date', insumos: 'id, name', recipes: 'id, linkedProductId', kv: 'key' });
    await v1.table('sales').add({ id: 'x', batchId: 'b', productId: 'p', productName: 'S', qty: 1, method: 'pixMaquina', payments: [{ method: 'pixMaquina', value: 5 }], grossValue: 5, costValue: 1, feeValue: 0, netProfit: 4, date: '2026-10-07T10:00:00.000Z' });
    v1.close();
    const v2 = new AppDB(name);
    const s = (await v2.sales.get('x'))!;
    expect(s.method).toBe('pix_mq');
    expect(s.payments).toEqual([{ method: 'pix_mq', value: 5 }]);
    await v2.delete();
  });
});

describe('limpeza a cada abertura', () => {
  it('venda "pixMaquina" gravada depois da migração é corrigida ao abrir o banco de novo', async () => {
    const name = 'reabre-' + Math.random();
    const a = new AppDB(name);
    await a.sales.add({ id: 'y', batchId: 'b', productId: 'p', productName: 'S', qty: 1, method: 'pixMaquina' as never, payments: [{ method: 'pixMaquina' as never, value: 5 }], grossValue: 5, costValue: 1, feeValue: 0, netProfit: 4, date: '2026-10-07T10:00:00.000Z' });
    a.close();
    const b = new AppDB(name);
    await b.open();
    await new Promise((r) => setTimeout(r, 50));
    const s = (await b.sales.get('y'))!;
    expect(s.method).toBe('pix_mq');
    expect(s.payments).toEqual([{ method: 'pix_mq', value: 5 }]);
    await b.delete();
  });
});
