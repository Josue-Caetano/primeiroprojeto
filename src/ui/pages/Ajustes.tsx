import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { exportBackup, getAuth, getSettings, saveAuth, saveSettings, wipeAll } from '../../db/db';
import { hashPassword, verifyPassword } from '../../domain/auth';
import { backupFileName, serializeBackup } from '../../domain/backup';
import type { Settings } from '../../domain/types';
import { Field, NumInput, downloadJson } from '../components/common';
import { RestoreBackup } from '../components/RestoreBackup';

export function Ajustes({ onLogout }: { onLogout: () => void }) {
  const stored = useLiveQuery(getSettings, []);
  const auth = useLiveQuery(getAuth, []);
  const [s, setS] = useState<Settings | null>(null);
  const [newCat, setNewCat] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (stored && !s) setS(stored);
  }, [stored, s]);

  if (!s) return null;

  const save = async (next = s) => {
    await saveSettings(next);
    setS(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="page">
      <section className="card">
        <h3>Negócio</h3>
        <Field label="Nome do negócio">
          <input value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} />
        </Field>
        <Field label="Seu nome">
          <input value={s.userName} onChange={(e) => setS({ ...s, userName: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="Meta de vendas por dia (R$)" hint="0 = sem meta">
            <NumInput value={s.metaDia ?? 0} onChange={(metaDia) => setS({ ...s, metaDia })} />
          </Field>
          <Field label="Troco inicial na gaveta (R$)" hint="para conferir o dinheiro no Histórico">
            <NumInput value={s.fundoTroco ?? 0} onChange={(fundoTroco) => setS({ ...s, fundoTroco })} />
          </Field>
        </div>
        <h4>Logo</h4>
        <div className="logo-row">
          {s.logo ? <img className="logo-preview" src={s.logo} alt="Logo" /> : <span className="muted small">Sem logo</span>}
          <label className="file-btn small-btn">
            {s.logo ? 'Trocar' : 'Escolher imagem'}
            <input type="file" accept="image/*" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await save({ ...s, logo: await imageToDataUrl(f) });
              } catch {
                alert('Não foi possível usar esta imagem.');
              }
            }} />
          </label>
          {s.logo && (
            <button className="ghost small" onClick={() => save({ ...s, logo: undefined })}>
              Remover
            </button>
          )}
        </div>
        <h4>Taxas da maquininha (%)</h4>
        <div className="row">
          <Field label="Débito">
            <NumInput value={s.feeDebit} onChange={(feeDebit) => setS({ ...s, feeDebit })} />
          </Field>
          <Field label="Crédito">
            <NumInput value={s.feeCredit} onChange={(feeCredit) => setS({ ...s, feeCredit })} />
          </Field>
          <Field label="Pix maquininha">
            <NumInput value={s.feePix} onChange={(feePix) => setS({ ...s, feePix })} />
          </Field>
        </div>
        <p className="muted small">Pix direto na sua chave não tem taxa. As taxas valem para as próximas vendas; vendas já registradas guardam a taxa da época.</p>
        <button className="primary full" onClick={() => save()}>
          {saved ? 'Salvo ✓' : 'Salvar'}
        </button>
      </section>

      <section className="card">
        <h3>Categorias de produto</h3>
        <ul className="tags">
          {s.categories.map((c) => (
            <li key={c}>
              {c}
              <button
                className="ghost small"
                aria-label={`Remover ${c}`}
                onClick={() => save({ ...s, categories: s.categories.filter((x) => x !== c) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input className="grow" placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button
            className="primary"
            onClick={() => {
              const c = newCat.trim();
              if (c && !s.categories.includes(c)) save({ ...s, categories: [...s.categories, c] });
              setNewCat('');
            }}
          >
            Adicionar
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Backup</h3>
        <p className="muted small">
          Gera um arquivo .json com tudo (produtos, vendas, insumos, fichas e ajustes), no mesmo formato do app antigo. Guarde fora do
          celular (Drive, e-mail, WhatsApp).
        </p>
        <button className="primary full" onClick={async () => downloadJson(serializeBackup(await exportBackup()), backupFileName())}>
          Baixar backup
        </button>
        <RestoreBackup allowMerge />
      </section>

      <PasswordSection hasPassword={!!auth} />

      <section className="card">
        <h3>Zona de perigo</h3>
        <button
          className="danger full"
          onClick={async () => {
            if (!confirm('Apagar TODOS os dados deste aparelho? Faça um backup antes.')) return;
            if (!confirm('Tem certeza? Não dá para desfazer.')) return;
            await wipeAll();
            location.reload();
          }}
        >
          Apagar todos os dados
        </button>
        {auth && (
          <button className="ghost full" onClick={onLogout}>
            Sair (bloquear app)
          </button>
        )}
      </section>
    </div>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    const auth = await getAuth();
    if (auth && !(await verifyPassword(current, auth.passwordHash))) return setMsg('Senha atual incorreta');
    if (!next) {
      if (!confirm('Remover a senha? Qualquer pessoa com o celular poderá abrir o app.')) return;
      await saveAuth(null);
      setMsg('Senha removida');
    } else {
      await saveAuth({ passwordHash: await hashPassword(next), createdAt: new Date().toISOString() });
      setMsg('Senha salva');
    }
    setCurrent('');
    setNext('');
  };

  return (
    <section className="card">
      <h3>Senha de acesso</h3>
      {hasPassword && (
        <Field label="Senha atual">
          <input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      )}
      <Field label={hasPassword ? 'Nova senha (vazio para remover)' : 'Criar senha'}>
        <input type="password" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <button className="primary full" onClick={submit}>
        {hasPassword ? 'Alterar senha' : 'Definir senha'}
      </button>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

/** Reduz a imagem para no máximo 256 px (a logo fica leve no backup) e devolve como data:URL PNG. */
function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagem inválida'));
    };
    img.src = url;
  });
}
