// Lê os tokens de uma execução do Kimi Code na sessão que a CLI gravou. O `stream-json` da CLI 2.3.0 não
// informa consumo (nem a documentação oficial promete), mas a CLI persiste cada pedido ao modelo no
// registro da sessão: `<home do Kimi>/sessions/<pasta do projeto>/<session_id>/agents/<agente>/wire.jsonl`,
// uma linha `{"type":"usage.record","model":…,"usage":{inputOther,output,inputCacheRead,inputCacheCreation}}`
// por pedido (o `agents/` tem o `main` e os subagentes). A home é `KIMI_CODE_HOME` ou `~/.kimi-code`, e o
// `session_id` vem do `session.resume_hint` que fecha o stream.
//
// Não é um contrato documentado (o changelog da CLI chama o arquivo de "session wire log", para depuração):
// qualquer divergência, ausência ou erro devolve `null`, e a execução fica como antes, medida só pelo inventário.
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import type { AiRunTokens } from '../../shared/log';

export interface KimiSessionUsage {
  tokens: AiRunTokens;
  /** quantos pedidos ao modelo a sessão registrou (um `usage.record` por pedido) */
  requests: number;
}

export interface KimiFsLike {
  existsSync(file: string): boolean;
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: 'utf8'): string;
}

/** A home do Kimi Code, como o registro do servidor MCP a resolve (`KIMI_CODE_HOME` vence). */
export const kimiHomeOf = (homeDir: string, env: NodeJS.ProcessEnv = process.env): string =>
  env.KIMI_CODE_HOME?.trim() || path.join(homeDir, '.kimi-code');

/** O id de sessão que a CLI emite (`session_<uuid>`); outro formato não vira caminho de arquivo. */
const SESSION_ID = /^session_[0-9a-f-]{8,64}$/i;

/** A pasta da sessão: `sessions/<pasta de projeto>/<session_id>`; null quando não há. */
export function kimiSessionDir(kimiHome: string, sessionId: string, fs: KimiFsLike = nodeFs): string | null {
  if (!SESSION_ID.test(sessionId)) return null;
  const sessions = path.join(kimiHome, 'sessions');
  let workspaces: string[];
  try {
    workspaces = fs.readdirSync(sessions);
  } catch {
    return null;
  }
  for (const name of workspaces) {
    const dir = path.join(sessions, name, sessionId);
    try {
      if (fs.existsSync(path.join(dir, 'agents'))) return dir;
    } catch {
      /* uma pasta sem permissão não impede as outras */
    }
  }
  return null;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

/** Soma os `usage.record` de um `wire.jsonl`; linha inválida ou de outro tipo é pulada. */
export function sumWireUsage(text: string, into: KimiSessionUsage): void {
  for (const line of text.split('\n')) {
    if (!line.includes('"usage.record"')) continue;
    try {
      const o = JSON.parse(line) as { type?: unknown; usage?: Record<string, unknown> };
      if (o?.type !== 'usage.record' || !o.usage || typeof o.usage !== 'object') continue;
      into.tokens.inputTokens += count(o.usage.inputOther);
      into.tokens.outputTokens += count(o.usage.output);
      into.tokens.cacheReadTokens += count(o.usage.inputCacheRead);
      into.tokens.cacheWriteTokens += count(o.usage.inputCacheCreation);
      into.requests++;
    } catch {
      /* linha parcial (a CLI ainda escrevendo) ou inválida */
    }
  }
}

/** Os tokens da sessão, somados os agentes; null quando a sessão não está lá ou não registrou pedido nenhum. */
export function readKimiSessionUsage(
  sessionId: string,
  o: { homeDir: string; env?: NodeJS.ProcessEnv; fs?: KimiFsLike },
): KimiSessionUsage | null {
  const fs = o.fs ?? nodeFs;
  const dir = kimiSessionDir(kimiHomeOf(o.homeDir, o.env), sessionId, fs);
  if (!dir) return null;
  const usage: KimiSessionUsage = { tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, requests: 0 };
  let agents: string[];
  try {
    agents = fs.readdirSync(path.join(dir, 'agents'));
  } catch {
    return null;
  }
  for (const agent of agents) {
    try {
      sumWireUsage(fs.readFileSync(path.join(dir, 'agents', agent, 'wire.jsonl'), 'utf8'), usage);
    } catch {
      /* agente sem wire.jsonl (ainda não escreveu) ou arquivo sumiu: segue nos outros */
    }
  }
  return usage.requests ? usage : null;
}
