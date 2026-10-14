import { afterEach, describe, expect, it } from 'vitest';
import { GIT_NOTICES, fileList, gitNotice, type GitNoticeKey } from '../src/shared/gitNotices';
import { setLocale, t } from '../src/webview/i18n';
import { host } from '../src/webview/i18n/en/host';

afterEach(() => setLocale('pt-BR'));

const KEYS = Object.keys(GIT_NOTICES) as GitNoticeKey[];
const names = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
const filled = (key: GitNoticeKey) => gitNotice(key, Object.fromEntries(names(GIT_NOTICES[key]).map((n) => [n, `<${n}>`])));

describe('gitNotice', () => {
  it('troca cada {param} pelo valor, número inclusive, e deixa o que falta como está', () => {
    expect(gitNotice('cleanup.localDeleted', { branch: 'historia/1-x' })).toBe('branch local historia/1-x apagada');
    expect(gitNotice('develop.ahead', { develop: 'develop', count: 2 })).toContain('tem 2 commit(s)');
    expect(gitNotice('cleanup.remoteGone', {})).toBe('branch remota origin/{branch} já tinha sido apagada');
  });

  it('os avisos levam **Aviso:** e as linhas de sucesso não', () => {
    expect(gitNotice('cleanup.noOrigin', { develop: 'develop' })).toMatch(/^\*\*Aviso:\*\* /);
    expect(gitNotice('develop.failed', { develop: 'develop', error: 'x' })).toMatch(/^\*\*Aviso:\*\* /);
    expect(gitNotice('develop.updated', { develop: 'develop' })).toBe('develop local atualizada até origin/develop');
    expect(gitNotice('cleanup.title')).toBe('Limpeza da história depois do merge:');
  });

  it('o aviso de pendência cita a limpeza de órfãs', () => {
    expect(gitNotice('cleanup.dirty', { path: '/p', files: 'a.ts', branch: 'b' })).toContain('limpeza de branches e worktrees órfãs');
    expect(gitNotice('cleanup.unpushed', { branch: 'b', count: 1, pr: 'u', path: '/p' })).toContain(
      'limpeza de branches e worktrees órfãs',
    );
  });
});

describe('fileList', () => {
  it('lista até 20 e corta o resto com "e mais N"', () => {
    const files = Array.from({ length: 23 }, (_, i) => `f${i}.ts`);
    expect(fileList(files.slice(0, 3))).toBe('f0.ts, f1.ts, f2.ts');
    expect(fileList(files.slice(0, 20))).not.toContain('e mais');
    const out = fileList(files);
    expect(out.endsWith('f19.ts e mais 3')).toBe(true);
    expect(out).not.toContain('f20.ts');
    expect(fileList(files, 2)).toBe('f0.ts, f1.ts e mais 21');
    expect(fileList([])).toBe('');
  });
});

describe('tradução en dos avisos', () => {
  it('toda chave tem tradução, com os mesmos {parâmetros}', () => {
    for (const key of KEYS) {
      const pt = GIT_NOTICES[key];
      const en = host[pt];
      expect(en, key).toBeTruthy();
      expect(names(en!), key).toEqual(names(pt));
    }
  });

  it('o texto preenchido sai em inglês pela tela', () => {
    setLocale('en');
    for (const key of KEYS) {
      const out = t(filled(key));
      expect(out, key).not.toMatch(/Aviso|apagad|não |Limpeza|pasta|branch (local|remota)/);
    }
    expect(t(gitNotice('cleanup.remoteDeleted', { branch: 'historia/1-x' }))).toBe('remote branch origin/historia/1-x deleted');
    expect(t(gitNotice('cleanup.noOrigin', { develop: 'develop' }))).toBe(
      '**Warning:** The repository has no origin remote: the remote branch and develop were not touched.',
    );
  });

  it('a lista de arquivos cortada também sai em inglês', () => {
    setLocale('en');
    const files = fileList(['a.ts', 'b.ts', 'c.ts'], 2);
    const out = t(gitNotice('cleanup.dirty', { path: '/w', files, branch: 'b' }));
    expect(out).toContain('uncommitted changes (a.ts, b.ts and 1 more)');
    expect(out).not.toContain('e mais');
  });
});
