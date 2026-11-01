import { baseValue } from '../../../../shared/harness';
import { Badge, Checkbox } from '@radix-ui/themes';
import { AGENT_TOOLS, extraToolNames, mcpToolPattern } from '../../../../shared/agentTools';
import type { AiTool } from '../../../../shared/harness';
import { Chip, IconClose, SelectField } from '../../ui';
import { t } from '../../../i18n';

/** Estado da caixa da categoria: todas, algumas (intermediário) ou nenhuma das ferramentas marcadas. */
function groupState(names: string[], value: string[]): boolean | 'indeterminate' {
  const n = names.filter((x) => value.includes(x)).length;
  return n === 0 ? false : n === names.length ? true : 'indeterminate';
}

/** Item sentinela do seletor de servidores: o Select do Radix não aceita valor vazio. */
const NONE = '__none';

interface Props {
  tool: AiTool;
  value: string[];
  onChange: (next: string[]) => void;
  /** a lista é de ferramentas negadas: marcar estreita o agente, então os avisos de "amplia o escopo" não valem */
  deny?: boolean;
  /** servidores MCP do board que podem entrar como `mcp__<nome>__*` (só na lista de disponíveis) */
  servers?: string[];
  /** prefixo do nome acessível de cada caixa; distingue a lista de negadas da de disponíveis */
  prefix?: string;
}

/**
 * As ferramentas por categoria (Leitura, Edição de arquivos, Comandos, Rede, Outros agentes), cada uma com a caixa da
 * categoria e a lista detalhada dentro, com o aviso nos
 * grupos que ampliam o que o agente alcança. O que o arquivo já tem e a lista não conhece (servidores MCP,
 * `Bash(git diff *)`) aparece como chip marcado, que dá para tirar; `servers` oferece acrescentar um servidor.
 */
export function ToolChecklist({ tool, value, onChange, deny = false, servers = [], prefix = '' }: Props) {
  const groups = baseValue(AGENT_TOOLS, tool) ?? [];
  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((v) => v !== name));
  // marcar a categoria marca todas as ferramentas dela; desmarcar tira todas (o resto da lista fica)
  const toggleGroup = (names: string[], on: boolean) =>
    onChange(on ? [...value, ...names.filter((n) => !value.includes(n))] : value.filter((v) => !names.includes(v)));
  const extras = extraToolNames(tool, value);
  const addable = servers.filter((s) => !value.includes(mcpToolPattern(s)));
  return (
    <div className="tool-checklist">
      {groups.map((g) => (
        <fieldset key={g.id} className="tool-group">
          <legend>
            <Checkbox
              className="tool-group-check"
              aria-label={`${prefix}${t('Categoria')} ${t(g.label)}`}
              checked={groupState(
                g.tools.map((x) => x.name),
                value,
              )}
              onCheckedChange={(v) =>
                toggleGroup(
                  g.tools.map((x) => x.name),
                  v === true,
                )
              }
            />
            <span className="tool-group-name">{t(g.label)}</span>
            {g.widens && !deny && (
              <Badge color="amber" variant="soft" title={t('Marcar uma ferramenta deste grupo amplia o que o agente pode fazer.')}>
                {t('amplia o escopo')}
              </Badge>
            )}
            <span className="muted small">{t(g.hint)}</span>
          </legend>
          <div className="tool-options">
            {g.tools.map((x) => (
              <label key={x.name} className="tool-option" title={t(x.hint)}>
                <Checkbox
                  aria-label={`${prefix}${x.name}`}
                  checked={value.includes(x.name)}
                  onCheckedChange={(v) => toggle(x.name, v === true)}
                />
                <code>{x.name}</code>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {(extras.length > 0 || addable.length > 0) && (
        <div className="tool-extras">
          {extras.map((name) => (
            <Chip key={name} on title={t('Tirar {name} da lista', { name })} onClick={() => toggle(name, false)}>
              {name} <IconClose />
            </Chip>
          ))}
          {addable.length > 0 && !deny && (
            <SelectField
              size="1"
              aria-label={t('Acrescentar servidor MCP')}
              options={[
                { value: NONE, label: t('Acrescentar servidor MCP…') },
                ...addable.map((s) => ({ value: s, label: mcpToolPattern(s) })),
              ]}
              value={NONE}
              onChange={(s) => s !== NONE && onChange([...value, mcpToolPattern(s)])}
            />
          )}
        </div>
      )}
    </div>
  );
}
