import type { Autopilot } from '../../src/extension/autopilot';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import type { AiRunner } from '../../src/extension/runner';
import { parseModelValue } from '../../src/shared/models';
import type { EvalConfig, EvalLog } from './types';

export type { EvalConfig, EvalLog } from './types';

/**
 * O board temporário de uma história, visto pelo `runStory`. Há duas implementações: a real
 * (`hostBoard.ts`, sobre `createBoardHost`) e a do teste (`test/evals/evalWorld.ts`, sobre o `cardWorld`).
 * O núcleo só conhece esta interface, por isso os dois lados exercitam o mesmo código.
 */
export interface EvalBoard {
  router: MessageRouter;
  runner: Pick<AiRunner, 'running' | 'onDidFinish'>;
  autopilot: Pick<Autopilot, 'stop'>;
  projectDir: string;
  /** encerra o board e devolve o que ficou no log (execuções da rodada e sinais de retrabalho) */
  close(period: { start: number; end: number }): Promise<EvalLog>;
}

/** `<perfil>:<modelo>@<esforço>` (o valor de um campo de modelo, com o esforço obrigatório). */
export function parseModel(value: string): EvalConfig {
  const parsed = parseModelValue(value);
  const colon = parsed ? parsed.id.indexOf(':') : -1;
  if (!parsed || !parsed.effort || colon <= 0 || colon === parsed.id.length - 1 || /\s/.test(value)) {
    throw new Error(`Modelo inválido: "${value}". Use <perfil>:<modelo>@<esforço>, por exemplo claude:opus@medium.`);
  }
  return { model: value, profile: parsed.id.slice(0, colon) };
}

/**
 * A configuração da rodada, comum ao host real e ao teste. Roda logo depois de montar o board e antes de criar a
 * história, só por mensagens do router: o modelo vira o único em todos os cards (o do card vale sobre o do
 * agente e o da regra), a permissão é `full` e o git fica em `branch` sem gitflow, para o código ficar na
 * própria pasta do projeto, onde rodam os testes de aceite.
 */
export function configureBoard(router: MessageRouter, config: EvalConfig): void {
  const { profile } = config;
  router.handle({ type: 'settings.aiProfiles.setEnabled', id: profile, enabled: true });
  router.handle({ type: 'settings.board.update', patch: { aiTool: profile } });
  router.handle({ type: 'settings.models.detect', tool: profile });

  const wanted = parseModelValue(config.model)!;
  const catalog = router.snapshot().board.modelCatalog;
  const option = catalog.find((o) => o.id === wanted.id);
  if (!option) {
    const available = catalog.filter((o) => o.tool === profile).map((o) => o.id);
    throw new Error(
      `Modelo "${wanted.id}" fora do catálogo do perfil "${profile}". Disponíveis: ${available.length ? available.join(', ') : 'nenhum'}.`,
    );
  }
  if (option.efforts.length > 0 && !option.efforts.includes(wanted.effort!)) {
    throw new Error(`Esforço "${wanted.effort}" não existe para ${option.id}. Disponíveis: ${option.efforts.join(', ')}.`);
  }

  // nenhuma sugestão por esforço da atividade pode trocar o modelo
  router.handle({ type: 'settings.modelRules.set', rules: [] });

  const s = router.snapshot();
  const modelField = s.fieldDefs.find((f) => f.kind === 'model');
  if (modelField) {
    for (const type of s.cardTypes) {
      router.handle({
        type: 'settings.type.update',
        typeId: type.id,
        patch: { defaults: { ...type.defaults, [modelField.id]: config.model } },
      });
    }
  }

  router.handle({
    type: 'settings.board.update',
    patch: { runner: { permission: 'full' }, git: { mode: 'branch', gitflow: false, mainBranch: 'main' } },
  });
}
