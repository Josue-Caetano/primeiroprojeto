import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, recalcRecipes } from '../../db/db';
import { newId } from '../../domain/ids';
import type { Insumo, InsumoUnit } from '../../domain/types';
import { Empty, Field, Modal, NumInput } from '../components/common';
import { money } from '../format';

const UNITS: { v: InsumoUnit; label: string }[] = [
  { v: 'g', label: 'gramas (g)' },
  { v: 'ml', label: 'mililitros (ml)' },
  { v: 'un', label: 'unidades (un)' },
];

/** Preço por 1 kg / 1 L / 1 un, para leitura humana. */
export function unitPriceLabel(i: Insumo) {
  if (!i.weight) return '—';
  if (i.unit === 'un') return `${money(i.price / i.weight)}/un`;
  return `${money((i.price / i.weight) * 1000)}/${i.unit === 'g' ? 'kg' : 'L'}`;
}

export function Insumos() {
  const insumos = useLiveQuery(() => db.insumos.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const [editing, setEditing] = useState<Insumo | null>(null);
  const [q, setQ] = useState('');
  if (!insumos) return null;

  const usage = (id: string) => (recipes ?? []).filter((r) => r.ingredients.some((g) => g.insumoId === id)).length;
  const list = insumos
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <p className="muted">Ingredientes e embalagens com o preço pago. São usados nas fichas técnicas para calcular o custo dos produtos.</p>
      <div className="row">
        <input className="grow" placeholder="Buscar insumo" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setEditing({ id: '', name: '', price: 0, weight: 1000, unit: 'g' })}>
          + Novo
        </button>
      </div>
      {list.length === 0 && <Empty>Nenhum insumo.</Empty>}
      <ul className="list">
        {list.map((i) => (
          <li key={i.id} className="card clickable" onClick={() => setEditing(i)}>
            <div className="grow">
              <b>{i.name.trim()}</b>
              <div className="muted small">
                {money(i.price)} por {i.weight.toLocaleString('pt-BR')} {i.unit} · {unitPriceLabel(i)}
                {usage(i.id) > 0 && ` · em ${usage(i.id)} ficha(s)`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {editing && <InsumoForm insumo={editing} usedIn={usage(editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InsumoForm({ insumo, usedIn, onClose }: { insumo: Insumo; usedIn: number; onClose: () => void }) {
  const [i, setI] = useState(insumo);
  const isNew = !insumo.id;
  const save = async () => {
    if (!i.name.trim()) return alert('Informe o nome');
    if (i.weight <= 0) return alert('A quantidade da embalagem deve ser maior que zero');
    const id = isNew ? newId() : i.id;
    await db.insumos.put({ ...i, id });
    if (!isNew) {
      const n = await recalcRecipes([id]);
      if (n > 0) alert(`${n} ficha(s) técnica(s) e os custos dos produtos vinculados foram atualizados.`);
    }
    onClose();
  };
  const remove = async () => {
    if (usedIn > 0 && !confirm(`Este insumo é usado em ${usedIn} ficha(s). Excluir mesmo assim? Ele passará a custar zero nelas.`)) return;
    if (usedIn === 0 && !confirm(`Excluir "${i.name.trim()}"?`)) return;
    await db.insumos.delete(i.id);
    onClose();
  };
  return (
    <Modal title={isNew ? 'Novo insumo' : 'Editar insumo'} onClose={onClose}>
      <Field label="Nome">
        <input value={i.name} autoFocus onChange={(e) => setI({ ...i, name: e.target.value })} />
      </Field>
      <Field label="Preço pago (R$)">
        <NumInput value={i.price} onChange={(price) => setI({ ...i, price })} />
      </Field>
      <div className="row">
        <Field label="Quantidade na embalagem">
          <NumInput value={i.weight} onChange={(weight) => setI({ ...i, weight })} />
        </Field>
        <Field label="Unidade">
          <select value={i.unit} onChange={(e) => setI({ ...i, unit: e.target.value as InsumoUnit })}>
            {UNITS.map((u) => (
              <option key={u.v} value={u.v}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted">= {unitPriceLabel(i)}</p>
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
