// Relatório de vendas do período em PDF (mesmo conteúdo do relatório do Vendeu, com as cores deste app).
// O jsPDF só é carregado quando a pessoa pede o PDF, para não pesar na abertura do app.
import { round2, type Totals } from '../domain/calc';
import { addDays } from '../domain/fiado';
import { METHOD_LABELS } from '../domain/types';
import { money } from './format';

type Linha = { key: string; qty: number; gross: number; net: number; sales: number };

export interface DadosRelatorio {
  storeName: string;
  logo?: string;
  /** nome do período escolhido: "Este mês", "30 dias"... */
  rotulo: string;
  /** primeiro dia e dia seguinte ao último (AAAA-MM-DD) */
  ini: string;
  fim: string;
  t: Totals;
  gastos: { nome: string; valor: number; vezes: number }[];
  fiado: { vendido: number; recebido: number };
  formas: { method: string; value: number }[];
  produtos: Linha[];
  dias: Linha[];
  meses: Linha[];
}

type RGB = [number, number, number];
const COR: Record<string, RGB> = {
  primaria: [15, 118, 110],
  clara: [94, 234, 212],
  escuro: [23, 32, 31],
  suave: [244, 246, 246],
  linha: [221, 227, 226],
  cinza: [95, 107, 106],
  verde: [21, 128, 61],
  verdeFundo: [220, 252, 231],
};

// O jsPDF só desenha o alfabeto latino: tira emojis e troca o sinal de menos.
const txt = (s: unknown) =>
  String(s ?? '')
    .replace(/−/g, '-')
    .replace(/[^\x20-\xFF]/g, '');
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const numero = (n: number) => n.toLocaleString('pt-BR');

export async function gerarRelatorioPDF(r: DadosRelatorio, agora = new Date()): Promise<{ blob: Blob; nome: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 16;
  const ultimoDia = addDays(r.fim, -1);
  const periodo = r.ini <= '2000-01-01' ? 'Todo o período' : r.ini === ultimoDia ? dataBR(r.ini) : `${dataBR(r.ini)} a ${dataBR(ultimoDia)}`;
  const totalGastos = round2(r.gastos.reduce((a, g) => a + g.valor, 0));
  const sobrou = round2(r.t.net - totalGastos);

  // ---- cabeçalho ----
  doc.setFillColor(...COR.primaria);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...COR.clara);
  doc.rect(0, 34, W, 2.5, 'F');
  let xt = M;
  if (r.logo) {
    try {
      const pr = doc.getImageProperties(r.logo);
      const lado = 22;
      const k = Math.min((lado - 3) / pr.width, (lado - 3) / pr.height);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M, 6, lado, lado, 3, 3, 'F');
      doc.addImage(r.logo, 'PNG', M + (lado - pr.width * k) / 2, 6 + (lado - pr.height * k) / 2, pr.width * k, pr.height * k);
      xt = M + lado + 6;
    } catch {
      /* logo que o jsPDF não lê: segue sem ela */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(txt(r.storeName || 'Minhas vendas'), xt, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('RELATÓRIO DE VENDAS', xt, 23);
  doc.setFont('helvetica', 'bold');
  doc.text(txt(`${r.rotulo}: ${periodo}`), W - M, 23, { align: 'right' });

  // ---- quadros de destaque ----
  let y = 46;
  const quadros: [string, string][] = [
    ['Faturamento', money(r.t.gross)],
    ['Sobrou (lucro)', money(sobrou)],
    ['Vendas', numero(r.t.batches)],
    ['Ticket médio', money(r.t.batches ? r.t.gross / r.t.batches : 0)],
  ];
  const lq = (W - 2 * M - 9) / 4;
  quadros.forEach(([rot, val], i) => {
    const x = M + i * (lq + 3);
    doc.setFillColor(...(i === 1 ? COR.verdeFundo : COR.suave));
    doc.setDrawColor(...COR.linha);
    doc.roundedRect(x, y, lq, 20, 3, 3, 'FD');
    doc.setTextColor(...COR.cinza);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(txt(rot.toUpperCase()), x + 4, y + 7);
    doc.setTextColor(...(i === 1 ? COR.verde : COR.escuro));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(txt(val), x + 4, y + 15.5);
  });
  y += 30;

  const titulo = (t: string) => {
    if (y > H - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...COR.primaria);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(txt(t), M, y);
    y += 3;
    doc.setDrawColor(...COR.primaria);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 6;
  };
  type Col = { t: string; w: number; dir?: boolean };
  const tabela = (cols: Col[], linhas: string[][], destaqueUltima = false) => {
    const cab = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...COR.cinza);
      let x = M;
      for (const c of cols) {
        doc.text(txt(c.t.toUpperCase()), c.dir ? x + c.w : x, y, { align: c.dir ? 'right' : 'left' });
        x += c.w;
      }
      y += 5;
    };
    cab();
    linhas.forEach((l, n) => {
      if (y > H - 22) {
        doc.addPage();
        y = 20;
        cab();
      }
      const ultima = destaqueUltima && n === linhas.length - 1;
      doc.setFont('helvetica', ultima ? 'bold' : 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...(ultima ? COR.verde : COR.escuro));
      let x = M;
      l.forEach((v, i) => {
        const c = cols[i];
        const cabe = doc.splitTextToSize(txt(v), c.w - 2)[0] ?? '';
        doc.text(cabe, c.dir ? x + c.w : x, y, { align: c.dir ? 'right' : 'left' });
        x += c.w;
      });
      doc.setDrawColor(...COR.linha);
      doc.setLineWidth(0.2);
      doc.line(M, y + 2, W - M, y + 2);
      y += 6.5;
    });
    y += 6;
  };
  const largura = W - 2 * M;

  titulo('Resumo');
  tabela(
    [{ t: '', w: 120 }, { t: 'Valor', w: largura - 120, dir: true }],
    [
      ['Vendido', money(r.t.gross)],
      ['Custo dos produtos', `- ${money(r.t.cost)}`],
      ['Taxas da maquininha', `- ${money(r.t.fees)}`],
      ...(r.gastos.length
        ? r.gastos.map((g) => [`${g.nome}${g.vezes > 1 ? ` (${g.vezes}x)` : ''}`, `- ${money(g.valor)}`])
        : [['Gastos anotados', `- ${money(0)}`]]),
      ['Sobrou', money(sobrou)],
    ],
    true,
  );

  if (r.fiado.vendido || r.fiado.recebido) {
    titulo('Fiado');
    tabela(
      [{ t: '', w: 120 }, { t: 'Valor', w: largura - 120, dir: true }],
      [
        ['Vendido no fiado (já está no vendido)', money(r.fiado.vendido)],
        ['Recebido de fiado no período', money(r.fiado.recebido)],
      ],
    );
  }

  titulo('Por forma de pagamento');
  tabela(
    [{ t: 'Forma', w: 100 }, { t: '%', w: 30, dir: true }, { t: 'Recebido', w: largura - 130, dir: true }],
    r.formas.map((f) => [METHOD_LABELS[f.method] ?? f.method, `${r.t.gross ? Math.round((f.value / r.t.gross) * 100) : 0}%`, money(f.value)]),
  );

  const colsQtd: Col[] = [
    { t: 'Produto', w: 82 },
    { t: 'Qtd.', w: 22, dir: true },
    { t: 'Vendido', w: 37, dir: true },
    { t: 'Lucro', w: largura - 141, dir: true },
  ];
  titulo('Por produto');
  tabela(colsQtd, r.produtos.map((p) => [p.key, numero(p.qty), money(p.gross), money(p.net)]));

  if (r.dias.length > 1) {
    const porMes = r.dias.length > 62;
    titulo(porMes ? 'Mês a mês' : 'Dia a dia');
    tabela(
      [{ t: porMes ? 'Mês' : 'Dia', w: 82 }, { t: 'Vendas', w: 22, dir: true }, { t: 'Vendido', w: 37, dir: true }, { t: 'Lucro', w: largura - 141, dir: true }],
      (porMes ? r.meses : r.dias).map((x) => [
        porMes ? `${x.key.slice(5, 7)}/${x.key.slice(0, 4)}` : dataBR(x.key),
        numero(x.sales),
        money(x.gross),
        money(x.net),
      ]),
    );
  }

  // ---- rodapé em todas as páginas ----
  const paginas = doc.getNumberOfPages();
  const hoje = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COR.cinza);
    doc.text(txt(`Gerado em ${hoje}. O lucro já desconta o custo dos produtos, as taxas da maquininha e os gastos anotados.`), M, H - 10);
    doc.text(`${i}/${paginas}`, W - M, H - 10, { align: 'right' });
  }

  return { blob: doc.output('blob'), nome: `relatorio-${slug(r.storeName || 'vendas')}-${r.ini}.pdf` };
}
