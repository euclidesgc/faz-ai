import { describe, expect, it } from 'vitest';
import { suggestSkills, words, type CatalogSkill } from '../src/shared/skillCatalog';

const skill = (name: string, description: string, scope: CatalogSkill['scope'] = 'user'): CatalogSkill => ({ name, description, scope });
const CATALOG = [
  skill('revisar-spec', 'Revisa uma Spec e aponta lacunas antes do Plan'),
  skill('frontend-design', 'Guidance for distinctive visual design when building new UI'),
  skill('agent-browser', 'Browser automation CLI to test web apps and take screenshots'),
  skill('humanizer', 'Remove signs of AI-generated writing from text'),
];

describe('skillCatalog', () => {
  it('words ignora acento, palavras vazias e as curtas', () => {
    expect(words('Revisão de código, para o time!')).toEqual(['revisao', 'codigo', 'time']);
  });

  it('sugere pelo nome e pela descrição, com plural e conjugação', () => {
    expect(suggestSkills('revisar specs antes de planejar', CATALOG).map((s) => s.name)[0]).toBe('revisar-spec');
    expect(suggestSkills('testar o web app com screenshots', CATALOG).map((s) => s.name)).toEqual(['agent-browser']);
    expect(suggestSkills('desenhar a interface visual', CATALOG).map((s) => s.name)).toEqual(['frontend-design']);
  });

  it('nada em comum não sugere nada, e a skill do projeto desempata', () => {
    expect(suggestSkills('contabilidade', CATALOG)).toEqual([]);
    expect(suggestSkills('', CATALOG)).toEqual([]);
    const tie = [skill('b-design', 'visual design', 'user'), skill('a-design', 'visual design', 'project')];
    expect(suggestSkills('design visual', tie).map((s) => s.name)).toEqual(['a-design', 'b-design']);
  });
});
