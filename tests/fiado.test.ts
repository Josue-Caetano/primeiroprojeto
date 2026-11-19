import { describe, expect, it } from 'vitest';
import { buildSales } from '../src/domain/calc';
import { comTaxasFiado, conferirCaixa, disponivelFiado, gastosPorNome, numeroWhats, resumoFiado, saldosFiado, sugestaoPreparo } from '../src/domain/fiado';
import { totals } from '../src/domain/calc';
import { parseBackup } from '../src/domain/backup';
import type { Product, Recebimento, Settings } from '../src/domain/types';
import { fixture } from './fixture';
import { MENSAGENS_PADRAO, itensDoFiado, modeloSugerido, modelos, preencher, varsCobranca } from '../src/domain/mensagens';

const b = parseBackup(fixture);
const settings: Settings = { ...b.settings, chavePix: '66999990000' };
const salgado = b.products[1] as Product;
const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

describe('fiado', () => {
  it('venda no fiado exige cliente e grava cliente e vencimento em cada linha, sem taxa', () => {
    const item = [{ product: salgado, qty: 2, unitPrice: 10 }];
    expect(() => buildSales(item, [{ method: 'fiado', value: 20 }], settings)).toThrow();
    const s = buildSales(item, [{ method: 'fiado', value: 20 }], settings, 0, new Date('2026-11-01T12:00:00Z'), {
      customerId: 'c1', customerName: 'Maria', dueDate: '2026-11-08',
    });
    expect(s[0]).toMatchObject({ method: 'fiado', customerId: 'c1', customerName: 'Maria', dueDate: '2026-11-08', feeValue: 0, netProfit: 14.6 });
  });

  it('saldo: pagamentos quitam as compras mais antigas; vencimento e atraso vêm da compra em aberto', () => {
    const item = [{ product: salgado, qty: 1, unitPrice: 10 }];
    const c1 = buildSales(item, [{ method: 'fiado', value: 10 }], settings, 0, new Date(2026, 9, 1, 12), { customerId: 'c1', customerName: 'Maria', dueDate: '2026-10-08' });
    const c2 = buildSales(item, [{ method: 'fiado', value: 10 }], settings, 0, new Date(2026, 9, 10, 12), { customerId: 'c1', customerName: 'Maria', dueDate: '2026-10-17' });
    const rec: Recebimento[] = [{ id: 'r1', clienteId: 'c1', data: '2026-10-12T15:00:00.000Z', valor: 10, forma: 'dinheiro', taxa: 0 }];
    const s = saldosFiado([...c1, ...c2], rec, '2026-10-20').get('c1')!;
    expect(s).toMatchObject({ devido: 20, pago: 10, saldo: 10, compras: 2, vencimento: '2026-10-17', atrasoDias: 3, desde: '2026-10-10' });
    expect(resumoFiado([s])).toEqual({ aReceber: 10, atrasado: 10, devendo: 1, atrasados: 1 });
    expect(disponivelFiado(15, 10)).toBe(5);
    expect(disponivelFiado(0, 10)).toBeNull();
  });

  it('taxa de recebimento entra nas taxas e sai do lucro do dia', () => {
    const t = totals(b.sales);
    const r = comTaxasFiado(t, [{ id: 'r', clienteId: 'c', data: '2026-10-06T10:00:00Z', valor: 50, forma: 'credito', taxa: 2.46 }]);
    expect(r.fees).toBe(+(t.fees + 2.46).toFixed(2));
    expect(r.net).toBe(+(t.net - 2.46).toFixed(2));
  });

  it('mensagem de cobrança (modelos) e número do WhatsApp', () => {
    const item = [{ product: salgado, qty: 2, unitPrice: 10 }];
    const c1 = buildSales(item, [{ method: 'fiado', value: 20 }], settings, 0, new Date(2026, 9, 1, 12), { customerId: 'c1', customerName: 'Maria', dueDate: '2026-10-08' });
    const s = saldosFiado(c1, [], '2026-10-10').get('c1')!;
    const vars = varsCobranca({ nome: 'Maria Silva' }, s, settings, '2026-10-10', money);
    const msg = preencher(modelos(settings).find((m) => m.id === modeloSugerido(s, '2026-10-10'))!.texto, vars);
    expect(modeloSugerido(s, '2026-10-10')).toBe('atrasado');
    expect(msg).toBe('Oi, Maria, tudo bem? O seu fiado de *R$ 20,00* venceu em 08/10. Consegue me dizer um dia bom para acertar?\nSe quiser, pode pagar no Pix: 66999990000');
    const lembrete = preencher(MENSAGENS_PADRAO[0].texto, { ...vars, prazo: '', pix_linha: '' });
    expect(lembrete).toBe('Oi, Maria! Tudo bem?\nPassando para lembrar do seu fiado: *R$ 20,00*.\nObrigado!');
    expect(numeroWhats('(66) 99999-0000')).toBe('5566999990000');
  });

  it('{itens}: compras em aberto com o que levou; paga em parte mostra quanto falta', () => {
    const c1 = buildSales([{ product: salgado, qty: 2, unitPrice: 10 }], [{ method: 'fiado', value: 20 }], settings, 0, new Date(2026, 10, 5, 12), { customerId: 'c1', customerName: 'Maria', dueDate: '' });
    const c2 = buildSales([{ product: salgado, qty: 1, unitPrice: 5 }], [{ method: 'fiado', value: 5 }], settings, 0, new Date(2026, 10, 6, 12), { customerId: 'c1', customerName: 'Maria', dueDate: '' });
    const rec: Recebimento[] = [{ id: 'r', clienteId: 'c1', data: '2026-11-07T12:00:00Z', valor: 8, forma: 'pix', taxa: 0 }];
    const s = saldosFiado([...c1, ...c2], rec, '2026-11-10').get('c1')!;
    expect(s.abertas.map((a) => a.falta)).toEqual([12, 5]);
    const nome = salgado.name.trim();
    expect(itensDoFiado(s.abertas, money)).toBe(`• 05/11 · 2× ${nome} · R$ 12,00 (de R$ 20,00, já pagou R$ 8,00)\n• 06/11 · 1× ${nome} · R$ 5,00`);
    // modelo personalizado no backup substitui os que vêm com o app
    expect(modelos({ ...settings, mensagens: [{ id: 'x', nome: 'Meu', texto: '{nome}: {itens}' }] })).toHaveLength(1);
    expect(modelos({ ...settings, mensagens: null })).toBe(MENSAGENS_PADRAO);
  });
});

describe('caixa, gastos e preparo', () => {
  it('conferência: troco + dinheiro + fiado em dinheiro − gastos do caixa', () => {
    const vendas = buildSales([{ product: salgado, qty: 3, unitPrice: 10 }], [{ method: 'dinheiro', value: 20 }, { method: 'pix', value: 10 }], settings);
    const gastos = [
      { id: 'g1', data: 'x', valor: 5, descricao: 'gelo', forma: 'dinheiro' },
      { id: 'g2', data: 'x', valor: 7, descricao: 'gás', forma: 'outro' },
    ];
    const rec = [{ id: 'r', clienteId: 'c', data: 'x', valor: 8, forma: 'dinheiro', taxa: 0 }];
    expect(conferirCaixa(vendas, gastos, 50, 70, rec)).toEqual({ fundo: 50, dinheiro: 20, fiadoDinheiro: 8, gastosDinheiro: 5, esperado: 73, diferenca: -3 });
    expect(conferirCaixa(vendas, gastos, 50, '', rec).diferenca).toBeNull();
  });

  it('gastos por nome e sugestão de preparo pelo mesmo dia da semana', () => {
    expect(gastosPorNome([
      { id: '1', data: 'x', valor: 110, descricao: 'Elaine', forma: 'outro' },
      { id: '2', data: 'x', valor: 55, descricao: 'elaine', forma: 'outro' },
      { id: '3', data: 'x', valor: 100, descricao: 'Anny', forma: 'dinheiro' },
    ])).toEqual([{ nome: 'Elaine', valor: 165, vezes: 2 }, { nome: 'Anny', valor: 100, vezes: 1 }]);
    const seg = (d: number, q: number) => buildSales([{ product: salgado, qty: q, unitPrice: 10 }], [{ method: 'pix', value: q * 10 }], settings, 0, new Date(2026, 9, d, 12));
    const vendas = [...seg(5, 10), ...seg(12, 15), ...seg(13, 99)]; // 5 e 12/10 são segundas; 13 é terça
    const r = sugestaoPreparo(vendas, '2026-10-19');
    expect(r.dias).toEqual(['2026-10-05', '2026-10-12']);
    expect(r.itens[0]).toMatchObject({ media: 13, max: 15 });
  });
});
