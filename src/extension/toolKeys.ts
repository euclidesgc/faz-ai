// A chave de API de cada ferramenta de IA (épica "ferramenta por modo", história 7): a pessoa a cola na tela
// do Conectar, e ela vai só para o cofre local (`LocalCredentials`, AES-GCM, a mesma pasta e a mesma chave
// local dos perfis) e, em cada processo da ferramenta, para o `authenticate` do agente. Nunca volta à tela,
// nunca entra no banco do board (nem na exportação), no log, no `ai_runs` nem no vínculo da admissão.
//
// A chave é da ferramenta, não do board nem do perfil: a conta (e a cota) é a mesma em toda pasta e nos
// três modos do Gemini, e a história 8 (CLI) e a 10 (API) leem a mesma chave. Por isso o índice (ferramenta →
// referência do cofre) fica num arquivo da pasta de dados da extensão, fora do banco. A referência não é
// segredo: sem a chave local do cofre (que nunca sai da máquina) ela não abre nada.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { validSecretRef, type CredentialStore } from './credentials';

const ownerOf = (tool: string) => JSON.stringify(['tool-key', tool]);
/** O id de ferramenta que o índice aceita: os do catálogo (`gemini`, `codex-acp`…). */
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Uma chave de API é uma linha só, sem espaços; o limite só barra o que claramente não é chave. */
const API_KEY = /^[\x21-\x7e]{8,512}$/;

/** Confere o formato da chave colada (sem dizer qual é): devolve a chave sem espaços nas pontas, ou o erro. */
export function parseApiKey(raw: unknown): { key: string } | { error: string } {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key) return { error: 'Cole a chave de API.' };
  if (!API_KEY.test(key)) return { error: 'A chave de API tem de ser uma linha só, sem espaços, com 8 a 512 caracteres.' };
  return { key };
}

export class ToolKeys {
  constructor(
    private readonly store: CredentialStore,
    /** o índice ferramenta → referência do cofre, um JSON só da pessoa (0600) */
    private readonly indexFile: string,
  ) {}

  private index(): Record<string, string> {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw).filter(([tool, ref]) => TOOL_ID.test(tool) && validSecretRef(ref))) as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }

  private write(index: Record<string, string>): void {
    fs.mkdirSync(path.dirname(this.indexFile), { recursive: true, mode: 0o700 });
    // troca atômica: outra janela que lê no meio nunca vê o arquivo pela metade
    const temp = `${this.indexFile}.${randomBytes(8).toString('hex')}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(index), { mode: 0o600 });
    fs.renameSync(temp, this.indexFile);
  }

  /** A chave está guardada (só a presença: a sonda de login e a tela não precisam do valor). */
  has(tool: string): boolean {
    const ref = this.index()[tool];
    return !!ref && this.store.has(ownerOf(tool), ref);
  }

  /** A chave, para o host entregar ao agente; null sem chave ou com o cofre indisponível. */
  get(tool: string): string | null {
    const ref = this.index()[tool];
    if (!ref) return null;
    try {
      const value = this.store.get(ownerOf(tool), ref)?.apiKey;
      return typeof value === 'string' && value ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda (ou troca) a chave da ferramenta, sem conferir. O cofre grava antes de o índice apontar para ela.
   * Quem tem como conferir a chave (o Conectar) usa `replace`, para a anterior só sair depois de a nova passar.
   */
  set(tool: string, apiKey: string): void {
    if (!TOOL_ID.test(tool)) throw new Error(`Ferramenta inválida: ${tool}.`);
    const parsed = parseApiKey(apiKey);
    if ('error' in parsed) throw new Error(parsed.error);
    const index = this.index();
    const old = index[tool];
    const ref = this.store.put(ownerOf(tool), { apiKey: parsed.key });
    this.write({ ...index, [tool]: ref });
    // o índice já aponta para a nova: a cifrada antiga sai do disco
    if (old && old !== ref) this.store.delete(ownerOf(tool), old);
  }

  /**
   * Troca a chave só depois que a nova é aceita (`accept`: no ACP, o `authenticate` do agente; no modo API, a
   * conferência com a API). Enquanto ela não passa, nada muda no cofre nem no índice: uma chave recusada (ou
   * uma rede fora do ar) deixa a anterior funcionando. Aceita, grava a nova e só então apaga a cifrada antiga.
   */
  async replace(tool: string, apiKey: string, accept: (key: string) => Promise<void>): Promise<void> {
    if (!TOOL_ID.test(tool)) throw new Error(`Ferramenta inválida: ${tool}.`);
    const parsed = parseApiKey(apiKey);
    if ('error' in parsed) throw new Error(parsed.error);
    await accept(parsed.key);
    this.set(tool, parsed.key);
  }

  /** Esquece a chave da ferramenta: o índice deixa de apontar para ela e o arquivo cifrado sai do disco. */
  remove(tool: string): void {
    const index = this.index();
    const old = index[tool];
    if (!old) return;
    delete index[tool];
    this.write(index);
    this.store.delete(ownerOf(tool), old);
  }
}
