import { authFailed } from '../src/extension/ai/profileAuth';
import { expect, it } from 'vitest';
import { ALL_AI_BASES } from '../src/shared/harness';
import { providerFor } from '../src/extension/ai/providers';
import type { HeadlessInput } from '../src/extension/ai/provider';
import { RUNNER_PERMISSIONS } from '../src/shared/runner';

const exec: NonNullable<HeadlessInput['exec']> = {
  agent: 'especialista',
  agentDefinition: { name: 'especialista', description: 'Especialista', prompt: 'Instrução fixa' },
  delegates: [],
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
    kind: 'copy' as const,
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
  expect(authFailed({ ...profile, kind: 'copy', base: 'kimi' }, ['{"input_tokens":401}'], false)).toBe(false);
});
