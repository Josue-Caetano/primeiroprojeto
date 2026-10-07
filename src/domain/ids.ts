// Mesmo formato de id do app antigo: timestamp em base 36 + sufixo aleatório (ex.: "mo4qw0gc3k80s8j5dri").
export function newId(at: Date = new Date()): string {
  return at.getTime().toString(36) + Math.random().toString(36).slice(2, 12);
}
