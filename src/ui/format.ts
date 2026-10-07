const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (n: number) => brl.format(n || 0);

export const pct = (n: number) => `${(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const dayLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Aceita "10,50" ou "10.50". */
export const parseNum = (v: string) => {
  const t = String(v).trim();
  // com vírgula, pontos são separador de milhar ("1.234,50"); sem vírgula, o ponto é decimal
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
};
