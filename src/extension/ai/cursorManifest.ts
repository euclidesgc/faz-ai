// Manifesto da execução no Cursor: o que o card permite (servidores MCP, subagentes, ferramentas,
// skills). O hook global do Cursor acha o arquivo pelo realpath da pasta de trabalho e nega o que
// não está nele. O board grava antes de iniciar a CLI e apaga no fim, também em falha ou cancelamento.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CursorManifest {
  runId: string;
  /** nomes de servidores MCP permitidos (inclui o do board) */
  mcpServers: string[];
  /** `subagent_type` permitidos */
  subagents: string[];
  /** `tool_name` de preToolUse permitidos */
  tools: string[];
  /** `tool_name` negados mesmo quando `tools` está vazio (sem lista, o card não restringe as ferramentas) */
  deniedTools?: string[];
  /** nomes das skills escolhidas */
  skills: string[];
  createdAt: string;
}

/** Variável de ambiente que leva o diretório dos manifestos ao hook. */
export const MANIFEST_DIR_ENV = 'FAZ_AI_MANIFEST_DIR';

function realOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** `dir/<sha1(realpath da pasta de trabalho)>.json` */
export function manifestPath(dir: string, workspace: string): string {
  const hash = crypto.createHash('sha1').update(realOrSelf(workspace)).digest('hex');
  return path.join(dir, `${hash}.json`);
}

/**
 * Grava o manifesto da pasta e devolve o `dispose`. Duas execuções na mesma pasta: a última escrita
 * vence, e o `dispose` só apaga o arquivo se o `runId` ainda for o seu.
 */
export function writeManifest(dir: string, workspace: string, manifest: CursorManifest): () => void {
  const file = manifestPath(dir, workspace);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest), { mode: 0o600 });
  fs.renameSync(tmp, file);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    try {
      const current = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CursorManifest>;
      if (current.runId !== manifest.runId) return;
    } catch {
      // ilegível ou já apagado: se existir e estiver corrompido, não é de outra execução reconhecível
      if (!fs.existsSync(file)) return;
    }
    fs.rmSync(file, { force: true });
  };
}
