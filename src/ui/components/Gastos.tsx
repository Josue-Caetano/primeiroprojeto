import { useState } from 'react';
import { getGastos, saveGastos } from '../../db/db';
import { round2 } from '../../domain/calc';
import { newId } from '../../domain/ids';
import type { Gasto } from '../../domain/types';
import { money } from '../format';
import { Field, Modal, NumInput } from './common';

// Códigos de forma de pagamento do gasto. "outro" é o que o app antigo grava; códigos
// desconhecidos aparecem como vieram.
export const FORMAS_GASTO: [string, string][] = [
  ['dinheiro', 'Dinheiro'],
  ['pix', 'Pix'],
  ['cartao', 'Cartão'],
  ['outro', 'Outro'],
];
export const formaLabel = (f: string) => FORMAS_GASTO.find(([k]) => k === f)?.[1] ?? f;

export const totalGastos = (g: Gasto[]) => round2(g.reduce((a, x) => a + x.valor, 0));

/** Lista e cadastro dos gastos de um dia (usado no Histórico). */
export function GastosDoDia({ day, gastos }: { day: string; gastos: Gasto[] }) {
  const [editing, setEditing] = useState<Gasto | null>(null);
  const doDia = gastos.filter((g) => g.data === day);

  return (
    <section className="card">
      <div className="batch-head">
        <h3 className="grow" style={{ margin: 0 }}>
          Gastos do dia
        </h3>
        {doDia.length > 0 && <b className="nowrap bad">{money(totalGastos(doDia))}</b>}
        <button
          className="ghost small"
          onClick={() => setEditing({ id: '', data: day, valor: 0, descricao: '', forma: 'dinheiro' })}
        >
          + Gasto
        </button>
      </div>
      {doDia.length === 0 ? (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Nenhum gasto. Ex.: gasolina, ingredientes, pagamento de ajudante.
        </p>
      ) : (
        <ul className="lines">
          {doDia.map((g) => (
            <li key={g.id} className="clickable" onClick={() => setEditing(g)}>
              <span className="grow">{g.descricao || 'Gasto'}</span>
              <span className="muted small">{formaLabel(g.forma)}</span>
              <span className="nowrap">{money(g.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      {editing && <GastoForm gasto={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function GastoForm({ gasto, onClose }: { gasto: Gasto; onClose: () => void }) {
  const [g, setG] = useState(gasto);
  const isNew = !gasto.id;
  const formas = FORMAS_GASTO.some(([k]) => k === g.forma) ? FORMAS_GASTO : [...FORMAS_GASTO, [g.forma, g.forma] as [string, string]];

  const save = async () => {
    if (g.valor <= 0) return alert('Informe o valor do gasto');
    const all = await getGastos();
    const item = { ...g, id: isNew ? newId() : g.id, descricao: g.descricao.trim() };
    await saveGastos(isNew ? [...all, item] : all.map((x) => (x.id === item.id ? item : x)));
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Excluir o gasto "${g.descricao || 'Gasto'}" de ${money(g.valor)}?`)) return;
    await saveGastos((await getGastos()).filter((x) => x.id !== g.id));
    onClose();
  };

  return (
    <Modal title={isNew ? 'Novo gasto' : 'Editar gasto'} onClose={onClose}>
      <Field label="Descrição">
        <input value={g.descricao} autoFocus placeholder="Ex.: gasolina" onChange={(e) => setG({ ...g, descricao: e.target.value })} />
      </Field>
      <div className="row">
        <Field label="Valor (R$)">
          <NumInput value={g.valor} onChange={(valor) => setG({ ...g, valor })} />
        </Field>
        <Field label="Pago com">
          <select value={g.forma} onChange={(e) => setG({ ...g, forma: e.target.value })}>
            {formas.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Data">
        <input type="date" value={g.data} onChange={(e) => e.target.value && setG({ ...g, data: e.target.value })} />
      </Field>
      <div className="row">
        {!isNew && (
          <button className="danger" onClick={remove}>
            Excluir
          </button>
        )}
        <button className="primary grow" onClick={save}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
