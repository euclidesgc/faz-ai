import { useState, type ReactNode } from 'react';
import { Button, Card, Heading, Text, TextField } from '@radix-ui/themes';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '../../ui';
import { t } from '../../../i18n';

interface ShellProps {
  /** o nome acessível do assistente */
  label: string;
  /** os nomes dos passos, em português (traduzidos aqui) */
  steps: string[];
  /** o passo à vista, a partir de 0 */
  step: number;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
  /** o botão do último passo: o que grava ("Criar agente") */
  finishLabel: string;
  /** o passo não pode seguir enquanto faltar uma resposta */
  nextDisabled?: boolean;
  children: ReactNode;
}

/**
 * A moldura dos assistentes de criação: um passo por vez num cartão, com o andamento no alto e Voltar, Continuar
 * (no último, o botão que grava) e Cancelar embaixo. Nada é gravado antes do botão do último passo.
 */
export function WizardShell({ label, steps, step, onBack, onNext, onCancel, finishLabel, nextDisabled, children }: ShellProps) {
  const last = step === steps.length - 1;
  return (
    <Card className="draft-card wizard" aria-label={label}>
      <div className="wizard-head">
        <Text size="1" color="gray">
          {t('Passo {n} de {total}', { n: step + 1, total: steps.length })}
        </Text>
        <Heading as="h4" size="3">
          {t(steps[step]!)}
        </Heading>
        <ol className="wizard-steps" aria-label={t('Passos')}>
          {steps.map((name, i) => (
            <li key={name} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              {t(name)}
            </li>
          ))}
        </ol>
      </div>
      <div className="wizard-body">{children}</div>
      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancelar')}
        </Button>
        <Button variant="soft" color="gray" disabled={step === 0} onClick={onBack}>
          {t('Voltar')}
        </Button>
        <Button disabled={nextDisabled} onClick={onNext}>
          {last ? finishLabel : t('Continuar')}
        </Button>
      </div>
    </Card>
  );
}

/** A pergunta de um passo: o que se quer saber, um exemplo de resposta e o resto do passo (campos, sugestões). */
export function WizardQuestion({ question, example, children }: { question: string; example?: string; children?: ReactNode }) {
  return (
    <div className="wizard-question">
      <Text as="p" size="2">
        {question}
      </Text>
      {example && (
        <Text as="p" size="1" color="gray" className="wizard-example">
          {t('Exemplo:')} <em>{example}</em>
        </Text>
      )}
      {children}
    </div>
  );
}

/**
 * Uma lista de frases que a pessoa ajusta: cada linha é um campo com os botões de subir, descer e tirar, e um
 * campo no fim acrescenta uma nova. Usada nos passos e nos limites do assistente de skills.
 */
export function StringListEditor({
  items,
  onChange,
  label,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  /** o nome da lista, para o leitor de tela */
  label: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const set = (i: number, text: string) => onChange(items.map((x, j) => (j === i ? text : x)));
  const move = (i: number, by: number) => {
    const next = [...items];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    onChange(next);
  };
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft('');
  };
  return (
    <div className="string-list" role="group" aria-label={label}>
      {items.map((text, i) => (
        <div key={i} className="string-list-row">
          <TextField.Root aria-label={`${label} ${i + 1}`} value={text} onChange={(e) => set(i, e.target.value)} className="grow" />
          <Button variant="ghost" size="1" aria-label={t('Subir')} title={t('Subir')} disabled={i === 0} onClick={() => move(i, -1)}>
            <IconArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="1"
            aria-label={t('Descer')}
            title={t('Descer')}
            disabled={i === items.length - 1}
            onClick={() => move(i, 1)}
          >
            <IconArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="1"
            aria-label={t('Tirar {item}', { item: `${label} ${i + 1}` })}
            title={t('Tirar')}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <IconTrash />
          </Button>
        </div>
      ))}
      <div className="string-list-row">
        <TextField.Root
          aria-label={t('Nova linha: {label}', { label })}
          className="grow"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="soft" color="gray" size="1" disabled={!draft.trim()} onClick={add}>
          <IconPlus /> {t('Acrescentar')}
        </Button>
      </div>
    </div>
  );
}
