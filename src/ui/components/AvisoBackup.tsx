import { useState } from 'react';
import { exportBackup } from '../../db/db';
import { backupFileName, serializeBackup } from '../../domain/backup';
import { adiarAviso, backupFeito, diasSemBackup } from '../avisoBackup';
import { downloadJson } from './common';

/** Baixa o backup e anota que foi feito (usado em Ajustes e no aviso). */
export async function baixarBackup() {
  downloadJson(serializeBackup(await exportBackup()), backupFileName());
  backupFeito();
}

/** Faixa "Faz X dias sem backup" no topo da tela de vender, quando já passou do prazo. */
export function AvisoBackup({ temDados }: { temDados: boolean }) {
  const [dias] = useState(() => diasSemBackup(temDados));
  const [estado, setEstado] = useState<'aberto' | 'baixado' | 'fechado'>('aberto');
  if (!dias || estado === 'fechado') return null;
  if (estado === 'baixado')
    return (
      <div className="aviso aviso-backup" role="status">
        <span>
          ✓ <b>Backup baixado.</b> Guarde o arquivo no Google Drive ou mande para o seu WhatsApp.
        </span>
      </div>
    );
  return (
    <div className="aviso aviso-backup" role="status">
      <span>
        💾 <b>Faz {dias} dias sem backup.</b> Seus dados ficam só neste aparelho: se limpar o navegador ou perder o celular, eles se perdem.
      </span>
      <div className="row">
        <button
          className="primary small"
          onClick={async () => {
            await baixarBackup();
            setEstado('baixado');
            setTimeout(() => setEstado('fechado'), 5000);
          }}
        >
          Baixar backup
        </button>
        <button
          className="ghost small"
          onClick={() => {
            adiarAviso();
            setEstado('fechado');
          }}
        >
          Depois
        </button>
      </div>
    </div>
  );
}
