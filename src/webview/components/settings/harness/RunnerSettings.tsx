import { Callout, Card, Text } from '@radix-ui/themes';
import { HEARTBEAT_RANGE, PARALLEL_RANGE, RUNNER_PERMISSIONS, SUBTASK_PARALLEL_RANGE, TIMEOUT_RANGE } from '../../../../shared/runner';
import { effectiveLimits } from '../../../../shared/orchestration';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { ai, settings } from '../../../commands';
import { ActionButton, FormField, IconWarning, NumberField, SelectField, SwitchField } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { DependsOn } from '../DependsOn';
import { t } from '../../../i18n';

/** O que a IA pode fazer quando o board a executa (pela conversa ou pelo heartbeat), o tempo limite e o heartbeat. */
export function RunnerSettings({ tool }: { tool: AiToolInfo }) {
  const board = useBoardStore((s) => s.state!.board);
  const unsupported = useBoardStore((s) => s.state!.aiRunUnsupported);
  const runner = board.runner;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === runner.permission)!;
  const worktree = board.git.mode === 'worktree';
  const subtasks = effectiveLimits(runner, board.git.mode).subtasks;
  const hasAvailableAgent = board.execProfiles.some((p) => p.scope !== 'builtin');
  return (
    <>
      <SectionHeader
        title={t('Execução pela conversa e heartbeat')}
        actions={
          !unsupported && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Começa uma rodada agora, mesmo com o heartbeat desligado')}
              onClick={() => ai.runHeartbeat()}
            >
              {t('Rodar o heartbeat agora')}
            </ActionButton>
          )
        }
      >
        {t(
          'O botão "Trabalhar na fase" de um card roda o {tool} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui se define o que ele pode fazer nessas execuções ("Refinar com IA" roda só com o board, quando a ferramenta tem esse nível; sem ele, o pedido proíbe mexer em arquivos). O {tool} precisa estar instalado e autenticado nesta máquina{suffix}.',
          {
            tool: tool.label,
            suffix:
              board.aiTool === 'claude'
                ? t('; o board é entregue a ele em cada execução, sem depender do botão acima')
                : t(', e o servidor do board conectado (botão acima)'),
          },
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
          <FormField
            label={t('Agente padrão')}
            hint={t('Executa os cards que não escolhem um agente, nem pela fase. Só os agentes marcados como disponíveis no Harness.')}
          >
            {(id) => (
              <>
                <SelectField
                  id={id}
                  aria-label={t('Agente padrão')}
                  options={board.execProfiles.map((p) => ({
                    value: p.id,
                    label: p.scope === 'builtin' ? t('Agente embutido (sem instruções)') : p.id,
                  }))}
                  value={board.execProfiles.find((p) => p.isDefault)?.id ?? ''}
                  onChange={(defaultAgent) => settings.updateBoard({ runner: { defaultAgent } })}
                />
                {!hasAvailableAgent && (
                  <DependsOn
                    label={t('agentes marcados como disponíveis')}
                    satisfied={hasAvailableAgent}
                    target={{ kind: 'board', section: 'harness-agents' }}
                    targetHint={t('em Harness › Sub-agentes')}
                  />
                )}
              </>
            )}
          </FormField>
          <FormField label={t('Tempo limite por execução')}>
            {(id) => (
              <div className="unit-field">
                <NumberField
                  id={id}
                  min={TIMEOUT_RANGE.min}
                  max={TIMEOUT_RANGE.max}
                  value={runner.timeoutMinutes}
                  onCommit={(timeoutMinutes) => settings.updateBoard({ runner: { timeoutMinutes } })}
                />
                <Text size="2" color="gray">
                  {t('minutos')}
                </Text>
              </div>
            )}
          </FormField>
          <div className="form-divider" />
          <div id="heartbeat">
            <SwitchField
              label={t('Heartbeat ligado')}
              checked={runner.heartbeat}
              onChange={(heartbeat) => settings.updateBoard({ runner: { heartbeat } })}
            />
            <Text as="p" size="1" color="gray">
              {t(
                'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool} sozinho a cada intervalo: ele trabalha nos cards prontos (um card aprovado vai para a próxima coluna na hora e é trabalhado na rodada seguinte), responde às mensagens pendentes, resume as conversas que cresceram, devolve para a IA os cards bloqueados por limite de uso, confere os pull requests mergeados e limpa branches e worktrees que sobraram, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.',
                { tool: tool.label },
              )}
            </Text>
            <FormField label={t('Intervalo')}>
              {(id) => (
                <div className="unit-field">
                  <NumberField
                    id={id}
                    min={HEARTBEAT_RANGE.min}
                    max={HEARTBEAT_RANGE.max}
                    value={runner.heartbeatMinutes}
                    disabled={!runner.heartbeat}
                    onCommit={(heartbeatMinutes) => settings.updateBoard({ runner: { heartbeatMinutes } })}
                  />
                  <Text size="2" color="gray">
                    {t('minutos')}
                  </Text>
                </div>
              )}
            </FormField>
            <SwitchField
              label={t('Refinar os cards novos do Backlog')}
              checked={runner.heartbeatRefine}
              disabled={!runner.heartbeat}
              onChange={(heartbeatRefine) => settings.updateBoard({ runner: { heartbeatRefine } })}
            />
            <Text as="p" size="1" color="gray">
              {t(
                'A cada rodada, o heartbeat refina os cards do Backlog ainda não refinados: a partir do título, a IA melhora a descrição, preenche os campos (modelo, skills, rules) e o checklist, e deixa o card aguardando a sua revisão. Aprovar leva o card para a primeira fase.',
              )}
            </Text>
          </div>
          <div className="form-divider" />
          <>
            <SwitchField
              label={t('Tocar histórias em paralelo')}
              checked={worktree && runner.parallel}
              disabled={!worktree}
              onChange={(parallel) => settings.updateBoard({ runner: { parallel } })}
            />
            <Text as="p" size="1" color="gray">
              {worktree
                ? t(
                    'Ligado, o heartbeat toca várias histórias ao mesmo tempo, cada uma na sua própria pasta (worktree). Mais histórias em paralelo usam mais memória e processador e gastam mais do limite de uso da sua conta. O modo autônomo continua uma por vez, porque as histórias dele são empilhadas.',
                  )
                : t(
                    'Só disponível no modo "Worktree por história" (Configurações > Git). Fora dele as histórias dividem a mesma pasta e causariam conflitos, então o heartbeat toca uma por vez.',
                  )}
            </Text>
            {worktree && runner.parallel && (
              <FormField label={t('Histórias ao mesmo tempo')}>
                {(id) => (
                  <div className="unit-field">
                    <NumberField
                      id={id}
                      min={PARALLEL_RANGE.min}
                      max={PARALLEL_RANGE.max}
                      value={runner.parallelStories}
                      onCommit={(parallelStories) => settings.updateBoard({ runner: { parallelStories } })}
                    />
                    <Text size="2" color="gray">
                      {t('histórias')}
                    </Text>
                  </div>
                )}
              </FormField>
            )}
            <FormField label={t('Sub-tarefas em paralelo por história')}>
              {(id) => (
                <div className="unit-field">
                  <NumberField
                    id={id}
                    min={SUBTASK_PARALLEL_RANGE.min}
                    max={SUBTASK_PARALLEL_RANGE.max}
                    value={runner.parallelSubtasks}
                    onCommit={(parallelSubtasks) => settings.updateBoard({ runner: { parallelSubtasks } })}
                  />
                  <Text size="2" color="gray">
                    {t('sub-tarefas')}
                  </Text>
                </div>
              )}
            </FormField>
            <Text as="p" size="1" color="gray">
              {t('Efetivo: {effective}. As sub-tarefas escrevem na mesma pasta da história, então rodam uma por vez.', {
                effective: subtasks.effective,
              })}
            </Text>
          </>
        </Card>
      )}
    </>
  );
}
