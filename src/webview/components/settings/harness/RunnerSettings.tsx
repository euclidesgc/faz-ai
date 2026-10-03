import { Button, Callout, Card, Text } from '@radix-ui/themes';
import { HEARTBEAT_RANGE, RUNNER_PERMISSIONS, TIMEOUT_RANGE } from '../../../../shared/runner';
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
              {t('Rodar agora')}
            </Button>
          )
        }
      >
        {t(
          'O botão "Chamar IA" da conversa de um card roda o {tool} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui se define o que ele pode fazer nessas execuções. O {tool} precisa estar instalado e autenticado nesta máquina{suffix}.',
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
              'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool} sozinho a cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por vez. Sem pendência, nada é executado.',
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
        </Card>
      )}
    </>
  );
}
