import * as fs from 'node:fs';
import * as path from 'node:path';
import { uninstallScopes, type PluginAction, type PluginInstall } from '../shared/harness';
import type { CliRun } from './cliProbe';

/** Roda `claude <args>` na pasta do projeto; quem liga o board sabe achar a CLI no PATH do terminal. */
export type ClaudeCli = (args: string[]) => Promise<CliRun>;

/**
 * Os plugins que o Claude Code carrega nesta pasta, pela saída de `claude plugin list --json`. As
 * instalações de projeto de outra pasta ficam de fora, e duas do mesmo plugin viram um item com os
 * escopos juntos. Saída que não é a lista (CLI antiga, erro) devolve null: aí vale a varredura de pastas.
 */
export function parseClaudePlugins(stdout: string, projectDir: string): PluginInstall[] | null {
  const start = stdout.indexOf('[');
  if (start < 0) return null;
  let list: unknown;
  try {
    list = JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const byId = new Map<string, PluginInstall>();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as Record<string, unknown>;
    // um plugin lido direto da pasta do marketplace (marketplace local) diz de onde em `readFromFolder`
    const dir = typeof p.readFromFolder === 'string' ? p.readFromFolder : typeof p.installPath === 'string' ? p.installPath : '';
    if (typeof p.id !== 'string' || !dir) continue;
    if (typeof p.projectPath === 'string' && p.projectPath && path.resolve(p.projectPath) !== path.resolve(projectDir)) continue;
    const scope = typeof p.scope === 'string' ? p.scope : 'user';
    const known = byId.get(p.id);
    if (known) known.scopes.push(scope);
    else byId.set(p.id, { id: p.id, scopes: [scope], enabled: p.enabled !== false, dir });
  }
  return [...byId.values()];
}

/**
 * O que muda a lista de plugins do Claude Code: o registro de instalados, os sincronizados do claude.ai
 * e os `enabledPlugins` dos settings. Comparar isto é barato; rodar a CLI, não.
 */
export function pluginSignature(homeDir: string, projectDir: string): string {
  const files = [
    path.join(homeDir, '.claude/plugins/installed_plugins.json'),
    path.join(homeDir, '.claude/plugins/synced'),
    path.join(homeDir, '.claude/settings.json'),
    path.join(projectDir, '.claude/settings.json'),
    path.join(projectDir, '.claude/settings.local.json'),
  ];
  return files
    .map((f) => {
      try {
        return String(fs.statSync(f).mtimeMs);
      } catch {
        return '-';
      }
    })
    .join('|');
}

/** O resultado de um comando de plugin: o Claude Code imprime um objeto JSON na última linha com `--json`. */
function outcome(run: CliRun): { ok: boolean; message: string } {
  const last = run.stdout.trim().split('\n').pop() ?? '';
  try {
    const json = JSON.parse(last) as { outcome?: string; message?: string; alreadyInGoalState?: boolean };
    // desativar o que já está desativado não é falha
    return { ok: json.outcome === 'ok' || json.alreadyInGoalState === true, message: json.message ?? '' };
  } catch {
    const text = (run.stderr.trim() || run.stdout.trim()).split('\n')[0] ?? '';
    return { ok: run.code === 0, message: run.code === null ? 'a CLI do Claude Code não respondeu' : text };
  }
}

/**
 * Desinstala, desativa ou ativa um plugin do Claude Code. Desinstalar roda um comando por escopo em
 * que ele está instalado; desativar e ativar deixam a CLI achar o escopo. Devolve o erro, ou null.
 */
export async function applyClaudePlugin(run: ClaudeCli, action: PluginAction, install: PluginInstall): Promise<string | null> {
  const calls =
    action === 'uninstall'
      ? uninstallScopes(install).map((scope) => ['plugin', 'uninstall', install.id, '--scope', scope, '--json'])
      : [['plugin', action, install.id, '--json']];
  for (const args of calls) {
    const result = outcome(await run(args));
    if (!result.ok) return result.message || `claude ${args.slice(0, 3).join(' ')} falhou`;
  }
  return null;
}

/**
 * Desinstala um plugin local do Cursor: tira a pasta dele de `~/.cursor/plugins/local`. O caminho vem
 * da varredura. Um plugin logo abaixo dessa pasta sai inteiro, e se for um link sai só o link; um mais
 * fundo só sai se a pasta real também estiver lá dentro, para nunca apagar arquivos de outro lugar.
 */
export function removeCursorPlugin(homeDir: string, install: PluginInstall): void {
  const root = path.join(homeDir, '.cursor/plugins/local');
  const rel = path.relative(root, install.dir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Plugin fora de ~/.cursor/plugins/local.');
  if (rel.split(path.sep).length > 1 && !fs.realpathSync(install.dir).startsWith(fs.realpathSync(root) + path.sep))
    throw new Error('A pasta do plugin fica fora de ~/.cursor/plugins/local: remova pelo Cursor.');
  fs.rmSync(install.dir, { recursive: true, force: true });
}
