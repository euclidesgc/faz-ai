import type { ReactNode } from 'react';

export interface ChipOption {
  value: string;
  /** o que aparece no chip; sem isso, o próprio valor */
  label?: ReactNode;
  title?: string;
}

interface Props {
  options: readonly (ChipOption | string)[];
  /** valores marcados */
  values: readonly string[];
  /** recebe a lista inteira já alternada: o valor clicado entra no fim ou sai */
  onChange: (values: string[]) => void;
  /** chips extras antes das opções (ex.: "Todos") */
  before?: ReactNode;
  /** o que vem depois dos chips: avisos de lista vazia, botão de "escolher mais" */
  children?: ReactNode;
}

/** Um chip de alternância avulso, para listas que precisam de um chip com lógica própria. */
export function Chip({ on, title, onClick, children }: { on: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Grupo de chips de alternância (`.chips-editor`): cada opção liga e desliga com um clique.
 * É o padrão de todas as listas de opções fixas do front (tipos, campos de seleção, skills, servidores MCP).
 */
export function ChipsEditor({ options, values, onChange, before, children }: Props) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="chips-editor">
      {before}
      {options.map((raw) => {
        const o = typeof raw === 'string' ? { value: raw } : raw;
        return (
          <Chip key={o.value} on={values.includes(o.value)} title={o.title} onClick={() => toggle(o.value)}>
            {o.label ?? o.value}
          </Chip>
        );
      })}
      {children}
    </div>
  );
}
