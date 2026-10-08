import { afterEach, describe, expect, it } from 'vitest';
import { commandNotFound } from '../src/extension/cliResolve';
import { setLocale, t } from '../src/webview/i18n';
import { EN } from '../src/webview/i18n/en';
import { host } from '../src/webview/i18n/en/host';
import { THEMES, FONTS } from '../src/shared/appearance';
import { EXEC_ASPECTS, TOOL_PRESETS, defaultAgent } from '../src/shared/execution';
import { AI_TOOLS, HARNESS_KINDS, HARNESS_SCOPES, RULE_FILES, SKILL_FOLDERS, SKILL_MODES } from '../src/shared/harness';
import { HARNESS_CATALOG, PERMISSION_LIST_LABEL, PLUGIN_COMMANDS } from '../src/shared/harnessCatalog';
import { MERGE_METHODS, WORKSPACE_MODES } from '../src/shared/git';
import { EFFORT_FIELD, EFFORT_LABELS, EFFORT_LEVELS, MODEL_EFFORT_LABEL } from '../src/shared/models';
import { RUNNER_PERMISSIONS, heartbeatState } from '../src/shared/runner';
import { CARD_STATUSES, OWNER_LABEL } from '../src/shared/status';
import { timeAgo } from '../src/shared/time';

afterEach(() => setLocale('pt-BR'));

describe('i18n do host: mensagens preenchidas', () => {
  const cases: [pt: string, en: string][] = [
    [
      'Não é possível concluir "Pagar fatura": 2 sub-tarefa(s) ainda em aberto.',
      'Cannot complete "Pagar fatura": 2 sub-task(s) still open.',
    ],
    [
      'Não é possível avançar "Login": 1 sub-tarefa(s) da fase Implementação ainda em aberto.',
      'Cannot advance "Login": 1 sub-task(s) of phase Implementação still open.',
    ],
    ['Tipo em uso por 4 card(s)', 'Type in use by 4 card(s)'],
    ['O workflow tem 7 card(s), inclusive arquivados e na lixeira', 'The workflow has 7 card(s), including archived and trashed ones'],
    ['2 tipo(s) de card nascem neste workflow', '2 card type(s) are created in this workflow'],
    ['A IA já está trabalhando em #12.', 'The AI is already working on #12.'],
    [
      'A pasta /tmp/x.worktrees/a já existe e não é uma worktree deste repositório.',
      'The folder /tmp/x.worktrees/a already exists and is not a worktree of this repository.',
    ],
    ['Já existe uma skill "revisar" ligada.', 'An enabled skill "revisar" already exists.'],
    ['Já existe uma skill "revisar" desligada.', 'A disabled skill "revisar" already exists.'],
    ['Já existe uma skill "revisar" em .claude/skills.', 'A skill "revisar" already exists in .claude/skills.'],
    ['Já existe uma skill "revisar" no destino.', 'A skill "revisar" already exists at the destination.'],
    ['Já existe "notas.md" nesta skill.', '"notas.md" already exists in this skill.'],
    ['Já existe "CLAUDE.md" em ~/.claude.', '"CLAUDE.md" already exists in ~/.claude.'],
    ['Servidor "git" não encontrado em .mcp.json.', 'Server "git" not found in .mcp.json.'],
    ['Já existe um servidor "git" em .mcp.json.', 'A server "git" already exists in .mcp.json.'],
    ['O Claude Code não tem uma pasta de usuário para este tipo de item.', 'Claude Code has no user folder for this kind of item.'],
    [
      'Arquivo de regras desconhecido: "X.md". Aceitos: CLAUDE.md, AGENTS.md.',
      'Unknown rules file: "X.md". Accepted: CLAUDE.md, AGENTS.md.',
    ],
    [
      'O modelo "Opus" não aceita o esforço "ultra". Aceitos: low, high.',
      'The model "Opus" does not accept the effort "ultra". Accepted: low, high.',
    ],
    [
      'Modelo "xyz" não está no catálogo. Disponíveis: Opus (claude:opus).',
      'Model "xyz" is not in the catalog. Available: Opus (claude:opus).',
    ],
    ['O board não tem o campo "Esforço da atividade".', 'The board has no "Esforço da atividade" field.'],
    ['Pasta não encontrada: /home/ana/skills', 'Folder not found: /home/ana/skills'],
    ['Não foi possível clonar https://github.com/a/b.git: timeout', 'Could not clone https://github.com/a/b.git: timeout'],
    ['Skill não encontrada na origem: revisar', 'Skill not found in the source: revisar'],
    [
      '"Revisar Spec" não é um nome de skill válido (letras minúsculas, números e hífens).',
      '"Revisar Spec" is not a valid skill name (lowercase letters, numbers and hyphens).',
    ],
    [
      '/p/.mcp.json não é um JSON simples (pode ter comentários ou um erro de sintaxe). Abra o arquivo e edite-o à mão.',
      '/p/.mcp.json is not plain JSON (it may have comments or a syntax error). Open the file and edit it by hand.',
    ],
    ['A resposta passou do tempo limite (30 min) e foi encerrada.', 'The reply exceeded the time limit (30 min) and was ended.'],
    ['Não foi possível executar o Cursor: falhou', 'Could not run Cursor: falhou'],
    ['O Cursor terminou com erro (código 2).', 'Cursor finished with an error (code 2).'],
    ['O Cursor terminou com erro (código 2).\n\nlinha 1\nlinha 2', 'Cursor finished with an error (code 2).\n\nlinha 1\nlinha 2'],
    [
      'Servidores MCP do agente não encontrados na configuração do Claude Code: a, b.',
      "The agent's MCP servers were not found in the Claude Code configuration: a, b.",
    ],
    ['"foto.png" tem mais de 20 MB e não foi anexado.', '"foto.png" is larger than 20 MB and was not attached.'],
    ['Migration 7 não encontrada', 'Migration 7 not found'],
  ];

  it.each(cases)('%s', (pt, en) => {
    setLocale('en');
    expect(t(pt)).toBe(en);
  });

  it('em português a mensagem fica como chegou', () => {
    expect(t('Tipo em uso por 4 card(s)')).toBe('Tipo em uso por 4 card(s)');
  });

  it('todo texto do host com {parâmetro} é traduzido quando chega preenchido', () => {
    setLocale('en');
    const values = (key: string) => Object.fromEntries([...key.matchAll(/\{(\w+)\}/g)].map((m) => [m[1]!, `<${m[1]}>`]));
    const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_m, n: string) => `<${n}>`);
    const wrong = Object.entries(host)
      .filter(([pt]) => /\{\w+\}/.test(pt))
      .filter(([pt, en]) => t(fill(pt)) !== fill(en) || Object.keys(values(pt)).length === 0)
      .map(([pt]) => pt);
    expect(wrong).toEqual([]);
  });

  it('a CLI não encontrada: a mensagem de cada ferramenta, sozinha e dentro do aviso do chat', () => {
    setLocale('en');
    for (const command of ['claude', 'agent', 'outra']) {
      const en = t(commandNotFound(command));
      expect(en).toMatch(new RegExp(`^command "${command}" was not found in PATH`));
      expect(en).toContain(`Then check in the terminal that "${command} --version" responds.`);
      expect(en).not.toMatch(/Instale|não encontrado/);
      expect(t(`Não foi possível executar o Claude Code: ${commandNotFound(command)}`)).toBe(`Could not run Claude Code: ${en}`);
    }
  });

  it('Conectar IA: o servidor registrado, o próximo passo e o aviso do .gitignore', () => {
    setLocale('en');
    const next = 'Claude Code: abra uma sessão nova na pasta e aprove o servidor (/mcp mostra o estado).';
    expect(t(`Servidor "faz-ai" registrado em: .mcp.json. ${next}`)).toBe(
      'Server "faz-ai" registered in: .mcp.json. Claude Code: open a new session in the folder and approve the server (/mcp shows its state).',
    );
    expect(
      t(
        `Servidor "faz-ai" registrado em: .mcp.json. ${next} Esses arquivos guardam caminhos desta máquina: considere colocar no .gitignore: .mcp.json.`,
      ),
    ).toBe(
      'Server "faz-ai" registered in: .mcp.json. Claude Code: open a new session in the folder and approve the server (/mcp shows its state). These files hold paths from this machine: consider adding them to .gitignore: .mcp.json.',
    );
  });

  it('o tempo decorrido e a ausência de ligação com o Faz AI', () => {
    setLocale('en');
    const now = 10 * 24 * 3_600_000;
    expect(t(timeAgo(now, now))).toBe('now');
    expect(t(timeAgo(now - 5 * 60_000, now))).toBe('5 min ago');
    expect(t(timeAgo(now - 3 * 3_600_000, now))).toBe('3 h ago');
    expect(t(timeAgo(now - 2 * 24 * 3_600_000, now))).toBe('2 d ago');
    const state = heartbeatState(
      {
        permission: 'board',
        timeoutMinutes: 30,
        heartbeat: true,
        heartbeatMinutes: 60,
        parallel: false,
        parallelStories: 2,
        defaultAgent: '',
      },
      { offline: true, unsupported: null },
    );
    expect(state.kind === 'stopped' && t(state.reason)).toBe('No connection to Faz AI.');
  });
});

describe('i18n dos rótulos compartilhados (src/shared)', () => {
  const texts: [string, string[]][] = [
    ['THEMES', THEMES.map((x) => x.label)],
    ['FONTS', FONTS.map((x) => x.label)],
    ['CARD_STATUSES', CARD_STATUSES.flatMap((x) => [x.label, x.hint])],
    ['OWNER_LABEL', Object.values(OWNER_LABEL)],
    ['RUNNER_PERMISSIONS', RUNNER_PERMISSIONS.flatMap((x) => [x.label, x.hint])],
    ['MERGE_METHODS', MERGE_METHODS.map((x) => x.label)],
    ['WORKSPACE_MODES', WORKSPACE_MODES.flatMap((x) => [x.label, x.hint])],
    ['EXEC_ASPECTS', EXEC_ASPECTS.map((x) => x.label)],
    ['TOOL_PRESETS', TOOL_PRESETS.flatMap((x) => [x.label, x.hint])],
    ['agente padrão', [defaultAgent().name]],
    ['esforço', [EFFORT_FIELD, MODEL_EFFORT_LABEL, ...EFFORT_LEVELS, ...Object.values(EFFORT_LABELS)]],
    ['SKILL_MODES', SKILL_MODES.flatMap((x) => [x.label, x.hint])],
    ['HARNESS_KINDS', HARNESS_KINDS.flatMap((x) => [x.label, x.hint])],
    ['HARNESS_SCOPES', HARNESS_SCOPES.flatMap((x) => [x.label, x.hint, x.summary])],
    ['SKILL_FOLDERS', SKILL_FOLDERS.map((x) => x.hint)],
    ['AI_TOOLS', AI_TOOLS.map((x) => x.mcp)],
    ['RULE_FILES', RULE_FILES.map((x) => x.readBy).filter((x) => x.includes(' e '))],
    ['PERMISSION_LIST_LABEL', Object.values(PERMISSION_LIST_LABEL)],
    [
      'PLUGIN_COMMANDS',
      Object.values(PLUGIN_COMMANDS).flatMap((x) => [x.where, ...x.commands.filter((c) => /dono|termo|endereço|pasta/.test(c))]),
    ],
    ['HARNESS_CATALOG', Object.values(HARNESS_CATALOG).flatMap((list) => list.flatMap((s) => (s.builtin ? [s.builtin] : [])))],
  ];

  it.each(texts)('%s: tudo que a interface mostra tem tradução', (_name, list) => {
    const missing = list.filter((text) => !(text in EN));
    expect(missing).toEqual([]);
  });

  it('as traduções saem em inglês, sem sobra de português', () => {
    setLocale('en');
    expect(t(THEMES[1]!.label)).toBe('Light');
    expect(t(CARD_STATUSES[2]!.label)).toBe('Waiting for answer');
    expect(t(OWNER_LABEL.human)).toBe('with you');
    expect(t(HARNESS_KINDS[2]!.label)).toBe('Subagents');
    expect(t(HARNESS_SCOPES[1]!.label)).toBe('Global');
    expect(t(EXEC_ASPECTS[4]!.label)).toBe('Model and effort');
    expect(t(TOOL_PRESETS[0]!.label)).toBe('Read-only');
    expect(t(EFFORT_LABELS.xhigh!)).toBe('very high');
    expect(t(PLUGIN_COMMANDS.claude.where)).toBe('in the terminal');
  });
});
