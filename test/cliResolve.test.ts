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
  fs.writeFileSync(path.join(home, 'tools/codex'), '', { mode: 0o644 });
  expect(resolveCommand('codex', path.join(home, 'tools'), home)).toBeNull();
  expect(commandNotFound('claude')).toContain('Claude Code');
});
