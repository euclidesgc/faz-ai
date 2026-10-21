import { baseInfo, type AiTool } from '../../../../shared/harness';
import { useAction } from '../../../useAction';
import { ui } from '../../../commands';
import { Card } from '@radix-ui/themes';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';

/** Conecta a ferramenta de IA ao MCP do board; vale para qualquer ferramenta, sem exclusividade entre elas. */
export function BoardInstall({ tool }: { tool: AiTool }) {
  const connecting = useAction(() => ui.connectAI(tool));
  return (
    <Card className="draft-card board-install" aria-label={t('Conectar ao board')}>
      <div className="row">
        <strong>{t('Conectar ao board')}</strong>
      </div>
      <p className="muted small">{t('Conecta a ferramenta de IA ao MCP do board.')}</p>
      <div className="row">
        <ActionButton
          loading={connecting.busy}
          hint={t('Registra o servidor MCP do board em {tool}.', { tool: baseInfo(tool).label })}
          onClick={() => void connecting.run()}
        >
          {t('Conectar ao board')}
        </ActionButton>
      </div>
    </Card>
  );
}
