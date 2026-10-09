import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { commandNotFound, resolveCommand } from '../src/extension/cliResolve';

let home: string;
const exe = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o755 });
  return file;
};

beforeEach(() => (home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cli-'))));
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it.skipIf(process.platform === 'win32')('acha a CLI no PATH, nas pastas usuais e embutida na extensão do editor, nessa ordem', () => {
  expect(resolveCommand('claude', '', home)).toBeNull();

  // quem só usa a extensão do Claude Code no editor: vale o binário embutido da versão mais nova
  exe(path.join(home, '.vscode/extensions/anthropic.claude-code-2.1.9-darwin-arm64/resources/native-binary/claude'));
  const newest = exe(path.join(home, '.vscode/extensions/anthropic.claude-code-2.1.287-darwin-arm64/resources/native-binary/claude'));
  expect(resolveCommand('claude', '', home)).toBe(newest);

  const local = exe(path.join(home, '.local/bin/claude'));
  expect(resolveCommand('claude', '', home)).toBe(local);

  const onPath = exe(path.join(home, 'tools/claude'));
  expect(resolveCommand('claude', `/nao-existe${path.delimiter}${path.join(home, 'tools')}`, home)).toBe(onPath);

  // arquivo sem permissão de execução não serve
  fs.writeFileSync(path.join(home, 'tools/cursor-agent'), '', { mode: 0o644 });
  expect(resolveCommand('cursor-agent', path.join(home, 'tools'), home)).toBeNull();
  expect(commandNotFound('claude')).toContain('Claude Code');
});

it.skipIf(process.platform === 'win32')('a CLI do Cursor: cursor-agent, o nome curto agent e a pasta do instalador', () => {
  expect(resolveCommand('cursor-agent', '', home)).toBeNull();
  // instalação que só deixou as versões, sem os atalhos em ~/.local/bin
  exe(path.join(home, '.local/share/cursor-agent/versions/2026.09.02-a1/cursor-agent'));
  const newest = exe(path.join(home, '.local/share/cursor-agent/versions/2026.10.01-e3/cursor-agent'));
  expect(resolveCommand('cursor-agent', '', home)).toBe(newest);
  // um `agent` qualquer no PATH não passa na frente da instalação do Cursor
  const short = exe(path.join(home, 'tools/agent'));
  expect(resolveCommand('cursor-agent', path.join(home, 'tools'), home)).toBe(newest);
  // sem a instalação, vale o nome curto
  fs.rmSync(path.join(home, '.local/share/cursor-agent'), { recursive: true });
  expect(resolveCommand('cursor-agent', path.join(home, 'tools'), home)).toBe(short);
  // os dois: vale o nome que não se confunde com outro programa
  const full = exe(path.join(home, 'tools/cursor-agent'));
  expect(resolveCommand('cursor-agent', path.join(home, 'tools'), home)).toBe(full);
  expect(commandNotFound('cursor-agent')).toContain('cursor-agent login');
});
