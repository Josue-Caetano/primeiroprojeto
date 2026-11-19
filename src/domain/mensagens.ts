// Mensagens de cobrança do fiado: modelos que a pessoa edita, cria e apaga (Ajustes → Mensagens de cobrança).
// Ficam em settings.mensagens (vão no backup, no mesmo formato do Vendeu); vazio = os modelos que vêm com o app.
import { localDay } from './calc';
import type { CompraAberta, SituacaoFiado } from './fiado';
import type { Cliente, MensagemCobranca, Settings } from './types';

export const MENSAGENS_PADRAO: MensagemCobranca[] = [
  { id: 'lembrete', nome: 'Lembrete', texto: 'Oi, {nome}! Tudo bem?\nPassando para lembrar do seu fiado: *{valor}* ({prazo}).{pix_linha}\nObrigado!' },
  { id: 'hoje', nome: 'Vence hoje', texto: 'Oi, {nome}! Hoje é o dia combinado para acertar o fiado de *{valor}*.{pix_linha}\nQualquer coisa me chama!' },
  { id: 'atrasado', nome: 'Atrasado', texto: 'Oi, {nome}, tudo bem? O seu fiado de *{valor}* {prazo}. Consegue me dizer um dia bom para acertar?{pix_linha}' },
  { id: 'recebido', nome: 'Pagamento recebido', texto: 'Recebi, {nome}! Muito obrigado 🙏 Está tudo certo por aqui.' },
];

export const VARIAVEIS = ['{nome}', '{valor}', '{itens}', '{vencimento}', '{prazo}', '{loja}', '{pix_linha}', '{data}'];

export const modelos = (settings: Settings): MensagemCobranca[] =>
  Array.isArray(settings.mensagens) && settings.mensagens.length ? settings.mensagens : MENSAGENS_PADRAO;

/** Troca as {variáveis}. Variável vazia dentro de parênteses some junto com eles: "({prazo})" sem prazo vira nada. */
export function preencher(texto: string, vars: Record<string, string>) {
  return String(texto || '')
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    .replace(/ *\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n');
}

const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/**
 * {itens}: as compras do fiado ainda não pagas, uma por linha: "• 05/11 · 2× Salgado, 1× Coca · R$ 25,00".
 * Compra paga em parte mostra quanto falta. A soma das linhas é o {valor}.
 */
export function itensDoFiado(abertas: CompraAberta[], money: (n: number) => string) {
  return abertas
    .map((a) => {
      const juntos = new Map<string, number>();
      for (const i of a.itens) juntos.set(i.nome, (juntos.get(i.nome) ?? 0) + i.qty);
      const oque = [...juntos].map(([nome, q]) => `${qtd(q)}× ${nome}`).join(', ') || 'Compra';
      const parte =
        a.falta < a.valor - 0.009 ? `${money(a.falta)} (de ${money(a.valor)}, já pagou ${money(a.valor - a.falta)})` : money(a.valor);
      return `• ${curta(localDay(a.date))} · ${oque} · ${parte}`;
    })
    .join('\n');
}

export function varsCobranca(cli: Pick<Cliente, 'nome'>, s: SituacaoFiado, settings: Settings, hoje: string, money: (n: number) => string) {
  const venc = s.vencimento || '';
  return {
    nome: String(cli.nome || '').trim().split(/\s+/)[0],
    valor: money(s.saldo),
    itens: itensDoFiado(s.abertas, money),
    vencimento: venc ? curta(venc) : '',
    prazo: !venc ? '' : venc < hoje ? `venceu em ${curta(venc)}` : venc === hoje ? 'vence hoje' : `vence em ${curta(venc)}`,
    loja: settings.storeName && settings.storeName !== 'Minhas Vendas' ? settings.storeName : '',
    pix_linha: settings.chavePix ? `\nSe quiser, pode pagar no Pix: ${settings.chavePix}` : '',
    data: curta(hoje),
  };
}

/** O modelo que já vem marcado: atrasado, vence hoje ou lembrete. */
export const modeloSugerido = (s: SituacaoFiado, hoje: string) => (s.atrasoDias > 0 ? 'atrasado' : s.vencimento === hoje ? 'hoje' : 'lembrete');
