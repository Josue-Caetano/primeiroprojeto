import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSales, entradasPorForma, fraseDoDia, fraseMelhorPeriodo, porPeriodoDoDia } from '../src/domain/calc';
import { parseBackup } from '../src/domain/backup';
import type { Payment, Product } from '../src/domain/types';
import { fixture } from './fixture';

const b = parseBackup(fixture);
const salgado = b.products[1] as Product;
const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const venda = (h: number, valor: number, pays: Payment[] = [{ method: 'dinheiro', value: valor }]) =>
  buildSales([{ product: salgado, qty: 1, unitPrice: valor }], pays, b.settings, 0, new Date(2026, 10, 10, h, 30));

describe('períodos do dia', () => {
  it('manhã até 11:59, tarde até 17:59; noite só aparece se teve venda', () => {
    const vs = [...venda(9, 10), ...venda(11, 5), ...venda(12, 30)];
    const ps = porPeriodoDoDia(vs);
    expect(ps.map((p) => [p.id, p.gross, p.batches])).toEqual([['manha', 15, 2], ['tarde', 30, 1]]);
    expect(fraseDoDia(ps, money)).toBe('A tarde vendeu R$ 15,00 a mais que a manhã.');
    expect(porPeriodoDoDia([...vs, ...venda(19, 7)]).map((p) => p.id)).toEqual(['manha', 'tarde', 'noite']);
    const comMedia = porPeriodoDoDia(vs).map((p) => ({ ...p, media: p.gross / 3 }));
    expect(fraseMelhorPeriodo(comMedia, 3, money)).toBe('A tarde vende mais: em média R$ 10,00 por dia, contra R$ 5,00 de manhã.');
    expect(fraseMelhorPeriodo(porPeriodoDoDia(venda(9, 10)).map((p) => ({ ...p, media: 0 })), 1, money)).toBe('Só teve venda de manhã.');
  });
});

describe('entradas por forma', () => {
  it('soma vendas e fiado recebido; fiado vendido fica à parte', () => {
    const vs = [
      ...venda(9, 10),
      ...venda(10, 20, [{ method: 'pix', value: 15 }, { method: 'credito', value: 5 }]),
      ...buildSales([{ product: salgado, qty: 1, unitPrice: 8 }], [{ method: 'fiado', value: 8 }], b.settings, 0, new Date(2026, 10, 10, 13), {
        customerId: 'c', customerName: 'Zé', dueDate: '',
      }),
    ];
    const e = entradasPorForma(vs, [{ forma: 'pixMaquina', valor: 4 }, { forma: 'pix', valor: 5 }]);
    expect(e.linhas).toEqual([
      { method: 'pix', vendas: 15, fiado: 5, total: 20 },
      { method: 'dinheiro', vendas: 10, fiado: 0, total: 10 },
      { method: 'credito', vendas: 5, fiado: 0, total: 5 },
      { method: 'pix_mq', vendas: 0, fiado: 4, total: 4 },
    ]);
    expect(e.fiadoVendido).toBe(8);
    expect(e.total).toBe(39);
  });
});

describe('lembrete de backup', () => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => mem.set(k, v),
  });
  afterEach(() => mem.clear());
  const DIA = 864e5;

  it('avisa depois de 7 dias com dados novos sem backup; "Depois" adia 3 dias', async () => {
    const { backupFeito, dadosMudaram, diasSemBackup, adiarAviso, textoBackup } = await import('../src/ui/avisoBackup');
    const t0 = new Date(2026, 10, 1, 10).getTime();
    expect(textoBackup(t0)).toContain('ainda não baixou');
    backupFeito(t0);
    dadosMudaram(t0 + 1000); // logo depois de restaurar: não conta
    expect(diasSemBackup(true, t0 + 10 * DIA)).toBe(0);
    dadosMudaram(t0 + DIA);
    dadosMudaram(t0 + 2 * DIA); // só a primeira mudança depois do backup vale
    expect(diasSemBackup(true, t0 + 6 * DIA)).toBe(0);
    expect(diasSemBackup(true, t0 + 8 * DIA)).toBe(8);
    expect(diasSemBackup(false, t0 + 8 * DIA)).toBe(0);
    adiarAviso(t0 + 8 * DIA);
    expect(diasSemBackup(true, t0 + 10 * DIA)).toBe(0);
    expect(diasSemBackup(true, t0 + 11 * DIA + 1)).toBe(11);
    backupFeito(t0 + 12 * DIA);
    expect(diasSemBackup(true, t0 + 30 * DIA)).toBe(0);
    expect(textoBackup(t0 + 13 * DIA)).toBe('Último backup: ontem.');
  });
});
