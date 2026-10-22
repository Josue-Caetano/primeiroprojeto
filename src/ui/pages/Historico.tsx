import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, getGastos, getSettings } from '../../db/db';
import { localDay, round2, salePayments, totals } from '../../domain/calc';
import { METHOD_LABELS, type Sale } from '../../domain/types';
import { Empty, Stat } from '../components/common';
import { GastosDoDia, totalGastos } from '../components/Gastos';
import { dayLabel, money, time } from '../format';

function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

export function Historico() {
  const [day, setDay] = useState(localDay(new Date()));
  const sales = useLiveQuery(() => {
    const [y, m, d] = day.split('-').map(Number);
    const start = new Date(y, m - 1, d).toISOString();
    const end = new Date(y, m - 1, d + 1).toISOString();
    return db.sales.where('date').between(start, end, true, false).toArray();
  }, [day]);

  const batches = useMemo(() => {
    const m = new Map<string, Sale[]>();
    for (const s of sales ?? []) m.set(s.batchId, [...(m.get(s.batchId) ?? []), s]);
    return [...m.entries()].sort((a, b) => b[1][0].date.localeCompare(a[1][0].date));
  }, [sales]);

  const t = totals(sales ?? []);
  const gastos = useLiveQuery(getGastos, []) ?? [];
  const settings = useLiveQuery(getSettings, []);
  const gastosDia = gastos.filter((g) => g.data === day);
  const gastoTotal = totalGastos(gastosDia);

  // conferência da gaveta: troco inicial + dinheiro recebido − gastos pagos em dinheiro
  let dinheiro = 0;
  for (const s of sales ?? []) for (const p of salePayments(s)) if (p.method === 'dinheiro') dinheiro += p.value;
  const fundo = settings?.fundoTroco ?? 0;
  const gastoDinheiro = totalGastos(gastosDia.filter((g) => g.forma === 'dinheiro'));
  const gaveta = round2(fundo + dinheiro - gastoDinheiro);

  const removeBatch = async (batchId: string) => {
    if (!confirm('Excluir esta venda? Esta ação não pode ser desfeita.')) return;
    await db.sales.where('batchId').equals(batchId).delete();
  };
  const removeLine = async (s: Sale) => {
    if (!confirm(`Excluir "${s.productName.trim()}" desta venda?`)) return;
    await db.sales.delete(s.id);
  };

  return (
    <div className="page">
      <div className="day-nav">
        <button className="ghost" onClick={() => setDay(shiftDay(day, -1))} aria-label="Dia anterior">
          ‹
        </button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="ghost" onClick={() => setDay(shiftDay(day, 1))} aria-label="Próximo dia">
          ›
        </button>
      </div>
      <p className="muted center">{dayLabel(day)}</p>

      <div className="stats stats-day">
        <Stat label="Vendas" value={t.batches} />
        <Stat label="Bruto" value={money(t.gross)} />
        <Stat label="Custo dos produtos" value={money(t.cost)} />
        <Stat label="Taxas" value={money(t.fees)} />
        {gastoTotal > 0 && <Stat label="Gastos" value={money(gastoTotal)} tone="bad" />}
        <Stat label="Lucro" value={money(t.net)} tone={t.net >= 0 ? 'good' : 'bad'} />
        {gastoTotal > 0 && (
          <Stat label="Sobra do dia (lucro − gastos)" value={money(t.net - gastoTotal)} tone={t.net - gastoTotal >= 0 ? 'good' : 'bad'} />
        )}
      </div>

      {(fundo > 0 || dinheiro > 0) && (
        <p className="muted small drawer">
          💵 Dinheiro esperado na gaveta: <b>{money(gaveta)}</b>
          <br />
          {fundo > 0 && `troco inicial ${money(fundo)} + `}vendas em dinheiro {money(dinheiro)}
          {gastoDinheiro > 0 && ` − gastos em dinheiro ${money(gastoDinheiro)}`}
        </p>
      )}

      <GastosDoDia day={day} gastos={gastos} />

      {batches.length === 0 && <Empty>Nenhuma venda neste dia.</Empty>}
      <ul className="batch-list">
        {batches.map(([batchId, lines]) => {
          const bt = totals(lines);
          const pays = new Map<string, number>();
          for (const l of lines) for (const p of salePayments(l)) pays.set(p.method, (pays.get(p.method) ?? 0) + p.value);
          return (
            <li key={batchId} className="card">
              <div className="batch-head">
                <div className="grow">
                  <b>{time(lines[0].date)}</b>
                  <div className="muted small pay-desc">
                    {[...pays.entries()].map(([m, v]) => `${METHOD_LABELS[m] ?? m}${pays.size > 1 ? ' ' + money(v) : ''}`).join(' + ') ||
                      METHOD_LABELS[lines[0].method]}
                  </div>
                </div>
                <b className="nowrap">{money(bt.gross)}</b>
                <button className="ghost small" onClick={() => removeBatch(batchId)} aria-label="Excluir venda">
                  🗑
                </button>
              </div>
              <ul className="lines">
                {lines.map((l) => (
                  <li key={l.id}>
                    <span className="grow">
                      {l.qty}× {l.productName.trim()}
                    </span>
                    <span className="line-values">
                      <span className="nowrap">{money(l.grossValue)}</span>
                      <span className="muted small nowrap">lucro {money(l.netProfit)}</span>
                    </span>
                    {lines.length > 1 && (
                      <button className="ghost small" onClick={() => removeLine(l)} aria-label="Excluir item">
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
