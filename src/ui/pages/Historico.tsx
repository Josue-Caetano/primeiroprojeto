import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, getCaixas, getGastos, getRecebimentos, getSettings, saveCaixas } from '../../db/db';
import { localDay, salePayments, totals } from '../../domain/calc';
import { addDays, comTaxasFiado, conferirCaixa, sugestaoPreparo } from '../../domain/fiado';
import { METHOD_LABELS, type Gasto, type Recebimento, type Sale } from '../../domain/types';
import { Field, Modal, NumInput, Empty, Stat } from '../components/common';
import { useFiado } from './Clientes';
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

  const gastos = useLiveQuery(getGastos, []) ?? [];
  const settings = useLiveQuery(getSettings, []);
  const recebimentos = useLiveQuery(getRecebimentos, []) ?? [];
  const caixas = useLiveQuery(getCaixas, []) ?? [];
  const fiado = useFiado();
  const hoje = localDay(new Date());
  const recebidosDia = recebimentos.filter((r) => localDay(r.data) === day).sort((a, b) => b.data.localeCompare(a.data));
  // as taxas da maquininha de fiado recebido no cartão entram no dia em que recebeu
  const t = comTaxasFiado(totals(sales ?? []), recebidosDia);
  const gastosDia = gastos.filter((g) => g.data === day);
  const gastoTotal = totalGastos(gastosDia);
  const [conferindo, setConferindo] = useState(false);
  const nomeCliente = (id: string) => fiado?.clientes.find((c) => c.id === id)?.nome ?? 'Cliente apagado';

  // conferência da gaveta: troco + vendas em dinheiro + fiado recebido em dinheiro − gastos pagos com o caixa
  const salvo = caixas.find((c) => c.dia === day);
  const caixa = conferirCaixa(sales ?? [], gastosDia, salvo?.fundo ?? settings?.fundoTroco ?? 0, salvo?.contado ?? '', recebidosDia);
  // "Para amanhã": média dos últimos 4 dias iguais da semana (olha até 90 dias para trás)
  const recentes = useLiveQuery(
    () => (day === hoje ? db.sales.where('date').aboveOrEqual(new Date(Date.now() - 90 * 864e5).toISOString()).toArray() : Promise.resolve([] as Sale[])),
    [day, hoje],
  );
  const amanha = day === hoje && recentes ? sugestaoPreparo(recentes, addDays(hoje, 1)) : null;

  const removeBatch = async (batchId: string) => {
    const noFiado = (sales ?? []).some((s) => s.batchId === batchId && s.customerId);
    if (!confirm(`Excluir esta venda?${noFiado ? ' O fiado dela sai da conta do cliente.' : ''} Esta ação não pode ser desfeita.`)) return;
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

      {day === hoje && fiado && fiado.resumo.devendo > 0 && (
        <p className={`card inner small ${fiado.resumo.atrasado ? 'bad' : ''}`}>
          📒 Fiado a receber: <b>{money(fiado.resumo.aReceber)}</b> · {fiado.resumo.devendo} cliente{fiado.resumo.devendo === 1 ? '' : 's'} devendo
          {fiado.resumo.atrasados > 0 && ` · ${fiado.resumo.atrasados} vencido${fiado.resumo.atrasados === 1 ? '' : 's'}`}
          <br />
          <span className="muted">Veja em Cadastros → Fiado.</span>
        </p>
      )}

      <div className="card drawer-card">
        <div className="batch-head">
          <span className="grow">
            💵 Dinheiro que deveria ter: <b>{money(caixa.esperado)}</b>
            {caixa.diferenca != null && (
              <div className={`small ${Math.abs(caixa.diferenca) < 0.01 ? 'good' : 'bad'}`}>
                {Math.abs(caixa.diferenca) < 0.01
                  ? 'Conferido: o caixa bateu! 👏'
                  : caixa.diferenca > 0
                    ? `Conferido: sobrando ${money(caixa.diferenca)}`
                    : `Conferido: faltando ${money(-caixa.diferenca)}`}
              </div>
            )}
          </span>
          <button className="ghost small" onClick={() => setConferindo(true)}>
            Conferir caixa
          </button>
        </div>
      </div>
      {conferindo && (
        <ConferirCaixa
          dia={day}
          vendas={sales ?? []}
          gastos={gastosDia}
          recebidos={recebidosDia}
          fundoInicial={salvo?.fundo ?? settings?.fundoTroco ?? 0}
          contadoInicial={salvo?.contado ?? ''}
          onClose={() => setConferindo(false)}
        />
      )}

      {recebidosDia.length > 0 && (
        <section className="card">
          <div className="batch-head">
            <h3 className="grow" style={{ margin: 0 }}>
              Fiado recebido
            </h3>
            <b className="good">{money(recebidosDia.reduce((a, r) => a + r.valor, 0))}</b>
          </div>
          <ul className="lines">
            {recebidosDia.map((r) => (
              <li key={r.id}>
                <span className="muted small">{time(r.data)}</span>
                <span className="grow">
                  {nomeCliente(r.clienteId)}
                  <div className="muted small">pagou no {METHOD_LABELS[r.forma] ?? r.forma}</div>
                </span>
                <b>{money(r.valor)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {amanha && amanha.itens.length > 0 && (
        <section className="card">
          <h3 style={{ margin: 0 }}>🍳 Para amanhã</h3>
          <p className="muted small" style={{ margin: '4px 0' }}>
            Média do que saiu nos últimos {amanha.dias.length} dia{amanha.dias.length === 1 ? '' : 's'} iguais da semana (
            {amanha.dias.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')}):
          </p>
          <ul className="lines">
            {amanha.itens.slice(0, 12).map((i) => (
              <li key={i.productId}>
                <span className="grow">{i.nome}</span>
                <b>{i.media}</b>
                <span className="muted small">máx. {i.max}</span>
              </li>
            ))}
          </ul>
        </section>
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
                    {lines[0].customerName ? ` · ${lines[0].customerName}` : ''}
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

function ConferirCaixa({
  dia,
  vendas,
  gastos,
  recebidos,
  fundoInicial,
  contadoInicial,
  onClose,
}: {
  dia: string;
  vendas: Sale[];
  gastos: Gasto[];
  recebidos: Recebimento[];
  fundoInicial: number;
  contadoInicial: number | '';
  onClose: () => void;
}) {
  const [fundo, setFundo] = useState(fundoInicial);
  const [contado, setContado] = useState<number | ''>(contadoInicial);
  const c = conferirCaixa(vendas, gastos, fundo, contado, recebidos);
  const salvar = async () => {
    const outros = (await getCaixas()).filter((x) => x.dia !== dia);
    await saveCaixas([...outros, { dia, fundo, contado }]);
    onClose();
  };
  return (
    <Modal title="Conferir o caixa" onClose={onClose}>
      <Field label="Troco que você levou (R$)">
        <NumInput value={fundo} onChange={setFundo} />
      </Field>
      <div className="card inner">
          <ul className="lines">
        <li>
          <span className="grow">Troco levado</span>
          <b>{money(c.fundo)}</b>
        </li>
        <li>
          <span className="grow">Vendas em dinheiro</span>
          <b>+ {money(c.dinheiro)}</b>
        </li>
        {c.fiadoDinheiro > 0 && (
          <li>
            <span className="grow">Fiado recebido em dinheiro</span>
            <b>+ {money(c.fiadoDinheiro)}</b>
          </li>
        )}
        <li>
          <span className="grow">Gastos pagos com o caixa</span>
          <b>− {money(c.gastosDinheiro)}</b>
        </li>
        <li>
          <span className="grow">
            <b>Deveria ter</b>
          </span>
          <b>{money(c.esperado)}</b>
        </li>
      </ul>
        </div>
      <Field label="Quanto tem de dinheiro agora (R$)" hint="Conte as notas e moedas. Pix e cartão você confere no extrato.">
        <NumInput value={contado === '' ? 0 : contado} placeholder="conte as notas e moedas" onChange={(v) => setContado(v)} />
      </Field>
      {c.diferenca != null && (
        <p className={Math.abs(c.diferenca) < 0.01 ? 'good' : 'bad'}>
          <b>
            {Math.abs(c.diferenca) < 0.01
              ? 'O caixa bateu certinho! 👏'
              : c.diferenca > 0
                ? `Sobrando ${money(c.diferenca)}`
                : `Faltando ${money(-c.diferenca)}`}
          </b>
        </p>
      )}
      <button className="primary full" onClick={salvar}>
        Salvar conferência
      </button>
    </Modal>
  );
}
