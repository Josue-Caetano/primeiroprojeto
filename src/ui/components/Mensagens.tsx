import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../../db/db';
import type { SituacaoFiado } from '../../domain/fiado';
import { numeroWhats } from '../../domain/fiado';
import { newId } from '../../domain/ids';
import { MENSAGENS_PADRAO, VARIAVEIS, modeloSugerido, modelos, preencher, varsCobranca } from '../../domain/mensagens';
import type { Cliente, MensagemCobranca } from '../../domain/types';
import { money } from '../format';
import { Modal } from './common';

/** Cobrar no WhatsApp: escolhe o modelo (o certo já vem marcado), ajusta o texto e manda. */
export function Cobrar({ cliente, situacao, hoje, onClose }: { cliente: Cliente; situacao: SituacaoFiado; hoje: string; onClose: () => void }) {
  const settings = useLiveQuery(getSettings, []);
  const [escolhido, setEscolhido] = useState(() => modeloSugerido(situacao, hoje));
  const [texto, setTexto] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  if (!settings) return null;

  const lista = modelos(settings);
  const atual = lista.find((m) => m.id === escolhido) ?? lista[0];
  const vars = varsCobranca(cliente, situacao, settings, hoje, money);
  const msg = texto ?? preencher(atual.texto, vars);
  const n = numeroWhats(cliente.whatsapp);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      prompt('Copie a mensagem:', msg);
    }
  };

  return (
    <Modal title={`Cobrar ${vars.nome}`} onClose={onClose} publico>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {lista.map((m) => (
          <button
            key={m.id}
            className={m.id === atual.id ? 'chip on' : 'chip'}
            onClick={() => {
              setEscolhido(m.id);
              setTexto(null);
            }}
          >
            {m.nome || 'Sem nome'}
          </button>
        ))}
      </div>
      <textarea rows={8} aria-label="Mensagem" value={msg} onChange={(e) => setTexto(e.target.value)} />
      <p className="muted small">
        Dá para mudar o texto antes de mandar.{' '}
        <button className="link-btn" onClick={() => setEditando(true)}>
          Editar os modelos
        </button>
      </p>
      <div className="row">
        {n && (
          <button className="primary grow" onClick={() => window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')}>
            💬 Abrir no WhatsApp
          </button>
        )}
        <button className={n ? 'ghost' : 'primary grow'} onClick={copiar}>
          {copiado ? 'Copiado ✓' : n ? 'Copiar' : 'Copiar mensagem'}
        </button>
      </div>
      {editando && (
        <EditarMensagens
          onClose={() => {
            setEditando(false);
            setTexto(null);
          }}
        />
      )}
    </Modal>
  );
}

/** Editar, criar e apagar os modelos de mensagem de cobrança. As alterações são salvas sozinhas. */
export function EditarMensagens({ onClose }: { onClose: () => void }) {
  const settings = useLiveQuery(getSettings, []);
  const [lista, setLista] = useState<MensagemCobranca[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<MensagemCobranca[] | null>(null);
  const ultimoNovo = useRef<HTMLInputElement | null>(null);
  const [focarNovo, setFocarNovo] = useState(false);

  useEffect(() => {
    if (settings && !lista) setLista(structuredClone(modelos(settings)));
  }, [settings, lista]);

  useEffect(() => {
    if (focarNovo && ultimoNovo.current) {
      ultimoNovo.current.scrollIntoView({ block: 'center' });
      ultimoNovo.current.focus();
      ultimoNovo.current.select();
      setFocarNovo(false);
    }
  }, [focarNovo, lista]);

  const gravar = async (l: MensagemCobranca[] | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pendente.current = null;
    await saveSettings({ ...(await getSettings()), mensagens: l });
  };
  const mudar = (l: MensagemCobranca[], agora = false) => {
    setLista(l);
    if (agora) return gravar(l);
    pendente.current = l;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => gravar(l), 400);
  };
  const fechar = async () => {
    if (pendente.current) await gravar(pendente.current);
    onClose();
  };

  if (!lista) return null;
  const set = (i: number, patch: Partial<MensagemCobranca>) => mudar(lista.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <Modal title="Mensagens de cobrança" onClose={fechar}>
      <p className="muted small variaveis">
        Variáveis:{' '}
        {VARIAVEIS.map((v) => (
          <code key={v}>{v}</code>
        ))}
        . Elas viram o nome do cliente, o valor, a data… <code>{'{itens}'}</code> vira a lista do que está em aberto (data, o que levou e o
        valor de cada compra). As alterações são salvas sozinhas.
      </p>
      {lista.map((m, i) => (
        <div key={m.id} className="card inner modelo-msg">
          <input
            ref={i === lista.length - 1 ? ultimoNovo : undefined}
            maxLength={40}
            value={m.nome}
            placeholder="Nome da mensagem"
            aria-label="Nome da mensagem"
            onChange={(e) => set(i, { nome: e.target.value })}
          />
          <textarea
            rows={5}
            value={m.texto}
            placeholder="Escreva a mensagem. Pode usar as variáveis, como {nome}."
            aria-label="Texto da mensagem"
            onChange={(e) => set(i, { texto: e.target.value })}
          />
          {lista.length > 1 && (
            <div>
              <button
                className="ghost small"
                onClick={() => {
                  if (!confirm(`Apagar a mensagem "${m.nome || 'sem nome'}"?`)) return;
                  mudar(
                    lista.filter((_, j) => j !== i),
                    true,
                  );
                }}
              >
                🗑 Apagar mensagem
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        className="ghost full"
        onClick={() => {
          mudar([...lista, { id: newId(), nome: 'Nova mensagem', texto: '' }], true);
          setFocarNovo(true);
        }}
      >
        + Nova mensagem
      </button>
      <p className="center">
        <button
          className="link-btn small"
          onClick={() => {
            if (!confirm('Voltar aos modelos que vêm com o app? As mensagens que você criou ou mudou serão apagadas.')) return;
            setLista(structuredClone(MENSAGENS_PADRAO));
            gravar(null);
          }}
        >
          Voltar aos modelos originais
        </button>
      </p>
    </Modal>
  );
}
