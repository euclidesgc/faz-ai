import { aiToolInfo, type AiTool, type HarnessItem, type InstallScope } from '../../../../shared/harness';
import { FLOW_SKILL_NAME } from '../../../../shared/harnessProject';
import { copyTarget } from '../../../../shared/harnessCatalog';
import { harness, ui } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Badge, Button, Card } from '@radix-ui/themes';
import { withGlobalWarning } from './text';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** O servidor MCP do board ou a skill do fluxo: o que o board instala nas ferramentas de IA. */
export type BoardArtifact = 'mcp' | 'skill';

const NAMES: Record<BoardArtifact, string> = { mcp: 'faz-ai', skill: FLOW_SKILL_NAME };

/** Onde cada escopo grava, como a pessoa reconhece o arquivo ou a pasta. */
function places(artifact: BoardArtifact, tool: AiTool): Record<InstallScope, string> {
  const info = aiToolInfo(tool);
  if (artifact === 'mcp') return { user: t(info.mcpUser), project: t(info.mcp) };
  const dir = (scope: InstallScope) =>
    `${scope === 'user' ? '~/' : ''}${copyTarget(tool, 'skill', 'skills', scope)?.path ?? ''}/${FLOW_SKILL_NAME}`;
  return { user: dir('user'), project: dir('project') };
}

/**
 * Instalação do que o board oferece à ferramenta, na seção do tipo (Servidores MCP, Skills): o padrão
 * da ferramenta é o escopo global, que vale em todo projeto sem nenhum arquivo no repositório; "neste
 * projeto" grava na pasta do projeto, que vale sobre o global aqui, e por isso pergunta antes quando
 * já há um global.
 */
export function BoardInstall({ artifact, tool, items }: { artifact: BoardArtifact; tool: AiTool; items: HarnessItem[] }) {
  const ask = useBoardStore((s) => s.ask);
  const name = NAMES[artifact];
  const installedIn = (scope: InstallScope) => items.some((i) => i.kind === artifact && i.scope === scope && i.name === name);
  const where = places(artifact, tool);
  const label = aiToolInfo(tool).label;

  const run = (scope: InstallScope, replace: boolean) =>
    artifact === 'mcp' ? ui.connectAI(tool, scope) : harness.installFlowSkill(tool, scope, replace);

  const install = (scope: InstallScope) => {
    const here = installedIn(scope);
    // o servidor é só a linha de registro do board, refeita com os caminhos atuais; a skill pode ter sido ajustada à mão
    const replacing = here && artifact === 'skill';
    const shadowing = scope === 'project' && installedIn('user');
    if (scope === 'project' && !here && !shadowing) return run(scope, false);
    const lines = [
      replacing
        ? t(
            'Já existe uma skill "{name}" em {where}. Ela será substituída pela versão desta extensão, e o que foi ajustado nela se perde.',
            {
              name,
              where: where[scope],
            },
          )
        : artifact === 'mcp'
          ? t('O registro será gravado em {where}.', { where: where[scope] })
          : t('A skill será instalada em {where}.', { where: where[scope] }),
      shadowing &&
        t(
          'Já está instalado no global. O do projeto passa a valer aqui no lugar dele, e o global continua valendo nos outros projetos. Para o board em qualquer repositório, o global basta.',
        ),
    ].filter(Boolean) as string[];
    ask({
      title:
        scope === 'user' ? t('Instalar no global do {tool}?', { tool: label }) : t('Instalar neste projeto, no {tool}?', { tool: label }),
      message: withGlobalWarning(lines.join('\n\n'), scope),
      confirmLabel: replacing ? t('Substituir') : t('Instalar'),
      onConfirm: () => run(scope, replacing),
    });
  };

  return (
    <Card className="draft-card board-install" aria-label={artifact === 'mcp' ? t('Servidor do board') : t('Skill do fluxo')}>
      <div className="row">
        <strong>{artifact === 'mcp' ? t('Servidor do board (faz-ai)') : t('Skill do fluxo (faz-ai-fluxo)')}</strong>
        <Badge color={installedIn('user') ? 'green' : 'gray'} variant="soft">
          {installedIn('user') ? t('global: instalado') : t('global: não instalado')}
        </Badge>
        <Badge color={installedIn('project') ? 'green' : 'gray'} variant="soft">
          {installedIn('project') ? t('neste projeto: instalado') : t('neste projeto: não instalado')}
        </Badge>
      </div>
      <p className="muted small">
        {artifact === 'mcp'
          ? rich(
              'Deixa a IA ler e atualizar o board nas suas conversas. As execuções pelo board não dependem disso. <b>Padrão da ferramenta</b> grava no global (<code>{user}</code>) sem a pasta do projeto: vale em qualquer repositório aberto com o board, sem arquivo nenhum no projeto. <b>Neste projeto</b> grava em <code>{project}</code>: use para fixar uma versão neste repositório ou num fork.',
              { user: where.user, project: where.project },
            )
          : rich(
              'Ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências. <b>Padrão da ferramenta</b> instala em <code>{user}</code>, para todos os seus projetos. <b>Neste projeto</b> instala em <code>{project}</code>, que vai no repositório: use para fixar uma versão ajustada para este time.',
              { user: where.user, project: where.project },
            )}
      </p>
      <div className="row">
        <Button onClick={() => install('user')}>
          {installedIn('user') ? t('Reinstalar (padrão da ferramenta)') : t('Instalar (padrão da ferramenta)')}
        </Button>
        <Button variant="soft" color="gray" onClick={() => install('project')}>
          {installedIn('project') ? t('Reinstalar neste projeto') : t('Instalar neste projeto')}
        </Button>
      </div>
    </Card>
  );
}
