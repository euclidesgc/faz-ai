import { describe, expect, it } from 'vitest';
import { SHOWCASE, changelogProblems, firstSection, packageProblems, readmeProblems, renameUnreleased } from '../scripts/releaseCheck.mjs';

const README_PT = `# Faz AI Kanban

> ⚠️ **O Faz AI está em fase alpha.**

> **Obrigado a quem está baixando e testando.**
`;

const README_EN = `# Faz AI Kanban

> ⚠️ **Faz AI is in alpha.**

> **Thank you to everyone downloading and trying it out.**
`;

describe('renameUnreleased', () => {
  it('troca só a primeira ocorrência do título por "## <versão>"', () => {
    const text = '## Não lançado\n\n- item\n\n## 0.30.0\n\n- anterior\n';
    const result = renameUnreleased(text, 'Não lançado', '0.30.1');
    expect(result.renamed).toBe(true);
    expect(result.text).toBe('## 0.30.1\n\n- item\n\n## 0.30.0\n\n- anterior\n');
  });

  it('devolve renamed: false quando não há o que renomear', () => {
    const text = '## 0.30.1\n\n- item\n';
    const result = renameUnreleased(text, 'Não lançado', '0.30.1');
    expect(result.renamed).toBe(false);
    expect(result.text).toBe(text);
  });
});

describe('firstSection', () => {
  it('título da primeira linha que começa com "## "', () => {
    expect(firstSection('# Changelog\n\n## 0.30.1\n\n- item\n')).toBe('0.30.1');
  });

  it('devolve null quando não há nenhuma seção', () => {
    expect(firstSection('# Changelog\n\nsem seções\n')).toBeNull();
  });
});

describe('changelogProblems', () => {
  it('sem problema quando a primeira seção é a versão que está saindo', () => {
    const text = '# Changelog\n\n## 0.30.1\n\n- item\n';
    expect(changelogProblems('CHANGELOG.md', text, '0.30.1')).toEqual([]);
  });

  it('acusa quando a primeira seção não é a versão que está saindo', () => {
    const text = '# Changelog\n\n## 0.30.0\n\n- item\n';
    expect(changelogProblems('CHANGELOG.md', text, '0.30.1')).toEqual([
      'CHANGELOG.md: a primeira seção é "0.30.0", e deveria ser "0.30.1"',
    ]);
  });

  it('acusa "Não lançado" sobrando no meio do arquivo, com a linha', () => {
    const text = '# Changelog\n\n## 0.30.1\n\n- item\n\n## Não lançado\n\n- esquecido\n';
    const problems = changelogProblems('CHANGELOG.md', text, '0.30.1');
    expect(problems).toEqual(['CHANGELOG.md: sobrou o título "## Não lançado" na linha 7']);
  });

  it('acusa um título de "não lançado" de outro idioma sobrando, não só o do arquivo', () => {
    const text = '# Changelog\n\n## 0.30.1\n\n- item\n\n## Unreleased\n\n- esquecido\n';
    expect(changelogProblems('CHANGELOG.md', text, '0.30.1')).toEqual(['CHANGELOG.md: sobrou o título "## Unreleased" na linha 7']);
  });

  it('acusa um changelog sem nenhuma seção', () => {
    expect(changelogProblems('CHANGELOG.md', '# Changelog\n\nsem seções\n', '0.30.1')).toEqual([
      'CHANGELOG.md: não tem nenhuma seção, e a primeira deveria ser "0.30.1"',
    ]);
  });

  it('acusa "Unreleased" sobrando no CHANGELOG_EN.md', () => {
    const text = '# Changelog\n\n## 0.30.1\n\n- item\n\n## Unreleased\n\n- forgotten\n';
    const problems = changelogProblems('CHANGELOG_EN.md', text, '0.30.1');
    expect(problems).toEqual(['CHANGELOG_EN.md: sobrou o título "## Unreleased" na linha 7']);
  });
});

describe('readmeProblems', () => {
  const readmeEntry = SHOWCASE.find((entry) => entry.file === 'README.md' && entry.kind === 'readme');
  const readmeEnEntry = SHOWCASE.find((entry) => entry.file === 'README_EN.md' && entry.kind === 'readme');
  const readmeBlocks = readmeEntry && readmeEntry.kind === 'readme' ? readmeEntry.blocks : [];
  const readmeEnBlocks = readmeEnEntry && readmeEnEntry.kind === 'readme' ? readmeEnEntry.blocks : [];

  it('sem problema quando os dois blocos estão presentes', () => {
    expect(readmeProblems('README.md', README_PT, readmeBlocks)).toEqual([]);
  });

  it('acusa o bloco de aviso de fase alpha ausente, nomeando o bloco e o arquivo', () => {
    const text = README_PT.replace('> ⚠️ **O Faz AI está em fase alpha.**\n\n', '');
    const problems = readmeProblems('README.md', text, readmeBlocks);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('README.md: falta o bloco "aviso de fase alpha"');
    expect(problems[0]).toContain('SHOWCASE');
    expect(problems[0]).toContain('scripts/releaseCheck.mjs');
  });

  it('acusa o bloco de agradecimento ausente, nomeando o bloco e o arquivo', () => {
    const text = README_PT.replace('> **Obrigado a quem está baixando e testando.**\n', '');
    const problems = readmeProblems('README.md', text, readmeBlocks);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('README.md: falta o bloco "agradecimento"');
  });

  it('acusa o bloco de alpha notice ausente no README_EN.md', () => {
    const text = README_EN.replace('> ⚠️ **Faz AI is in alpha.**\n\n', '');
    const problems = readmeProblems('README_EN.md', text, readmeEnBlocks);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('README_EN.md: falta o bloco "alpha notice"');
  });

  it('acusa o bloco de thank you ausente no README_EN.md', () => {
    const text = README_EN.replace('> **Thank you to everyone downloading and trying it out.**\n', '');
    const problems = readmeProblems('README_EN.md', text, readmeEnBlocks);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('README_EN.md: falta o bloco "thank you"');
  });
});

describe('packageProblems', () => {
  const CHANGELOG_PT = '# Changelog\n\n## 0.30.1\n\n- item\n';
  const CHANGELOG_EN = '# Changelog\n\n## 0.30.1\n\n- item\n';

  it('sem nenhum problema quando o pacote está correto', () => {
    const contents = {
      'CHANGELOG.md': CHANGELOG_PT,
      'CHANGELOG_EN.md': CHANGELOG_EN,
      'README.md': README_PT,
      'README_EN.md': README_EN,
    };
    expect(packageProblems(contents, '0.30.1')).toEqual([]);
  });

  it('acusa arquivo ausente no pacote, nomeando o arquivo', () => {
    const contents = {
      'CHANGELOG.md': CHANGELOG_PT,
      'CHANGELOG_EN.md': CHANGELOG_EN,
      'README.md': README_PT,
    };
    expect(packageProblems(contents, '0.30.1')).toEqual(['README_EN.md: arquivo ausente no pacote']);
  });

  it('junta os problemas de todos os arquivos de vitrine', () => {
    const contents = {
      'CHANGELOG.md': '# Changelog\n\n## Não lançado\n\n- item\n',
      'CHANGELOG_EN.md': CHANGELOG_EN,
      'README.md': README_PT.replace('> ⚠️ **O Faz AI está em fase alpha.**\n\n', ''),
      'README_EN.md': README_EN,
    };
    const problems = packageProblems(contents, '0.30.1');
    expect(problems).toContain('CHANGELOG.md: a primeira seção é "Não lançado", e deveria ser "0.30.1"');
    expect(problems.some((problem) => problem.includes('README.md: falta o bloco "aviso de fase alpha"'))).toBe(true);
  });
});
