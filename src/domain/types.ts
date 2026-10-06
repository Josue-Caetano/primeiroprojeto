// Tipos que espelham exatamente o formato do arquivo de backup (backup_ambulante_*.json).
// Campos opcionais existem porque o app antigo foi evoluindo: vendas antigas não têm
// `payments`, `productType` nem `saleMode`, e o importador aceita as três gerações.

export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro';
export const MULTIPLE_METHODS = 'Múltiplos';
export type SaleMethod = PaymentMethod | typeof MULTIPLE_METHODS;

export const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'debito', 'credito'];

export const METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
  [MULTIPLE_METHODS]: 'Múltiplos',
};

export type SaleMode = 'unit';

export interface Product {
  id: string;
  type: string; // categoria (ex.: "Salgado", "Suco")
  name: string;
  price: number;
  cost: number;
  createdAt: string;
  saleMode?: SaleMode;
}

export interface Payment {
  method: PaymentMethod;
  value: number;
}

/** Uma linha de venda = um produto dentro de uma venda (batch). */
export interface Sale {
  id: string;
  batchId: string;
  productId: string;
  productName: string;
  productType?: string;
  qty: number;
  saleMode?: SaleMode;
  method: SaleMethod;
  payments?: Payment[];
  grossValue: number;
  costValue: number;
  feeValue: number;
  netProfit: number;
  date: string; // ISO
}

export type InsumoUnit = 'g' | 'ml' | 'un';

export interface Insumo {
  id: string;
  name: string;
  price: number; // preço pago pela embalagem
  weight: number; // quantidade da embalagem (na unidade abaixo)
  unit: InsumoUnit;
}

export interface RecipeIngredient {
  insumoId: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  opFeePercentage: number; // % de custo operacional (gás, energia...)
  markup: number;
  packagingCost: number; // custo de embalagem por unidade
  yieldQty: number; // rendimento (unidades)
  unitCost: number;
  suggestedPrice: number;
  linkedProductId?: string;
}

export interface Settings {
  feeDebit: number;
  feeCredit: number;
  feePix: number;
  storeName: string;
  userName: string;
  categories: string[];
}

export interface Auth {
  passwordHash: string;
  createdAt: string;
}

export interface Backup {
  products: Product[];
  sales: Sale[];
  insumos: Insumo[];
  recipes: Recipe[];
  settings: Settings;
  auth?: Auth | null;
  exportDate: string;
}

export const DEFAULT_SETTINGS: Settings = {
  feeDebit: 1.99,
  feeCredit: 4.99,
  feePix: 0,
  storeName: 'Minhas Vendas',
  userName: '',
  categories: ['Salgado', 'Suco', 'Refrigerante'],
};
