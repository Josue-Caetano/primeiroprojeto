// Lembrete de backup (como no Vendeu). Os dados ficam só no aparelho: se limpar os dados do navegador ou perder
// o celular, só o backup salva. Aqui: pede ao navegador para não apagar os dados sozinho, lembra quando faz tempo
// sem backup (com dados novos desde o último) e diz quando foi o último backup.
const DIA = 864e5;
const PRAZO = 7; // dias com dados novos sem backup até o aviso aparecer
const ADIAR = 3; // "Depois" esconde o aviso por 3 dias
const APP = 'vendas-ambulante';

const chave = (s: string) => `${APP}:backup-${s}`;
const ler = (s: string) => {
  try {
    return Number(localStorage.getItem(chave(s))) || 0;
  } catch {
    return 0;
  }
};
const gravar = (s: string, v: number) => {
  try {
    localStorage.setItem(chave(s), String(v));
  } catch {
    /* sem armazenamento */
  }
};

/** Pede ao navegador para não apagar os dados quando faltar espaço (não impede a pessoa de limpar). */
export function pedirPersistencia() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* navegador antigo */
  }
}

/** Os dados mudaram: guarda quando foi a primeira mudança depois do último backup. */
export function dadosMudaram(agora = Date.now()) {
  const m = ler('mudou');
  const feito = ler('feito');
  // o aviso de mudança do banco chega um instante depois de restaurar: não conta como dado novo
  if ((!m || m <= feito) && agora - feito > 3000) gravar('mudou', agora);
}

/** Backup baixado (ou restaurado: os dados do aparelho passam a ser os do arquivo). */
export function backupFeito(agora = Date.now()) {
  gravar('feito', agora);
}

/** "Depois": esconde o aviso por alguns dias. */
export function adiarAviso(agora = Date.now()) {
  gravar('adiado', agora + ADIAR * DIA);
}

/** Dias sem backup, se tem dados novos desde o último e já passou do prazo; senão 0. */
export function diasSemBackup(temDados = true, agora = Date.now()) {
  if (!temDados) return 0;
  const feito = ler('feito');
  const mudou = ler('mudou');
  if (!mudou || mudou <= feito) return 0;
  if (agora < ler('adiado')) return 0;
  const dias = Math.floor((agora - (feito || mudou)) / DIA);
  return dias >= PRAZO ? dias : 0;
}

/** "Último backup: hoje" / "há 3 dias" / nenhum ainda. */
export function textoBackup(agora = Date.now()) {
  const feito = ler('feito');
  if (!feito) return 'Você ainda não baixou nenhum backup neste aparelho.';
  const ini = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dias = Math.round((ini(agora) - ini(feito)) / DIA);
  return `Último backup: ${dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`}.`;
}
