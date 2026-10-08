import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, HarnessItem } from '../shared/harness';
import { HARNESS_CATALOG, hookTargets, type HarnessSource, type HookInput } from '../shared/harnessCatalog';
import { hookCommand } from './harnessScan';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/** Lê um JSON de configuração para alterá-lo; recusa arquivos com comentários, que seriam perdidos ao regravar. */
function readForWrite(file: string): Json {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  try {
    const v: unknown = text.trim() ? JSON.parse(text) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Json;
  } catch {
    /* cai no erro abaixo */
  }
  throw new Error(`${file} não é um JSON simples (pode ter comentários ou um erro de sintaxe). Abra o arquivo e edite-o à mão.`);
}

function write(file: string, config: Json): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

/** Hooks e regras de permissão nos arquivos JSON das ferramentas. Só mexe na entrada pedida; o resto do arquivo fica como estava. Não depende da API do VSCode. */
export class HooksAndPermissions {
  constructor(
    private projectDir: string,
    private homeDir: string,
  ) {}

  private base(scope: 'project' | 'user'): string {
    const dir = scope === 'project' ? this.projectDir : this.homeDir;
    if (!dir) throw new Error(scope === 'project' ? 'Nenhuma pasta de projeto aberta.' : 'Pasta do usuário não encontrada.');
    return dir;
  }

  /** A fonte do catálogo que corresponde ao arquivo de um item listado. */
  private sourceOf(tool: AiTool, item: HarnessItem, match: (src: HarnessSource) => boolean): HarnessSource {
    if (item.scope === 'plugin') throw new Error('Itens de plugin não podem ser alterados pelo board.');
    const src = HARNESS_CATALOG[tool].find(
      (x) => match(x) && x.scope === item.scope && path.join(this.base(x.scope), x.path) === item.path,
    );
    if (!src) throw new Error('Este item fica num arquivo que o board não edita. Abra o arquivo e edite-o à mão.');
    return src;
  }

  /** Acrescenta um hook ao arquivo indicado, no formato da ferramenta, e devolve o caminho do arquivo. */
  addHook(tool: AiTool, index: number, input: HookInput): string {
    const target = hookTargets(tool).find((t) => t.source === index);
    const src = HARNESS_CATALOG[tool][index];
    if (!target || !src) throw new Error('Este arquivo de hooks não é editado pelo board.');
    const event = input.event.trim();
    const command = input.command.trim();
    const matcher = input.matcher.trim();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(event)) throw new Error('Informe o evento do hook.');
    if (!command) throw new Error('Informe o comando do hook.');
    const timeout = Number.isFinite(input.timeout) && input.timeout > 0 ? Math.round(input.timeout) : 0;
    const file = path.join(this.base(src.scope), src.path);
    const config = readForWrite(file);
    const hooks = { ...obj(config.hooks) };
    const list = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
    if (target.format === 'nested') {
      const handler = { type: 'command', command, ...(timeout ? { timeout } : {}) };
      // entra no grupo que já tem o mesmo filtro, se houver
      const at = list.findIndex(
        (g) => (typeof obj(g).matcher === 'string' ? obj(g).matcher : '') === matcher && Array.isArray(obj(g).hooks),
      );
      if (at >= 0) list[at] = { ...obj(list[at]), hooks: [...(obj(list[at]).hooks as unknown[]), handler] };
      else list.push({ ...(matcher ? { matcher } : {}), hooks: [handler] });
    } else {
      list.push({ command, ...(matcher ? { matcher } : {}), ...(timeout ? { timeout } : {}) });
    }
    hooks[event] = list;
    write(file, { ...(target.format === 'nested' || config.version !== undefined ? {} : { version: 1 }), ...config, hooks });
    return file;
  }

  /** Remove do arquivo o hook listado (o evento e o comando do item). */
  removeHook(tool: AiTool, item: HarnessItem): void {
    this.sourceOf(tool, item, (x) => x.kind === 'hook' && x.layout === 'json-keys');
    const config = readForWrite(item.path);
    const hooks = { ...obj(config.hooks) };
    const command = item.detail ?? '';
    let removed = false;
    const keep = (h: unknown) => {
      // tira só a primeira ocorrência: o mesmo comando pode estar registrado mais de uma vez
      if (removed || hookCommand(obj(h)) !== command) return true;
      removed = true;
      return false;
    };
    const list = (Array.isArray(hooks[item.name]) ? (hooks[item.name] as unknown[]) : []).flatMap((entry) => {
      const e = obj(entry);
      if (!Array.isArray(e.hooks)) return keep(entry) ? [entry] : [];
      const handlers = e.hooks.filter(keep);
      return handlers.length ? [{ ...e, hooks: handlers }] : [];
    });
    if (!removed) throw new Error('Hook não encontrado no arquivo. Atualize a lista e tente de novo.');
    if (list.length) hooks[item.name] = list;
    else delete hooks[item.name];
    write(item.path, { ...config, hooks });
  }

  /** Acrescenta uma regra a uma das listas de permissão (allow, ask, deny) do arquivo indicado. */
  addPermission(tool: AiTool, index: number, list: string, rule: string): string {
    const src = HARNESS_CATALOG[tool][index];
    if (!src || src.layout !== 'json-permissions' || !src.lists.includes(list))
      throw new Error('Este arquivo de permissões não é editado pelo board.');
    const text = rule.trim();
    if (!text) throw new Error('Informe a regra.');
    const file = path.join(this.base(src.scope), src.path);
    const config = readForWrite(file);
    const permissions = { ...obj(config.permissions) };
    const rules = Array.isArray(permissions[list]) ? (permissions[list] as unknown[]) : [];
    if (rules.includes(text)) throw new Error('Esta regra já está na lista.');
    permissions[list] = [...rules, text];
    write(file, { ...config, permissions });
    return file;
  }

  removePermission(tool: AiTool, item: HarnessItem): void {
    const src = this.sourceOf(tool, item, (x) => x.layout === 'json-permissions');
    const list = item.detail ?? '';
    if (src.layout !== 'json-permissions' || !src.lists.includes(list)) throw new Error('Regra de permissão desconhecida.');
    const config = readForWrite(item.path);
    const permissions = { ...obj(config.permissions) };
    const rules = Array.isArray(permissions[list]) ? (permissions[list] as unknown[]) : [];
    if (!rules.includes(item.name)) throw new Error('Regra não encontrada no arquivo. Atualize a lista e tente de novo.');
    permissions[list] = rules.filter((r) => r !== item.name);
    write(item.path, { ...config, permissions });
  }
}
