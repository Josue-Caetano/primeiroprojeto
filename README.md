# Vendas Ambulante

App de vendas para vendedor ambulante, compatível com os backups do app anterior
(`backup_ambulante_*.json`). Funciona offline no celular (PWA) e guarda tudo no próprio
aparelho (IndexedDB).

## Funcionalidades

- **Vender (PDV)**: toque nos produtos para montar o carrinho, ajuste quantidade e preço
  (desconto), cobre em Pix, Dinheiro, Débito ou Crédito, ou divida entre várias formas.
  Calculadora de troco. Produtos mais vendidos aparecem primeiro.
- **Histórico**: vendas do dia agrupadas, com navegação por data e exclusão de venda ou item.
- **Relatórios**: faturamento, lucro líquido, custo, taxas, ticket médio, margem; por dia/mês,
  forma de pagamento, categoria, produto, dia da semana e horário. Períodos prontos ou personalizados.
- **Cadastros**
  - Produtos (categoria, preço, custo, margem).
  - Insumos (preço pago, quantidade da embalagem em g/ml/un).
  - Fichas técnicas: custo por unidade e preço sugerido a partir dos insumos, custo
    operacional %, embalagem, rendimento e markup. Vinculada a um produto, atualiza o custo
    dele. Mudar o preço de um insumo recalcula as fichas que o usam.
- **Ajustes**: nome do negócio, taxas da maquininha, categorias, senha, backup/restauração
  (substituir tudo ou juntar com os dados atuais).

## Compatibilidade com o backup antigo

| Campo do backup | Uso no app |
| --- | --- |
| `products` | Produtos (`type` = categoria) |
| `sales` | Uma linha por produto vendido; linhas com o mesmo `batchId` formam uma venda. Aceita as três gerações do formato antigo (sem `payments`, com `payments`, com `productType`/`saleMode`) e `method: "Múltiplos"`. |
| `insumos`, `recipes` | Insumos e fichas técnicas (a fórmula de custo reproduz exatamente os valores do app antigo) |
| `settings` | Taxas (% débito/crédito/pix), nome do negócio, nome do usuário, categorias |
| `auth` | Senha. A senha do app antigo continua funcionando; no primeiro login ela é regravada com SHA-256. |

Exportar gera um arquivo no mesmo formato. Registros importados voltam idênticos na exportação.

Regras de cálculo de uma venda (iguais às do app antigo):

- `grossValue` = quantidade × preço; `costValue` = quantidade × custo do produto
- `feeValue` = soma de (valor de cada pagamento × taxa % do método); dinheiro não tem taxa
- `netProfit` = bruto − custo − taxa
- com vários pagamentos, cada item recebe a sua parte proporcional de cada pagamento

## Instalar no celular

O app é publicado automaticamente no GitHub Pages (branch `gh-pages`) a cada atualização da `main`:
https://josue-caetano.github.io/primeiroprojeto/

1. Abra o link no Chrome (Android) ou Safari (iPhone).
2. Android: menu ⋮ → **Adicionar à tela inicial** / **Instalar app**.
   iPhone: botão Compartilhar → **Adicionar à Tela de Início**.
3. Na primeira tela, toque em **Restaurar de um arquivo de backup** e escolha o seu `.json`.

Depois disso o app abre mesmo sem internet. Os dados ficam só no aparelho: faça backup em
Ajustes de tempos em tempos.

## APK Android (Android Studio)

A pasta `android/` é um projeto do Android Studio que abre este app num WebView, sem internet.

- **Jeito mais fácil:** em GitHub → **Actions → Gerar APK Android**, abra a última execução e baixe
  `vendas-ambulante-apk` em *Artifacts*. Dentro do ZIP está o `app-debug.apk`, que pode ser instalado
  direto no celular.
- **Pelo Android Studio:** *File → Open* → pasta `android` → espere o Gradle sincronizar →
  *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.
- **Depois de mudar o app web**, rode `npm run android:sync` para copiar a versão nova para
  `android/app/src/main/assets/www` antes de gerar o APK.

Os dados do APK ficam separados dos dados do navegador: use backup/restaurar para levá-los.
Para instalar o APK ao lado do app antigo, troque o `applicationId` em `android/app/build.gradle.kts`
se ele for igual ao do app antigo.

## Desenvolvimento

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (cálculos, backup, banco)
npm run build      # gera dist/ (site estático; pode ir para GitHub Pages, Netlify etc.)
```

Para validar um backup real nos testes (o arquivo não deve ser versionado):

```bash
BACKUP_FILE=/caminho/backup_ambulante_123.json npm test
```

### Estrutura

```
src/domain/   tipos, cálculos, leitura/validação de backup, senha (sem dependência de UI)
src/db/       banco IndexedDB (Dexie), restaurar/exportar, recálculo de fichas
src/ui/       telas e componentes React
public/       manifest, ícone e service worker (offline)
tests/        testes com vitest
```
