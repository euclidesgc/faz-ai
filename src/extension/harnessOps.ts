import * as fs from 'node:fs';
import * as path from 'node:path';
import { SKILL_NAME_PATTERN, aiToolInfo, type AiTool, type HarnessItem, type SkillMode } from '../shared/harness';
import { HARNESS_CATALOG, copyTarget, type HarnessSource } from '../shared/harnessCatalog';
import { agentTemplate, skillTemplate } from './harness';
import { setSkillMode } from './skillMode';

/** Conteúdo inicial de um arquivo novo do harness, no formato que a ferramenta espera. */
function template(tool: AiTool, src: HarnessSource, file: string, name: string, description: string): string {
  const oneLine = description.replace(/\r?\n/g, ' ').trim();
  if (src.layout === 'skills') return skillTemplate(name, oneLine, 'Instruções da skill.');
  if (src.kind === 'agent') {
    const spec = aiToolInfo(tool).agents;
    if (spec) return agentTemplate({ ...spec, format: file.endsWith('.toml') ? 'toml' : 'markdown' }, name, oneLine, 'Instruções do agente.');
  }
  if (file.endsWith('.json')) return '{}\n';
  if (file.endsWith('.toml') || file.endsWith('.rules')) return '';
  if (src.layout === 'file') return '';
  // regras por caminho e prompts: frontmatter com a descrição e o campo de aplicação de cada ferramenta
  const extra = file.endsWith('.mdc') ? 'alwaysApply: false\n' : file.endsWith('.instructions.md') ? 'applyTo: "**"\n' : '';
  return `---\ndescription: ${oneLine}\n${extra}---\n\n`;
}

/** Cria, apaga e copia itens do harness no projeto e na pasta do usuário. Nunca escreve em plugins. Não depende da API do VSCode. */
export class HarnessOps {
  constructor(private projectDir: string, private homeDir: string) {}

  private base(scope: 'project' | 'user'): string {
    const dir = scope === 'project' ? this.projectDir : this.homeDir;
    if (!dir) throw new Error(scope === 'project' ? 'Nenhuma pasta de projeto aberta.' : 'Pasta do usuário não encontrada.');
    return dir;
  }

  private checkName(name: string): void {
    if (!SKILL_NAME_PATTERN.test(name)) throw new Error('Nome inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").');
  }

  /** Cria o item na fonte do catálogo indicada e devolve o caminho do arquivo criado. */
  create(tool: AiTool, source: number, name: string, description: string): string {
    const src = HARNESS_CATALOG[tool][source];
    if (!src || src.builtin || (src.layout !== 'file' && src.layout !== 'files' && src.layout !== 'skills')) throw new Error('Não é possível criar um item neste lugar.');
    const root = path.join(this.base(src.scope), src.path);
    let file = root;
    if (src.layout !== 'file') {
      this.checkName(name);
      file = src.layout === 'skills' ? path.join(root, name, 'SKILL.md') : path.join(root, `${name}${src.createExt ?? src.ext}`);
      if ((src.layout === 'skills' || src.kind === 'agent') && !description.trim()) throw new Error('Informe a descrição: é por ela que a IA decide quando usar o item.');
    }
    if (fs.existsSync(file)) throw new Error(`Já existe: ${file}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, template(tool, src, file, name, description));
    return file;
  }

  /** Só mexe em arquivos do projeto ou da pasta do usuário que a varredura listou. */
  private own(item: HarnessItem): void {
    if (item.scope === 'plugin') throw new Error('Itens de plugin não podem ser alterados pelo board.');
    const inside = [this.projectDir, this.homeDir].some((b) => b && item.path.startsWith(b + path.sep));
    if (!inside || item.layout === 'entry') throw new Error('Este item não pode ser alterado pelo board.');
  }

  setSkillMode(tool: AiTool, item: HarnessItem, mode: SkillMode): void {
    this.own(item);
    if (item.layout !== 'skills') throw new Error('Só skills têm modo de invocação.');
    setSkillMode(tool, item.path, mode);
  }

  remove(item: HarnessItem): void {
    this.own(item);
    if (item.kind === 'settings') throw new Error('Arquivos de configuração não são apagados pelo board.');
    if (item.layout === 'skills') fs.rmSync(path.dirname(item.path), { recursive: true, force: true });
    else fs.rmSync(item.path, { force: true });
  }

  /** Copia uma skill (a pasta inteira), um agente, um comando ou uma regra para o projeto ou para a pasta do usuário. A cópia fica independente. */
  copy(tool: AiTool, item: HarnessItem, to: 'project' | 'user'): string {
    if (item.layout !== 'files' && item.layout !== 'skills') throw new Error('Este item não pode ser copiado.');
    const target = copyTarget(tool, item.kind, item.layout, to);
    if (!target) throw new Error(`O ${aiToolInfo(tool).label} não tem uma pasta de ${to === 'project' ? 'projeto' : 'usuário'} para este tipo de item.`);
    const root = path.join(this.base(to), target.path);
    if (item.layout === 'skills') {
      const from = path.dirname(item.path);
      const dest = path.join(root, path.basename(from));
      if (fs.existsSync(dest)) throw new Error(`Já existe uma skill "${path.basename(from)}" em ${target.path}.`);
      fs.mkdirSync(root, { recursive: true });
      fs.cpSync(from, dest, { recursive: true });
      return path.join(dest, 'SKILL.md');
    }
    const dest = path.join(root, path.basename(item.path));
    if (fs.existsSync(dest)) throw new Error(`Já existe "${path.basename(item.path)}" em ${target.path}.`);
    fs.mkdirSync(root, { recursive: true });
    fs.copyFileSync(item.path, dest);
    return dest;
  }
}
