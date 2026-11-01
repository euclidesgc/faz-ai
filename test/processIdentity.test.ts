import { describe, expect, it } from 'vitest';
import { processBirth, processState, processGroupState, validProcessIdentity } from '../src/extension/processIdentity';

describe('identidade de processos', () => {
  it('uma declaração sem nascimento não comprova que o PID ainda é o mesmo processo', () => {
    expect(processState({ pid: process.pid, birth: null })).toBe('unknown');
    expect(processState({ pid: process.pid, birth: 'outro-nascimento' })).toBe('unknown');
    const birth = processBirth(process.pid);
    expect(processState({ pid: process.pid, birth })).toBe(birth ? 'alive' : 'unknown');
  });
  it('PID de grupo ausente, grupo diferente do líder e plataforma diferente não são prova', () => {
    const identity = { pid: process.pid, birth: processBirth(process.pid), platform: process.platform, groupId: null, generation: 'teste' };
    expect(processGroupState(identity)).toBe('unknown');
    expect(processGroupState({ ...identity, groupId: process.pid + 1 })).toBe('unknown');
    expect(processGroupState({ ...identity, platform: process.platform === 'win32' ? 'darwin' : 'win32', groupId: process.pid })).toBe(
      'unknown',
    );
  });
  it('valida todos os campos da identidade persistida antes de consultar o sistema', () => {
    const value = { pid: 123, birth: 'birth', platform: 'darwin', groupId: 123, generation: 'geracao' };
    expect(validProcessIdentity(value)).toBe(true);
    for (const bad of [
      null,
      {},
      { ...value, pid: -1 },
      { ...value, pid: '123' },
      { ...value, groupId: 999 },
      { ...value, generation: '../arquivo' },
      { ...value, birth: {} },
      { ...value, platform: ['darwin'] },
    ])
      expect(validProcessIdentity(bad)).toBe(false);
  });
});
