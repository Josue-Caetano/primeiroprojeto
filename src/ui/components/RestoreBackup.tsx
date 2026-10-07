import { useState } from 'react';
import { restoreBackup, type RestoreMode } from '../../db/db';
import { parseBackup, summarizeBackup } from '../../domain/backup';
import type { Backup } from '../../domain/types';
import { dateTime } from '../format';

/** Escolhe um arquivo de backup, mostra o resumo e restaura. */
export function RestoreBackup({ allowMerge, onDone }: { allowMerge?: boolean; onDone?: () => void }) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RestoreMode>('replace');

  const onFile = async (file?: File) => {
    setError('');
    setBackup(null);
    if (!file) return;
    try {
      setBackup(parseBackup(await file.text()));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = async () => {
    if (!backup) return;
    if (mode === 'replace' && allowMerge && !confirm('Os dados atuais deste aparelho serão substituídos pelo backup. Continuar?')) return;
    setBusy(true);
    try {
      await restoreBackup(backup, mode);
      if (onDone) onDone();
      else location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const sum = backup && summarizeBackup(backup);

  return (
    <div className="restore">
      <label className="file-btn">
        Restaurar de um arquivo de backup…
        <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {error && <p className="bad">{error}</p>}
      {sum && (
        <div className="card inner">
          <b>{sum.storeName}</b>
          <ul className="small">
            <li>{sum.products} produtos</li>
            <li>
              {sum.batches} vendas ({sum.sales} itens)
              {sum.firstSale && ` de ${dateTime(sum.firstSale)} a ${dateTime(sum.lastSale!)}`}
            </li>
            <li>{sum.insumos} insumos</li>
            <li>{sum.recipes} fichas técnicas</li>
            {sum.exportDate && <li>backup feito em {dateTime(sum.exportDate)}</li>}
            {sum.hasPassword && mode === 'replace' && <li>tem senha: use a mesma senha do app antigo para entrar</li>}
          </ul>
          {allowMerge && (
            <div className="radio-row">
              <label>
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Substituir tudo
              </label>
              <label>
                <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Juntar com os dados atuais
              </label>
            </div>
          )}
          <button className="primary full" disabled={busy} onClick={run}>
            {busy ? 'Restaurando…' : 'Restaurar'}
          </button>
        </div>
      )}
    </div>
  );
}
