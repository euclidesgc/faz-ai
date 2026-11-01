// "Criar com IA" e "Sugerir configuração" da biblioteca de artefatos: o que a tela manda e o que volta. A IA
// escreve cada pergunta (uma chamada por pergunta) e o rascunho; o host valida a resposta antes de ela chegar à
// tela, e nada é gravado sem a pessoa revisar no formulário. Só tipos e funções puras.
import type { NeutralTool } from './artifactTools';

export type AssistKind = 'rule' | 'skill' | 'agent';

/** O rascunho do arquivo, no formato dos formulários (ids neutros nas tools). */
export interface ArtifactAssistDraft {
  name: string;
  description: string;
  version: string;
  /** regra: o texto inteiro (com o frontmatter); skill: as instruções; agente: o prompt de sistema */
  body: string;
  tools: NeutralTool[];
  /** só skill */
  folder?: string;
  /** só agente: as skills padrão (`pasta/nome` ou só o nome) */
  skills?: string[];
  /** só agente: '' = inherit */
  model?: string;
}

export interface AssistAnswer {
  question: string;
  answer: string;
}

export interface ArtifactAssistInput {
  /** `question`: próxima pergunta do assistente; `suggest`: "Sugerir configuração" (preenche tudo de uma vez) */
  mode: 'question' | 'suggest';
  kind: AssistKind;
  /** o objetivo que a pessoa escreveu (no assistente, a primeira resposta) */
  goal: string;
  answers: AssistAnswer[];
  draft: ArtifactAssistDraft;
  language: 'pt-BR' | 'en';
}

export interface AssistOption {
  label: string;
  /** a opção que a IA recomenda; no máximo uma por pergunta */
  suggested: boolean;
}

export interface AssistQuestion {
  text: string;
  hint: string;
  /** `single`: escolhe uma; `multi`: várias; `tools`: as caixas das tools neutras (as opções vêm da lista fechada) */
  type: 'single' | 'multi' | 'tools';
  options: AssistOption[];
  /** só em `tools`: as recomendadas */
  suggestedTools?: NeutralTool[];
}

export interface ArtifactAssistResult {
  /** "Contexto que encontrei": o que o host e a IA leram (stack, manifestos, artefatos, cards) */
  context: { label: string; value: string }[];
  /** ausente quando a IA julga que já tem o bastante (ou no modo `suggest`) */
  question?: AssistQuestion;
  /** posição da próxima pergunta e o total estimado pela IA */
  progress: { index: number; total: number };
  draft: ArtifactAssistDraft;
  done: boolean;
}

/** O roteiro de assuntos que a IA cobre, por tipo; ela escreve as perguntas e pode juntar ou pular. */
export const ASSIST_TOPICS: Record<AssistKind, string[]> = {
  rule: [
    'objetivo e público do projeto',
    'stack e versões',
    'estrutura de pastas',
    'convenções de código',
    'testes',
    'git e commits',
    'o que nunca fazer',
    'definição de pronto',
  ],
  skill: ['assunto da skill', 'quando aplicar', 'tools de que precisa', 'pasta na biblioteca', 'exemplos'],
  agent: ['objetivo do agente', 'tools que concede', 'skills padrão', 'resultado esperado ao terminar o card'],
};
