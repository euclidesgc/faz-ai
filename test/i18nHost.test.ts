import { afterEach, describe, expect, it } from 'vitest';
import { commandNotFound } from '../src/extension/cliResolve';
import { setLocale, t } from '../src/webview/i18n';
import { EN } from '../src/webview/i18n/en';
import { host } from '../src/webview/i18n/en/host';
import { THEMES, FONTS } from '../src/shared/appearance';
import { AGENT_SUGGESTIONS } from '../src/shared/agentSuggestions';
import { AGENT_TOOLS } from '../src/shared/agentTools';
import { AGENT_WIZARD_STEPS, MODEL_REASONS, TOOL_REASONS } from '../src/shared/agentWizard';
import { EXEC_ASPECTS, TOOL_PRESETS, defaultAgent } from '../src/shared/execution';
import { RULE_CONFLICT_REASONS } from '../src/shared/ruleConflicts';
import { RULE_IDEAS, RULE_WIZARD_STEPS, conventionItems, pathSuggestions } from '../src/shared/ruleWizard';
import { SKILL_WIZARD_STEPS } from '../src/shared/skillWizard';
import { AI_BASES, HARNESS_KINDS, HARNESS_SCOPES, RULE_FILES, SKILL_FOLDERS } from '../src/shared/harness';
import { HARNESS_CATALOG } from '../src/shared/harnessCatalog';
import { BRANCH_KINDS, MERGE_METHODS, WORKSPACE_MODES } from '../src/shared/git';
import { gitNoticeText, type GitNotice } from '../src/shared/gitflow';
import { EFFORT_FIELD, EFFORT_LABELS, EFFORT_LEVELS, MODEL_EFFORT_LABEL } from '../src/shared/models';
import { RUNNER_PERMISSIONS, heartbeatState } from '../src/shared/runner';
import { CARD_STATUSES, OWNER_LABEL } from '../src/shared/status';
import { timeAgo } from '../src/shared/time';
import { TOOLS } from '../src/shared/aiTools';

afterEach(() => setLocale('pt-BR'));

describe('i18n do host: mensagens preenchidas', () => {
  const cases: [pt: string, en: string][] = [
    ['Este card não tem perguntas pendentes.', 'This card has no pending questions.'],
    [
      'As perguntas deste card mudaram: confira as novas antes de enviar.',
      'The questions on this card have changed: review the new ones before sending.',
    ],
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
      'Não dá para renomear a branch agora: a IA está executando #12, #13. Espere terminar e tente de novo.',
      'Cannot rename the branch now: the AI is running #12, #13. Wait for it to finish and try again.',
    ],
    [
      'A pasta /tmp/x.worktrees/a já existe e não é uma worktree deste repositório.',
      'The folder /tmp/x.worktrees/a already exists and is not a worktree of this repository.',
    ],
    ['Já existe uma skill "revisar" ligada.', 'An enabled skill "revisar" already exists.'],
    ['Já existe uma skill "revisar" desligada.', 'A disabled skill "revisar" already exists.'],
    ['Já existe uma skill "revisar" em .claude/skills.', 'A skill "revisar" already exists in .claude/skills.'],
    ['Já existe uma skill "revisar" no destino.', 'A skill "revisar" already exists at the destination.'],
    [
      'O modelo "Opus" não aceita o esforço "ultra". Aceitos: low, high.',
      'The model "Opus" does not accept the effort "ultra". Accepted: low, high.',
    ],
    [
      'Modelo "xyz" não está no catálogo. Disponíveis: Opus (claude:opus).',
      'Model "xyz" is not in the catalog. Available: Opus (claude:opus).',
    ],
    ['O board não tem o campo "Esforço da atividade".', 'The board has no "Esforço da atividade" field.'],
    ['"Prazo" é o nome de um campo do board; escolha outro nome.', '"Prazo" is the name of a board field; choose another name.'],
    ['O campo de modelo de IA é só um, o "Modelo" do board.', 'There is only one AI model field, the board\'s "Modelo".'],
    [
      'O campo "Fase" é do board e não pode ser apagado: as regras e a IA dependem dele.',
      'The "Fase" field belongs to the board and cannot be deleted: the rules and the AI depend on it.',
    ],
    [
      'O campo "Tags" é do board e não pode ser renomeado: as regras e a IA o encontram pelo nome.',
      'The "Tags" field belongs to the board and cannot be renamed: the rules and the AI find it by its name.',
    ],
    ['As opções do campo "Skills" são mantidas pelo board.', 'The options of the "Skills" field are kept by the board.'],
    ['Os tipos de card do campo "Fase" são mantidos pelo board.', 'The card types of the "Fase" field are kept by the board.'],
    ['O campo "Fase" é preenchido pelo board e pela IA, não à mão.', 'The "Fase" field is filled in by the board and the AI, not by hand.'],
    [
      'O campo "Fase" não tem valor padrão por tipo: o board o preenche em cada card.',
      'The "Fase" field has no default value per type: the board fills it in on each card.',
    ],
    ['Pasta não encontrada: /home/ana/skills', 'Folder not found: /home/ana/skills'],
    ['Subpasta não encontrada: docs', 'Subfolder not found: docs'],
    ['Arquivo não encontrado: /tmp/x.json', 'File not found: /tmp/x.json'],
    ['Item não encontrado na prévia: rule:a', 'Item not found in the preview: rule:a'],
    ['Skill "revisar" não está no board.', 'Skill "revisar" is not in the board.'],
    [
      'Importados: a, b. Pulados: -. Problemas: -. Servidores MCP a configurar: git.',
      'Imported: a, b. Skipped: -. Problems: -. MCP servers to configure: git.',
    ],
    ['Não foi possível clonar https://github.com/a/b.git: timeout', 'Could not clone https://github.com/a/b.git: timeout'],
    ['A resposta passou do tempo limite (30 min) e foi encerrada.', 'The reply exceeded the time limit (30 min) and was ended.'],
    ['Não foi possível executar o Cursor: falhou', 'Could not run Cursor: falhou'],
    ['O Cursor terminou com erro (código 2).', 'Cursor finished with an error (code 2).'],
    ['O Cursor terminou com erro (código 2).\n\nlinha 1\nlinha 2', 'Cursor finished with an error (code 2).\n\nlinha 1\nlinha 2'],
    [
      'Servidores MCP do agente não encontrados na configuração do Claude Code: a, b.',
      "The agent's MCP servers were not found in the Claude Code configuration: a, b.",
    ],
    ['"foto.png" tem mais de 20 MB e não foi anexado.', '"foto.png" is larger than 20 MB and was not attached.'],
    [
      'Board "B" importado: 2 card(s) e 1 anexo(s). Preencha os valores vazios dos servidores MCP: github: TOKEN.',
      'Board "B" imported: 2 card(s) and 1 attachment(s). Fill in the empty values of the MCP servers: github: TOKEN.',
    ],
    [
      'Board "B" importado: 2 card(s) e 1 anexo(s). Anexos sem arquivo: #3. Preencha os valores vazios dos servidores MCP: github: TOKEN.',
      'Board "B" imported: 2 card(s) and 1 attachment(s). Attachments without a file: #3. Fill in the empty values of the MCP servers: github: TOKEN.',
    ],
    [
      'Board "B" importado: 2 card(s) e 1 anexo(s). Revise as configurações locais dos servidores MCP: github: revisão da configuração local.',
      'Board "B" imported: 2 card(s) and 1 attachment(s). Review the local MCP server configurations: github: revisão da configuração local.',
    ],
    [
      'Board "B" importado: 2 card(s) e 1 anexo(s). Anexos sem arquivo: #3. Revise as configurações locais dos servidores MCP: github.',
      'Board "B" imported: 2 card(s) and 1 attachment(s). Attachments without a file: #3. Review the local MCP server configurations: github.',
    ],
    ['Migration 7 não encontrada', 'Migration 7 not found'],
  ];

  it.each(cases)('%s', (pt, en) => {
    setLocale('en');
    expect(t(pt)).toBe(en);
  });

  it('os avisos do gitflow na conversa (gitNoticeText) saem em inglês, com os valores no lugar', () => {
    setLocale('en');
    const cases: [GitNotice, string][] = [
      [
        { kind: 'noOrigin', branch: 'feature/1-x', base: 'develop' },
        'The repository has no origin: branch feature/1-x started from develop as it is on this machine.',
      ],
      [
        { kind: 'fetchFailed', branch: 'feature/1-x', base: 'develop', error: 'timeout (20 s)' },
        'Could not update the origin refs before creating branch feature/1-x (timeout (20 s)). It started from develop as it is on this machine, which may be out of date.',
      ],
      [
        { kind: 'developCreated', develop: 'dev', main: 'trunk' },
        'Branch dev did not exist: the board created it from trunk and pushed it to origin.',
      ],
      [
        { kind: 'developLocalOnly', develop: 'develop', main: 'main', error: 'remote: protected branch' },
        'Branch develop did not exist: the board created it from main, but could not push it to origin (remote: protected branch). Push it by hand: git push -u origin develop',
      ],
      [
        { kind: 'developNotPushed', develop: 'develop' },
        'Branch develop exists only on this machine: the pull request to it can only be opened after pushing it to origin (git push -u origin develop).',
      ],
      [
        { kind: 'baseMissing', branch: 'feature/2-y', missing: 'feature/1-x', base: 'develop' },
        'Branch feature/1-x, which feature/2-y had started from, no longer exists on this machine or on origin: feature/2-y was recreated from develop, which becomes the pull request base.',
      ],
    ];
    for (const [notice, en] of cases) expect(t(gitNoticeText(notice))).toBe(en);
  });

  it('erros e avisos fixos de artefatos do board (limites, agente padrão, skill do fluxo, nome repetido, origem)', () => {
    setLocale('en');
    const cases: [string, string][] = [
      ['Arquivo maior que 512 KB.', 'File larger than 512 KB.'],
      ['A skill já tem 100 arquivos de apoio.', 'The skill already has 100 supporting files.'],
      [
        'Escolha outro agente padrão das instruções antes de apagar este.',
        'Choose another default instructions agent before deleting this one.',
      ],
      ['A skill do fluxo é da extensão: só o modo dela pode mudar.', 'The flow skill belongs to the extension: only its mode can change.'],
      [
        'Já existe um artefato com este nome. Edite o existente ou escolha outro nome.',
        'An artifact with this name already exists. Edit the existing one or choose another name.',
      ],
      ['Subpasta inválida.', 'Invalid subfolder.'],
      ['Nenhum artefato encontrado.', 'No artifact found.'],
      ['O nome faz-ai é reservado ao MCP do board.', 'The name faz-ai is reserved for the board MCP.'],
    ];
    for (const [pt, en] of cases) expect(t(pt)).toBe(en);
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

  it('Conectar IA: o servidor registrado no global, e o próximo passo de cada ferramenta', () => {
    setLocale('en');
    const next = 'Claude Code: abra uma sessão nova em qualquer projeto com o board aberto (/mcp mostra o estado).';
    expect(t(`Servidor "faz-ai" registrado em: ~/.claude.json. ${next}`)).toBe(
      'Server "faz-ai" registered in: ~/.claude.json. Claude Code: open a new session in any project with the board open (/mcp shows its state).',
    );
    expect(
      t('Servidor "faz-ai" registrado em: .cursor/mcp.json. Cursor: se o "faz-ai" aparecer desligado em Cursor Settings → MCP, ligue.'),
    ).toBe('Server "faz-ai" registered in: .cursor/mcp.json. Cursor: if "faz-ai" shows as off in Cursor Settings → MCP, turn it on.');
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
        idleMinutes: 20,
        heartbeat: true,
        heartbeatMinutes: 60,
        heartbeatRefine: true,
        parallel: false,
        parallelStories: 2,
        parallelSubtasks: 2,
        autopilotPaused: false,
        defaultAgent: '',
        admissionRegime: 'exclusive',
        compatibilityReviewRevision: 0,
        compatibilityReviews: {},
        quotaCritical: {},
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
    ['BRANCH_KINDS', BRANCH_KINDS.map((x) => x.label)],
    ['EXEC_ASPECTS', EXEC_ASPECTS.map((x) => x.label)],
    ['TOOL_PRESETS', TOOL_PRESETS.flatMap((x) => [x.label, x.hint])],
    [
      'AGENT_TOOLS',
      Object.values(AGENT_TOOLS).flatMap((groups) => groups.flatMap((g) => [g.label, g.hint, ...g.tools.map((x) => x.hint)])),
    ],
    ['AGENT_SUGGESTIONS', AGENT_SUGGESTIONS.map((x) => x.label)],
    ['assistentes (passos)', [...AGENT_WIZARD_STEPS, ...RULE_WIZARD_STEPS, ...SKILL_WIZARD_STEPS]],
    ['assistente de agente (motivos)', [...Object.values(TOOL_REASONS), ...Object.values(MODEL_REASONS)]],
    ['RULE_CONFLICT_REASONS', RULE_CONFLICT_REASONS],
    ['RULE_IDEAS', RULE_IDEAS.map((x) => x.label)],
    [
      'convenções e caminhos sugeridos',
      [
        ...conventionItems({
          languages: ['TypeScript'],
          scripts: { test: 'a', lint: 'a', format: 'a', typecheck: 'a', build: 'a' },
          tools: ['eslint'],
          folders: ['src'],
          readme: '',
        }).map((x) => x.label),
        ...pathSuggestions({ languages: [], scripts: {}, tools: [], folders: ['src'], readme: '' }).map((x) => x.label),
      ],
    ],
    ['agente padrão', [defaultAgent().name]],
    ['esforço', [EFFORT_FIELD, MODEL_EFFORT_LABEL, ...EFFORT_LEVELS, ...Object.values(EFFORT_LABELS)]],
    ['HARNESS_KINDS', HARNESS_KINDS.flatMap((x) => [x.label, x.hint])],
    ['HARNESS_SCOPES', HARNESS_SCOPES.flatMap((x) => [x.label, x.hint, x.summary])],
    ['SKILL_FOLDERS', SKILL_FOLDERS.map((x) => x.hint)],
    ['AI_BASES', AI_BASES.map((x) => x.mcp)],
    ['RULE_FILES', RULE_FILES.map((x) => x.readBy).filter((x) => x.includes(' e '))],
    ['HARNESS_CATALOG', Object.values(HARNESS_CATALOG).flatMap((list) => list.flatMap((s) => (s.builtin ? [s.builtin] : [])))],
    ['HARNESS_CATALOG (frases)', Object.values(HARNESS_CATALOG).flatMap((list) => list.flatMap((s) => (s.hint ? [s.hint] : [])))],
  ];

  it.each(texts)('%s: tudo que a interface mostra tem tradução', (_name, list) => {
    const missing = list.filter((text) => !(text in EN));
    expect(missing).toEqual([]);
  });

  it('as traduções saem em inglês, sem sobra de português', () => {
    setLocale('en');
    expect(t(THEMES[1]!.label)).toBe('Light');
    expect(t(CARD_STATUSES[2]!.label)).toBe('Verifying');
    expect(t(CARD_STATUSES[3]!.label)).toBe('Waiting for answer');
    expect(t(OWNER_LABEL.human)).toBe('with you');
    expect(t(HARNESS_KINDS[3]!.label)).toBe('Subagents');
    expect(t(HARNESS_SCOPES[1]!.label)).toBe('Global');
    expect(t(EXEC_ASPECTS[4]!.label)).toBe('Model and effort');
    expect(t(TOOL_PRESETS[0]!.label)).toBe('Read-only');
    expect(t(EFFORT_LABELS.xhigh!)).toBe('very high');
  });
});

describe('i18n do Conectar (história 7)', () => {
  it('as fichas dos modos, a cobrança e a recomendação de cada ferramenta saem em inglês', () => {
    setLocale('en');
    const texts = TOOLS.flatMap((tool) => [tool.billing, tool.recommended.reason, ...tool.modes.flatMap((m) => Object.values(m.sheet))]);
    expect(texts.filter((text) => t(text) === text)).toEqual([]);
    expect(t('compatível: o Codex lê os próprios arquivos de instruções e a própria configuração')).toBe(
      'compatible: Codex reads its own instruction files and its own configuration',
    );
  });

  it('as mensagens do Conectar no host saem em inglês, com os valores preenchidos', () => {
    setLocale('en');
    expect(t('O comando `gemini` do Gemini CLI não está no PATH. Instale pela página oficial e tente de novo.')).toBe(
      'The `gemini` command for Gemini CLI is not on the PATH. Install it from the official page and try again.',
    );
    expect(t('Gemini CLI recusou a chave de API: API key not valid.')).toBe('Gemini CLI refused the API key: API key not valid.');
    expect(t('Gemini: a verificação de capacidades não passou. Pendentes: mcp/session-servers.')).toBe(
      'Gemini: the capability check did not pass. Pending: mcp/session-servers.',
    );
  });
});
