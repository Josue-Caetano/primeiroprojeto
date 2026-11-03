// Fiado, conferência do caixa, gastos por nome e sugestão de preparo.
// Mesmas regras do Vendeu, para os dois apps mostrarem os mesmos números com o mesmo backup.
import { feeRate, localDay, round2, salePayments, type Totals } from './calc';
import { FIADO, type Gasto, type PaymentMethod, type Recebimento, type Sale, type Settings } from './types';

// ---------- Datas (dias locais AAAA-MM-DD) ----------

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};

const weekday = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

// ---------- Fiado ----------

/** Parte de uma linha de venda que ficou no fiado. */
export const fiadoDaLinha = (s: Sale) => round2(salePayments(s).filter((p) => p.method === FIADO).reduce((a, p) => a + p.value, 0));

/** Taxa da maquininha num recebimento de fiado (cartão ou Pix na maquininha). */
export const taxaRecebimento = (valor: number, forma: string, settings: Settings) =>
  round2((valor * feeRate(forma as PaymentMethod, settings)) / 100);

export interface SituacaoFiado {
  devido: number;
  pago: number;
  saldo: number;
  compras: number;
  desde: string;
  vencimento: string;
  atrasoDias: number;
}

export const SEM_FIADO: SituacaoFiado = { devido: 0, pago: 0, saldo: 0, compras: 0, desde: '', vencimento: '', atrasoDias: 0 };

/**
 * Situação do fiado de cada cliente. O que ele paga quita primeiro as compras mais antigas;
 * a primeira compra ainda aberta diz desde quando ele deve e quando vence.
 */
export function saldosFiado(vendas: Sale[], recebimentos: Recebimento[], hoje: string) {
  type Compra = { batchId: string; date: string; dueDate: string; valor: number };
  const m = new Map<string, { devido: number; pago: number; compras: Map<string, Compra> }>();
  const de = (id: string) => {
    if (!m.has(id)) m.set(id, { devido: 0, pago: 0, compras: new Map() });
    return m.get(id)!;
  };
  for (const v of vendas) {
    if (!v.customerId) continue;
    const f = fiadoDaLinha(v);
    if (!f) continue;
    const c = de(v.customerId);
    c.devido += f;
    const k = c.compras.get(v.batchId) ?? { batchId: v.batchId, date: v.date, dueDate: v.dueDate ?? '', valor: 0 };
    k.valor += f;
    c.compras.set(v.batchId, k);
  }
  for (const r of recebimentos) de(r.clienteId).pago += r.valor;

  const out = new Map<string, SituacaoFiado>();
  for (const [id, c] of m) {
    const compras = [...c.compras.values()].sort((a, b) => a.date.localeCompare(b.date));
    let resta = round2(c.pago);
    let aberta: Compra | null = null;
    for (const k of compras) {
      if (resta >= round2(k.valor) - 0.009) {
        resta = round2(resta - k.valor);
        continue;
      }
      aberta = k;
      break;
    }
    const saldo = Math.max(0, round2(c.devido - c.pago));
    const vencimento = saldo > 0 && aberta ? aberta.dueDate : '';
    out.set(id, {
      devido: round2(c.devido),
      pago: round2(c.pago),
      saldo,
      compras: compras.length,
      desde: saldo > 0 && aberta ? localDay(aberta.date) : '',
      vencimento,
      atrasoDias: vencimento && vencimento < hoje ? daysBetween(vencimento, hoje) : 0,
    });
  }
  return out;
}

/** Quanto o cliente ainda pode comprar no fiado. Sem limite (zero) devolve null. */
export const disponivelFiado = (limite: number, saldo: number) => (limite > 0 ? Math.max(0, round2(limite - saldo)) : null);

/** Totais do fiado: quanto falta receber, quanto já venceu e quantos clientes devem. */
export function resumoFiado(saldos: Iterable<SituacaoFiado>) {
  let aReceber = 0,
    atrasado = 0,
    devendo = 0,
    atrasados = 0;
  for (const s of saldos) {
    if (s.saldo <= 0) continue;
    aReceber += s.saldo;
    devendo += 1;
    if (s.atrasoDias > 0) {
      atrasado += s.saldo;
      atrasados += 1;
    }
  }
  return { aReceber: round2(aReceber), atrasado: round2(atrasado), devendo, atrasados };
}

/** Totais somando as taxas da maquininha cobradas ao receber fiado no cartão (entram no dia em que recebeu). */
export function comTaxasFiado(t: Totals, recebidos: Recebimento[]): Totals {
  const tx = round2(recebidos.reduce((a, r) => a + (r.taxa || 0), 0));
  return tx ? { ...t, fees: round2(t.fees + tx), net: round2(t.net - tx) } : t;
}

/** "vencido há 3 dias", "vence 25/10", "deve desde 12/10" ou "nada pendente". */
export function quandoFiado(s: SituacaoFiado, hoje: string) {
  const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (s.saldo <= 0) return 'nada pendente';
  if (s.atrasoDias > 0) return `vencido há ${s.atrasoDias} dia${s.atrasoDias === 1 ? '' : 's'}`;
  if (s.vencimento === hoje) return 'vence hoje';
  if (s.vencimento) return `vence ${curta(s.vencimento)}`;
  return `deve desde ${curta(s.desde)}`;
}

/** Número para o link do WhatsApp: só dígitos, com o 55 do Brasil. */
export function numeroWhats(tel: string) {
  const n = String(tel || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return '';
  return n.length <= 11 ? `55${n}` : n;
}

export function mensagemCobranca(nome: string, s: SituacaoFiado, settings: Settings, hoje: string, money: (n: number) => string) {
  const primeiro = nome.trim().split(/\s+/)[0];
  const loja = settings.storeName && settings.storeName !== 'Minhas Vendas' ? ` em ${settings.storeName}` : '';
  const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const prazo = !s.vencimento
    ? ''
    : s.vencimento < hoje
      ? ` (venceu em ${curta(s.vencimento)})`
      : s.vencimento === hoje
        ? ' (vence hoje)'
        : ` (vence em ${curta(s.vencimento)})`;
  return [
    `Oi, ${primeiro}! Tudo bem?`,
    `Passando para lembrar do seu fiado${loja}: *${money(s.saldo)}*${prazo}.`,
    settings.chavePix ? `Se quiser, pode pagar no Pix: ${settings.chavePix}` : '',
    'Obrigado!',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- Caixa ----------

/** Conferência do caixa: dinheiro que deveria estar na mão no fim do dia. */
export function conferirCaixa(vendasDoDia: Sale[], gastosDoDia: Gasto[], fundo: number, contado: number | '', recebidosDoDia: Recebimento[]) {
  let dinheiro = 0;
  for (const s of vendasDoDia) for (const p of salePayments(s)) if (p.method === 'dinheiro') dinheiro += p.value;
  dinheiro = round2(dinheiro);
  const fiadoDinheiro = round2(recebidosDoDia.filter((r) => r.forma === 'dinheiro').reduce((a, r) => a + r.valor, 0));
  const gastosDinheiro = round2(gastosDoDia.filter((g) => g.forma !== 'outro').reduce((a, g) => a + g.valor, 0));
  const esperado = round2((fundo || 0) + dinheiro + fiadoDinheiro - gastosDinheiro);
  return {
    fundo: round2(fundo || 0),
    dinheiro,
    fiadoDinheiro,
    gastosDinheiro,
    esperado,
    diferenca: contado === '' ? null : round2(contado - esperado),
  };
}

// ---------- Gastos ----------

/** Gastos somados pelo nome anotado (gelo, gás...), do maior para o menor. Sem nome vira "Gasto". */
export function gastosPorNome(gastos: Gasto[]) {
  const m = new Map<string, { nome: string; valor: number; vezes: number }>();
  for (const g of gastos) {
    const nome = String(g.descricao || '').trim() || 'Gasto';
    const k = nome.toLocaleLowerCase('pt-BR');
    const c = m.get(k) ?? { nome, valor: 0, vezes: 0 };
    c.valor += g.valor;
    c.vezes += 1;
    m.set(k, c);
  }
  return [...m.values()].map((c) => ({ ...c, valor: round2(c.valor) })).sort((a, b) => b.valor - a.valor);
}

// ---------- Preparo ----------

/**
 * Quanto preparar para um dia: média do que saiu de cada produto nas últimas `vezes` vezes em que você
 * trabalhou no mesmo dia da semana (dias sem venda não contam).
 */
export function sugestaoPreparo(vendas: Sale[], dia: string, vezes = 4) {
  const semana = weekday(dia);
  const porDia = new Map<string, Sale[]>();
  for (const v of vendas) {
    const d = localDay(v.date);
    if (d >= dia || weekday(d) !== semana) continue;
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push(v);
  }
  const dias = [...porDia.keys()].sort().slice(-vezes);
  if (!dias.length) return { dias: [] as string[], itens: [] as { productId: string; nome: string; media: number; max: number }[] };
  const m = new Map<string, { productId: string; nome: string; qtds: number[] }>();
  dias.forEach((d, i) => {
    for (const v of porDia.get(d)!) {
      const c = m.get(v.productId) ?? { productId: v.productId, nome: String(v.productName || '').trim(), qtds: Array(dias.length).fill(0) };
      c.qtds[i] += v.qty;
      m.set(v.productId, c);
    }
  });
  const itens = [...m.values()]
    .map((c) => ({ productId: c.productId, nome: c.nome, media: Math.ceil(c.qtds.reduce((a, b) => a + b, 0) / dias.length), max: Math.max(...c.qtds) }))
    .filter((x) => x.media > 0)
    .sort((a, b) => b.media - a.media);
  return { dias, itens };
}
