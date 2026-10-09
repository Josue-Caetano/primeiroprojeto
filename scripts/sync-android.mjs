// Copia o app web já montado (dist/) para o projeto Android (android/app/src/main/assets/www).
// Uso: npm run android:sync   (monta o app e copia)
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = root + 'dist';
const www = root + 'android/app/src/main/assets/www';

if (!existsSync(dist + '/index.html')) {
  console.error('dist/ não encontrado: rode "npm run build" antes.');
  process.exit(1);
}
rmSync(www, { recursive: true, force: true });
cpSync(dist, www, { recursive: true });
writeFileSync(www + '/LEIA-ME.txt', 'Arquivos gerados por "npm run android:sync" a partir de dist/. Não edite aqui.\n');
console.log('App web copiado para', www);
