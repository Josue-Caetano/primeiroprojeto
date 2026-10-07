import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, getAuth, getSettings, saveAuth, saveSettings } from './db/db';
import { hashPassword, isLegacyHash, verifyPassword } from './domain/auth';
import { localDay } from './domain/calc';
import { DEFAULT_SETTINGS } from './domain/types';
import { Field } from './ui/components/common';
import { RestoreBackup } from './ui/components/RestoreBackup';
import { Ajustes } from './ui/pages/Ajustes';
import { Fichas } from './ui/pages/Fichas';
import { Historico } from './ui/pages/Historico';
import { Insumos } from './ui/pages/Insumos';
import { Produtos } from './ui/pages/Produtos';
import { Relatorios } from './ui/pages/Relatorios';
import { Vender } from './ui/pages/Vender';

type Tab = 'vender' | 'historico' | 'relatorios' | 'cadastros' | 'ajustes';
type Cadastro = 'produtos' | 'insumos' | 'fichas';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'vender', icon: '🛒', label: 'Vender' },
  { id: 'historico', icon: '🧾', label: 'Histórico' },
  { id: 'relatorios', icon: '📊', label: 'Relatórios' },
  { id: 'cadastros', icon: '📦', label: 'Cadastros' },
  { id: 'ajustes', icon: '⚙️', label: 'Ajustes' },
];

// A senha é pedida no primeiro uso de cada dia: guarda o dia (local) do último desbloqueio.
// sessionStorage não serve aqui porque o Android descarta a sessão ao trocar de app.
const UNLOCK_KEY = 'vendas-ambulante:unlockedDay';
const isUnlockedToday = () => {
  try {
    return localStorage.getItem(UNLOCK_KEY) === localDay(new Date());
  } catch {
    return false;
  }
};
const setUnlockedToday = (on: boolean) => {
  try {
    if (on) localStorage.setItem(UNLOCK_KEY, localDay(new Date()));
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* sem armazenamento: só não lembra o desbloqueio */
  }
};

export function App() {
  const state = useLiveQuery(async () => {
    const [settingsRow, auth, products, sales] = await Promise.all([
      db.kv.get('settings'),
      getAuth(),
      db.products.count(),
      db.sales.count(),
    ]);
    return { initialized: !!settingsRow || products > 0 || sales > 0, auth };
  }, []);
  const settings = useLiveQuery(getSettings, []);
  const [unlocked, setUnlocked] = useState(isUnlockedToday);

  // app deixado aberto de um dia para o outro: bloqueia ao voltar para ele
  useEffect(() => {
    const check = () => document.visibilityState === 'visible' && !isUnlockedToday() && setUnlocked(false);
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  const [tab, setTab] = useState<Tab>('vender');
  const [cadastro, setCadastro] = useState<Cadastro>('produtos');

  useEffect(() => {
    if (settings?.storeName) document.title = settings.storeName;
  }, [settings?.storeName]);

  if (!state) return <div className="splash">Carregando…</div>;
  if (!state.initialized) return <Welcome />;
  if (state.auth && !unlocked)
    return (
      <Login
        storeName={settings?.storeName}
        userName={settings?.userName}
        onUnlock={() => {
          setUnlockedToday(true);
          setUnlocked(true);
        }}
      />
    );

  return (
    <div className="app">
      <header className="topbar">
        <h1>{settings?.storeName || 'Vendas'}</h1>
        {tab === 'cadastros' && (
          <div className="segmented">
            {(['produtos', 'insumos', 'fichas'] as Cadastro[]).map((c) => (
              <button key={c} className={cadastro === c ? 'on' : ''} onClick={() => setCadastro(c)}>
                {c === 'produtos' ? 'Produtos' : c === 'insumos' ? 'Insumos' : 'Fichas técnicas'}
              </button>
            ))}
          </div>
        )}
      </header>
      <main>
        {tab === 'vender' && <Vender />}
        {tab === 'historico' && <Historico />}
        {tab === 'relatorios' && <Relatorios />}
        {tab === 'cadastros' && cadastro === 'produtos' && <Produtos />}
        {tab === 'cadastros' && cadastro === 'insumos' && <Insumos />}
        {tab === 'cadastros' && cadastro === 'fichas' && <Fichas />}
        {tab === 'ajustes' && (
          <Ajustes
            onLogout={() => {
              setUnlockedToday(false);
              setUnlocked(false);
            }}
          />
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Login({ storeName, userName, onUnlock }: { storeName?: string; userName?: string; onUnlock: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const auth = await getAuth();
    if (!auth || (await verifyPassword(pw, auth.passwordHash))) {
      // senha do app antigo (base64) é regravada como sha256 no primeiro login
      if (auth && isLegacyHash(auth.passwordHash)) await saveAuth({ ...auth, passwordHash: await hashPassword(pw) });
      onUnlock();
    } else {
      setError('Senha incorreta');
      setPw('');
    }
  };
  return (
    <form className="center-screen" onSubmit={submit}>
      <h1>{storeName || 'Vendas'}</h1>
      {userName?.trim() && <p className="muted">Olá, {userName.trim()}!</p>}
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        placeholder="Senha"
        value={pw}
        onChange={(e) => {
          setPw(e.target.value);
          setError('');
        }}
      />
      {error && <p className="bad">{error}</p>}
      <button className="primary full big">Entrar</button>
    </form>
  );
}

function Welcome() {
  const [mode, setMode] = useState<'choose' | 'new'>('choose');
  const [storeName, setStoreName] = useState('');
  const [userName, setUserName] = useState('');
  const [pw, setPw] = useState('');

  if (mode === 'choose')
    return (
      <div className="center-screen">
        <h1>Vendas Ambulante</h1>
        <p className="muted">Controle de vendas, custos e lucro. Funciona offline; os dados ficam neste aparelho.</p>
        <RestoreBackup />
        <button className="ghost full" onClick={() => setMode('new')}>
          Começar do zero
        </button>
      </div>
    );

  return (
    <form
      className="center-screen"
      onSubmit={async (e) => {
        e.preventDefault();
        await saveSettings({ ...DEFAULT_SETTINGS, storeName: storeName.trim() || DEFAULT_SETTINGS.storeName, userName });
        if (pw) {
          await saveAuth({ passwordHash: await hashPassword(pw), createdAt: new Date().toISOString() });
          setUnlockedToday(true);
        }
        location.reload();
      }}
    >
      <h1>Novo negócio</h1>
      <Field label="Nome do negócio">
        <input value={storeName} autoFocus onChange={(e) => setStoreName(e.target.value)} placeholder="Ex.: Lanches do Zé" />
      </Field>
      <Field label="Seu nome">
        <input value={userName} onChange={(e) => setUserName(e.target.value)} />
      </Field>
      <Field label="Senha (opcional)">
        <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <button className="primary full big">Começar</button>
      <button type="button" className="ghost full" onClick={() => setMode('choose')}>
        Voltar
      </button>
    </form>
  );
}
