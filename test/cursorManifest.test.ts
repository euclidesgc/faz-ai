import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorToolNames, manifestPath, writeManifest, type CursorManifest } from '../src/extension/ai/cursorManifest';

const make = (runId: string): CursorManifest => ({
  runId,
  mcpServers: ['faz-ai'],
  subagents: ['backend-node'],
  tools: ['Read'],
  skills: [],
  createdAt: new Date().toISOString(),
});

describe('manifesto do Cursor', () => {
  let dir: string;
  let ws: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-man-'));
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-ws-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('grava por pasta de trabalho e apaga no dispose', () => {
    const dispose = writeManifest(dir, ws, make('a'));
    const file = manifestPath(dir, ws);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).runId).toBe('a');
    dispose();
    expect(fs.existsSync(file)).toBe(false);
    dispose();
  });

  it('resolve link simbólico para o mesmo arquivo', () => {
    const link = path.join(dir, 'link');
    fs.symlinkSync(ws, link);
    expect(manifestPath(dir, link)).toBe(manifestPath(dir, ws));
  });

  it('o dispose de uma execução não apaga o manifesto de outra na mesma pasta', () => {
    const first = writeManifest(dir, ws, make('a'));
    const second = writeManifest(dir, ws, make('b'));
    first();
    expect(JSON.parse(fs.readFileSync(manifestPath(dir, ws), 'utf8')).runId).toBe('b');
    second();
    expect(fs.existsSync(manifestPath(dir, ws))).toBe(false);
  });

  it('não deixa arquivos temporários', () => {
    writeManifest(dir, ws, make('a'))();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('cursorToolNames', () => {
  it('traduz os nomes do Claude Code para os do Cursor', () => {
    expect(cursorToolNames(['Bash', 'Read', 'Agent', 'Edit', 'Write'])).toEqual({
      names: ['Shell', 'Read', 'Task', 'Write'],
      complete: true,
    });
  });
  it('marca como incompleta a lista com ferramenta sem equivalente', () => {
    expect(cursorToolNames(['Read', 'Glob'])).toEqual({ names: ['Read'], complete: false });
  });
});
