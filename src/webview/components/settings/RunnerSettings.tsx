import { Callout, Card } from '@radix-ui/themes';
import {
  FAILURE_LIMIT_RANGE,
  HEARTBEAT_RANGE,
  IDLE_RANGE,
  PARALLEL_RANGE,
  RUNNER_PERMISSIONS,
  SUBTASK_PARALLEL_RANGE,
  TIMEOUT_RANGE,
} from '../../../shared/runner';
import { effectiveLimits } from '../../../shared/orchestration';
import { useBoardStore } from '../../store/boardStore';
import { ai, settings } from '../../commands';
import { ActionButton, FormField, IconWarning, NumberField, SelectField, Stack, SwitchField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { t } from '../../i18n';

/** O que a IA pode fazer quando o board a executa (pela conversa ou pelo heartbeat), o tempo limite e o heartbeat. */
export function RunnerSettings() {
  const board = useBoardStore((s) => s.state!.board);
  const unsupported = useBoardStore((s) => s.state!.aiRunUnsupported);
  const runner = board.runner;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === runner.permission)!;
  const worktree = board.git.mode === 'worktree';
  const subtasks = effectiveLimits(runner, board.git.mode).subtasks;
  return (
    <>
      <SectionHeader title={t('Execução pela IA')}>
        {t(
          'O botão "Trabalhar na fase" de um card roda a IA dele em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui se define o que ela pode fazer nessas execuções ("Refinar com IA" roda só com o board, quando a ferramenta tem esse nível; sem ele, o pedido proíbe mexer em arquivos). O agente de cada card precisa estar instalado, autenticado e ligado em Conectar agentes.',
        )}
      </SectionHeader>
      {unsupported ? (
        <Callout.Root color="amber">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(unsupported)}</Callout.Text>
        </Callout.Root>
      ) : (
        <Card className="runner-settings form-card" aria-label={t('Execução pela IA')}>
          <FormField label={t('O que a IA pode fazer')} hint={runner.permission === 'full' ? undefined : t(permission.hint)}>
            {(id) => (
              <SelectField
                id={id}
                aria-label={t('O que a IA pode fazer')}
                options={RUNNER_PERMISSIONS.map((p) => ({ ...p, label: t(p.label) }))}
                value={runner.permission}
                onChange={(p) => settings.updateBoard({ runner: { permission: p } })}
              />
            )}
          </FormField>
          {runner.permission === 'full' && (
            <Callout.Root color="amber" size="1">
              <Callout.Icon>
                <IconWarning />
              </Callout.Icon>
              <Callout.Text>{t(permission.hint)}</Callout.Text>
            </Callout.Root>
          )}
          {/* o regime saiu daqui (história 7): é consequência do que cada perfil prova, com a ciência por perfil
              no Conectar. Quem ligou o compatível do board antes continua com ele, e só pode voltar ao exclusivo */}
          {runner.admissionRegime === 'compatible' && (
            <Callout.Root color="amber" size="1">
              <Callout.Icon>
                <IconWarning />
              </Callout.Icon>
              <Callout.Text>
                {t(
                  'Regime compatível ligado para o board inteiro (revisão {n}), de uma versão anterior. Agora o regime é de cada perfil: a ciência é dada no Conectar, em Conectar agentes.',
                  { n: runner.compatibilityReviewRevision },
                )}
              </Callout.Text>
              <div className="row end">
                <ActionButton
                  size="1"
                  variant="soft"
                  hint={t(
                    'Desliga o regime compatível do board. Os perfis com ciência seguem no compatível; os que não passam pelo Conectar (cópias, personalizados) recebem a ciência nos detalhes deles, em Conectar agentes.',
                  )}
                  onClick={() => settings.updateBoard({ runner: { admissionRegime: 'exclusive' } })}
                >
                  {t('Voltar ao exclusivo')}
                </ActionButton>
              </div>
            </Callout.Root>
          )}
          <FormField label={t('Tempo limite por execução')}>
            {(id) => (
              <NumberField
                id={id}
                min={TIMEOUT_RANGE.min}
                max={TIMEOUT_RANGE.max}
                value={runner.timeoutMinutes}
                unit={t('minutos')}
                onCommit={(timeoutMinutes) => settings.updateBoard({ runner: { timeoutMinutes } })}
              />
            )}
          </FormField>
          <FormField
            label={t('Encerrar sem atividade após')}
            hint={t(
              'Encerra a execução de card quando a ferramenta passa esse tempo sem nenhuma saída. 0 desliga. Vale só para execuções com stream; saída em texto, modo API e o chat ficam só com o tempo limite.',
            )}
          >
            {(id) => (
              <NumberField
                id={id}
                min={IDLE_RANGE.min}
                max={IDLE_RANGE.max}
                value={runner.idleMinutes}
                unit={t('minutos')}
                onCommit={(idleMinutes) => settings.updateBoard({ runner: { idleMinutes } })}
              />
            )}
          </FormField>
          <FormField
            label={t('Falhas iguais até bloquear')}
            hint={t('Depois dessa quantidade de falhas iguais na mesma história, o board a bloqueia.')}
          >
            {(id) => (
              <NumberField
                id={id}
                min={FAILURE_LIMIT_RANGE.min}
                max={FAILURE_LIMIT_RANGE.max}
                value={runner.failureLimit}
                unit={t('falhas')}
                onCommit={(failureLimit) => settings.updateBoard({ runner: { failureLimit } })}
              />
            )}
          </FormField>
        </Card>
      )}
      {!unsupported && (
        <>
          <SectionHeader
            id="heartbeat"
            title={t('Heartbeat')}
            actions={
              <ActionButton
                variant="soft"
                color="gray"
                hint={t('Começa uma rodada agora, mesmo com o heartbeat desligado')}
                onClick={() => ai.runHeartbeat()}
              >
                {t('Rodar o heartbeat agora')}
              </ActionButton>
            }
          />
          <Card className="runner-settings form-card" aria-label={t('Heartbeat')}>
            <Stack>
              <SwitchField
                label={t('Heartbeat ligado')}
                hint={t(
                  'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama sozinho, a cada intervalo, o agente de cada card: ele trabalha nos cards prontos (um card aprovado vai para a próxima coluna na hora e é trabalhado na rodada seguinte), responde às mensagens pendentes, resume as conversas que cresceram, devolve para a IA os cards bloqueados por limite de uso, confere os pull requests mergeados e limpa branches e worktrees que sobraram, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.',
                )}
                checked={runner.heartbeat}
                onChange={(heartbeat) => settings.updateBoard({ runner: { heartbeat } })}
              />
              <Stack indent>
                <FormField label={t('Intervalo')}>
                  {(id) => (
                    <NumberField
                      id={id}
                      min={HEARTBEAT_RANGE.min}
                      max={HEARTBEAT_RANGE.max}
                      value={runner.heartbeatMinutes}
                      unit={t('minutos')}
                      disabled={!runner.heartbeat}
                      onCommit={(heartbeatMinutes) => settings.updateBoard({ runner: { heartbeatMinutes } })}
                    />
                  )}
                </FormField>
                <SwitchField
                  label={t('Refinar os cards novos do Backlog')}
                  hint={t(
                    'A cada rodada, o heartbeat refina os cards do Backlog ainda não refinados: a partir do título, a IA melhora a descrição, preenche os campos (modelo, skills, rules) e o checklist, e deixa o card aguardando a sua revisão. Aprovar leva o card para a primeira fase.',
                  )}
                  checked={runner.heartbeatRefine}
                  disabled={!runner.heartbeat}
                  onChange={(heartbeatRefine) => settings.updateBoard({ runner: { heartbeatRefine } })}
                />
              </Stack>
            </Stack>
          </Card>
          <SectionHeader title={t('Paralelismo')} />
          <Card className="runner-settings form-card" aria-label={t('Paralelismo')}>
            <Stack>
              <SwitchField
                label={t('Tocar histórias em paralelo')}
                hint={
                  worktree
                    ? t(
                        'Ligado, o heartbeat toca várias histórias ao mesmo tempo, cada uma na sua própria pasta (worktree). Mais histórias em paralelo usam mais memória e processador e gastam mais do limite de uso da sua conta. O modo autônomo continua uma por vez, porque as histórias dele são empilhadas.',
                      )
                    : t(
                        'Só disponível no modo "Worktree por história" (Configurações > Git). Fora dele as histórias dividem a mesma pasta e causariam conflitos, então o heartbeat toca uma por vez.',
                      )
                }
                checked={worktree && runner.parallel}
                disabled={!worktree}
                onChange={(parallel) => settings.updateBoard({ runner: { parallel } })}
              />
              {worktree && runner.parallel && (
                <Stack indent>
                  <FormField label={t('Histórias ao mesmo tempo')}>
                    {(id) => (
                      <NumberField
                        id={id}
                        min={PARALLEL_RANGE.min}
                        max={PARALLEL_RANGE.max}
                        value={runner.parallelStories}
                        unit={t('histórias')}
                        onCommit={(parallelStories) => settings.updateBoard({ runner: { parallelStories } })}
                      />
                    )}
                  </FormField>
                </Stack>
              )}
              <FormField
                label={t('Sub-tarefas em paralelo por história')}
                hint={t('Efetivo: {effective}. As sub-tarefas escrevem na mesma pasta da história, então rodam uma por vez.', {
                  effective: subtasks.effective,
                })}
              >
                {(id) => (
                  <NumberField
                    id={id}
                    min={SUBTASK_PARALLEL_RANGE.min}
                    max={SUBTASK_PARALLEL_RANGE.max}
                    value={runner.parallelSubtasks}
                    unit={t('sub-tarefas')}
                    onCommit={(parallelSubtasks) => settings.updateBoard({ runner: { parallelSubtasks } })}
                  />
                )}
              </FormField>
            </Stack>
          </Card>
        </>
      )}
    </>
  );
}
