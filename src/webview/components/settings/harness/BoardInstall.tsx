import { baseInfo, type AiTool, type HarnessItem, type InstallScope } from '../../../../shared/harness';
import { FLOW_SKILL_NAME } from '../../../../shared/harnessProject';
import { copyTarget } from '../../../../shared/harnessCatalog';
import { useAction } from '../../../useAction';
import { harness, ui } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Badge, Card } from '@radix-ui/themes';
import { withGlobalWarning } from './text';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** O servidor MCP do board ou a skill do fluxo: o que o board instala nas ferramentas de IA. */
export type BoardArtifact = 'mcp' | 'skill';

const NAMES: Record<BoardArtifact, string> = { mcp: 'faz-ai', skill: FLOW_SKILL_NAME };

/** Onde o global grava, como a pessoa reconhece o arquivo ou a pasta. */
function place(artifact: BoardArtifact, tool: AiTool): string {
  if (artifact === 'mcp') return t(baseInfo(tool).mcpUser);
  return `~/${copyTarget(tool, 'skill', 'skills', 'user')?.path ?? ''}/${FLOW_SKILL_NAME}`;
}

/**
 * Instalação do que o board oferece à ferramenta, na seção do tipo (Servidores MCP, Skills): só o escopo
 * global, que vale em todo projeto sem nenhum arquivo no repositório. A exceção é o servidor no Cursor,
 * que fica no projeto.
 */
export function BoardInstall({ artifact, tool, items }: { artifact: BoardArtifact; tool: AiTool; items: HarnessItem[] }) {
  const ask = useBoardStore((s) => s.ask);
  const name = NAMES[artifact];
  const installedIn = (scope: InstallScope) => items.some((i) => i.kind === artifact && i.scope === scope && i.name === name);
  const where = place(artifact, tool);
  const label = baseInfo(tool).label;

  // registrar o servidor chama a CLI da ferramenta; o botão clicado mostra a espera até o host confirmar
  const installing = useAction((replace: boolean) => (artifact === 'mcp' ? ui.connectAI(tool) : harness.installFlowSkill(tool, replace)));
  const run = (replace: boolean) => void installing.run(replace);

  const install = () => {
    // o servidor é só a linha de registro do board, refeita com os caminhos atuais; a skill pode ter sido ajustada à mão
    const replacing = installedIn('user') && artifact === 'skill';
    const message = replacing
      ? t('Já existe uma skill "{name}" em {where}. Ela será substituída pela versão desta extensão, e o que foi ajustado nela se perde.', {
          name,
          where,
        })
      : artifact === 'mcp'
        ? t('O registro será gravado em {where}.', { where })
        : t('A skill será instalada em {where}.', { where });
    ask({
      title: t('Instalar no global do {tool}?', { tool: label }),
      message: withGlobalWarning(message, 'user'),
      confirmLabel: replacing ? t('Substituir') : t('Instalar'),
      onConfirm: () => run(replacing),
    });
  };

  // no Cursor o servidor do board é só do projeto: o global é um processo para todas as janelas, que
  // não sabe qual board atender. O board grava o do projeto sozinho ao abrir no Cursor.
  if (artifact === 'mcp' && tool === 'cursor')
    return (
      <Card className="draft-card board-install" aria-label={t('Servidor do board')}>
        <div className="row">
          <strong>{t('Servidor do board (faz-ai)')}</strong>
          <Badge color={installedIn('project') ? 'green' : 'gray'} variant="soft">
            {installedIn('project') ? t('neste projeto: instalado') : t('neste projeto: não instalado')}
          </Badge>
        </div>
        <p className="muted small">
          {rich(
            'No Cursor, o servidor do board fica em <code>{project}</code>, fora do git. O global do Cursor é um processo só para todas as janelas e não sabe qual board atender. O board grava este registro sozinho ao abrir no Cursor; se o "faz-ai" aparecer desligado em Cursor Settings → MCP, ligue.',
            { project: '.cursor/mcp.json' },
          )}
        </p>
        <div className="row">
          <ActionButton
            loading={installing.busy}
            hint={t('Grava o registro do board em .cursor/mcp.json, na pasta do projeto.')}
            onClick={() => run(false)}
          >
            {installedIn('project') ? t('Reinstalar neste projeto') : t('Instalar neste projeto')}
          </ActionButton>
        </div>
      </Card>
    );

  return (
    <Card className="draft-card board-install" aria-label={artifact === 'mcp' ? t('Servidor do board') : t('Skill do fluxo')}>
      <div className="row">
        <strong>{artifact === 'mcp' ? t('Servidor do board (faz-ai)') : t('Skill do fluxo (faz-ai-fluxo)')}</strong>
        <Badge color={installedIn('user') ? 'green' : 'gray'} variant="soft">
          {installedIn('user') ? t('global: instalado') : t('global: não instalado')}
        </Badge>
      </div>
      <p className="muted small">
        {artifact === 'mcp'
          ? rich(
              'Deixa a IA ler e atualizar o board nas suas conversas. As execuções pelo board não dependem disso. Grava no global (<code>{user}</code>): vale em qualquer repositório aberto com o board, sem arquivo nenhum no projeto.',
              { user: where },
            )
          : rich(
              'Ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências. Instala em <code>{user}</code>, para todos os seus projetos.',
              { user: where },
            )}
      </p>
      <div className="row">
        <ActionButton
          loading={installing.busy}
          hint={
            artifact === 'mcp'
              ? t('Registra o servidor do board no global da ferramenta: vale em todos os projetos, sem arquivo no repositório.')
              : t('Instala a skill na sua pasta de usuário: vale em todos os projetos.')
          }
          onClick={install}
        >
          {installedIn('user') ? t('Reinstalar (padrão da ferramenta)') : t('Instalar (padrão da ferramenta)')}
        </ActionButton>
      </div>
    </Card>
  );
}
