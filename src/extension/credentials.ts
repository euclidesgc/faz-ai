import * as fs from 'node:fs';
import * as path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Database } from 'sql.js';

export interface CredentialStore {
  put(owner: string, value: Record<string, unknown>): string;
  get(owner: string, ref: string): Record<string, unknown> | null;
  has(owner: string, ref: string): boolean;
  /** apaga o valor da referência, se for do dono (trocar ou esquecer uma chave não deixa o cifrado antigo no disco) */
  delete(owner: string, ref: string): void;
  redact(text: string): string;
}
class PrivateValues {
  private values = new Set<string>();
  remember(value: unknown): void {
    if (typeof value === 'string') {
      if (value) this.values.add(value);
      if (/^https?:\/\//.test(value))
        try {
          const url = new URL(value);
          for (const part of [url.username, url.password, ...url.searchParams.values()])
            if (part) this.values.add(decodeURIComponent(part));
        } catch {
          /* O valor inteiro continua protegido. */
        }
      if (value.startsWith('--') && value.includes('=')) this.values.add(value.slice(value.indexOf('=') + 1));
    } else if (Array.isArray(value)) value.forEach((item) => this.remember(item));
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => this.remember(item));
  }
  redact(text: string): string {
    const values = [...this.values].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!values.length) return text;
    try {
      return text.replace(new RegExp(values.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), '[credencial local]');
    } catch {
      return '[saída protegida]';
    }
  }
}
/**
 * Campos da configuração do perfil que descrevem como chamar a ferramenta e nunca guardam segredo (nome do agente
 * ACP, comando, formato do prompt, onde fica o servidor do board...). Mascará-los trocaria
 * "gemini" por "[credencial local]" no log. `args`, `extraArgs`, `env` e qualquer outro campo continuam mascarados.
 */
const NON_SECRET_CONFIG_KEYS = new Set([
  'acpAgent',
  'command',
  'promptVia',
  'boardServer',
  'mcpProjectFile',
  'installUrl',
  'versionArgs',
  'statusArgs',
  'isolation',
]);

/** Saídas de sondas usam a mesma ocultação de valores dos comandos de execução. */
export function redactCredentialValues(text: string, value: unknown): string {
  const privateValues = new PrivateValues();
  if (value && typeof value === 'object' && !Array.isArray(value))
    for (const [key, item] of Object.entries(value)) {
      if (!NON_SECRET_CONFIG_KEYS.has(key)) privateValues.remember(item);
    }
  else privateValues.remember(value);
  return privateValues.redact(text);
}

export const validSecretRef = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stores = new WeakMap<Database, CredentialStore>();
/** Cada banco em memória tem um cofre próprio; testes nunca escrevem no cofre da pessoa. */
export function credentialsFor(db: Database): CredentialStore {
  let store = stores.get(db);
  if (!store) {
    const values = new Map<string, { owner: string; value: Record<string, unknown> }>();
    const privateValues = new PrivateValues();
    store = {
      put(owner, value) {
        const ref = randomBytes(32).toString('hex');
        values.set(ref, { owner, value: structuredClone(value) });
        privateValues.remember(value);
        return ref;
      },
      get(owner, ref) {
        const saved = values.get(ref);
        return saved?.owner === owner ? structuredClone(saved.value) : null;
      },
      has(owner, ref) {
        return values.get(ref)?.owner === owner;
      },
      delete(owner, ref) {
        if (values.get(ref)?.owner === owner) values.delete(ref);
      },
      redact: (text) => privateValues.redact(text),
    };
    stores.set(db, store);
  }
  return store;
}
export function bindCredentials(db: Database, store: CredentialStore): void {
  stores.set(db, store);
}
function syncDir(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function privateFile(file: string): Buffer {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())))
      throw new Error('Arquivo de credenciais sem proteção local adequada.');
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
/** Publicação exclusiva: segredo confirmado no disco antes de substituir qualquer valor no SQLite. */
function publish(file: string, bytes: Uint8Array): void {
  const temp = `${file}.${randomBytes(16).toString('hex')}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // link publica exclusivamente bytes completos; outro host nunca lê uma chave pela metade.
    fs.linkSync(temp, file);
    syncDir(path.dirname(file));
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
/** Cofre do host, compartilhável por MCPs e perfis. A chave local nunca entra no banco/export. */
export class LocalCredentials implements CredentialStore {
  private privateValues = new PrivateValues();
  redact(text: string): string {
    return this.privateValues.redact(text);
  }
  private key(): Buffer {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
    )
      throw new Error('Pasta de credenciais sem proteção local adequada.');
    const file = path.join(this.directory, 'key');
    if (!fs.existsSync(file)) {
      // Um segundo host pode ganhar a criação; ambos leem os mesmos bytes publicados.
      try {
        publish(file, randomBytes(32));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    const key = privateFile(file);
    if (key.length !== 32) throw new Error('Chave local de credenciais inválida.');
    return key;
  }
  constructor(readonly directory: string) {}
  put(owner: string, value: Record<string, unknown>): string {
    const key = this.key();
    const ref = randomBytes(32).toString('hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([owner, ref])));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    publish(
      path.join(this.directory, `${ref}.json`),
      Buffer.from(
        JSON.stringify({
          version: 1,
          owner: createHash('sha256').update(owner).digest('hex'),
          iv: iv.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
          data: data.toString('base64'),
        }),
      ),
    );
    this.privateValues.remember(value);
    return ref;
  }
  get(owner: string, ref: string): Record<string, unknown> | null {
    if (!validSecretRef(ref)) return null;
    const file = path.join(this.directory, `${ref}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const envelope = JSON.parse(privateFile(file).toString('utf8')) as { version: number; iv: string; tag: string; data: string };
      if (envelope.version !== 1) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(JSON.stringify([owner, ref])));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const value: unknown = JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'),
      );
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.privateValues.remember(value);
        return value as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  /** Só apaga o arquivo do mesmo dono (o hash do dono no envelope): uma referência de outro não é tocada. */
  delete(owner: string, ref: string): void {
    if (!this.has(owner, ref)) return;
    fs.rmSync(path.join(this.directory, `${ref}.json`), { force: true });
    syncDir(this.directory);
  }
  has(owner: string, ref: string): boolean {
    if (!validSecretRef(ref)) return false;
    try {
      const envelope = JSON.parse(privateFile(path.join(this.directory, `${ref}.json`)).toString('utf8')) as { owner?: unknown };
      return envelope.owner === createHash('sha256').update(owner).digest('hex') && fs.existsSync(path.join(this.directory, 'key'));
    } catch {
      return false;
    }
  }
}
