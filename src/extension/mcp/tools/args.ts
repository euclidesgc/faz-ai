import { z } from 'zod';

// Argumentos repetidos entre as ferramentas. A descrição faz parte do contrato com a IA: não mude o texto.

export const cardArg = z.union([z.string(), z.number()]).describe('Número do card, ex.: 12 ou "#12"');

export const fieldsArg = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
  .describe('Valores de campos personalizados por nome do campo, ex.: {"Fase": "Spec"}. null limpa o campo.');

export const categoryArg = z
  .enum(['open', 'done', 'cancelled'])
  .describe('O que a coluna representa: trabalho em aberto, conclusão ou cancelamento');

export const workflowArg = z.string().describe('Nome do workflow, ou "parent" (histórias) / "child" (sub-tarefas)');

export const columnWorkflowArg = workflowArg
  .optional()
  .describe('Workflow da coluna; necessário quando há colunas de mesmo nome nos dois workflows');

export const colorArg = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('Cor em hexadecimal, ex.: "#3b82f6"');
