import { Button, Callout, Card, Text } from '@radix-ui/themes';
import { HEARTBEAT_RANGE, RUNNER_PERMISSIONS, TIMEOUT_RANGE } from '../../../../shared/runner';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { ai, settings } from '../../../commands';
import { FormField, IconWarning, NumberField, SelectField, SwitchField } from '../../ui';
import { SectionHeader } from '../SectionHeader';

/** O que a IA pode fazer quando o board a executa (pela conversa ou pelo heartbeat), o tempo limite e o heartbeat. */
export function RunnerSettings({ tool }: { tool: AiToolInfo }) {
  const board = useBoardStore((s) => s.state!.board);
  const unsupported = useBoardStore((s) => s.state!.aiRunUnsupported);
  const runner = board.runner;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === runner.permission)!;
  return (
    <>
      <SectionHeader
        title="Execução pela conversa e heartbeat"
        actions={
          !unsupported && (
            <Button
              variant="soft"
              color="gray"
              title="Começa uma rodada agora, mesmo com o heartbeat desligado"
              onClick={() => ai.runHeartbeat()}
            >
              Rodar agora
            </Button>
          )
        }
      >
        O botão "Chamar IA" da conversa de um card roda o {tool.label} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui
        se define o que ele pode fazer nessas execuções. O {tool.label} precisa estar instalado e autenticado nesta máquina
        {board.aiTool === 'claude'
          ? '; o board é entregue a ele em cada execução, sem depender do botão acima'
          : ', e o servidor do board conectado (botão acima)'}
        .
      </SectionHeader>
      {unsupported ? (
        <Callout.Root color="orange">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{unsupported}</Callout.Text>
        </Callout.Root>
      ) : (
        <Card className="runner-settings form-card" aria-label="Execução pela IA">
          <FormField label="O que a IA pode fazer" hint={runner.permission === 'full' ? undefined : permission.hint}>
            {(id) => (
              <SelectField
                id={id}
                aria-label="O que a IA pode fazer"
                options={RUNNER_PERMISSIONS}
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
              <Callout.Text>{permission.hint}</Callout.Text>
            </Callout.Root>
          )}
          <FormField label="Tempo limite por execução">
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
                  minutos
                </Text>
              </div>
            )}
          </FormField>
          <div className="form-divider" />
          <SwitchField
            label="Heartbeat ligado"
            checked={runner.heartbeat}
            onChange={(heartbeat) => settings.updateBoard({ runner: { heartbeat } })}
          />
          <Text as="p" size="1" color="gray">
            Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool.label} sozinho a
            cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por
            vez. Sem pendência, nada é executado.
          </Text>
          <FormField label="Intervalo">
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
                  minutos
                </Text>
              </div>
            )}
          </FormField>
        </Card>
      )}
    </>
  );
}
