import type { FieldDisplay, FieldKind, FieldValue } from '../../../../shared/model';
import { t } from '../../../i18n';

/** Cada tipo de campo com o nome na tela, o que ele guarda e um valor de exemplo para a prévia. */
export const FIELD_KINDS: { value: FieldKind; label: string; hint: string; sample: (options: string[]) => FieldValue }[] = [
  { value: 'text', label: 'Texto', hint: 'Uma linha de texto livre.', sample: () => t('Texto de exemplo') },
  { value: 'number', label: 'Número', hint: 'Um número, como pontos ou horas.', sample: () => 3 },
  { value: 'date', label: 'Data', hint: 'Uma data, como um prazo.', sample: () => new Date().toISOString().slice(0, 10) },
  { value: 'url', label: 'Link', hint: 'Um endereço, com um botão para abrir.', sample: () => t('https://exemplo.com') },
  {
    value: 'select',
    label: 'Seleção',
    hint: 'Uma opção de uma lista que você define.',
    sample: (o) => o[0] ?? t('Opção'),
  },
  {
    value: 'multiselect',
    label: 'Múltipla seleção',
    hint: 'Várias opções de uma lista que você define, como tags.',
    sample: (o) => (o.length ? o.slice(0, 2) : [t('Opção 1'), t('Opção 2')]),
  },
  {
    value: 'checkbox',
    label: 'Sim ou não',
    hint: 'Uma caixa de marcar; no card aparece o nome do campo quando marcada.',
    sample: () => true,
  },
  {
    value: 'model',
    label: 'Modelo de IA',
    hint: 'Modelo e esforço do catálogo em Modelos de IA; diz qual modelo trabalha no card.',
    sample: () => null,
  },
];

export const kindInfo = (kind: FieldKind) => FIELD_KINDS.find((k) => k.value === kind)!;

/** Como o campo aparece na face do card no board. */
export const FIELD_DISPLAYS: { value: FieldDisplay; label: string; hint: string }[] = [
  { value: 'badge', label: 'Selo', hint: 'Selo preenchido com o valor.' },
  { value: 'chip', label: 'Selo vazado', hint: 'Selo só com contorno, mais discreto.' },
  { value: 'inline', label: 'Nome: valor', hint: 'Texto com o nome do campo antes do valor.' },
  { value: 'hidden', label: 'Oculto', hint: 'Não aparece no board, só no card aberto.' },
];

export const hasOptions = (kind: FieldKind): boolean => kind === 'select' || kind === 'multiselect';

/** As opções do campo "Skills" vêm das skills do projeto, mantidas pela extensão. */
export const isSkillsField = (name: string): boolean => name.trim().toLowerCase() === 'skills';
