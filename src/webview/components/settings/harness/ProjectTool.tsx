import { Button, RadioGroup } from '@radix-ui/themes';
import { AI_TOOLS, type AiTool } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { settings, ui } from '../../../commands';
import { SectionHeader } from '../SectionHeader';
import { t } from '../../../i18n';

/** Escolha da ferramenta de IA do projeto (uma por vez) e o registro do MCP do board nela. */
export function ProjectTool({ tool }: { tool: AiToolInfo }) {
  const chooseTool = (id: AiTool) => id !== tool.id && settings.updateBoard({ aiTool: id });
  return (
    <>
      <SectionHeader
        title={t('Ferramenta deste projeto')}
        actions={<Button onClick={() => ui.connectAI()}>{t('Conectar o {tool} ao board (MCP)', { tool: tool.label })}</Button>}
      >
        {t(
          'O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas. O botão registra o servidor do board em {mcp}.',
          { mcp: t(tool.mcp) },
        )}
      </SectionHeader>
      <RadioGroup.Root value={tool.id} onValueChange={(id) => chooseTool(id as AiTool)} aria-label={t('Ferramenta de IA do projeto')}>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t('Ferramenta')}</th>
              <th>{t('Regras')}</th>
              <th>Skills</th>
              <th>MCP</th>
            </tr>
          </thead>
          <tbody>
            {AI_TOOLS.map((x) => (
              <tr key={x.id} className={x.id === tool.id ? '' : 'off'}>
                <td>
                  <RadioGroup.Item value={x.id} aria-label={x.label} />
                </td>
                <td>{x.label}</td>
                <td>
                  <code>{x.rules}</code>
                </td>
                <td>
                  <code>{x.skills}</code>
                </td>
                <td>
                  <code>{t(x.mcp)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RadioGroup.Root>
    </>
  );
}
