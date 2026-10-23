import type { Database } from 'sql.js';
import {
  BUILTIN_ISOLATION,
  BUILTIN_PROFILES,
  PROFILE_MODES,
  catalogTool,
  isReadyCli,
  isReadyProfile,
  newProfileId,
  normalizeProfileKind,
  unknownProfileCapabilities,
  validateProfile,
  type AiProfile,
  type AiProfileDraft,
  type AiProfileConfig,
  type AiProfileKind,
  type ProfileMode,
} from '../../shared/aiProfiles';
import { toolModeEntry } from '../../shared/aiTools';
import { credentialsFor, validSecretRef } from '../credentials';
import { all, bool, num, one, run, str, transaction, type Row } from '../db/query';

const ownerOf = (boardId: string, id: string) => JSON.stringify(['profile', boardId, id]);
const knownConfigKeys = [
  'command',
  'env',
  'extraArgs',
  'installUrl',
  'args',
  'promptVia',
  'boardServer',
  'mcpProjectFile',
  'permissionArgs',
  'versionArgs',
  'statusArgs',
  'authPatterns',
];
/**
 * Os ajustes que um perfil do catálogo guarda no cofre por cima da ferramenta (os `overrides` da cópia): o
 * resto vem da ferramenta. São as mesmas chaves que a cópia guardava antes da migração 48, no mesmo lugar.
 */
const overrideKeys = ['command', 'env', 'extraArgs', 'installUrl', 'authPatterns', 'isolation'];
type Identity = { kind: AiProfileKind; tool: string; mode: ProfileMode };
/**
 * Ferramenta e modo de uma linha gravada antes da migração 48 (`tool` vazio), pelo `kind` antigo:
 * `builtin` → (id, cli); `acp` → (id, acp); `copy` → catálogo com a ferramenta da base, em cli;
 * `custom` → (id, acp) com agente ACP no cofre, senão (id, cli). `catalogTool` dá o mesmo valor de antes.
 */
function legacyIdentity(row: Row, acpAgent: unknown): Identity {
  const ready = BUILTIN_PROFILES.find((p) => p.id === row.id);
  if (ready) return { kind: ready.kind, tool: ready.tool, mode: ready.mode };
  const id = str(row.id);
  // o agente ACP pronto que saiu do catálogo continua o que era: a própria ferramenta, em acp. Pela base
  // (generic) ele viraria uma cópia, mudaria o catalogTool e o caminho de volta o gravaria como copy
  if (row.kind === 'acp') return { kind: 'catalog', tool: id, mode: 'acp' };
  if (normalizeProfileKind(row.kind) === 'catalog') return { kind: 'catalog', tool: str(row.base), mode: 'cli' };
  return { kind: 'custom', tool: id, mode: typeof acpAgent === 'string' ? 'acp' : 'cli' };
}
/** A identidade gravada (schema 48) ou, com `tool` vazio, a deduzida do `kind` antigo. */
function identityOf(row: Row, acpAgent: unknown): Identity {
  const kind = normalizeProfileKind(row.kind);
  const mode = PROFILE_MODES.find((m) => m === row.mode);
  return row.tool && kind && mode ? { kind, tool: str(row.tool), mode } : legacyIdentity(row, acpAgent);
}
/**
 * O modo de um perfil pronto: o gravado na linha, quando a extensão oferece esse modo para a ferramenta
 * (`TOOLS`); senão, o do código. É o "um perfil por ferramenta, com o modo trocável" da épica: quem troca é
 * o Conectar (história 7), e o Gemini passa a ter o modo API oferecido na história 10. Um modo que esta
 * versão não oferece (gravado por uma mais nova, ou que saiu do catálogo) volta ao do código, em vez de
 * deixar o perfil num modo sem driver.
 */
function readyMode(builtin: AiProfile, stored: unknown): ProfileMode {
  const mode = PROFILE_MODES.find((m) => m === stored);
  return mode && toolModeEntry(builtin.tool, mode) ? mode : builtin.mode;
}
/** Configuração livre nunca passa pelo SQLite nem retorna ao editor. */
export class AiProfileRepo {
  constructor(private readonly db: Database) {}
  private rows(boardId: string): Row[] {
    return all(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? ORDER BY position, id', [boardId]);
  }
  /**
   * Preenchimento preguiçoso da migração 48: grava `kind`, `tool` e `mode` nas linhas que ainda não têm
   * ferramenta. Idempotente (só toca `tool = ''`). O personalizado depende do cofre: sem ler o cofre (falha
   * ou configuração ausente, como no perfil importado de outra máquina) nada é gravado, e a leitura segue
   * deduzindo; o primeiro `save` grava.
   */
  private fillToolAndMode(boardId: string): void {
    const pending = all(this.db, "SELECT id, kind, base, secret_ref FROM ai_profiles WHERE board_id = ? AND tool = ''", [boardId]);
    for (const row of pending) {
      let acpAgent: unknown;
      if (normalizeProfileKind(row.kind) === 'custom' && !BUILTIN_PROFILES.some((p) => p.id === row.id)) {
        let saved: Record<string, unknown> | null;
        try {
          saved = credentialsFor(this.db).get(ownerOf(boardId, str(row.id)), str(row.secret_ref));
        } catch {
          continue;
        }
        if (!saved) continue;
        acpAgent = saved.acpAgent;
      } else if (!normalizeProfileKind(row.kind)) continue;
      const identity = legacyIdentity(row, acpAgent);
      run(this.db, "UPDATE ai_profiles SET kind = ?, tool = ?, mode = ? WHERE board_id = ? AND id = ? AND tool = ''", [
        identity.kind,
        identity.tool,
        identity.mode,
        boardId,
        str(row.id),
      ]);
    }
  }
  list(boardId: string): AiProfile[] {
    this.fillToolAndMode(boardId);
    const result = this.rows(boardId).map((row) => this.publicProfile(row));
    for (const p of BUILTIN_PROFILES)
      if (!result.some((row) => row.id === p.id)) result.push({ ...structuredClone(p), capabilities: unknownProfileCapabilities() });
    return result.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
  /**
   * O que volta da configuração para a leitura pública: o isolamento declarado e o agente ACP (o id do catálogo),
   * que não são segredo. É por `acpAgent` que o board, a interface e o MCP reconhecem um perfil ACP; o resto
   * (comando, argumentos, ambiente) fica no cofre.
   */
  private publicConfigOf(row: Row): AiProfileConfig {
    try {
      const saved = credentialsFor(this.db).get(ownerOf(str(row.board_id), str(row.id)), str(row.secret_ref));
      const config: AiProfileConfig = {};
      if (saved?.isolation !== undefined) config.isolation = saved.isolation as AiProfileConfig['isolation'];
      if (typeof saved?.acpAgent === 'string') config.acpAgent = saved.acpAgent;
      return config;
    } catch {
      return {};
    }
  }
  private publicProfile(row: Row): AiProfile {
    const builtin = BUILTIN_PROFILES.find((p) => p.id === row.id);
    const config = builtin ? null : this.publicConfigOf(row);
    return {
      ...(builtin
        ? { ...structuredClone(builtin), mode: readyMode(builtin, row.mode) }
        : {
            id: str(row.id),
            name: str(row.name),
            ...identityOf(row, config!.acpAgent),
            base: str(row.base) as AiProfile['base'],
            config: config!,
          }),
      enabled: bool(row.enabled),
      position: num(row.position),
      capabilities: unknownProfileCapabilities(),
      credentials: {
        secretRef: str(row.secret_ref),
        review: row.review_state === 'reviewed' ? 'reviewed' : 'pending',
        available: !!builtin || credentialsFor(this.db).has(ownerOf(str(row.board_id), str(row.id)), str(row.secret_ref)),
      },
    };
  }
  private human(actor: 'person' | 'ai'): void {
    if (actor !== 'person') throw new Error('Perfis executáveis exigem revisão humana.');
  }
  save(boardId: string, draft: AiProfileDraft, actor: 'person' | 'ai', reviewed = true): AiProfile {
    this.human(actor);
    const kind = normalizeProfileKind(draft.kind);
    // no catálogo, o formulário só grava a cópia de uma CLI pronta; o agente ACP pronto vem do código
    if ((kind === 'catalog' && draft.base === 'generic') || BUILTIN_PROFILES.some((p) => p.id === draft.id))
      throw new Error('Os perfis prontos não são editados: duplique para mudar.');
    if (!kind) throw new Error('Tipo ou base do perfil inválido.');
    return transaction(this.db, () => {
      const rows = this.rows(boardId),
        old = rows.find((row) => row.id === draft.id);
      if (old && this.defaultId(boardId) === old.id && (!reviewed || !draft.enabled))
        throw new Error('Escolha outro perfil padrão antes de desligar este.');
      const id = old
        ? str(old.id)
        : newProfileId(
            draft.name,
            rows.map((row) => str(row.id)),
          );
      if (old && (normalizeProfileKind(old.kind) !== kind || old.base !== draft.base))
        throw new Error('O tipo e a base do perfil não são alterados: crie outro perfil.');
      const saved = old ? credentialsFor(this.db).get(ownerOf(boardId, id), str(old.secret_ref)) : null;
      // O navegador não recebe a configuração privada: campos omitidos numa edição mantêm o valor do cofre.
      // A cópia só retém chaves do seu próprio tipo; explicitamente enviadas, listas podem ser esvaziadas.
      const config: AiProfileConfig = {};
      for (const [key, value] of Object.entries(saved ?? {}))
        if (kind === 'custom' || overrideKeys.includes(key) || !knownConfigKeys.includes(key)) config[key] = value;
      for (const [key, value] of Object.entries(draft.config)) {
        if (kind !== 'custom' && !overrideKeys.includes(key)) continue;
        if (key === 'env' && value && typeof value === 'object' && !Array.isArray(value)) {
          const env = { ...(config.env ?? {}) };
          for (const [name, secret] of Object.entries(value)) {
            if (secret === '') delete env[name];
            else env[name] = secret as string;
          }
          config.env = env;
        } else config[key] = value;
      }
      const errors = validateProfile({ ...draft, kind, config });
      if (errors.length) throw new Error(errors.join(' '));
      // a ferramenta e o modo saem do tipo e da configuração, nunca do rascunho: a cópia é a ferramenta da base
      // em cli; o personalizado é a própria ferramenta, em acp quando aponta um agente do catálogo ACP
      const tool = kind === 'catalog' ? draft.base : id,
        mode: ProfileMode = kind === 'custom' && typeof config.acpAgent === 'string' ? 'acp' : 'cli';
      const ref = credentialsFor(this.db).put(ownerOf(boardId, id), config);
      run(
        this.db,
        `INSERT INTO ai_profiles(board_id,id,name,enabled,kind,tool,mode,base,position,secret_ref,review_state)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(board_id,id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, kind=excluded.kind, tool=excluded.tool, mode=excluded.mode, position=excluded.position, secret_ref=excluded.secret_ref, review_state=excluded.review_state, config_json='{}'`,
        [
          boardId,
          id,
          draft.name.trim(),
          reviewed && draft.enabled ? 1 : 0,
          kind,
          tool,
          mode,
          draft.base,
          draft.position,
          ref,
          reviewed ? 'reviewed' : 'pending',
        ],
      );
      return this.publicProfile(one(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id])!);
    });
  }
  setEnabled(boardId: string, id: string, enabled: boolean, actor: 'person' | 'ai'): void {
    this.human(actor);
    if (typeof enabled !== 'boolean') throw new Error('Estado do perfil inválido.');
    if (!enabled && this.defaultId(boardId) === id) throw new Error('Escolha outro perfil padrão antes de desligar este.');
    // o agente ACP pronto só ganha linha no banco quando a pessoa liga: boards antigos não passam por migração
    this.ensureCatalogRow(boardId, id);
    const row = one(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    if (!row) throw new Error('Perfil indisponível neste board.');
    if (enabled && row.review_state !== 'reviewed') throw new Error('Revise o perfil importado antes de ligar.');
    run(this.db, 'UPDATE ai_profiles SET enabled = ? WHERE board_id = ? AND id = ?', [enabled ? 1 : 0, boardId, id]);
  }
  /**
   * Troca o modo do perfil pronto (o Conectar, ao conectar o cartão de outro modo): só um modo que a extensão
   * oferece para a ferramenta. O id, as políticas, o catálogo de modelos e a chave da ferramenta não mudam;
   * o vínculo da admissão muda com o transporte, e as provas do outro modo deixam de valer para ele.
   */
  setMode(boardId: string, id: string, mode: ProfileMode, actor: 'person' | 'ai'): void {
    this.human(actor);
    const builtin = BUILTIN_PROFILES.find((p) => p.id === id);
    if (!builtin) throw new Error('Só o perfil pronto troca de modo; o personalizado segue pelo formulário.');
    if (!toolModeEntry(builtin.tool, mode)) throw new Error(`O modo ${mode} não é oferecido para ${builtin.name}.`);
    this.ensureCatalogRow(boardId, id);
    run(this.db, 'UPDATE ai_profiles SET mode = ? WHERE board_id = ? AND id = ?', [mode, boardId, id]);
  }
  /** Revisão explícita dos prontos importados; não liga o perfil nem concede capacidades. */
  reviewBuiltin(boardId: string, id: string, actor: 'person' | 'ai'): void {
    this.human(actor);
    if (!BUILTIN_PROFILES.some((p) => p.id === id)) throw new Error('Forneça uma configuração revisada para este perfil.');
    // o kind antigo (builtin, acp) vale até o preenchimento da migração 48 gravar catalog
    run(
      this.db,
      "UPDATE ai_profiles SET review_state = 'reviewed' WHERE board_id = ? AND id = ? AND kind IN ('catalog', 'builtin', 'acp')",
      [boardId, id],
    );
  }
  private ensureCatalogRow(boardId: string, id: string): void {
    const p = BUILTIN_PROFILES.find((profile) => profile.id === id);
    if (p)
      run(
        this.db,
        "INSERT OR IGNORE INTO ai_profiles(board_id,id,name,enabled,kind,tool,mode,base,position,review_state) VALUES (?,?,?,?,?,?,?,?,?,'reviewed')",
        [boardId, p.id, p.name, p.enabled ? 1 : 0, p.kind, p.tool, p.mode, p.base, p.position],
      );
  }
  remove(boardId: string, id: string, actor: 'person' | 'ai'): void {
    this.human(actor);
    if (BUILTIN_PROFILES.some((p) => p.id === id)) throw new Error('Os perfis prontos não são apagados: desligue.');
    if (this.defaultId(boardId) === id) throw new Error('Escolha outro perfil padrão antes de apagar este.');
    run(this.db, 'DELETE FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
  }
  duplicate(boardId: string, id: string, actor: 'person' | 'ai'): AiProfile {
    this.human(actor);
    const profiles = this.list(boardId),
      source = profiles.find((p) => p.id === id);
    if (!source) throw new Error('Perfil indisponível neste board.');
    // Cópia humana ganha referência própria; não herda revisão nem evidência executável.
    // a cópia de um agente ACP pronto é um perfil personalizado com o mesmo agente: o id novo é outra ferramenta do catálogo
    // o mesmo vale para o Gemini pronto em qualquer modo (a base dele é a do agente ACP): a cópia é o personalizado
    // com o agente, em acp, porque o Gemini pela CLI e pela API não tem cópia de catálogo (não é uma `AiBase`)
    const kind: AiProfileKind = source.kind === 'custom' || source.mode === 'acp' || source.base === 'generic' ? 'custom' : 'catalog';
    // o personalizado com o agente ACP é sempre do modo ACP: a cópia de uma cópia do Gemini pela API ou pela CLI
    // não fica num modo sem driver para o personalizado
    const mode = kind === 'custom' && source.base === 'generic' && typeof source.config.acpAgent === 'string' ? 'acp' : source.mode;
    const targetId = newProfileId(
      `${source.name} cópia`,
      profiles.map((p) => p.id),
    );
    const sourceRow = one(this.db, 'SELECT secret_ref FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    // a cópia de um pronto leva a lista de itens que a CLI carrega (declaração herdada, sem a garantia do base)
    const config =
      isReadyCli(source) && source.base !== 'generic'
        ? { isolation: { loads: structuredClone(BUILTIN_ISOLATION[source.base].loads) } }
        : isReadyProfile(source)
          ? structuredClone(source.config)
          : credentialsFor(this.db).get(ownerOf(boardId, id), str(sourceRow?.secret_ref));
    const ref = config ? credentialsFor(this.db).put(ownerOf(boardId, targetId), config) : null;
    // a cópia do catálogo continua a ferramenta da origem; a personalizada é outra ferramenta, no modo da origem
    const tool = kind === 'catalog' ? catalogTool(source) : targetId;
    run(
      this.db,
      "INSERT INTO ai_profiles(board_id,id,name,enabled,kind,tool,mode,base,position,secret_ref,review_state) VALUES (?,?,?,0,?,?,?,?,?,?,'pending')",
      [
        boardId,
        targetId,
        `${source.name} (cópia)`,
        kind,
        tool,
        mode,
        source.base,
        Math.max(-1, ...profiles.map((p) => p.position)) + 1,
        ref,
      ],
    );
    return this.list(boardId).find((p) => p.id === targetId)!;
  }
  /** Porta privada: só o preparador do host usa, após admissão por capacidades. */
  resolveConfig(boardId: string, id: string): AiProfileConfig {
    const row = one(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    if (!row || !bool(row.enabled) || row.review_state !== 'reviewed') throw new Error('Perfil desativado ou pendente de revisão.');
    // o pronto ACP leva o agente do catálogo (e a página oficial); nada vem do cofre
    const builtin = BUILTIN_PROFILES.find((p) => p.id === id);
    if (builtin) return structuredClone(builtin.config);
    const config = credentialsFor(this.db).get(ownerOf(boardId, id), str(row.secret_ref));
    if (!config) throw new Error('Configuração local do perfil indisponível.');
    return config;
  }
  /** Somente adaptadores internos do host recebem valores privados para sondar ou executar. */
  resolveProfile(boardId: string, id: string): AiProfile {
    const meta = this.list(boardId).find((p) => p.id === id);
    if (!meta) throw new Error('Perfil indisponível neste board.');
    return { ...meta, config: this.resolveConfig(boardId, id) };
  }
  private defaultId(boardId: string): string {
    const row = one(this.db, 'SELECT ai_tools_json FROM boards WHERE id = ?', [boardId]);
    try {
      const value: unknown = JSON.parse(str(row?.ai_tools_json));
      return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : 'claude';
    } catch {
      return 'claude';
    }
  }
}
/** O import aceita somente referências. Configuração executável importada fica sem autoridade local. */
export function validateProfileRows(rows: Row[], boardId: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = str(row.id),
      builtin = BUILTIN_PROFILES.find((p) => p.id === id);
    if (
      row.board_id !== boardId ||
      !/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) ||
      ids.has(id) ||
      !['pending', 'reviewed'].includes(str(row.review_state)) ||
      ![0, 1].includes(Number(row.enabled))
    )
      throw new Error('Perfil importado inválido.');
    ids.add(id);
    let config: unknown;
    try {
      config = JSON.parse(str(row.config_json));
    } catch {
      throw new Error('Configuração importada de perfil inválida.');
    }
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      Object.keys(config).length ||
      (row.secret_ref !== null && !validSecretRef(row.secret_ref))
    )
      throw new Error('A importação de perfis exige referências locais, sem valores.');
    // os dois conjuntos de valores: o do schema 48 (catalog/custom, com ferramenta e modo) e o antigo
    // (builtin, acp, copy, custom), com a ferramenta vazia até o repositório preencher
    const kind = normalizeProfileKind(row.kind),
      tool = str(row.tool),
      mode = row.mode === undefined ? 'cli' : str(row.mode);
    const legacy = builtin ? (builtin.mode === 'acp' ? 'acp' : 'builtin') : kind === 'catalog' ? 'copy' : 'custom';
    if (
      (row.kind !== 'catalog' && row.kind !== legacy) ||
      (row.kind === 'catalog' && !tool) ||
      !PROFILE_MODES.some((m) => m === mode) ||
      (builtin
        ? row.base !== builtin.base ||
          row.secret_ref !== null ||
          // sem a ferramenta (linha ainda não preenchida), o modo é o do pronto ou o padrão da coluna (`cli`);
          // um pronto de CLI em `acp` não passa por estar sem ferramenta. Com a ferramenta, vale o modo do
          // pronto ou outro que a extensão oferece para ela (o Gemini pela API, desde a história 10); a
          // chave nunca vem no arquivo: ela é do cofre de quem conectou
          (tool === ''
            ? mode !== builtin.mode && mode !== 'cli'
            : tool !== builtin.tool || (mode !== builtin.mode && !toolModeEntry(builtin.tool, mode as ProfileMode)))
        : // `api` só existe no pronto: a cópia e o personalizado (comando próprio ou agente ACP) não rodam nele
          mode === 'api' ||
          (kind === 'custom') !== (row.base === 'generic') ||
          !['claude', 'cursor', 'kimi', 'generic'].includes(str(row.base)) ||
          (tool !== '' && tool !== (kind === 'catalog' ? str(row.base) : id)) ||
          (kind === 'catalog' && mode !== 'cli'))
    )
      throw new Error('Tipo ou base do perfil importado inválido.');
    if (
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 240 ||
      row.name.includes('\0') ||
      !Number.isSafeInteger(row.position) ||
      Number(row.position) < 0 ||
      Number(row.position) > 1000000
    )
      throw new Error('Metadados do perfil importado inválidos.');
  }
}
