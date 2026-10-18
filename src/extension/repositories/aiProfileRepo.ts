import type { Database } from 'sql.js';
import {
  BUILTIN_PROFILES,
  newProfileId,
  unknownProfileCapabilities,
  validateProfile,
  type AiProfile,
  type AiProfileDraft,
  type AiProfileConfig,
} from '../../shared/aiProfiles';
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
const copyKeys = ['command', 'env', 'extraArgs', 'installUrl'];
/** Configuração livre nunca passa pelo SQLite nem retorna ao editor. */
export class AiProfileRepo {
  constructor(private readonly db: Database) {}
  private rows(boardId: string): Row[] {
    return all(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? ORDER BY position, id', [boardId]);
  }
  list(boardId: string): AiProfile[] {
    const result = this.rows(boardId).map((row) => this.publicProfile(row));
    for (const p of BUILTIN_PROFILES)
      if (!result.some((row) => row.id === p.id)) result.push({ ...structuredClone(p), capabilities: unknownProfileCapabilities() });
    return result.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
  private publicProfile(row: Row): AiProfile {
    const builtin = BUILTIN_PROFILES.find((p) => p.id === row.id);
    return {
      ...(builtin
        ? structuredClone(builtin)
        : {
            id: str(row.id),
            name: str(row.name),
            kind: str(row.kind) as AiProfile['kind'],
            base: str(row.base) as AiProfile['base'],
            config: {},
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
    if (draft.kind === 'builtin' || BUILTIN_PROFILES.some((p) => p.id === draft.id))
      throw new Error('Os perfis prontos não são editados: duplique para mudar.');
    const errors = validateProfile(draft);
    if (errors.length) throw new Error(errors.join(' '));
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
      if (old && (old.kind !== draft.kind || old.base !== draft.base))
        throw new Error('O tipo e a base do perfil não são alterados: crie outro perfil.');
      const saved = old ? credentialsFor(this.db).get(ownerOf(boardId, id), str(old.secret_ref)) : null;
      // Só extensões já salvas são preservadas; um campo conhecido inaplicável não passa para uma cópia.
      const config: AiProfileConfig = {};
      for (const [key, value] of Object.entries(saved ?? {})) if (!knownConfigKeys.includes(key)) config[key] = value;
      for (const [key, value] of Object.entries(draft.config)) if (draft.kind === 'custom' || copyKeys.includes(key)) config[key] = value;
      const ref = credentialsFor(this.db).put(ownerOf(boardId, id), config);
      run(
        this.db,
        `INSERT INTO ai_profiles(board_id,id,name,enabled,kind,base,position,secret_ref,review_state)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(board_id,id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, position=excluded.position, secret_ref=excluded.secret_ref, review_state=excluded.review_state, config_json='{}'`,
        [
          boardId,
          id,
          draft.name.trim(),
          reviewed && draft.enabled ? 1 : 0,
          draft.kind,
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
    const row = one(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    if (!row) throw new Error('Perfil indisponível neste board.');
    if (enabled && row.review_state !== 'reviewed') throw new Error('Revise o perfil importado antes de ligar.');
    run(this.db, 'UPDATE ai_profiles SET enabled = ? WHERE board_id = ? AND id = ?', [enabled ? 1 : 0, boardId, id]);
  }
  /** Revisão explícita dos prontos importados; não liga o perfil nem concede capacidades. */
  reviewBuiltin(boardId: string, id: string, actor: 'person' | 'ai'): void {
    this.human(actor);
    if (!BUILTIN_PROFILES.some((p) => p.id === id)) throw new Error('Forneça uma configuração revisada para este perfil.');
    run(this.db, "UPDATE ai_profiles SET review_state = 'reviewed' WHERE board_id = ? AND id = ? AND kind = 'builtin'", [boardId, id]);
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
    const kind = source.kind === 'custom' ? 'custom' : 'copy';
    const targetId = newProfileId(
      `${source.name} cópia`,
      profiles.map((p) => p.id),
    );
    const sourceRow = one(this.db, 'SELECT secret_ref FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    const config = source.kind === 'builtin' ? null : credentialsFor(this.db).get(ownerOf(boardId, id), str(sourceRow?.secret_ref));
    const ref = config ? credentialsFor(this.db).put(ownerOf(boardId, targetId), config) : null;
    run(
      this.db,
      "INSERT INTO ai_profiles(board_id,id,name,enabled,kind,base,position,secret_ref,review_state) VALUES (?,?,?,0,?,?,?,?,'pending')",
      [boardId, targetId, `${source.name} (cópia)`, kind, source.base, Math.max(-1, ...profiles.map((p) => p.position)) + 1, ref],
    );
    return this.list(boardId).find((p) => p.id === targetId)!;
  }
  /** Porta privada: só o preparador do host usa, após admissão por capacidades. */
  resolveConfig(boardId: string, id: string): AiProfileConfig {
    const row = one(this.db, 'SELECT * FROM ai_profiles WHERE board_id = ? AND id = ?', [boardId, id]);
    if (!row || !bool(row.enabled) || row.review_state !== 'reviewed') throw new Error('Perfil desativado ou pendente de revisão.');
    if (BUILTIN_PROFILES.some((p) => p.id === id)) return {};
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
    if (
      builtin
        ? row.kind !== 'builtin' || row.base !== builtin.base || row.secret_ref !== null
        : !['copy', 'custom'].includes(str(row.kind)) ||
          (row.kind === 'custom') !== (row.base === 'generic') ||
          !['claude', 'cursor', 'kimi', 'generic'].includes(str(row.base))
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
