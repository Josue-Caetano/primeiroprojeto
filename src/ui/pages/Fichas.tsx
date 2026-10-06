import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, saveRecipe } from '../../db/db';
import { computeRecipe, ingredientCost } from '../../domain/calc';
import { newId } from '../../domain/ids';
import type { Insumo, Product, Recipe } from '../../domain/types';
import { Empty, Field, Modal, NumInput } from '../components/common';
import { money } from '../format';

export function Fichas() {
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const insumos = useLiveQuery(() => db.insumos.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const [editing, setEditing] = useState<Recipe | null>(null);
  if (!recipes || !insumos || !products) return null;
  const productName = new Map(products.map((p) => [p.id, p.name.trim()]));

  return (
    <div className="page">
      <p className="muted">
        Ficha técnica: quanto de cada insumo vai numa receita e quanto ela rende. Calcula o custo por unidade e o preço sugerido; se
        estiver vinculada a um produto, o custo do produto é atualizado automaticamente.
      </p>
      <button
        className="primary full"
        onClick={() =>
          setEditing({
            id: '',
            name: '',
            ingredients: [],
            opFeePercentage: 25,
            markup: 3,
            packagingCost: 0,
            yieldQty: 1,
            unitCost: 0,
            suggestedPrice: 0,
          })
        }
      >
        + Nova ficha técnica
      </button>
      {recipes.length === 0 && <Empty>Nenhuma ficha técnica.</Empty>}
      <ul className="list">
        {[...recipes]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => (
            <li key={r.id} className="card clickable" onClick={() => setEditing(r)}>
              <div className="grow">
                <b>{r.name.trim()}</b>
                <div className="muted small">
                  rende {r.yieldQty} · {r.ingredients.length} insumo(s)
                  {r.linkedProductId && productName.has(r.linkedProductId) && ` · → ${productName.get(r.linkedProductId)}`}
                </div>
              </div>
              <div className="right">
                <div>custo {money(r.unitCost)}</div>
                <div className="muted small">sugerido {money(r.suggestedPrice)}</div>
              </div>
            </li>
          ))}
      </ul>
      {editing && <RecipeForm recipe={editing} insumos={insumos} products={products} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecipeForm({
  recipe,
  insumos,
  products,
  onClose,
}: {
  recipe: Recipe;
  insumos: Insumo[];
  products: Product[];
  onClose: () => void;
}) {
  const [r, setR] = useState(recipe);
  const isNew = !recipe.id;
  const map = new Map(insumos.map((i) => [i.id, i]));
  const c = computeRecipe(r, map);
  const sortedInsumos = [...insumos].sort((a, b) => a.name.localeCompare(b.name));
  const linked = products.find((p) => p.id === r.linkedProductId);

  const save = async () => {
    if (!r.name.trim()) return alert('Informe o nome');
    await saveRecipe({
      ...r,
      id: isNew ? newId() : r.id,
      ingredients: r.ingredients.filter((g) => g.insumoId && g.qty > 0),
      unitCost: c.unitCost,
      suggestedPrice: c.suggestedPrice,
    });
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Excluir a ficha "${r.name.trim()}"?`)) return;
    await db.recipes.delete(r.id);
    onClose();
  };
  const setIng = (idx: number, patch: Partial<Recipe['ingredients'][number]>) =>
    setR({ ...r, ingredients: r.ingredients.map((g, i) => (i === idx ? { ...g, ...patch } : g)) });

  return (
    <Modal title={isNew ? 'Nova ficha técnica' : 'Ficha técnica'} onClose={onClose}>
      <Field label="Nome da receita">
        <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
      </Field>

      <h4>Insumos</h4>
      <ul className="ingredients">
        {r.ingredients.map((g, idx) => {
          const ins = map.get(g.insumoId);
          return (
            <li key={idx}>
              <select value={g.insumoId} onChange={(e) => setIng(idx, { insumoId: e.target.value })}>
                {!ins && <option value={g.insumoId}>(insumo removido)</option>}
                {sortedInsumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name.trim()}
                  </option>
                ))}
              </select>
              <span className="qty-input">
                <NumInput value={g.qty} onChange={(qty) => setIng(idx, { qty })} />
                <small>{ins?.unit ?? ''}</small>
              </span>
              <span className="small right">{money(ingredientCost(g, map))}</span>
              <button className="ghost small" onClick={() => setR({ ...r, ingredients: r.ingredients.filter((_, i) => i !== idx) })}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <button
        className="ghost full"
        disabled={insumos.length === 0}
        onClick={() => setR({ ...r, ingredients: [...r.ingredients, { insumoId: sortedInsumos[0]?.id ?? '', qty: 0 }] })}
      >
        + Adicionar insumo
      </button>

      <div className="row">
        <Field label="Rendimento (unidades)">
          <NumInput value={r.yieldQty} onChange={(yieldQty) => setR({ ...r, yieldQty })} />
        </Field>
        <Field label="Custo operacional (%)" hint="gás, luz, água...">
          <NumInput value={r.opFeePercentage} onChange={(opFeePercentage) => setR({ ...r, opFeePercentage })} />
        </Field>
      </div>
      <div className="row">
        <Field label="Embalagem por unidade (R$)">
          <NumInput value={r.packagingCost} onChange={(packagingCost) => setR({ ...r, packagingCost })} />
        </Field>
        <Field label="Markup (×)">
          <NumInput value={r.markup} onChange={(markup) => setR({ ...r, markup })} />
        </Field>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Insumos</span>
          <strong>{money(c.ingredientsTotal)}</strong>
        </div>
        <div className="stat">
          <span>Receita + operacional</span>
          <strong>{money(c.batchCost)}</strong>
        </div>
        <div className="stat">
          <span>Custo por unidade</span>
          <strong>{money(c.unitCost)}</strong>
        </div>
        <div className="stat good">
          <span>Preço sugerido</span>
          <strong>{money(c.suggestedPrice)}</strong>
        </div>
      </div>

      <Field
        label="Vincular a um produto"
        hint={linked ? `Ao salvar, o custo de "${linked.name.trim()}" passa a ser ${money(c.unitCost)} (preço atual ${money(linked.price)}).` : undefined}
      >
        <select value={r.linkedProductId ?? ''} onChange={(e) => setR({ ...r, linkedProductId: e.target.value || undefined })}>
          <option value="">— nenhum —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name.trim()}
            </option>
          ))}
        </select>
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
