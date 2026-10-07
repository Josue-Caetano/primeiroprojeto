import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, getSettings } from '../../db/db';
import { buildSales, cartTotal, round2, totals, type CartItem } from '../../domain/calc';
import { METHOD_LABELS, PAYMENT_METHODS, type Payment, type PaymentMethod, type Product } from '../../domain/types';
import { Empty, Modal, NumInput } from '../components/common';
import { money } from '../format';

export function Vender() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const settings = useLiveQuery(getSettings, []);
  const todaySales = useLiveQuery(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return db.sales.where('date').aboveOrEqual(start.toISOString()).toArray();
  }, []);
  // ordem dos produtos: mais vendidos primeiro (últimas ~2000 vendas), depois por nome
  const ranking = useLiveQuery(async () => {
    const recent = await db.sales.orderBy('date').reverse().limit(2000).toArray();
    const m = new Map<string, number>();
    for (const s of recent) m.set(s.productId, (m.get(s.productId) ?? 0) + s.qty);
    return m;
  }, []);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<string>('');
  const [checkout, setCheckout] = useState(false);
  const [flash, setFlash] = useState<string>('');

  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.type).filter(Boolean))], [products]);
  const visible = useMemo(() => {
    const list = (products ?? []).filter((p) => !category || p.type === category);
    return list.sort((a, b) => (ranking?.get(b.id) ?? 0) - (ranking?.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [products, category, ranking]);

  const add = (p: Product, delta = 1) =>
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id);
      if (i < 0) return delta > 0 ? [...c, { product: p, qty: delta, unitPrice: p.price }] : c;
      const next = [...c];
      next[i] = { ...next[i], qty: next[i].qty + delta };
      return next.filter((x) => x.qty > 0);
    });

  const total = cartTotal(cart);
  const qtyOf = (id: string) => cart.find((x) => x.product.id === id)?.qty ?? 0;
  const today = todaySales ? totals(todaySales) : null;

  if (!products || !settings) return null;

  return (
    <div className="page vender">
      {today && (
        <div className="today-bar">
          Hoje: <b>{today.batches}</b> vendas · <b>{money(today.gross)}</b> · lucro <b>{money(today.net)}</b>
        </div>
      )}
      {flash && <div className="flash">{flash}</div>}

      {categories.length > 1 && (
        <div className="chips">
          <button className={!category ? 'chip on' : 'chip'} onClick={() => setCategory('')}>
            Todos
          </button>
          {categories.map((c) => (
            <button key={c} className={category === c ? 'chip on' : 'chip'} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <Empty>Nenhum produto. Cadastre em Produtos ou restaure um backup em Ajustes.</Empty>
      ) : (
        <div className="product-grid">
          {visible.map((p) => {
            const q = qtyOf(p.id);
            return (
              <button key={p.id} className={`product-tile ${q ? 'in-cart' : ''}`} onClick={() => add(p)}>
                {q > 0 && <span className="badge">{q}</span>}
                <span className="name">{p.name.trim()}</span>
                <span className="price">{money(p.price)}</span>
              </button>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="cart">
          <ul>
            {cart.map((item, idx) => (
              <li key={item.product.id}>
                <span className="grow">{item.product.name.trim()}</span>
                <button className="qty-btn" onClick={() => add(item.product, -1)} aria-label="Menos">
                  −
                </button>
                <b className="qty">{item.qty}</b>
                <button className="qty-btn" onClick={() => add(item.product, 1)} aria-label="Mais">
                  +
                </button>
                <span className="unit-price" title="Preço unitário (toque para dar desconto)">
                  <NumInput
                    value={item.unitPrice}
                    onChange={(v) => setCart((c) => c.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)))}
                  />
                </span>
                <span className="line-total">{money(item.qty * item.unitPrice)}</span>
              </li>
            ))}
          </ul>
          <div className="cart-footer">
            <button className="ghost" onClick={() => setCart([])}>
              Limpar
            </button>
            <button className="primary big" disabled={total <= 0} onClick={() => setCheckout(true)}>
              Cobrar {money(total)}
            </button>
          </div>
        </div>
      )}

      {checkout && (
        <Checkout
          total={total}
          onClose={() => setCheckout(false)}
          onConfirm={async (payments) => {
            const sales = buildSales(cart, payments, settings);
            await db.sales.bulkAdd(sales);
            setCart([]);
            setCheckout(false);
            setFlash(`Venda registrada: ${money(total)}`);
            setTimeout(() => setFlash(''), 2500);
          }}
        />
      )}
    </div>
  );
}

function Checkout({
  total,
  onClose,
  onConfirm,
}: {
  total: number;
  onClose: () => void;
  onConfirm: (p: Payment[]) => Promise<void>;
}) {
  const [multi, setMulti] = useState(false);
  const [values, setValues] = useState<Record<PaymentMethod, number>>({ pix: 0, pix_mq: 0, dinheiro: 0, debito: 0, credito: 0 });
  const [received, setReceived] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async (payments: Payment[]) => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(payments);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const paid = round2(Object.values(values).reduce((a, b) => a + b, 0));
  const missing = round2(total - paid);

  return (
    <Modal title={`Total ${money(total)}`} onClose={onClose}>
      {!multi ? (
        <>
          <div className="pay-grid">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} className={`pay ${m}`} disabled={busy} onClick={() => confirm([{ method: m, value: total }])}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="change-calc">
            <span>Troco — recebido em dinheiro:</span>
            <NumInput value={received} onChange={setReceived} />
            {received > 0 && (
              <b className={received >= total ? 'good' : 'bad'}>
                {received >= total ? `Troco ${money(received - total)}` : `Faltam ${money(total - received)}`}
              </b>
            )}
          </div>
          <button className="ghost full" onClick={() => setMulti(true)}>
            Dividir em mais de uma forma de pagamento
          </button>
        </>
      ) : (
        <>
          {PAYMENT_METHODS.map((m) => (
            <div className="split-row" key={m}>
              <span>{METHOD_LABELS[m]}</span>
              <NumInput value={values[m]} onChange={(v) => setValues((s) => ({ ...s, [m]: v }))} />
              <button
                className="ghost small"
                onClick={() => setValues((s) => ({ ...s, [m]: round2(s[m] + Math.max(missing, 0)) }))}
              >
                restante
              </button>
            </div>
          ))}
          <p className={Math.abs(missing) < 0.01 ? 'good' : 'bad'}>
            {Math.abs(missing) < 0.01 ? 'Valores conferem' : missing > 0 ? `Faltam ${money(missing)}` : `Passou ${money(-missing)}`}
          </p>
          <div className="row">
            <button className="ghost" onClick={() => setMulti(false)}>
              Voltar
            </button>
            <button
              className="primary"
              disabled={busy || Math.abs(missing) >= 0.01}
              onClick={() =>
                confirm(PAYMENT_METHODS.filter((m) => values[m] > 0).map((m) => ({ method: m, value: values[m] })))
              }
            >
              Confirmar
            </button>
          </div>
        </>
      )}
      {error && <p className="bad">{error}</p>}
    </Modal>
  );
}
