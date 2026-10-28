import { Badge, Checkbox, Text } from '@radix-ui/themes';
import { isActive } from '../../../../shared/artifacts';
import { mappingLabel, supportsToolList, toolsFor, type NeutralTool } from '../../../../shared/artifactTools';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';

/** Os servidores MCP ativos do board: o que `mcp` vira na ferramenta do projeto (um glob por servidor). */
export function useActiveMcpServers(): string[] {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts);
  return (artifacts ?? []).filter((a) => a.kind === 'mcp' && !a.missing && isActive(a) && a.name !== 'faz-ai').map((a) => a.name);
}

/**
 * A grade de tools neutras do formulário: uma caixa por tool, com o aviso de sensível, a marca de sugerida pela IA
 * e, embaixo, o nome que a tool tem na ferramenta do projeto.
 */
export function ToolGrid({
  kind,
  value,
  onChange,
  suggested = [],
  disabled,
}: {
  kind: 'skill' | 'agent';
  value: readonly NeutralTool[];
  onChange: (next: NeutralTool[]) => void;
  /** as que a última sugestão (ou o assistente) recomendou */
  suggested?: readonly NeutralTool[];
  disabled?: boolean;
}) {
  const tool = useBoardStore((s) => s.state!.board.aiTool);
  const servers = useActiveMcpServers();
  const list = supportsToolList(tool);
  const toggle = (id: NeutralTool, on: boolean) =>
    onChange(
      toolsFor(kind)
        .map((x) => x.id)
        .filter((x) => (x === id ? on : value.includes(x))),
    );
  return (
    <div className="tool-grid-wrap">
      {!list && <p className="muted small">{t('Sem lista de tools nesta ferramenta.')}</p>}
      <ul className="tool-grid">
        {toolsFor(kind).map((info) => {
          const mapped = list ? mappingLabel(tool, info.id, servers) : null;
          return (
            <li key={info.id} className="tool-grid-item">
              <Text as="label" size="2" className="tool-grid-label">
                <Checkbox
                  checked={value.includes(info.id)}
                  disabled={disabled}
                  onCheckedChange={(on) => toggle(info.id, on === true)}
                  aria-describedby={`tool-${info.id}-hint`}
                />
                <span className="tool-grid-name">{t(info.label)}</span>
                {info.sensitive && (
                  <Badge color="orange" variant="soft" size="1">
                    {t('sensível')}
                  </Badge>
                )}
                {suggested.includes(info.id) && (
                  <Badge color="indigo" variant="soft" size="1">
                    {t('sugerida')}
                  </Badge>
                )}
              </Text>
              <span id={`tool-${info.id}-hint`} className="muted small">
                {t(info.hint)}
              </span>
              {mapped && <code className="tool-grid-map">{mapped}</code>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
