import { authFailed } from '../src/extension/ai/profileAuth';
import { expect, it } from 'vitest';
import { ALL_AI_BASES } from '../src/shared/harness';
import { providerFor } from '../src/extension/ai/providers';
import type { HeadlessInput } from '../src/extension/ai/provider';
import { RUNNER_PERMISSIONS } from '../src/shared/runner';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';

const exec: NonNullable<HeadlessInput['exec']> = {
  agent: 'especialista',
  agentDefinition: { name: 'especialista', description: 'Especialista', prompt: 'Instrução fixa' },
  mcpAllowed: [],
  mcpBlocked: [],
  mcpConfig: '{"mcpServers":{}}',
  tools: ['Read'],
  deniedTools: ['Bash'],
  model: { name: 'modelo-fixo', effort: 'high' },
};
// Retrato anterior aos adaptadores: flags e leitores dos três prontos devem permanecer iguais.
it.each(ALL_AI_BASES)('preserva os comandos nativos de %s', (tool) => {
  const cases = RUNNER_PERMISSIONS.flatMap(({ value: permission }) =>
    [false, true].flatMap((withExec) =>
      [false, true].flatMap((withDirs) =>
        [false, true].map((structured) => {
          const input: HeadlessInput = {
            prompt: 'Pedido fixo\ncom espaço',
            permission,
            structured,
            ...(withExec ? { exec } : {}),
            ...(withDirs ? { addDirs: ['/pasta adicional'] } : {}),
            boardServer: { command: 'node', args: ['bridge.js'] },
          };
          return { permission, withExec, withDirs, structured, command: providerFor(tool).command(input) };
        }),
      ),
    ),
  );
  expect(cases).toMatchSnapshot();
});

const custom = (config: import('../src/shared/aiProfiles').AiProfileConfig): import('../src/shared/aiProfiles').AiProfile => ({
  id: 'personalizado',
  name: 'Personalizado',
  kind: 'custom',
  tool: 'personalizado',
  mode: 'cli',
  base: 'generic',
  enabled: true,
  position: 3,
  config: { command: 'custom-cli', ...config },
  credentials: { secretRef: 'a'.repeat(64), review: 'reviewed', available: true },
});
it('cópia preserva leitor/formato e configura comando, ambiente e argumentos adicionais', () => {
  const profile = {
    ...custom({ command: '/cli-alternativa', env: { ACCOUNT: 'work' }, extraArgs: ['--account work'] }),
    id: 'cursor-work',
    kind: 'catalog' as const,
    tool: 'cursor',
    mode: 'cli' as const,
    base: 'cursor' as const,
  };
  const input: HeadlessInput = { prompt: 'oi', permission: 'board', structured: true };
  const native = providerFor('cursor'),
    copy = providerFor(profile),
    built = native.command(input);
  expect(copy.command(input)).toEqual({
    ...built,
    command: '/cli-alternativa',
    env: { ...built.env, ACCOUNT: 'work' },
    args: [...built.args, '--account', 'work'],
  });
  expect(copy.tool).toBe(profile.id);
  expect(copy.reader).toBe(native.reader);
  expect(copy.measure).toBe(native.measure);
});
it('personalizado monta stdin, MCP, modelo/pastas e somente os argumentos da permissão atual', () => {
  const profile = custom({
    args: ['--mcp {mcpConfig}', '--model={model}', '--add-dir {addDir}'],
    permissionArgs: { board: ['--read-only'], full: ['--all'] },
  });
  const input: HeadlessInput = { prompt: 'pedido\ncom espaço', permission: 'board', exec, addDirs: ['/pasta um', '/pasta dois'] };
  const provider = providerFor(profile),
    built = provider.command(input);
  expect(provider.measure).toBe('none');
  expect(built.stdin).toBe(input.prompt);
  expect(built.format).toBe('text');
  expect(built.args).toEqual([
    '--mcp',
    '{tmp:mcp.json}',
    '--model=modelo-fixo',
    '--add-dir',
    '/pasta um',
    '--add-dir',
    '/pasta dois',
    '--read-only',
  ]);
  expect(built.tempFiles).toEqual({ 'mcp.json': exec.mcpConfig });
  expect(built.lookup).toEqual({ onlyPath: true });
  expect(built.noShell).toBe(true);
  const reader = provider.reader('text', { model: null });
  reader.push('resposta', 'stdout');
  expect(reader.report()).toMatchObject({ measure: 'none', consumption: null });
});
it('pedido em argumento não é dividido e os modos MCP projeto/nenhum são explícitos', () => {
  const input: HeadlessInput = {
    prompt: 'pedido com espaço\ne quebra',
    permission: 'full',
    boardServer: { command: 'node', args: ['bridge.js'] },
  };
  const project = providerFor(
    custom({ promptVia: 'arg', args: ['--prompt {prompt}'], boardServer: 'project', mcpProjectFile: '.custom/mcp.json' }),
  ).command(input);
  expect(project.args).toEqual(['--prompt', input.prompt]);
  expect(project.stdin).toBeUndefined();
  expect(project.projectMcp?.entry).toEqual(input.boardServer);
  const none = providerFor(custom({ promptVia: 'arg', args: ['--mcp {mcpConfig}'], boardServer: 'none' })).command(input);
  expect(none.args).toEqual([input.prompt]);
  expect(none.tempFiles).toBeUndefined();
  expect(none.projectMcp).toBeUndefined();
});
it('ausência de restrições/tradução ou caminho MCP fora do projeto bloqueia a montagem', () => {
  expect(() => providerFor(custom({})).command({ prompt: 'oi', permission: 'board' })).toThrow('permissão restrita');
  expect(() =>
    providerFor(custom({ permissionArgs: { board: ['--read-only'] } })).command({
      prompt: 'oi',
      permission: 'board',
      exec: { ...exec, toolSet: 'explicit' },
    }),
  ).toThrow('tradução');
  expect(() =>
    providerFor(custom({ boardServer: 'project', mcpProjectFile: '../mcp.json' })).command({ prompt: 'oi', permission: 'full' }),
  ).toThrow('relativo');
});

it('frases de autenticação são literais, sem regex, e números do fluxo não viram erro de login', () => {
  const profile = custom({ authPatterns: ['TOKEN.*EXPIRED'] });
  expect(authFailed(profile, ['token-any-expired'])).toBe(false);
  expect(authFailed(profile, ['token.*expired'])).toBe(true);
  expect(authFailed({ ...profile, kind: 'catalog', tool: 'kimi', mode: 'cli', base: 'kimi' }, ['{"input_tokens":401}'], false)).toBe(false);
});

// Gemini pela CLI (história 8): o perfil pronto `gemini` no modo `cli`, o mesmo binário do ACP.
const geminiCli = (): import('../src/shared/aiProfiles').AiProfile => ({
  ...structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!),
  mode: 'cli',
  enabled: true,
});
const settingsOf = (built: ReturnType<ReturnType<typeof providerFor>['command']>) =>
  JSON.parse(built.tempHome!.files['.gemini/settings.json']!) as Record<string, any>;
const board = { command: 'node', args: ['bridge.js'], env: { FAZAI_TOKEN: 'sessao' } };

it('Gemini pela CLI: o pedido pela entrada, -p vazio, stream-json, a home isolada e só o nome da variável da chave', () => {
  const provider = providerFor(geminiCli());
  expect(provider.measure).toBe('tokens');
  const built = provider.command({
    prompt: 'Pedido "com aspas" & quebra\nde linha',
    permission: 'board',
    structured: true,
    addDirs: ['/pasta com espaço'],
    exec: { ...exec, agent: '', agentDefinition: null, model: { name: 'gemini-2.5-pro', effort: 'high' } },
    boardServer: board,
  });
  expect(built.command).toBe('gemini');
  expect(built.stdin).toBe('Pedido "com aspas" & quebra\nde linha');
  expect(built.args).toEqual([
    '-p',
    '',
    '--output-format',
    'stream-json',
    '--approval-mode',
    'default',
    '--skip-trust',
    '-e',
    'none',
    '--allowed-mcp-server-names',
    'faz-ai',
    '--include-directories',
    '/pasta com espaço',
    // o esforço não tem flag: só o modelo
    '-m',
    'gemini-2.5-pro',
  ]);
  expect(built.format).toBe('gemini-stream-json');
  expect(built.tempHome!.env).toBe('GEMINI_CLI_HOME');
  expect(built.apiKeyEnv).toBe('GEMINI_API_KEY');
  // a chave nunca está no comando: nem nos argumentos, nem no ambiente, nem no settings
  expect(built.apiKey).toBeUndefined();
  expect(Object.values(built.env ?? {}).every((v) => v === '')).toBe(true);
  expect(built.env).not.toHaveProperty('GEMINI_API_KEY');
  const settings = settingsOf(built);
  expect(settings.security.auth).toEqual({ selectedType: 'gemini-api-key' });
  // o nome da variável aparece só na máscara do shell (`blocked`); o valor, nunca
  expect(JSON.stringify(settings)).not.toMatch(/apiKey/);
  expect(settings.experimental).toEqual({ enableAgents: false });
  expect(settings.skills).toEqual({ enabled: false });
  expect(settings.hooksConfig).toEqual({ enabled: false });
  expect(settings.context).toEqual({ memoryBoundaryMarkers: [], includeDirectoryTree: false });
  expect(settings.privacy).toEqual({ usageStatisticsEnabled: false });
  // o `mcpConfig` do exec é o do card (vazio aqui): o servidor do board não entra por trás
  expect(settings.mcpServers).toEqual({});
  expect(settings.mcp).toEqual({ allowed: ['faz-ai'] });
  // fora da admissão, "Só o board": as de leitura do Gemini, dentro das do card (Read), sem as negadas (Bash)
  expect(settings.tools.core).toEqual(['read_file', 'read_many_files', 'list_directory']);
  const text = provider.command({ prompt: 'oi', permission: 'board', structured: false });
  expect(text.format).toBe('text');
  expect(text.args).not.toContain('stream-json');
});

it('Gemini pela CLI admitido: tools.core é a lista da decisão, e cada servidor só com as operações admitidas', () => {
  const built = providerFor(geminiCli()).command({
    prompt: 'oi',
    permission: 'full',
    structured: true,
    exec: {
      ...exec,
      agent: '',
      agentDefinition: null,
      toolSet: 'explicit',
      tools: ['read_file', 'grep_search'],
      deniedTools: ['invoke_agent'],
      mcpTools: ['mcp__faz-ai__get_card', 'mcp__meu_srv__listar'],
      mcpAllowed: ['meu_srv'],
      mcpConfig: JSON.stringify({
        mcpServers: {
          'faz-ai': { type: 'stdio', ...board },
          meu_srv: { type: 'http', url: 'https://mcp.example/x', headers: { Authorization: 'Bearer t' } },
          fora: { type: 'stdio', command: 'fora', args: [] },
        },
      }),
    },
  });
  expect(built.args).toEqual(expect.arrayContaining(['--approval-mode', 'yolo']));
  expect(built.args.filter((a, i) => built.args[i - 1] === '--allowed-mcp-server-names')).toEqual(['faz-ai', 'meu_srv']);
  const settings = settingsOf(built);
  expect(settings.tools).toEqual({
    core: ['read_file', 'grep_search'],
    // as operações MCP só são declaradas ao modelo quando estão aqui (conferido na 0.65.0)
    allowed: ['read_file', 'grep_search', 'mcp_faz-ai_get_card', 'mcp_meu_srv_listar'],
  });
  expect(settings.mcpServers).toEqual({
    'faz-ai': { command: 'node', args: ['bridge.js'], env: { FAZAI_TOKEN: 'sessao' }, includeTools: ['get_card'] },
    meu_srv: { httpUrl: 'https://mcp.example/x', headers: { Authorization: 'Bearer t' }, includeTools: ['listar'] },
  });
  // nenhuma operação admitida, nenhuma ferramenta: a lista vazia fecha o registro (a CLI não declara nada)
  const empty = settingsOf(
    providerFor(geminiCli()).command({
      prompt: 'oi',
      permission: 'board',
      exec: { ...exec, toolSet: 'explicit', tools: [], mcpTools: [], mcpConfig: '{"mcpServers":{}}' },
    }),
  );
  expect(empty.tools).toEqual({ core: [], allowed: [] });
  expect(empty.mcp).toEqual({ allowed: ['faz-ai'] });
});

it('Gemini pela CLI: um .env da pasta não redefine endpoint, credencial nem proxy, e o shell do modelo não vê a chave', () => {
  const pinned = [
    'GOOGLE_GEMINI_BASE_URL',
    'GOOGLE_VERTEX_BASE_URL',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'GOOGLE_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'GEMINI_CLI_CUSTOM_HEADERS',
    'GEMINI_SYSTEM_MD',
    'HTTPS_PROXY',
    'NODE_OPTIONS',
  ];
  const saved = Object.fromEntries(pinned.map((n) => [n, process.env[n]]));
  try {
    for (const n of pinned) delete process.env[n];
    process.env.HTTPS_PROXY = 'http://proxy.da.pessoa:3128';
    const built = providerFor(geminiCli()).command({ prompt: 'oi', permission: 'board', structured: true });
    // o que o host não define vai vazio (a CLI lê como ausente, e o `.env` só preenche o que falta)
    for (const n of pinned.filter((n) => n !== 'HTTPS_PROXY')) expect(built.env![n]).toBe('');
    // o que o host define, o processo já herda: nada a fixar, e o valor da pessoa não vai para o comando
    expect(built.env).not.toHaveProperty('HTTPS_PROXY');
    // a chave não está entre as fixadas: com o cofre, o `spawn` a define; sem ele, vale o login da pessoa
    expect(built.env).not.toHaveProperty('GEMINI_API_KEY');
    const settings = settingsOf(built);
    expect(settings.advanced).toEqual({ ignoreLocalEnv: true });
    expect(settings.security.environmentVariableRedaction).toEqual({ enabled: true, blocked: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] });
  } finally {
    for (const [n, v] of Object.entries(saved))
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
  }
});

it('Gemini pela CLI e pelo ACP: a chave recusada pela API é login vencido', () => {
  const tail = ['Terminou com erro: [API Error: {"error":{"code":400,"message":"API key not valid. Please pass a valid API key."'];
  expect(authFailed(geminiCli(), tail)).toBe(true);
  // a saída real do Gemini CLI 0.65.0 pelo ACP com a chave errada: o `authenticate` passa e o `session/prompt`
  // falha com o 400 da API (rastreio do board, teste de ponta a ponta de Ferramentas de IA)
  const acpTail = [
    'Falhou: {"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 400,\\n    \\"message\\": \\"API key not valid. Please pass a valid API key.\\",',
    '        "reason": "API_KEY_INVALID",',
  ];
  expect(authFailed({ ...geminiCli(), mode: 'acp' }, acpTail)).toBe(true);
  // outro agente ACP com a mesma frase não é o Gemini: a regra é dele
  expect(authFailed({ ...geminiCli(), tool: 'opencode', id: 'opencode', mode: 'acp' }, acpTail)).toBe(false);
  expect(authFailed(geminiCli(), ['Terminou com erro: [API Error: You have exhausted your daily quota on this model.]'])).toBe(false);
});

// Retomada de sessão (reparo do bloco final): só o Claude Code tem `--resume` confirmado com `-p` na documentação oficial.
it('só o Claude Code é resumable; Cursor, Kimi, Gemini e genérico ficam sem retomada', () => {
  expect(Object.fromEntries(ALL_AI_BASES.map((t) => [t, providerFor(t).resumable === true]))).toEqual({
    claude: true,
    cursor: false,
    kimi: false,
  });
  expect(providerFor(geminiCli()).resumable).toBeUndefined();
  expect(providerFor(custom({})).resumable).toBeUndefined();
});
it('cópia do Claude não herda a retomada e ignora `resume` ao montar o comando', () => {
  const copy = {
    ...custom({ command: '/claude-alternativo' }),
    id: 'claude-work',
    kind: 'catalog' as const,
    tool: 'claude',
    mode: 'cli' as const,
    base: 'claude' as const,
  };
  const input: HeadlessInput = { prompt: 'oi', permission: 'board', structured: true };
  expect(providerFor(copy).resumable).toBe(false);
  expect(providerFor(copy).command({ ...input, resume: { sessionId: 's-1' } }).args).not.toContain('--resume');
});
it('Claude com resume leva --resume <id> logo após -p e mantém o isolamento, o MCP e as ferramentas', () => {
  const base: HeadlessInput = {
    prompt: 'repare',
    permission: 'edits',
    structured: true,
    exec,
    addDirs: ['/pasta adicional'],
    boardServer: { command: 'node', args: ['bridge.js'] },
  };
  const plain = providerFor('claude').command(base);
  const resumed = providerFor('claude').command({ ...base, resume: { sessionId: 'sessao-123' } });
  expect(resumed.args.slice(0, 3)).toEqual(['-p', '--resume', 'sessao-123']);
  // fora o par da retomada, o comando é o mesmo: nada do isolamento, MCP, agente, ferramentas e modelo se perde
  expect(resumed.args).toEqual(['-p', '--resume', 'sessao-123', ...plain.args.slice(1)]);
  expect(resumed.args).toEqual(expect.arrayContaining(['--strict-mcp-config', '--mcp-config', '{tmp:mcp.json}', '--tools', 'Read']));
  expect(resumed.args).toEqual(expect.arrayContaining(['--setting-sources', '--model', 'modelo-fixo']));
  expect(resumed.stdin).toBe('repare');
  expect(resumed.tempFiles).toEqual(plain.tempFiles);
  expect(resumed.format).toBe(plain.format);
});
it('Claude sem resume: o comando não muda', () => {
  const input: HeadlessInput = { prompt: 'oi', permission: 'board', structured: true };
  expect(providerFor('claude').command(input).args).not.toContain('--resume');
  expect(providerFor('claude').command({ ...input, resume: undefined })).toEqual(providerFor('claude').command(input));
});
