import { z } from 'zod';
import { findColumn, findWorkflow } from '../format';
import { categoryArg, columnWorkflowArg, workflowArg } from './args';
import { findProfile, overview } from './helpers';
import type { DefineTool } from './registry';

/** Configuração do board: colunas, workflows, aparência e nome. */
export function registerBoardTools(tool: DefineTool): void {
  tool(
    'create_column',
    'Cria uma coluna em um workflow. Sem `position`, ela entra antes da primeira coluna de conclusão ou cancelamento.',
    {
      workflow: workflowArg,
      name: z.string().min(1),
      category: categoryArg.optional(),
      position: z.number().int().min(0).optional().describe('Índice da coluna na linha (0 = primeira)'),
    },
    (a, router) => {
      const s = router.snapshot();
      const wf = findWorkflow(s, a.workflow);
      const before = new Set(s.columns.map((c) => c.id));
      const created = router
        .handle({ type: 'settings.column.create', workflowId: wf.id, name: a.name, position: a.position })
        .columns.find((c) => !before.has(c.id));
      if (created && a.category) router.handle({ type: 'settings.column.update', columnId: created.id, patch: { category: a.category } });
      return overview(router);
    },
  );

  tool(
    'update_column',
    'Altera uma coluna: nome, o que ela representa (categoria), posição no workflow, se a IA atua nela, se ela exige aprovação de uma pessoa para o card avançar, e a fase (instrução para a IA e modelo do documento que a fase produz).',
    {
      column: z.string(),
      workflow: columnWorkflowArg,
      name: z.string().min(1).optional(),
      category: categoryArg.optional(),
      position: z.number().int().min(0).optional(),
      ai_active: z.boolean().optional().describe('A IA trabalha nos cards desta coluna: ao entrar nela o card fica "ready"'),
      requires_approval: z.boolean().optional().describe('A IA só avança o card depois que uma pessoa aprova'),
      ai_instruction: z.string().optional().describe('O que a IA faz quando um card entra nesta coluna (fase)'),
      artifact_name: z.string().optional().describe('Nome do arquivo do documento que a fase produz, ex.: "PRD.md"; vazio se não produz'),
      artifact_template: z.string().optional().describe('Modelo do documento, em markdown'),
      exec_profile: z
        .string()
        .optional()
        .describe('Nome do agente de execução dos cards desta coluna (ver execProfiles em get_board); vazio volta ao padrão do board'),
    },
    (a, router) => {
      const s = router.snapshot();
      const col = findColumn(s, a.column, a.workflow ? findWorkflow(s, a.workflow).id : undefined);
      router.handle({
        type: 'settings.column.update',
        columnId: col.id,
        patch: {
          name: a.name,
          category: a.category,
          position: a.position,
          aiActive: a.ai_active,
          requiresApproval: a.requires_approval,
          aiInstruction: a.ai_instruction,
          artifactName: a.artifact_name,
          artifactTemplate: a.artifact_template,
          execProfile: a.exec_profile === undefined ? undefined : a.exec_profile ? findProfile(router.snapshot(), a.exec_profile).id : null,
        },
      });
      return overview(router);
    },
  );

  tool(
    'delete_column',
    'Exclui uma coluna, movendo os cards dela para outra coluna do mesmo workflow.',
    { column: z.string(), workflow: columnWorkflowArg, move_cards_to: z.string().describe('Coluna que recebe os cards') },
    (a, router) => {
      const s = router.snapshot();
      const col = findColumn(s, a.column, a.workflow ? findWorkflow(s, a.workflow).id : undefined);
      const target = findColumn(s, a.move_cards_to, col.workflowId);
      router.handle({ type: 'settings.column.delete', columnId: col.id, moveCardsTo: target.id });
      return overview(router);
    },
  );

  tool('rename_workflow', 'Renomeia um workflow.', { workflow: workflowArg, name: z.string().min(1) }, (a, router) => {
    router.handle({
      type: 'settings.workflow.update',
      workflowId: findWorkflow(router.snapshot(), a.workflow).id,
      patch: { name: a.name },
    });
    return overview(router);
  });

  tool(
    'create_workflow',
    'Cria um workflow (linha do board) no fim do board, com as colunas A fazer, Em andamento e Concluído. `kind` "parent" recebe cards independentes (como histórias e bugs); "child" recebe sub-tarefas de uma história.',
    { name: z.string().min(1), kind: z.enum(['parent', 'child']).default('parent') },
    (a, router) => {
      router.handle({ type: 'settings.workflow.create', name: a.name, kind: a.kind });
      return overview(router);
    },
  );

  tool(
    'move_workflow',
    'Muda a posição de um workflow no board (0 = o primeiro, em cima). Os outros se reordenam.',
    { workflow: workflowArg, position: z.number().int().min(0) },
    (a, router) => {
      router.handle({
        type: 'settings.workflow.update',
        workflowId: findWorkflow(router.snapshot(), a.workflow).id,
        patch: { position: a.position },
      });
      return overview(router);
    },
  );

  tool(
    'delete_workflow',
    'Exclui um workflow e as colunas dele. Só é possível se ele não tiver cards (nem arquivados ou na lixeira), se nenhum tipo de card nascer nele e se não for o único workflow do board.',
    { workflow: workflowArg },
    (a, router) => {
      router.handle({ type: 'settings.workflow.delete', workflowId: findWorkflow(router.snapshot(), a.workflow).id });
      return overview(router);
    },
  );

  tool(
    'set_appearance',
    'Ajusta a aparência do board: tema (system acompanha o claro/escuro do VS Code (ou do sistema, no navegador), light, dark) e a fonte e o tamanho dos textos longos (descrição e comentários).',
    {
      theme: z.enum(['system', 'light', 'dark']).optional(),
      font: z
        .enum(['sans', 'ui', 'serif', 'mono', 'editor'])
        .optional()
        .describe('sans = sem serifa do sistema; ui = fonte da interface do VS Code; editor = fonte do editor do VS Code'),
      font_size: z.number().int().min(11).max(22).optional().describe('Tamanho em px'),
    },
    (a, router) => {
      const patch = Object.fromEntries(
        Object.entries({ theme: a.theme, font: a.font, fontSize: a.font_size }).filter(([, v]) => v !== undefined),
      );
      return router.handle({ type: 'settings.board.update', patch: { appearance: patch } }).board.appearance;
    },
  );

  tool('rename_board', 'Renomeia o board.', { name: z.string().min(1) }, (a, router) => {
    router.handle({ type: 'settings.board.update', patch: { name: a.name } });
    return overview(router);
  });
}

/** Regras do board e reset. */
export function registerBoardRulesTools(tool: DefineTool): void {
  tool(
    'update_rules',
    'Altera as regras do board. Só o que for informado é alterado.',
    {
      blockDoneWithOpenChildren: z.boolean().optional().describe('História não entra em coluna de conclusão com sub-tarefas em aberto'),
      blockPhaseAdvanceWithOpenChildren: z
        .boolean()
        .optional()
        .describe('História não avança de coluna enquanto houver sub-tarefas em aberto cuja Fase é a coluna atual'),
      onCancelParent: z.enum(['ask', 'cascade', 'keep']).optional().describe('Sub-tarefas em aberto quando a história é cancelada'),
      onAllChildrenDone: z.enum(['ask', 'auto', 'off']).optional().describe('História quando a última sub-tarefa em aberto é concluída'),
      confirmTrash: z.enum(['whenDependents', 'always', 'never']).optional(),
      confirmArchive: z.enum(['whenDependents', 'always', 'never']).optional(),
      autoApplyModelSuggestion: z
        .boolean()
        .optional()
        .describe('Preencher o campo de modelo com a sugestão enquanto ele não foi escolhido à mão'),
      includeFastModels: z
        .boolean()
        .optional()
        .describe(
          'Incluir no catálogo do Cursor as variantes rápidas dos modelos (respondem mais rápido e cobram mais pelos mesmos tokens). Ligar acrescenta as da última lista lida do Cursor; desligar as tira do catálogo.',
        ),
    },
    (a, router) => {
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      return router.handle({ type: 'settings.rules.update', patch }).board.rules;
    },
  );

  tool(
    'reset_board',
    'APAGA o board inteiro (cards, comentários, anexos e configurações) e recria com o padrão. Não pode ser desfeito: confirme com a pessoa antes.',
    {},
    (_a, router) => {
      router.handle({ type: 'settings.board.reset' });
      return overview(router);
    },
  );
}
