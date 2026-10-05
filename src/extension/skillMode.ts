import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, SkillMode } from '../shared/harness';

/**
 * Como cada ferramenta desliga a invocação automática de uma skill (documentação lida em 2026-10-02):
 * - Claude Code, Cursor, Kimi Code e Copilot: `disable-model-invocation: true` no frontmatter do SKILL.md.
 *   No Claude Code e no Cursor a documentação diz que a descrição sai do contexto; nas outras, só que a
 *   IA deixa de invocar a skill sozinha. O Kimi também aceita `disableModelInvocation`.
 * - Codex: `policy.allow_implicit_invocation: false` em `agents/openai.yaml`, na pasta da skill.
 */
const FRONTMATTER_KEY = /^(disable-model-invocation|disableModelInvocation|disable_model_invocation):\s*(\S+)\s*$/m;
// o `\r?` aceita o arquivo com CRLF (checkout no Windows), e a troca o devolve no fim da linha
const CODEX_KEY = /^([ \t]*)allow_implicit_invocation:[ \t]*(\S+?)[ \t]*(\r?)$/m;
const HEAD_BYTES = 8192;

const codexPolicy = (skillDir: string) => path.join(skillDir, 'agents', 'openai.yaml');

function read(file: string, bytes?: number): string {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return bytes ? text.slice(0, bytes) : text;
  } catch {
    return '';
  }
}

const frontmatter = (text: string) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);

/** Lê o modo nos dois formatos: uma skill pode ser lida por mais de uma ferramenta. */
export function skillMode(skillMd: string): SkillMode {
  const fm = frontmatter(read(skillMd, HEAD_BYTES))?.[1] ?? '';
  if (FRONTMATTER_KEY.exec(fm)?.[2] === 'true') return 'manual';
  return CODEX_KEY.exec(read(codexPolicy(path.dirname(skillMd))))?.[2] === 'false' ? 'manual' : 'auto';
}

function setFrontmatter(skillMd: string, mode: SkillMode): void {
  const text = read(skillMd);
  const fm = frontmatter(text);
  if (!fm) {
    if (mode === 'manual') fs.writeFileSync(skillMd, `---\ndisable-model-invocation: true\n---\n\n${text}`);
    return;
  }
  const lines = fm[1]!.split(/\r?\n/).filter((l) => !FRONTMATTER_KEY.test(l));
  if (mode === 'manual') lines.push('disable-model-invocation: true');
  fs.writeFileSync(skillMd, `---\n${lines.join('\n')}\n---${text.slice(fm[0].length)}`);
}

function setCodexPolicy(skillDir: string, mode: SkillMode): void {
  const file = codexPolicy(skillDir);
  const text = read(file);
  const value = mode === 'manual' ? 'false' : 'true';
  if (CODEX_KEY.test(text)) return fs.writeFileSync(file, text.replace(CODEX_KEY, `$1allow_implicit_invocation: ${value}$3`));
  // sem a chave vale o padrão da ferramenta (automática): só grava quando é para desligar
  if (mode === 'auto') return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (/^policy:\s*$/m.test(text))
    return fs.writeFileSync(file, text.replace(/^policy:\s*$/m, `policy:\n  allow_implicit_invocation: ${value}`));
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}policy:\n  allow_implicit_invocation: ${value}\n`);
}

/** Grava o modo no formato da ferramenta. Ao voltar para automática, limpa os dois formatos. */
export function setSkillMode(tool: AiTool, skillMd: string, mode: SkillMode): void {
  if (!fs.existsSync(skillMd)) throw new Error('SKILL.md não encontrado.');
  const dir = path.dirname(skillMd);
  if (mode === 'auto') {
    setFrontmatter(skillMd, 'auto');
    setCodexPolicy(dir, 'auto');
  } else if (tool === 'codex') setCodexPolicy(dir, 'manual');
  else setFrontmatter(skillMd, 'manual');
}
