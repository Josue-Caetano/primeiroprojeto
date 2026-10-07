import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, getSettings } from '../../db/db';
import { newId } from '../../domain/ids';
import type { Product } from '../../domain/types';
import { Empty, Field, Modal, NumInput } from '../components/common';
import { money, pct } from '../format';

export function Produtos() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const settings = useLiveQuery(getSettings, []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const [editing, setEditing] = useState<Product | null>(null);

  if (!products || !settings) return null;
  const linked = new Map((recipes ?? []).filter((r) => r.linkedProductId).map((r) => [r.linkedProductId!, r.name]));
  const groups = new Map<string, Product[]>();
  for (const p of [...products].sort((a, b) => a.name.localeCompare(b.name))) {
    groups.set(p.type || 'Sem categoria', [...(groups.get(p.type || 'Sem categoria') ?? []), p]);
  }

  return (
    <div className="page">
      <button
        className="primary full"
        onClick={() =>
          setEditing({ id: '', type: settings.categories[0] ?? '', name: '', price: 0, cost: 0, createdAt: '', saleMode: 'unit' })
        }
      >
        + Novo produto
      </button>
      {products.length === 0 && <Empty>Nenhum produto cadastrado.</Empty>}
      {[...groups.entries()].map(([type, list]) => (
        <section key={type}>
          <h3 className="group-title">{type}</h3>
          <ul className="list">
            {list.map((p) => (
              <li key={p.id} className="card clickable" onClick={() => setEditing(p)}>
                <div className="grow">
                  <b>{p.name.trim()}</b>
                  <div className="muted small">
                    custo {money(p.cost)} · margem {pct(p.price ? ((p.price - p.cost) / p.price) * 100 : 0)}
                    {linked.has(p.id) && ' · custo pela ficha técnica'}
                  </div>
                </div>
                <b>{money(p.price)}</b>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editing && (
        <ProductForm
          product={editing}
          categories={settings.categories}
          linkedRecipe={linked.get(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  categories,
  linkedRecipe,
  onClose,
}: {
  product: Product;
  categories: string[];
  linkedRecipe?: string;
  onClose: () => void;
}) {
  const [p, setP] = useState(product);
  const isNew = !product.id;
  const save = async () => {
    if (!p.name.trim()) return alert('Informe o nome');
    if (isNew) await db.products.add({ ...p, id: newId(), createdAt: new Date().toISOString() });
    else await db.products.put(p);
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Excluir "${p.name.trim()}"? As vendas já feitas continuam no histórico.`)) return;
    await db.products.delete(p.id);
    await db.recipes.where('linkedProductId').equals(p.id).modify((r) => {
      delete r.linkedProductId;
    });
    onClose();
  };
  return (
    <Modal title={isNew ? 'Novo produto' : 'Editar produto'} onClose={onClose}>
      <Field label="Nome">
        <input value={p.name} autoFocus onChange={(e) => setP({ ...p, name: e.target.value })} />
      </Field>
      <Field label="Categoria">
        <select value={p.type} onChange={(e) => setP({ ...p, type: e.target.value })}>
          {!categories.includes(p.type) && <option value={p.type}>{p.type || '—'}</option>}
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="row">
        <Field label="Preço de venda (R$)">
          <NumInput value={p.price} onChange={(price) => setP({ ...p, price })} />
        </Field>
        <Field label="Custo (R$)" hint={linkedRecipe ? `Atualizado pela ficha "${linkedRecipe.trim()}"` : undefined}>
          <NumInput value={p.cost} onChange={(cost) => setP({ ...p, cost })} />
        </Field>
      </div>
      <p className="muted">
        Lucro por unidade (antes das taxas): <b>{money(p.price - p.cost)}</b>
      </p>
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
