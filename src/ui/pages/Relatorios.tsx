import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, getGastos, getRecebimentos, getSettings } from '../../db/db';
import { byPaymentMethod, groupSum, localDay, round2, totals } from '../../domain/calc';
import { comTaxasFiado, fiadoDaLinha, gastosPorNome } from '../../domain/fiado';
import { METHOD_LABELS } from '../../domain/types';
import { Empty, Stat, downloadBlob } from '../components/common';
import { totalGastos } from '../components/Gastos';
import { dayLabel, money, pct } from '../format';

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
  const allGastos = useLiveQuery(getGastos, []);
  const [fromDay, toDay] = [localDay(start), localDay(end)];
  const gastosPeriodo = (allGastos ?? []).filter((g) => g.data >= fromDay && g.data < toDay);
  const gastoTotal = totalGastos(gastosPeriodo);
  const allRecebimentos = useLiveQuery(getRecebimentos, []);
  const settings = useLiveQuery(getSettings, []);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const recebidos = (allRecebimentos ?? []).filter((r) => {
    const d = localDay(r.data);
    return d >= fromDay && d < toDay;
  });

  const data = useMemo(() => {
    if (!sales) return null;
    const typeOf = new Map((products ?? []).map((p) => [p.id, p.type]));
    // taxas de fiado recebido no cartão entram no período em que foi recebido
    const t = comTaxasFiado(totals(sales), recebidos);
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
      melhorDia: [...days].sort((a, b) => b.gross - a.gross)[0] ?? null,
      fiado: {
        vendido: round2(sales.reduce((a, s) => a + fiadoDaLinha(s), 0)),
        recebido: round2(recebidos.reduce((a, r) => a + r.valor, 0)),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, products, allRecebimentos, fromDay, toDay]);

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
            {gastoTotal > 0 && <Stat label="Gastos" value={money(gastoTotal)} tone="bad" />}
            {gastoTotal > 0 && (
              <Stat
                label="Lucro após gastos"
                value={money(data.t.net - gastoTotal)}
                tone={data.t.net - gastoTotal >= 0 ? 'good' : 'bad'}
              />
            )}
            <Stat label="Vendas" value={data.t.batches} />
            <Stat label="Itens vendidos" value={data.t.items} />
            <Stat label="Ticket médio" value={money(data.t.gross / data.t.batches)} />
            <Stat label="Margem" value={pct(data.t.gross ? (data.t.net / data.t.gross) * 100 : 0)} />
            <Stat label="Média por dia trabalhado" value={money(data.t.gross / Math.max(data.activeDays, 1))} />
            <Stat label="Lucro médio por dia" value={money(data.t.net / Math.max(data.activeDays, 1))} />
          </div>

          {data.melhorDia && data.activeDays > 1 && (
            <p className="muted small" style={{ margin: '10px 2px 0' }}>
              🏆 Melhor dia: <b>{dayLabel(data.melhorDia.key)}</b>, com {money(data.melhorDia.gross)} em {data.melhorDia.sales} vendas.
            </p>
          )}

          {gastosPeriodo.length > 0 && (
            <section className="card">
              <h3>Gastos</h3>
              <ul className="lines">
                {gastosPorNome(gastosPeriodo).map((g) => (
                  <li key={g.nome}>
                    <span className="grow">
                      {g.nome}
                      {g.vezes > 1 ? ` (${g.vezes}×)` : ''}
                    </span>
                    <b className="bad">− {money(g.valor)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(data.fiado.vendido > 0 || data.fiado.recebido > 0) && (
            <section className="card">
              <h3>Fiado</h3>
              <ul className="lines">
                <li>
                  <span className="grow">Vendido no fiado</span>
                  <b>{money(data.fiado.vendido)}</b>
                </li>
                <li>
                  <span className="grow">Recebido de fiado</span>
                  <b>{money(data.fiado.recebido)}</b>
                </li>
              </ul>
              <p className="muted small">O fiado já conta no faturamento do dia da venda. Quem está devendo aparece em Cadastros → Fiado.</p>
            </section>
          )}

          {data.days.length > 1 && (
            <section className="card">
              {/* períodos longos viram barras por mês para caber na tela */}
              <h3>Faturamento por {data.days.length > 45 ? 'mês' : 'dia'}</h3>
              <VBars
                rows={
                  data.days.length > 45
                    ? data.months.map((m) => ({
                        ...m,
                        tick: m.key.slice(5, 7) + '/' + m.key.slice(2, 4),
                        title: monthLabel(m.key),
                        gastos: gastosPorNome(gastosPeriodo.filter((g) => g.data.startsWith(m.key))),
                      }))
                    : data.days.map((d) => ({
                        ...d,
                        tick: d.key.slice(8, 10) + '/' + d.key.slice(5, 7),
                        title: dayLabel(d.key),
                        gastos: gastosPorNome(gastosPeriodo.filter((g) => g.data === d.key)),
                      }))
                }
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

          <button
            className="primary full big"
            disabled={gerandoPdf}
            onClick={async () => {
              setGerandoPdf(true);
              try {
                const { gerarRelatorioPDF } = await import('../pdf');
                const { blob, nome } = await gerarRelatorioPDF({
                  storeName: settings?.storeName ?? '',
                  logo: settings?.logo,
                  rotulo: PRESETS.find(([k]) => k === preset)![1],
                  ini: preset === 'tudo' ? '2000-01-01' : fromDay,
                  fim: toDay,
                  t: data.t,
                  gastos: gastosPorNome(gastosPeriodo),
                  fiado: data.fiado,
                  formas: data.methods.map((m) => ({ method: m.method, value: m.value })),
                  produtos: data.products,
                  dias: data.days,
                  meses: data.months,
                });
                downloadBlob(blob, nome);
              } catch (e) {
                alert('Não foi possível gerar o PDF: ' + (e as Error).message);
              } finally {
                setGerandoPdf(false);
              }
            }}
          >
            {gerandoPdf ? 'Gerando PDF…' : '📄 Baixar relatório em PDF'}
          </button>
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

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

type VRow = {
  key: string;
  tick: string;
  title: string;
  gross: number;
  cost: number;
  fees: number;
  net: number;
  sales: number;
  /** gastos do dia (ou do mês) somados pelo nome */
  gastos: { nome: string; valor: number; vezes: number }[];
};

const TIP_WIDTH = 224;

/** Colunas de faturamento com o lucro por dentro; tocar (ou passar o mouse) numa coluna abre o balão. */
function VBars({ rows }: { rows: VRow[] }) {
  const [sel, setSel] = useState<{ i: number; x: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const max = Math.max(...rows.map((r) => r.gross), 1);

  // toque fora do gráfico fecha o balão
  useEffect(() => {
    if (!sel) return;
    const close = (e: PointerEvent) => {
      if (!chartRef.current?.contains(e.target as Node)) setSel(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [sel]);

  const select = (i: number, el: HTMLElement) => {
    const box = chartRef.current!.getBoundingClientRect();
    const bar = el.getBoundingClientRect();
    setSel({ i, x: bar.left + bar.width / 2 - box.left });
  };

  const width = chartRef.current?.clientWidth ?? 0;
  const r = sel ? (rows[sel.i] ?? null) : null; // trocar o período pode deixar o índice fora da lista
  // o balão fica ao lado da coluna escolhida (do lado com mais espaço) para não cobri-la
  const tipLeft = sel
    ? Math.min(Math.max(sel.x > width / 2 ? sel.x - 12 - TIP_WIDTH : sel.x + 12, 0), Math.max(width - TIP_WIDTH, 0))
    : 0;

  return (
    <div className="chart" ref={chartRef} onPointerLeave={(e) => e.pointerType === 'mouse' && setSel(null)}>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--primary)' }} />
          Faturamento
        </span>
        <span>
          <i style={{ background: 'var(--bar-sub)' }} />
          Lucro
        </span>
      </div>
      <div className="vbars" onScroll={() => setSel(null)}>
        {rows.map((row, i) => (
          <button
            key={row.key}
            type="button"
            className={`vbar ${sel?.i === i ? 'on' : sel ? 'dim' : ''}`}
            aria-label={`${row.title}: faturamento ${money(row.gross)}, lucro ${money(row.net)}`}
            onClick={(e) => select(i, e.currentTarget)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && select(i, e.currentTarget)}
          >
            <span className="plot">
              <span className="fill" style={{ height: `${(row.gross / max) * 100}%` }}>
                <span className="fill-sub" style={{ height: `${(Math.max(row.net, 0) / Math.max(row.gross, 0.01)) * 100}%` }} />
              </span>
            </span>
            <span className="tick">{row.tick}</span>
          </button>
        ))}
      </div>
      {r && (
        <div className="tip" role="status" style={{ left: tipLeft, width: TIP_WIDTH }}>
          <div className="tip-title">{r.title.charAt(0).toUpperCase() + r.title.slice(1)}</div>
          <div className="tip-row">
            <span>Faturamento</span>
            <b>{money(r.gross)}</b>
          </div>
          <div className="tip-row">
            <span>Lucro</span>
            <b className="good">{money(r.net)}</b>
          </div>
          <div className="tip-row">
            <span>Custo dos produtos</span>
            <b>{money(r.cost)}</b>
          </div>
          <div className="tip-row">
            <span>Taxas</span>
            <b>{money(r.fees)}</b>
          </div>
          {r.gastos.map((g) => (
            <div className="tip-row" key={g.nome}>
              <span>
                {g.nome}
                {g.vezes > 1 ? ` (${g.vezes}×)` : ''}
              </span>
              <b className="bad">− {money(g.valor)}</b>
            </div>
          ))}
          {r.gastos.length > 0 && (
            <div className="tip-row">
              <span>Sobrou</span>
              <b className="good">{money(r.net - r.gastos.reduce((a, g) => a + g.valor, 0))}</b>
            </div>
          )}
          <div className="tip-row">
            <span>Vendas</span>
            <b>{r.sales}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
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
