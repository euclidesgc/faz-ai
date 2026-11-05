import { describe, expect, it } from 'vitest';
import { SHOWCASE, packageProblems, readmeProblems } from '../scripts/releaseCheck.mjs';

const README_PT = `# Faz AI Kanban

> ⚠️ **O Faz AI está em fase alpha.**

> **Obrigado a quem está baixando e testando.**
`;

const README_EN = `# Faz AI Kanban

> ⚠️ **Faz AI is in alpha.**

> **Thank you to everyone downloading and trying it out.**
`;

describe('SHOWCASE', () => {
  it('confere só os dois READMEs: o projeto não mantém changelog', () => {
    expect(SHOWCASE.map((entry) => entry.file)).toEqual(['README.md', 'README_EN.md']);
  });
});

describe('readmeProblems', () => {
  const readmeEntry = SHOWCASE.find((entry) => entry.file === 'README.md');
  const readmeEnEntry = SHOWCASE.find((entry) => entry.file === 'README_EN.md');
  const readmeBlocks = readmeEntry ? readmeEntry.blocks : [];
  const readmeEnBlocks = readmeEnEntry ? readmeEnEntry.blocks : [];

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
  it('sem nenhum problema quando o pacote está correto', () => {
    expect(packageProblems({ 'README.md': README_PT, 'README_EN.md': README_EN })).toEqual([]);
  });

  it('acusa arquivo ausente no pacote, nomeando o arquivo', () => {
    expect(packageProblems({ 'README.md': README_PT })).toEqual(['README_EN.md: arquivo ausente no pacote']);
  });

  it('não exige changelog no pacote', () => {
    const contents = { 'README.md': README_PT, 'README_EN.md': README_EN, 'CHANGELOG.md': '# Changelog\n' };
    expect(packageProblems(contents)).toEqual([]);
  });

  it('junta os problemas de todos os arquivos de vitrine', () => {
    const contents = {
      'README.md': README_PT.replace('> ⚠️ **O Faz AI está em fase alpha.**\n\n', ''),
      'README_EN.md': README_EN.replace('> **Thank you to everyone downloading and trying it out.**\n', ''),
    };
    const problems = packageProblems(contents);
    expect(problems.some((problem) => problem.includes('README.md: falta o bloco "aviso de fase alpha"'))).toBe(true);
    expect(problems.some((problem) => problem.includes('README_EN.md: falta o bloco "thank you"'))).toBe(true);
  });
});
