import { describe, expect, it } from 'vitest';
import { AGENT_SUGGESTIONS } from '../src/shared/agentSuggestions';
import { draftAgentInstructions, nameFromText, suggestAgentModel, suggestAgentTools, workKind } from '../src/shared/agentWizard';
import type { ModelOption } from '../src/shared/models';

const names = (directive: string) => suggestAgentTools(directive).map((x) => x.tool);

describe('assistente de agentes: ferramentas sugeridas pela diretriz', () => {
  it('revisar e ler dão só a leitura; o exemplo do diff acrescenta o Bash para o git', () => {
    expect(names('Revisa a documentação e lê os arquivos para apontar erros')).toEqual(['Read', 'Grep', 'Glob']);
    expect(names('Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.')).toEqual([
      'Read',
      'Grep',
      'Glob',
      'Bash',
    ]);
  });

  it('editar, implementar e corrigir trazem Edit, Write e Bash; testar e rodar, o Bash; pesquisar, a web', () => {
    expect(names('Implementa funcionalidades novas')).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash']);
    expect(names('Roda a suíte de testes e resume as falhas')).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
    expect(names('Pesquisa na web como usar uma biblioteca')).toEqual(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
  });

  it('"sem alterar" e "somente leitura" tiram a edição, e nunca se sugere Agent', () => {
    expect(names('Corrige bugs, mas sem editar nada: somente leitura')).not.toContain('Edit');
    for (const d of ['Planeja a arquitetura e delega aos outros agentes', 'Implementa, testa e pesquisa na web', '']) {
      expect(names(d)).not.toContain('Agent');
    }
  });

  it('cada sugestão vem com o motivo', () => {
    for (const x of suggestAgentTools('Escreve testes e roda a suíte')) expect(x.reason.length).toBeGreaterThan(5);
  });
});

describe('assistente de agentes: nome, modelo e instruções', () => {
  it('o nome vem das primeiras palavras da diretriz, sem acento e sem palavras vazias', () => {
    expect(nameFromText('Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.')).toBe(
      'revisa-diff-branch-antes',
    );
    expect(nameFromText('Escreve a documentação')).toBe('escreve-documentacao');
    expect(nameFromText('')).toBe('');
  });

  const catalog: ModelOption[] = [
    { id: 'claude:opus', tool: 'claude', model: 'opus', label: 'Opus', efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    { id: 'claude:sonnet', tool: 'claude', model: 'sonnet', label: 'Sonnet', efforts: ['low', 'medium'], defaultEffort: 'medium' },
    { id: 'claude:haiku', tool: 'claude', model: 'haiku', label: 'Haiku', efforts: [], defaultEffort: null },
    { id: 'cursor:auto', tool: 'cursor', model: 'auto', label: 'Auto', efforts: [], defaultEffort: null },
  ];

  it('leitura e revisão: o menor modelo da ferramenta com esforço baixo; planejamento e implementação: um maior', () => {
    expect(workKind('Revisa o diff e aponta bugs')).toBe('light');
    expect(workKind('Planeja a arquitetura de uma funcionalidade')).toBe('heavy');
    expect(workKind('Implementa a funcionalidade e escreve os testes')).toBe('heavy');
    expect(suggestAgentModel('light', catalog, 'claude')).toMatchObject({ value: 'claude:haiku' });
    expect(suggestAgentModel('heavy', catalog, 'claude')).toMatchObject({ value: 'claude:opus@medium' });
    // o esforço baixo vale quando o menor modelo o tem
    expect(suggestAgentModel('light', catalog.slice(1, 2), 'claude')?.value).toBe('claude:sonnet@low');
    expect(suggestAgentModel('light', catalog, 'cursor')?.value).toBe('cursor:auto');
    expect(suggestAgentModel('light', [], 'claude')).toBeNull();
  });

  it('o rascunho das instruções diz como trabalha e o que nunca faz, conforme as ferramentas', () => {
    const answers = {
      directive: 'Revisa o diff.',
      skills: [],
      mcp: [],
      standards: 'Rode npm run test',
      never: '- Nunca opine sobre estilo',
    };
    const reader = draftAgentInstructions('claude', { ...answers, tools: ['Read', 'Grep'], readonly: false });
    expect(reader).toContain('## Como trabalha');
    expect(reader).toContain('Faça só isto: Revisa o diff.');
    expect(reader).toContain('- Rode npm run test');
    expect(reader).toContain('Nunca altere nem crie arquivos.');
    expect(reader).toContain('- Nunca opine sobre estilo');
    const writer = draftAgentInstructions('claude', { ...answers, tools: ['Read', 'Edit', 'Bash'], readonly: false, skills: ['modelos'] });
    expect(writer).not.toContain('Nunca altere nem crie arquivos.');
    expect(writer).toContain('Nunca rode comandos que mudem o estado do repositório');
    expect(writer).toContain('Siga as skills modelos');
  });

  it('as sugestões prontas são os quatro agentes de escopo reduzido, com nome válido e instruções', () => {
    expect(AGENT_SUGGESTIONS.map((s) => s.id)).toEqual(['reviewer', 'tests', 'docs', 'migrations']);
    for (const s of AGENT_SUGGESTIONS) {
      expect(s.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(s.instructions).toContain('## O que nunca faz');
      expect(s.tools).not.toContain('Agent');
    }
    expect(AGENT_SUGGESTIONS[0]).toMatchObject({ readonly: true, model: 'light' });
    expect(AGENT_SUGGESTIONS[0]!.tools).not.toContain('Edit');
  });
});
