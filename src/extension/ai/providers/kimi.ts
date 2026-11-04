// Provider do Kimi Code (`kimi -p`), conferido contra a CLI 2.1.1 (2026-10-13), relido na 2.3.0 (2026-10-31) e na
// 2.4.1 (2026-11-03, referência oficial do comando `kimi` e das páginas de agentes e skills em
// moonshotai.github.io/kimi-code; as flags abaixo seguem iguais; `-p` não se combina com `--yolo`, `--auto` nem
// `--plan`):
// - o prompt é obrigatório como valor do `-p` (a CLI não o lê da entrada padrão: `-p` sem valor e
//   `-p ""` são recusados). No Windows, se a CLI for um shim `.cmd` do npm, o cmd.exe corta a linha
//   em 8191 caracteres — o risco existe e não há flag alternativa; o instalador nativo não o tem;
// - em `-p` a permissão é sempre "auto" (nada é perguntado) e não há flag para estreitar: o nível do
//   board chega ao modelo pelo PERMISSION_ADVICE, no prompt;
// - não há `--mcp-config`: o servidor do board vai para o `.kimi-code/mcp.json` do projeto,
//   materializado antes da execução (como o Cursor), e a pasta precisa ser confiável
//   (`KIMI_CODE_TRUST_WORKSPACE=1`), senão a CLI o pula;
// - não há `--agents` inline: no modo tradicional o agente do card vai como orientação no prompt
//   (EXEC_ENFORCEMENT o marca "orientado" para o Kimi). `--agent <nome>` aceita só agentes já instalados nas pastas
//   da CLI, e `--agent-file <arquivo>` carrega um agente para a sessão nova (nenhum dos dois se combina com
//   `--session`);
// - o nível de esforço não tem flag: só o modelo vai por `-m`.
//
// A sessão da História (sondas de 2026-11-02 na 2.4.1, `teste_modos/resultados/fase1-cli-kimi.md`): a principal
// nasce com `--agent-file` e retoma com `--session <id>` (a CLI restaura o agente vinculado e recusa flags de agente
// na retomada); a filha é um agente em `.kimi-code/agents/<nome>.md` da raiz do `.git` do projeto, com `tools` e
// `disallowedTools` próprios, que a CLI impõe antes de cada chamada; a principal a lança pela ferramenta `Agent`
// (`subagent_type`), e o resultado da chamada traz `actual_subagent_type` e `status`. A filha roda no modelo da
// sessão (o arquivo de agente ignora `model`), e a CLI não informa na largada o estado dos servidores MCP.
import type { AiProvider, StoryChildDefinition } from '../provider';
import type { AgentDefinition } from '../../execution';
import { tmpArg } from '../provider';
import { kimiReader } from '../../aiOutput/kimi';
import { textReader } from '../../aiOutput/text';

const PRINCIPAL_FILE = 'condutor.md';
/** A pasta de agentes do projeto que a CLI descobre a partir da raiz do `.git` (documentação "Agents", 2.4.1). */
export const KIMI_PROJECT_AGENTS_DIR = '.kimi-code/agents';

/** Um valor de frontmatter YAML em uma linha, entre aspas, para nome e descrição. */
const yamlText = (value: string): string => JSON.stringify(value.replace(/\s+/g, ' ').trim());
/** Uma lista YAML em linha (`[a, b]`), com cada item entre aspas. */
const yamlList = (values: readonly string[]): string => `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;

/**
 * O agente da sessão no formato que a CLI lê (frontmatter `name`, `description`, `tools`, `disallowedTools`,
 * `subagents`; o corpo é o prompt). A entrada `Agent(<filha>)` do board vira `Agent` com `subagents: ["*"]`: a
 * CLI só aceita a lista de tipos na criação da sessão, e a retomada não recebe arquivo de agente, então quem
 * confere qual filha nasceu é o board, pelo nome no evento.
 */
export function kimiPrincipalAgentFile(definition: AgentDefinition): string {
  // o vínculo do agente é fixado na criação da sessão e a retomada não recebe outro arquivo: a principal precisa
  // nascer já com a ferramenta `Agent` (sonda de 03/11: sem ela na lista, a sessão retomada não tinha como delegar)
  const tools = definition.tools
    ? [...new Set([...definition.tools.map((tool) => (/^(Agent|Task)\(/.test(tool) ? 'Agent' : tool)), 'Agent'])]
    : undefined;
  const lines = [
    '---',
    `name: ${yamlText(definition.name)}`,
    `description: ${yamlText(definition.description)}`,
    ...(tools ? [`tools: ${yamlList(tools)}`] : []),
    ...(definition.disallowedTools?.length
      ? [`disallowedTools: ${yamlList(definition.disallowedTools.filter((tool) => tool !== 'Agent'))}`]
      : []),
    // a lista de tipos vale só na criação: fica aberta, e o board confere o nome da filha no evento. Sem lista de
    // ferramentas não há principal da História (a definição é só o papel do agente): nada muda nela
    ...(tools ? ['subagents: ["*"]'] : []),
    '---',
    '',
    definition.prompt,
    '',
  ];
  return lines.join('\n');
}

/** A filha no formato que a CLI lê de `.kimi-code/agents/`; `model`, `effort` e `mcpServers` não existem lá. */
export function kimiChildAgentFile(name: string, definition: StoryChildDefinition): string {
  const lines = [
    '---',
    `name: ${yamlText(name)}`,
    `description: ${yamlText(definition.description)}`,
    ...(definition.tools ? [`tools: ${yamlList(definition.tools)}`] : []),
    ...(definition.disallowedTools?.length ? [`disallowedTools: ${yamlList(definition.disallowedTools)}`] : []),
    // a filha não delega: a profundidade é uma
    'subagents: []',
    '---',
    '',
    definition.prompt,
    '',
  ];
  return lines.join('\n');
}

export const kimiProvider: AiProvider = {
  tool: 'kimi',
  // a CLI (2.1.1 e 2.3.0) não informa custo nem tokens no stream-json; os tokens vêm do registro da sessão que ela
  // grava em disco (`aiOutput/kimiSession.ts`), e o custo fica para o preço do catálogo
  measure: 'tokens',
  storySessions: { transport: 'cli', childModel: 'inherited', mcpEvidence: 'board-file' },
  command: ({ prompt, addDirs = [], exec, boardServer, structured, storySession, storyChild }) => {
    const tempFiles: Record<string, string> = {};
    const projectFiles: Record<string, string> = {};
    const args = [
      '-p',
      prompt,
      ...(structured ? ['--output-format', 'stream-json'] : []),
      ...addDirs.flatMap((d) => ['--add-dir', d]),
      ...(exec?.model ? ['-m', exec.model.name] : []),
    ];
    if (storySession) {
      // a retomada restaura o agente vinculado na criação; a CLI recusa `--agent-file` junto de `--session`
      args.push('--session', storySession.sessionId);
    } else if (exec?.agentDefinition) {
      tempFiles[PRINCIPAL_FILE] = kimiPrincipalAgentFile(exec.agentDefinition);
      args.push('--agent-file', tmpArg(PRINCIPAL_FILE));
    }
    if (storyChild) {
      if (!storySession) throw new Error('A filha do Kimi Code exige a sessão principal já aberta; a primeira chamada não delega.');
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(storyChild.name)) throw new Error('Nome de filha inválido para o Kimi Code.');
      projectFiles[`${KIMI_PROJECT_AGENTS_DIR}/${storyChild.name}.md`] = kimiChildAgentFile(storyChild.name, storyChild.definition);
    }
    return {
      command: 'kimi',
      args,
      format: structured ? 'kimi-stream-json' : 'text',
      // a CLI 2.4.1 ignora o `.kimi-code/mcp.json` numa pasta não confiável ("this folder is not trusted; skipped 1
      // project-level MCP server", sonda de 2026-11-02): a confiança vai pela variável, senão o servidor do board não
      // existe na execução headless de uma worktree nova
      env: { KIMI_CODE_TRUST_WORKSPACE: '1' },
      // o Kimi Code não recebe servidores pela linha de comando: o do board vai para o
      // .kimi-code/mcp.json do projeto, sem o campo `type` (a CLI documenta a entrada stdio sem ele)
      ...(boardServer ? { projectMcp: { file: '.kimi-code/mcp.json', entry: boardServer, stdioType: false } } : {}),
      ...(Object.keys(tempFiles).length ? { tempFiles } : {}),
      ...(Object.keys(projectFiles).length ? { projectFiles } : {}),
    };
  },
  reader: (format, deps) => (format === 'kimi-stream-json' ? kimiReader(deps) : textReader()),
};
