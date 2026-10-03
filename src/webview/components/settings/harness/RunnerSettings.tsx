import { HEARTBEAT_RANGE, RUNNER_PERMISSIONS, TIMEOUT_RANGE } from '../../../../shared/runner';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { ai, settings } from '../../../commands';
import { Button, EnumSelect, FieldRow, NumberField } from '../../ui';

/** O que a IA pode fazer quando o board a executa (pela conversa ou pelo heartbeat), o tempo limite e o heartbeat. */
export function RunnerSettings({ tool }: { tool: AiToolInfo }) {
  const board = useBoardStore((s) => s.state!.board);
  const unsupported = useBoardStore((s) => s.state!.aiRunUnsupported);
  const runner = board.runner;
  return (
    <>
      <h3 className="section-head">Execução pela conversa e heartbeat</h3>
      <p className="muted small">
        O botão "Chamar IA" da conversa de um card roda o {tool.label} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui
        se define o que ele pode fazer nessas execuções. O {tool.label} precisa estar instalado e autenticado nesta máquina
        {board.aiTool === 'claude'
          ? '; o board é entregue a ele em cada execução, sem depender do botão acima'
          : ', e o servidor do board conectado (botão acima)'}
        .
      </p>
      {unsupported ? (
        <p className="banner warn">{unsupported}</p>
      ) : (
        <section className="settings-block runner-settings">
          <FieldRow label="O que a IA pode fazer">
            <EnumSelect
              options={RUNNER_PERMISSIONS}
              value={runner.permission}
              onChange={(permission) => settings.updateBoard({ runner: { permission } })}
            />
          </FieldRow>
          <p className={`small ${runner.permission === 'full' ? 'banner warn' : 'muted'}`}>
            {RUNNER_PERMISSIONS.find((p) => p.value === runner.permission)!.hint}
          </p>
          <FieldRow label="Tempo limite por execução">
            <div className="row">
              <NumberField
                min={TIMEOUT_RANGE.min}
                max={TIMEOUT_RANGE.max}
                value={runner.timeoutMinutes}
                onCommit={(timeoutMinutes) => settings.updateBoard({ runner: { timeoutMinutes } })}
              />
              <span className="muted">minutos</span>
            </div>
          </FieldRow>
          <h4>Heartbeat</h4>
          <p className="muted small">
            Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool.label} sozinho a
            cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por
            vez. Sem pendência, nada é executado.
          </p>
          <label className="switch">
            <input
              type="checkbox"
              checked={runner.heartbeat}
              onChange={(e) => settings.updateBoard({ runner: { heartbeat: e.target.checked } })}
            />
            Heartbeat ligado
          </label>
          <FieldRow label="Intervalo">
            <div className="row">
              <NumberField
                min={HEARTBEAT_RANGE.min}
                max={HEARTBEAT_RANGE.max}
                value={runner.heartbeatMinutes}
                onCommit={(heartbeatMinutes) => settings.updateBoard({ runner: { heartbeatMinutes } })}
              />
              <span className="muted">minutos</span>
              <Button title="Começa uma rodada agora, mesmo com o heartbeat desligado" onClick={() => ai.runHeartbeat()}>
                Rodar agora
              </Button>
            </div>
          </FieldRow>
        </section>
      )}
    </>
  );
}
