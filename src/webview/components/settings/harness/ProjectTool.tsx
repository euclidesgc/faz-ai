import { Button, RadioGroup } from '@radix-ui/themes';
import { AI_TOOLS, type AiTool } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { settings, ui } from '../../../commands';
import { SectionHeader } from '../SectionHeader';

/** Escolha da ferramenta de IA do projeto (uma por vez) e o registro do MCP do board nela. */
export function ProjectTool({ tool }: { tool: AiToolInfo }) {
  const chooseTool = (id: AiTool) => id !== tool.id && settings.updateBoard({ aiTool: id });
  return (
    <>
      <SectionHeader
        title="Ferramenta deste projeto"
        actions={<Button onClick={() => ui.connectAI()}>Conectar o {tool.label} ao board (MCP)</Button>}
      >
        O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é
        registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas. O
        botão registra o servidor do board em {tool.mcp}.
      </SectionHeader>
      <RadioGroup.Root value={tool.id} onValueChange={(id) => chooseTool(id as AiTool)} aria-label="Ferramenta de IA do projeto">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Ferramenta</th>
              <th>Regras</th>
              <th>Skills</th>
              <th>MCP</th>
            </tr>
          </thead>
          <tbody>
            {AI_TOOLS.map((t) => (
              <tr key={t.id} className={t.id === tool.id ? '' : 'off'}>
                <td>
                  <RadioGroup.Item value={t.id} aria-label={t.label} />
                </td>
                <td>{t.label}</td>
                <td>
                  <code>{t.rules}</code>
                </td>
                <td>
                  <code>{t.skills}</code>
                </td>
                <td>
                  <code>{t.mcp}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RadioGroup.Root>
    </>
  );
}
