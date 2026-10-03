import { techColor, techIcon } from '../../techLogos';
import type { ChipOption } from './ChipsEditor';

/** Logo da tecnologia que o texto nomeia, na cor da marca; nada quando o texto não é uma tecnologia conhecida. */
export function TechLogo({ name }: { name: string }) {
  const icon = techIcon(name);
  if (!icon) return null;
  return (
    <svg className="tech-logo" viewBox="0 0 24 24" aria-hidden="true" fill={techColor(icon)}>
      <path d={icon.path} />
    </svg>
  );
}

/** O texto de uma opção de campo de seleção, com o logo à frente quando ela é uma tecnologia (Dart, Flutter, React...). */
export function OptionLabel({ text }: { text: string }) {
  return (
    <>
      <TechLogo name={text} />
      {text}
    </>
  );
}

/** Chip de uma opção de campo de seleção, com o logo quando ela é uma tecnologia. */
export const optionChip = (text: string): ChipOption => ({ value: text, label: <OptionLabel text={text} /> });
