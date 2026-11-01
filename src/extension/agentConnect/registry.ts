// O registro oficial do ACP: a lista de agentes que a tela de Conectar agentes mostra, com o ícone, a descrição,
// a versão publicada e como iniciar cada um (pacote npx/uvx ou binário por sistema). Aqui ela vira o comando que
// esta máquina consegue rodar. O board não baixa binários: um agente só de binário precisa já estar no PATH.
//
// A lista fica guardada (memória e arquivo na pasta de dados) por algumas horas: a tela abre na hora, e sem rede
// ela segue com a cópia anterior, dizendo de quando é.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RegistryAgent, RegistryListing } from '../../shared/agentConnect';

export const ACP_REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/** Quanto tempo a cópia do registro vale antes de baixar de novo: o registro muda de hora em hora, não de minuto. */
export const REGISTRY_TTL_MS = 6 * 60 * 60 * 1000;

/** Quanto o download do registro pode levar antes de desistir e seguir com a cópia guardada. */
const DOWNLOAD_TIMEOUT_MS = 15_000;

/** Acha um executável pelo nome; null quando não está nesta máquina. */
export type ResolveFn = (command: string) => string | null;

/** A chave de plataforma do registro (`darwin-aarch64`, `linux-x86_64`, `windows-x86_64`…). */
export function platformKey(platform: string = process.platform, arch: string = process.arch): string {
  const system = platform === 'win32' ? 'windows' : platform;
  const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : arch;
  return `${system}-${cpu}`;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const strMap = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(obj(v) ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'));

/**
 * O nome do executável de uma entrada binária: o registro aponta para dentro do arquivo baixado
 * (`./dist-package/cursor-agent`, `./bin/devin`), e quem instalou pelo canal oficial tem o mesmo nome no PATH.
 */
export function binaryName(cmd: string): string {
  return path.basename(cmd.replace(/\\/g, '/')).replace(/\.(exe|cmd)$/i, '');
}

/**
 * Os argumentos do npx para um pacote: `-y` evita a pergunta antes de instalar (o processo não tem terminal para
 * responder) e `--prefer-offline` usa o pacote já baixado sem consultar a rede, o que tira de 100 a 300 ms de cada
 * abertura (medido com o adaptador do Claude); um pacote que ainda não está no cache é baixado como sempre.
 */
export const npxArgs = (pkg: string, args: readonly string[]): string[] => ['-y', '--prefer-offline', pkg, ...args];

/**
 * As entradas do registro como agentes que esta máquina consegue (ou não) iniciar. Um binário já instalado
 * vence o pacote: roda a versão que a pessoa usa no dia a dia e não baixa nada.
 */
export function agentsFromRegistry(registry: unknown, platform: string, resolve: ResolveFn): RegistryAgent[] {
  const list = obj(registry)?.agents;
  if (!Array.isArray(list)) throw new Error('O registro do ACP veio num formato inesperado.');
  const agents: RegistryAgent[] = [];
  for (const raw of list) {
    const entry = obj(raw);
    const dist = obj(entry?.distribution);
    if (!entry || !dist || !str(entry.id)) continue;
    const base = {
      id: str(entry.id),
      name: str(entry.name) || str(entry.id),
      version: str(entry.version),
      description: str(entry.description),
      authors: strList(entry.authors),
      icon: str(entry.icon) || null,
      url: str(entry.website) || str(entry.repository) || null,
    };
    const binary = obj(obj(dist.binary)?.[platform]);
    const binaryCmd = binary ? binaryName(str(binary.cmd)) : '';
    const binaryPath = binaryCmd ? resolve(binaryCmd) : null;
    if (binary && binaryPath) {
      agents.push({
        ...base,
        distribution: 'binary',
        command: binaryPath,
        args: strList(binary.args),
        env: strMap(binary.env),
        available: true,
        note: null,
      });
      continue;
    }
    const pkg = obj(dist.npx) ?? obj(dist.uvx);
    if (pkg) {
      const runner = dist.npx ? 'npx' : 'uvx';
      const runnerPath = resolve(runner);
      agents.push({
        ...base,
        distribution: runner,
        command: runnerPath ?? runner,
        args: runner === 'npx' ? npxArgs(str(pkg.package), strList(pkg.args)) : [str(pkg.package), ...strList(pkg.args)],
        env: strMap(pkg.env),
        available: !!runnerPath,
        note: runnerPath ? `Baixa ${str(pkg.package)} pelo ${runner} na primeira vez.` : `Precisa do ${runner} instalado.`,
      });
      continue;
    }
    if (binary) {
      agents.push({
        ...base,
        distribution: 'binary',
        command: binaryCmd,
        args: strList(binary.args),
        env: strMap(binary.env),
        available: false,
        note: binaryCmd ? `Instale o ${binaryCmd} pela página do agente: o board não baixa binários.` : 'Sem comando para esta plataforma.',
      });
    } else if (obj(dist.binary)) {
      agents.push({
        ...base,
        distribution: 'binary',
        command: '',
        args: [],
        env: {},
        available: false,
        note: 'Sem binário para esta plataforma.',
      });
    }
  }
  return agents.sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
}

interface Cached {
  fetchedAt: number;
  registry: unknown;
}

/**
 * O registro guardado: em memória, num arquivo da pasta de dados e, vencido o prazo (ou a pedido), baixado de
 * novo. Um download falho não apaga a cópia: a lista segue com ela e com o erro, para a tela dizer de quando é.
 */
export class RegistryCache {
  private memory: Cached | null = null;
  private loaded = false;
  private download: Promise<Cached> | null = null;

  constructor(
    /** o arquivo da cópia; null guarda só em memória (os testes) */
    private file: string | null,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = Date.now,
    private ttlMs: number = REGISTRY_TTL_MS,
  ) {}

  /** O registro bruto, a data e o erro do último download; `refresh` baixa mesmo com a cópia no prazo. */
  async get(refresh = false): Promise<{ registry: unknown; fetchedAt: number | null; error: string | null }> {
    const cached = await this.cached();
    if (cached && !refresh && this.now() - cached.fetchedAt < this.ttlMs) return { ...cached, error: null };
    try {
      // dois pedidos ao mesmo tempo (duas telas abertas) esperam o mesmo download
      const fresh = await (this.download ??= this.fetchFresh().finally(() => (this.download = null)));
      return { ...fresh, error: null };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return cached ? { ...cached, error } : { registry: null, fetchedAt: null, error };
    }
  }

  /** A lista resolvida para esta máquina, pronta para a tela. */
  async listing(resolve: ResolveFn, refresh = false, platform = platformKey(os.platform(), os.arch())): Promise<RegistryListing> {
    const { registry, fetchedAt, error } = await this.get(refresh);
    return { agents: registry ? agentsFromRegistry(registry, platform, resolve) : [], fetchedAt, error };
  }

  private async cached(): Promise<Cached | null> {
    if (!this.loaded && this.file) {
      this.loaded = true;
      try {
        const saved = obj(JSON.parse(await fs.readFile(this.file, 'utf8')));
        if (saved && typeof saved.fetchedAt === 'number' && Array.isArray(obj(saved.registry)?.agents))
          this.memory ??= { fetchedAt: saved.fetchedAt, registry: saved.registry };
      } catch {
        /* sem cópia no disco (primeira vez) ou arquivo estragado: baixa de novo */
      }
    }
    return this.memory;
  }

  private async fetchFresh(): Promise<Cached> {
    const res = await this.fetchFn(ACP_REGISTRY_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`O registro do ACP respondeu ${res.status}.`);
    const registry: unknown = await res.json();
    if (!Array.isArray(obj(registry)?.agents)) throw new Error('O registro do ACP veio num formato inesperado.');
    const fresh = { fetchedAt: this.now(), registry };
    this.memory = fresh;
    if (this.file)
      await fs
        .mkdir(path.dirname(this.file), { recursive: true })
        .then(() => fs.writeFile(this.file!, JSON.stringify(fresh), 'utf8'))
        .catch(() => {
          /* sem gravar a cópia, a lista continua em memória; a próxima abertura baixa de novo */
        });
    return fresh;
  }
}
