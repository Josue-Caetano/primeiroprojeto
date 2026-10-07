// O app antigo guardava a senha apenas em base64 (btoa), o que não é um hash de verdade.
// Aqui as senhas novas são gravadas como "sha256:<hex>", e o formato antigo continua sendo
// aceito para que a senha de um backup restaurado funcione. Ao entrar com uma senha no
// formato antigo, o app a migra para sha256.

const PREFIX = 'sha256:';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function legacyEncode(password: string): string {
  // equivalente a btoa(unescape(encodeURIComponent(pw))), seguro para acentos
  const bytes = new TextEncoder().encode(password);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function hashPassword(password: string): Promise<string> {
  return PREFIX + (await sha256Hex(password));
}

export function isLegacyHash(hash: string): boolean {
  return !hash.startsWith(PREFIX);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith(PREFIX)) return (await sha256Hex(password)) === hash.slice(PREFIX.length);
  return legacyEncode(password) === hash;
}
