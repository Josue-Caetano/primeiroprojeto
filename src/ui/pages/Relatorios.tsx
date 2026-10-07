import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import { byPaymentMethod, groupSum, localDay, totals } from '../../domain/calc';
import { METHOD_LABELS } from '../../domain/types';
import { Empty, Stat } from '../components/common';
import { money, pct } from '../format';

type Preset = 'hoje' | '7d' | '30d' | 'mes' | 'mesAnt' | 'tudo' | 'custom';

function range(preset: Preset, from: string, to: string): [Date, Date] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (preset) {
    case 'hoje':
      return [startOfDay(now), tomorrow];
    case '7d':
      return [new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), tomorrow];
    case '30d':
      return [new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), tomorrow];
    case 'mes':
      return [new Date(now.getFullYear(), now.getMonth(), 1), tomorrow];
    case 'mesAnt':
      return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    case 'tudo':
      return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
    case 'custom': {
      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      return [new Date(fy, fm - 1, fd), new Date(ty, tm - 1, td + 1)];
    }
  }
}

const PRESETS: [Preset, string][] = [
  ['hoje', 'Hoje'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['mes', 'Este mês'],
  ['mesAnt', 'Mês passado'],
  ['tudo', 'Tudo'],
  ['custom', 'Período'],
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function Relatorios() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState(localDay(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(localDay(new Date()));
  const [start, end] = range(preset, from, to);

  const sales = useLiveQuery(
    () => db.sales.where('date').between(start.toISOString(), end.toISOString(), true, false).toArray(),
    [start.getTime(), end.getTime()],
  );
  const products = useLiveQuery(() => db.products.toArray(), []);

  const data = useMemo(() => {
    if (!sales) return null;
    const typeOf = new Map((products ?? []).map((p) => [p.id, p.type]));
    const t = totals(sales);
    const days = groupSum(sales, (s) => localDay(s.date)).sort((a, b) => a.key.localeCompare(b.key));
    const weekdays = groupSum(sales, (s) => new Date(s.date).getDay()).sort((a, b) => a.key - b.key);
    const hours = groupSum(sales, (s) => new Date(s.date).getHours()).sort((a, b) => a.key - b.key);
    return {
      t,
      days,
      months: groupSum(sales, (s) => localDay(s.date).slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
      weekdays,
      hours,
      products: groupSum(sales, (s) => s.productName.trim()),
      categories: groupSum(sales, (s) => s.productType || typeOf.get(s.productId) || 'Sem categoria'),
      methods: byPaymentMethod(sales),
      activeDays: days.length,
    };
  }, [sales, products]);

  return (
    <div className="page">
      <div className="chips">
        {PRESETS.map(([k, label]) => (
          <button key={k} className={preset === k ? 'chip on' : 'chip'} onClick={() => setPreset(k)}>
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="row">
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span>até</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      )}

      {!data ? null : data.t.batches === 0 ? (
        <Empty>Nenhuma venda no período.</Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="Faturamento" value={money(data.t.gross)} />
            <Stat label="Lucro líquido" value={money(data.t.net)} tone={data.t.net >= 0 ? 'good' : 'bad'} />
            <Stat label="Custo dos produtos" value={money(data.t.cost)} />
            <Stat label="Taxas de cartão/pix" value={money(data.t.fees)} />
            <Stat label="Vendas" value={data.t.batches} />
            <Stat label="Itens vendidos" value={data.t.items} />
            <Stat label="Ticket médio" value={money(data.t.gross / data.t.batches)} />
            <Stat label="Margem" value={pct(data.t.gross ? (data.t.net / data.t.gross) * 100 : 0)} />
            <Stat label="Média por dia trabalhado" value={money(data.t.gross / Math.max(data.activeDays, 1))} />
            <Stat label="Lucro médio por dia" value={money(data.t.net / Math.max(data.activeDays, 1))} />
          </div>

          {data.days.length > 1 && (
            <section className="card">
              {/* períodos longos viram barras por mês para caber na tela */}
              <h3>Faturamento por {data.days.length > 45 ? 'mês' : 'dia'} (claro = lucro)</h3>
              <Bars
                rows={
                  data.days.length > 45
                    ? data.months.map((m) => ({ label: m.key.slice(5, 7) + '/' + m.key.slice(2, 4), value: m.gross, sub: m.net }))
                    : data.days.map((d) => ({ label: d.key.slice(8, 10) + '/' + d.key.slice(5, 7), value: d.gross, sub: d.net }))
                }
                vertical
              />
            </section>
          )}

          <section className="card">
            <h3>Por forma de pagamento</h3>
            <Bars rows={data.methods.map((m) => ({ label: METHOD_LABELS[m.method] ?? m.method, value: m.value }))} />
          </section>

          <section className="card">
            <h3>Por categoria</h3>
            <Table rows={data.categories} />
          </section>

          <section className="card">
            <h3>Por produto</h3>
            <Table rows={data.products} />
          </section>

          <section className="card">
            <h3>Por dia da semana</h3>
            <Bars rows={data.weekdays.map((w) => ({ label: WEEKDAYS[w.key], value: w.gross }))} />
          </section>

          <section className="card">
            <h3>Por horário</h3>
            <Bars rows={data.hours.map((h) => ({ label: `${String(h.key).padStart(2, '0')}h`, value: h.gross }))} />
          </section>
        </>
      )}
    </div>
  );
}

function Table({ rows }: { rows: { key: string; qty: number; gross: number; net: number }[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Nome</th>
          <th className="right">Qtd</th>
          <th className="right">Bruto</th>
          <th className="right">Lucro</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="right">{r.qty}</td>
            <td className="right">{money(r.gross)}</td>
            <td className="right">{money(r.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars({ rows, vertical }: { rows: { label: string; value: number; sub?: number }[]; vertical?: boolean }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (vertical) {
    return (
      <div className="vbars">
        {rows.map((r) => (
          <div key={r.label} className="vbar" title={`${r.label}: ${money(r.value)}${r.sub != null ? ` (lucro ${money(r.sub)})` : ''}`}>
            <div className="fill" style={{ height: `${(r.value / max) * 100}%` }}>
              {r.sub != null && <div className="fill-sub" style={{ height: `${(Math.max(r.sub, 0) / Math.max(r.value, 0.01)) * 100}%` }} />}
            </div>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar">
          <span className="label">{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="value">{money(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
