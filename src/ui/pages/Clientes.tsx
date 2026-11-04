import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, getClientes, getRecebimentos, getSettings, removeIn, saveClientes, saveRecebimentos, upsertIn } from '../../db/db';
import { localDay, round2 } from '../../domain/calc';
import {
  SEM_FIADO,
  addDays,
  disponivelFiado,
  fiadoDaLinha,
  mensagemCobranca,
  numeroWhats,
  quandoFiado,
  resumoFiado,
  saldosFiado,
  taxaRecebimento,
  type SituacaoFiado,
} from '../../domain/fiado';
import { newId } from '../../domain/ids';
import { METHOD_LABELS, PAYMENT_METHODS, type Cliente, type Sale } from '../../domain/types';
import { Empty, Field, Modal, NumInput, Stat } from '../components/common';
import { money, time } from '../format';

const normal = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const curta = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

/** Clientes, vendas no fiado, recebimentos e a situação de cada cliente (sempre atualizados). */
export function useFiado() {
  const clientes = useLiveQuery(getClientes, []);
  const recebimentos = useLiveQuery(getRecebimentos, []);
  const vendas = useLiveQuery(() => db.sales.where('customerId').above('').toArray(), []);
  return useMemo(() => {
    if (!clientes || !recebimentos || !vendas) return null;
    const hoje = localDay(new Date());
    const saldos = saldosFiado(vendas, recebimentos, hoje);
    const porCliente = new Map(clientes.map((c) => [c.id, saldos.get(c.id) ?? SEM_FIADO]));
    return { hoje, clientes, recebimentos, vendas, porCliente, resumo: resumoFiado(porCliente.values()) };
  }, [clientes, recebimentos, vendas]);
}

export function Clientes() {
  const f = useFiado();
  const settings = useLiveQuery(getSettings, []);
  const [filtro, setFiltro] = useState<'devendo' | 'vencidos' | 'todos'>('devendo');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Cliente | null>(null);
  if (!f || !settings) return null;

  const termo = normal(busca);
  const lista = f.clientes
    .map((c) => ({ c, s: f.porCliente.get(c.id)! }))
    .filter(({ c, s }) => (filtro === 'todos' || (filtro === 'devendo' ? s.saldo > 0 : s.atrasoDias > 0)) && (!termo || normal(c.nome).includes(termo) || c.whatsapp.includes(termo)))
    .sort((a, b) => b.s.atrasoDias - a.s.atrasoDias || b.s.saldo - a.s.saldo || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));

  return (
    <div className="page">
      <p className="muted">Quem levou fiado e ainda vai pagar. O fiado entra no vendido e no lucro do dia da venda; quando o cliente paga, o dinheiro entra no caixa do dia em que você recebeu.</p>
      {settings.fiadoAtivo === false && <p className="aviso">O botão <b>Fiado</b> está desligado na hora de cobrar. Ligue em Ajustes.</p>}
      <div className="stats">
        <Stat label="A receber" value={money(f.resumo.aReceber)} />
        <Stat label={`Vencido (${f.resumo.atrasados})`} value={money(f.resumo.atrasado)} tone={f.resumo.atrasado ? 'bad' : undefined} />
        <Stat label="Devendo" value={`${f.resumo.devendo} de ${f.clientes.length}`} />
      </div>
      <button className="primary full" onClick={() => setEditando(novoCliente())}>
        + Cliente
      </button>
      <div className="chips" style={{ marginTop: 10 }}>
        {(
          [
            ['devendo', 'Devendo'],
            ['vencidos', 'Vencidos'],
            ['todos', 'Todos'],
          ] as const
        ).map(([k, n]) => (
          <button key={k} className={filtro === k ? 'chip on' : 'chip'} onClick={() => setFiltro(k)}>
            {n}
          </button>
        ))}
      </div>
      <input style={{ marginTop: 8 }} type="search" placeholder="Procurar pelo nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {lista.length === 0 ? (
        <Empty>
          {!f.clientes.length
            ? 'Nenhum cliente ainda. Cadastre aqui ou na hora de cobrar, tocando em Fiado.'
            : termo
              ? 'Ninguém com esse nome.'
              : filtro === 'devendo'
                ? 'Ninguém está devendo. 🎉'
                : filtro === 'vencidos'
                  ? 'Nenhum fiado vencido. 🎉'
                  : 'Nenhum cliente.'}
        </Empty>
      ) : (
        <ul className="list">
          {lista.map(({ c, s }) => (
            <li key={c.id} className="card clickable cli-item" onClick={() => setAberto(c.id)}>
              <div className="grow">
                <b>{c.nome}</b>
                <div className={`small ${s.atrasoDias > 0 ? 'bad' : 'muted'}`}>{quandoFiado(s, f.hoje)}</div>
              </div>
              <b className={s.atrasoDias > 0 ? 'bad' : ''}>{s.saldo > 0 ? money(s.saldo) : '✓'}</b>
            </li>
          ))}
        </ul>
      )}
      {aberto && <FichaCliente id={aberto} onClose={() => setAberto(null)} onEdit={(c) => setEditando(c)} />}
      {editando && <ClienteForm cliente={editando} onClose={() => setEditando(null)} onSaved={(c) => !aberto && setAberto(c.id)} />}
    </div>
  );
}

const novoCliente = (nome = ''): Cliente => ({ id: '', nome, whatsapp: '', obs: '', limite: 0 });

function FichaCliente({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: Cliente) => void }) {
  const f = useFiado();
  const settings = useLiveQuery(getSettings, []);
  const [recebendo, setRecebendo] = useState(false);
  if (!f || !settings) return null;
  const c = f.clientes.find((x) => x.id === id);
  if (!c) return null;
  const s = f.porCliente.get(id)!;
  const disp = disponivelFiado(c.limite, s.saldo);

  // compras no fiado e pagamentos, do mais recente para o mais antigo
  const compras = new Map<string, Sale[]>();
  for (const v of f.vendas) if (v.customerId === id && fiadoDaLinha(v) > 0) compras.set(v.batchId, [...(compras.get(v.batchId) ?? []), v]);
  const historico = [
    ...[...compras.values()].map((linhas) => ({
      tipo: 'compra' as const,
      date: linhas[0].date,
      key: linhas[0].batchId,
      linhas,
      valor: round2(linhas.reduce((a, l) => a + fiadoDaLinha(l), 0)),
    })),
    ...f.recebimentos.filter((r) => r.clienteId === id).map((r) => ({ tipo: 'pago' as const, date: r.data, key: r.id, r, valor: r.valor })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const cobrar = async () => {
    const msg = mensagemCobranca(c.nome, s, settings, f.hoje, money);
    const n = numeroWhats(c.whatsapp);
    if (n) {
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      return;
    }
    try {
      await navigator.clipboard.writeText(msg);
      alert('Mensagem de cobrança copiada. Cole no WhatsApp do cliente.');
    } catch {
      prompt('Copie a mensagem de cobrança:', msg);
    }
  };

  return (
    <Modal title={c.nome} onClose={onClose} publico>
      <div className={`card inner saldo-cliente ${s.atrasoDias > 0 ? 'atrasado' : ''}`}>
        <span className="muted small">{s.saldo > 0 ? 'Está devendo' : 'Situação'}</span>
        <h2 className={s.atrasoDias > 0 ? 'bad' : ''} style={{ margin: '2px 0' }}>
          {s.saldo > 0 ? money(s.saldo) : 'Em dia 👍'}
        </h2>
        <span className="small muted">
          {s.saldo > 0
            ? `${quandoFiado(s, f.hoje)}${s.vencimento ? ` · combinado para ${curta(s.vencimento)}` : ''}`
            : s.compras
              ? `Já comprou ${s.compras} vez${s.compras === 1 ? '' : 'es'} no fiado e pagou tudo.`
              : 'Ainda não comprou no fiado.'}
        </span>
      </div>
      {(c.whatsapp || c.obs || c.limite > 0) && (
        <div className="card inner">
          <ul className="lines">
          {c.whatsapp && (
            <li>
              <span className="grow muted">WhatsApp</span>
              <b>{c.whatsapp}</b>
            </li>
          )}
          {c.limite > 0 && (
            <li>
              <span className="grow muted">Limite de fiado</span>
              <b>{money(c.limite)}</b>
            </li>
          )}
          {disp != null && (
            <li>
              <span className="grow muted">Ainda pode comprar</span>
              <b className={disp > 0 ? 'good' : 'bad'}>{money(disp)}</b>
            </li>
          )}
          {c.obs && (
            <li className="nota-privada">
              <span className="grow muted">Anotação</span>
              <b>{c.obs}</b>
            </li>
          )}
        </ul>
        </div>
      )}
      {s.saldo > 0 && (
        <button className="ghost full" onClick={cobrar}>
          💬 {c.whatsapp ? 'Cobrar no WhatsApp' : 'Copiar mensagem de cobrança'}
        </button>
      )}
      <h4>Histórico</h4>
      {historico.length === 0 ? (
        <p className="muted small">Nada por aqui ainda.</p>
      ) : (
        <ul className="lines">
          {historico.map((h) =>
            h.tipo === 'compra' ? (
              <li key={h.key}>
                <span className="muted small nowrap">{curta(localDay(h.date))}</span>
                <span className="grow">
                  {h.linhas.map((l) => `${l.qty}× ${l.productName.trim()}`).join(', ')}
                  <div className="muted small">
                    às {time(h.date)}
                    {h.linhas[0].dueDate ? ` · pagar até ${curta(h.linhas[0].dueDate)}` : ''}
                  </div>
                </span>
                <b className="nowrap bad">+ {money(h.valor)}</b>
              </li>
            ) : (
              <li key={h.key}>
                <span className="muted small nowrap">{curta(localDay(h.date))}</span>
                <span className="grow">
                  Pagou
                  <div className="muted small">
                    {METHOD_LABELS[h.r.forma] ?? h.r.forma} às {time(h.date)}
                  </div>
                </span>
                <b className="nowrap good">− {money(h.valor)}</b>
                <button
                  className="ghost small"
                  aria-label="Apagar este pagamento"
                  onClick={async () => {
                    if (!confirm('Apagar este pagamento? O valor volta a ficar devendo.')) return;
                    await removeIn(getRecebimentos, saveRecebimentos, h.r.id);
                  }}
                >
                  🗑
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      <div className="row">
        <button className="ghost" onClick={() => onEdit(c)}>
          Editar
        </button>
        {s.saldo <= 0 && (
          <button
            className="danger"
            onClick={async () => {
              if (!confirm(`Apagar ${c.nome} da lista de clientes? As vendas continuam nos relatórios.`)) return;
              await removeIn(getClientes, saveClientes, c.id);
              onClose();
            }}
          >
            Apagar
          </button>
        )}
        <button className="primary grow" disabled={s.saldo <= 0} onClick={() => setRecebendo(true)}>
          Receber
        </button>
      </div>
      {recebendo && <Receber cliente={c} saldo={s.saldo} onClose={() => setRecebendo(false)} />}
    </Modal>
  );
}

function Receber({ cliente, saldo, onClose }: { cliente: Cliente; saldo: number; onClose: () => void }) {
  const settings = useLiveQuery(getSettings, []);
  const [valor, setValor] = useState(saldo);
  const [erro, setErro] = useState('');
  if (!settings) return null;
  const receber = async (forma: string) => {
    if (valor <= 0) return setErro('Digite quanto ele pagou.');
    if (valor > saldo + 0.009) return setErro(`Ele deve só ${money(saldo)}.`);
    const v = round2(valor);
    await upsertIn(getRecebimentos, saveRecebimentos, {
      id: newId(),
      clienteId: cliente.id,
      data: new Date().toISOString(),
      valor: v,
      forma,
      taxa: taxaRecebimento(v, forma, settings),
    });
    const resta = round2(saldo - v);
    alert(resta > 0 ? `Recebido ${money(v)}. Ainda deve ${money(resta)}.` : `Recebido ${money(v)}. ${cliente.nome} quitou tudo! 🎉`);
    onClose();
  };
  return (
    <Modal title={`Receber de ${cliente.nome}`} onClose={onClose} publico>
      <p className="muted">
        Está devendo <b>{money(saldo)}</b>
      </p>
      <Field label="Quanto pagou agora (R$)" hint="Pode ser só uma parte. O resto continua anotado.">
        <NumInput value={valor} onChange={setValor} autoFocus />
      </Field>
      <p className="muted small">Toque em como ele pagou:</p>
      <div className="pay-grid">
        {PAYMENT_METHODS.map((m) => (
          <button key={m} className={`pay ${m}`} onClick={() => receber(m)}>
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      {erro && <p className="bad">{erro}</p>}
    </Modal>
  );
}

function ClienteForm({ cliente, onClose, onSaved }: { cliente: Cliente; onClose: () => void; onSaved?: (c: Cliente) => void }) {
  const [c, setC] = useState(cliente);
  const isNew = !cliente.id;
  const save = async () => {
    const saved = await salvarCliente(c);
    if (typeof saved === 'string') return alert(saved);
    onSaved?.(saved);
    onClose();
  };
  return (
    <Modal title={isNew ? 'Novo cliente' : 'Editar cliente'} onClose={onClose}>
      <CamposCliente c={c} onChange={setC} autoFocus={isNew} />
      <button className="primary full" onClick={save}>
        Salvar
      </button>
    </Modal>
  );
}

function CamposCliente({ c, onChange, autoFocus }: { c: Cliente; onChange: (c: Cliente) => void; autoFocus?: boolean }) {
  return (
    <>
      <Field label="Nome">
        <input value={c.nome} maxLength={50} autoFocus={autoFocus} placeholder="Ex.: Maria da farmácia" onChange={(e) => onChange({ ...c, nome: e.target.value })} />
      </Field>
      <Field label="WhatsApp" hint="Para mandar a cobrança com um toque. Pode deixar vazio.">
        <input type="tel" inputMode="tel" maxLength={20} value={c.whatsapp} placeholder="(66) 99999-9999" onChange={(e) => onChange({ ...c, whatsapp: e.target.value })} />
      </Field>
      <Field label="Limite de fiado (R$)" hint="Até quanto ele pode ficar devendo. Zero: sem limite.">
        <NumInput value={c.limite} onChange={(limite) => onChange({ ...c, limite })} placeholder="Sem limite" />
      </Field>
      <Field label="Anotação">
        <input value={c.obs} maxLength={80} placeholder="Ex.: paga todo dia 5" onChange={(e) => onChange({ ...c, obs: e.target.value })} />
      </Field>
    </>
  );
}

/** Grava o cliente (novo ou editado). Devolve o cliente salvo ou a mensagem de erro. */
async function salvarCliente(c: Cliente): Promise<Cliente | string> {
  const nome = c.nome.trim().replace(/\s+/g, ' ');
  if (!nome) return 'Digite o nome do cliente.';
  const todos = await getClientes();
  const repetido = todos.find((x) => x.id !== c.id && normal(x.nome) === normal(nome));
  if (repetido) return `Já tem um cliente chamado ${repetido.nome}.`;
  const salvo: Cliente = {
    ...c,
    id: c.id || newId(),
    nome,
    whatsapp: c.whatsapp.trim(),
    obs: c.obs.trim(),
    limite: Math.max(0, c.limite || 0),
    ...(c.id ? {} : { criadoEm: new Date().toISOString() }),
  };
  await upsertIn(getClientes, saveClientes, salvo);
  return salvo;
}

let prazoLembrado = 7; // dias para pagar, lembrado entre uma venda e outra

/** Passo "para quem é o fiado?" dentro da tela de cobrar. */
export function PassoFiado({
  valor,
  onBack,
  onConfirm,
}: {
  valor: number;
  onBack: () => void;
  onConfirm: (c: { customerId: string; customerName: string; dueDate: string }) => void;
}) {
  const f = useFiado();
  const hoje = localDay(new Date());
  const [termo, setTermo] = useState('');
  const [escolhido, setEscolhido] = useState('');
  const [novo, setNovo] = useState<Cliente | null>(null);
  const [vence, setVence] = useState(addDays(hoje, prazoLembrado));
  const [erro, setErro] = useState('');
  if (!f) return <p className="muted">Carregando clientes…</p>;
  const formNovo = novo ?? (f.clientes.length ? null : novoCliente());

  const t = normal(termo);
  const lista = f.clientes
    .filter((c) => !t || normal(c.nome).includes(t))
    .sort((a, b) => (t ? normal(a.nome).indexOf(t) - normal(b.nome).indexOf(t) : 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 30);
  const exato = f.clientes.some((c) => normal(c.nome) === t);

  const anotar = async () => {
    setErro('');
    let cli = f.clientes.find((c) => c.id === escolhido);
    let saldo: SituacaoFiado = cli ? f.porCliente.get(cli.id)! : SEM_FIADO;
    if (formNovo) {
      // confere sem gravar: o cliente novo só é salvo se o fiado for anotado
      const nome = formNovo.nome.trim().replace(/\s+/g, ' ');
      if (!nome) return setErro('Digite o nome do cliente.');
      if (f.clientes.some((x) => normal(x.nome) === normal(nome))) return setErro(`Já tem um cliente chamado ${nome}.`);
      cli = { ...formNovo, nome };
      saldo = SEM_FIADO;
    }
    if (!cli) return;
    const disp = disponivelFiado(cli.limite, saldo.saldo);
    if (disp != null && valor > disp + 0.009) {
      return setErro(
        disp > 0
          ? `Passa do limite de ${money(cli.limite)}. ${cli.nome} pode comprar só mais ${money(disp)} no fiado.`
          : `${cli.nome} já chegou no limite de ${money(cli.limite)}. Receba antes de anotar mais.`,
      );
    }
    if (formNovo) {
      const salvo = await salvarCliente(cli);
      if (typeof salvo === 'string') return setErro(salvo);
      cli = salvo;
    }
    onConfirm({ customerId: cli.id, customerName: cli.nome, dueDate: vence });
  };

  return (
    <>
      <p className="muted">
        Vai ficar no fiado: <b>{money(valor)}</b>
      </p>
      {formNovo ? (
        <div className="card inner">
          <h4 style={{ marginTop: 0 }}>Cliente novo</h4>
          <CamposCliente c={formNovo} onChange={setNovo} autoFocus />
          {f.clientes.length > 0 && (
            <button className="ghost small" onClick={() => setNovo(null)}>
              Escolher um cliente já cadastrado
            </button>
          )}
        </div>
      ) : (
        <>
          <input type="search" autoFocus placeholder="Para quem é? Digite o nome" value={termo} onChange={(e) => setTermo(e.target.value)} />
          <ul className="list escolha">
            {lista.map((c) => {
              const s = f.porCliente.get(c.id)!;
              const disp = disponivelFiado(c.limite, s.saldo);
              const estoura = disp != null && valor > disp + 0.009;
              return (
                <li
                  key={c.id}
                  className={`card clickable ${escolhido === c.id ? 'escolhido' : ''} ${estoura ? 'bloqueado' : ''}`}
                  onClick={() => !estoura && setEscolhido(c.id)}
                >
                  <div className="grow">
                    <b>{c.nome}</b>
                    <div className={`small ${s.atrasoDias > 0 ? 'bad' : 'muted'}`}>
                      {s.saldo > 0 ? `já deve ${money(s.saldo)}${s.atrasoDias > 0 ? ' (vencido)' : ''}` : 'nada pendente'}
                    </div>
                    {disp != null && (
                      <div className={`small ${estoura ? 'bad' : 'muted'}`}>
                        {estoura
                          ? `Passa do limite de ${money(c.limite)}${disp > 0 ? `: pode só mais ${money(disp)}` : ''}`
                          : `limite ${money(c.limite)} · pode mais ${money(disp)}`}
                      </div>
                    )}
                  </div>
                  {escolhido === c.id && <b className="good">✓</b>}
                </li>
              );
            })}
          </ul>
          {!exato && (
            <button className="ghost full" onClick={() => setNovo(novoCliente(termo.trim()))}>
              + Cadastrar {termo.trim() ? `"${termo.trim()}"` : 'cliente novo'}
            </button>
          )}
        </>
      )}
      <h4>Vai pagar até</h4>
      <div className="chips">
        {[7, 15, 30].map((n) => (
          <button
            key={n}
            className={vence === addDays(hoje, n) ? 'chip on' : 'chip'}
            onClick={() => {
              prazoLembrado = n;
              setVence(addDays(hoje, n));
            }}
          >
            {n} dias
          </button>
        ))}
      </div>
      <input type="date" style={{ marginTop: 6 }} value={vence} min={hoje} aria-label="Data combinada" onChange={(e) => e.target.value && setVence(e.target.value < hoje ? hoje : e.target.value)} />
      {erro && <p className="bad">{erro}</p>}
      <div className="row">
        <button className="ghost" onClick={onBack}>
          Voltar
        </button>
        <button className="primary grow" disabled={!escolhido && !formNovo} onClick={anotar}>
          Anotar no fiado
        </button>
      </div>
    </>
  );
}
