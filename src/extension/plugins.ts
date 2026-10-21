import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginInstall } from '../shared/harness';
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
 * Na home, o que muda a lista de plugins do Claude Code: o registro de instalados, os sincronizados do
 * claude.ai e os `enabledPlugins` dos settings. O resto de `~/.claude/plugins` (catálogos dos
 * marketplaces, caches) muda sem mudar o que está instalado.
 */
export const CLAUDE_PLUGIN_STATE = ['.claude/plugins/installed_plugins.json', '.claude/plugins/synced', '.claude/settings.json'];

/**
 * O que muda a lista de plugins do Claude Code: o estado da home e os `enabledPlugins` dos settings do
 * projeto. Comparar isto é barato; rodar a CLI, não.
 */
export function pluginSignature(homeDir: string, projectDir: string): string {
  const files = [
    ...CLAUDE_PLUGIN_STATE.map((f) => path.join(homeDir, f)),
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
