import { describe, expect, it } from 'vitest';
import { FLOW_TEXT } from './flowSkillText';

// A pilha de pull requests e o hotfix, como a skill do fluxo os ensina.

const homologacao = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Homologação'), FLOW_TEXT.indexOf('## Modo autônomo'));

describe('skill', () => {
  it('skill: a pilha diz que a base muda quando a anterior é concluída, manda git merge da nova base e proíbe rebase e push forçado', () => {
    const corpo = FLOW_TEXT.replace(/\s+/g, ' ');
    const trechos = corpo.split('Quando a anterior é concluída');
    expect(trechos.length - 1).toBe(2);
    for (const t of trechos.slice(1)) {
      expect(t).toMatch(/passa a base da seguinte/);
      expect(t).toContain('git fetch origin <base>');
      expect(t).toContain('git merge origin/<base>');
      expect(t).toMatch(/sem rebase nem push forçado/);
    }
  });

  it('skill: Homologação diz que o board abre o PR da principal para a develop no hotfix', () => {
    const texto = homologacao.replace(/\s+/g, ' ');
    expect(texto).toMatch(/Num hotfix[^.]*não abra pull request da principal para a `develop`/);
    expect(texto).toContain('o board faz isso');
  });
});
