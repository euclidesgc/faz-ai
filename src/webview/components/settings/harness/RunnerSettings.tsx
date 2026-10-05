import { Button, Callout, Card, Text } from '@radix-ui/themes';
import { HEARTBEAT_RANGE, PARALLEL_RANGE, RUNNER_PERMISSIONS, TIMEOUT_RANGE } from '../../../../shared/runner';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { ai, settings } from '../../../commands';
import { FormField, IconWarning, NumberField, SelectField, SwitchField } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { t } from '../../../i18n';

/** O que a IA pode fazer quando o board a executa (pela conversa ou pelo heartbeat), o tempo limite e o heartbeat. */
export function RunnerSettings({ tool }: { tool: AiToolInfo }) {
  const board = useBoardStore((s) => s.state!.board);
  const unsupported = useBoardStore((s) => s.state!.aiRunUnsupported);
  const runner = board.runner;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === runner.permission)!;
  const worktree = board.git.mode === 'worktree';
  return (
    <>
      <SectionHeader
        title={t('Execução pela conversa e heartbeat')}
        actions={
          !unsupported && (
            <Button
              variant="soft"
              color="gray"
              title={t('Começa uma rodada agora, mesmo com o heartbeat desligado')}
              onClick={() => ai.runHeartbeat()}
            >
              {t('Rodar o heartbeat agora')}
            </Button>
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
        <Callout.Root color="orange">
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
            <Callout.Root color="orange" size="1">
              <Callout.Icon>
                <IconWarning />
              </Callout.Icon>
              <Callout.Text>{t(permission.hint)}</Callout.Text>
            </Callout.Root>
          )}
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
          <SwitchField
            label={t('Heartbeat ligado')}
            checked={runner.heartbeat}
            onChange={(heartbeat) => settings.updateBoard({ runner: { heartbeat } })}
          />
          <Text as="p" size="1" color="gray">
            {t(
              'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool} sozinho a cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.',
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
                  onCommit={(heartbeatMinutes) => settings.updateBoard({ runner: { heartbeatMinutes } })}
                />
                <Text size="2" color="gray">
                  {t('minutos')}
                </Text>
              </div>
            )}
          </FormField>
          <div className="form-divider" />
          <SwitchField
            label={t('Tocar histórias em paralelo')}
            checked={worktree && runner.parallel}
            disabled={!worktree}
            onChange={(parallel) => settings.updateBoard({ runner: { parallel } })}
          />
          <Text as="p" size="1" color="gray">
            {worktree
              ? t(
                  'Ligado, o heartbeat toca várias histórias ao mesmo tempo, cada uma na sua própria pasta (worktree). Mais histórias em paralelo usam mais memória e processador e gastam mais do limite de uso da sua conta. O modo autônomo continua uma por vez, porque as histórias dele são empilhadas. As sub-tarefas independentes de cada história já rodam em paralelo, sem limite, conforme o plano.',
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
        </Card>
      )}
    </>
  );
}
