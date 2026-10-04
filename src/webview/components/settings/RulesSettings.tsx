import type { ReactNode } from 'react';
import { Badge, Button, Card, Heading } from '@radix-ui/themes';
import { DEFAULT_RULES, type BoardRules, type CancelChildrenMode, type CompleteParentMode, type ConfirmMode } from '../../../shared/rules';
import { columnsOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { t, dt } from '../../i18n';
import { settings } from '../../commands';
import { SelectField, SwitchField } from '../ui';
import { PageHeader } from './PageHeader';

const CONFIRM_OPTIONS: { value: ConfirmMode; label: string }[] = [
  { value: 'whenDependents', label: 'Avisar se levar sub-tarefas ou anexos' },
  { value: 'always', label: 'Sempre pedir confirmação' },
  { value: 'never', label: 'Nunca perguntar' },
];

const CANCEL_OPTIONS: { value: CancelChildrenMode; label: string }[] = [
  { value: 'ask', label: 'Perguntar o que fazer' },
  { value: 'cascade', label: 'Cancelar as sub-tarefas junto' },
  { value: 'keep', label: 'Manter as sub-tarefas como estão' },
];

const COMPLETE_OPTIONS: { value: CompleteParentMode; label: string }[] = [
  { value: 'ask', label: 'Perguntar se move a história' },
  { value: 'auto', label: 'Mover a história automaticamente' },
  { value: 'off', label: 'Não fazer nada' },
];

function Rule({ title, when, then, active, control }: { title: string; when: string; then: string; active: boolean; control: ReactNode }) {
  return (
    <Card className={`rule ${active ? '' : 'off'}`} aria-label={title}>
      <div className="rule-head">
        <Heading as="h3" size="3">
          {title}
        </Heading>
        <Badge color={active ? 'indigo' : 'gray'} variant={active ? 'soft' : 'outline'}>
          {active ? t('Ativa') : t('Desligada')}
        </Badge>
        <div className="rule-control">{control}</div>
      </div>
      <dl className="when">
        <dt>{t('Quando')}</dt>
        <dd>{when}</dd>
        <dt>{t('Então')}</dt>
        <dd>{then}</dd>
      </dl>
    </Card>
  );
}

export function RulesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const rules = state.board.rules;
  const set = (patch: Partial<BoardRules>) => settings.updateRules(patch);

  const parentWf = state.workflows.find((w) => w.kind === 'parent');
  const names = (category: 'done' | 'cancelled') => {
    const list = parentWf
      ? columnsOf(state, parentWf.id)
          .filter((c) => c.category === category)
          .map((c) => `"${dt(c.name)}"`)
      : [];
    return list.length ? list.join(', ') : t('nenhuma coluna definida ainda');
  };
  const changed = (Object.keys(DEFAULT_RULES) as (keyof BoardRules)[]).some((k) => rules[k] !== DEFAULT_RULES[k]);

  const confirmSelect = (key: 'confirmTrash' | 'confirmArchive', label: string) => (
    <SelectField
      aria-label={label}
      options={CONFIRM_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
      value={rules[key]}
      onChange={(mode) => set({ [key]: mode })}
    />
  );
  const confirmThen = (mode: ConfirmMode, trash: boolean) =>
    mode === 'always'
      ? trash
        ? t('sempre pedir confirmação antes de excluir.')
        : t('sempre pedir confirmação antes de arquivar.')
      : mode === 'never'
        ? trash
          ? t('excluir direto, sem perguntar. As sub-tarefas e os anexos vão junto do mesmo jeito.')
          : t('arquivar direto, sem perguntar. As sub-tarefas e os anexos vão junto do mesmo jeito.')
        : t('avisar e pedir confirmação se o card levar sub-tarefas ou anexos junto; cards simples seguem direto.');

  return (
    <div className="rule-list">
      <PageHeader
        title={t('Regras')}
        actions={
          <Button variant="soft" color="gray" disabled={!changed} onClick={() => set(DEFAULT_RULES)}>
            {t('Restaurar regras padrão')}
          </Button>
        }
      >
        {t(
          'Regras deste board. O que conta como conclusão ou cancelamento vem de "Esta coluna representa", no menu de ações de cada coluna.',
        )}
      </PageHeader>

      <Rule
        title={t('Concluir história com sub-tarefas em aberto')}
        active={rules.blockDoneWithOpenChildren}
        when={t('uma história é movida para uma coluna de conclusão ({names}) e ainda tem sub-tarefas em aberto', { names: names('done') })}
        then={
          rules.blockDoneWithOpenChildren
            ? t('bloquear o movimento e avisar quantas sub-tarefas faltam.')
            : t('permitir. As sub-tarefas ficam onde estão.')
        }
        control={
          <SwitchField
            label={t('Bloquear')}
            checked={rules.blockDoneWithOpenChildren}
            onChange={(blockDoneWithOpenChildren) => set({ blockDoneWithOpenChildren })}
          />
        }
      />

      <Rule
        title={t('Avançar de fase com sub-tarefas da fase em aberto')}
        active={rules.blockPhaseAdvanceWithOpenChildren}
        when={t('uma história é movida para uma coluna mais adiante e ainda tem sub-tarefas em aberto cujo campo "Fase" é a coluna atual')}
        then={
          rules.blockPhaseAdvanceWithOpenChildren
            ? t('bloquear o movimento e avisar quantas sub-tarefas da fase faltam. Voltar de coluna e cancelar continuam livres.')
            : t('permitir. As sub-tarefas ficam onde estão.')
        }
        control={
          <SwitchField
            label={t('Bloquear')}
            checked={rules.blockPhaseAdvanceWithOpenChildren}
            onChange={(blockPhaseAdvanceWithOpenChildren) => set({ blockPhaseAdvanceWithOpenChildren })}
          />
        }
      />

      <Rule
        title={t('Cancelar história com sub-tarefas em aberto')}
        active={rules.onCancelParent !== 'keep'}
        when={t('uma história é movida para uma coluna de cancelamento ({names}) e ainda tem sub-tarefas em aberto', {
          names: names('cancelled'),
        })}
        then={
          rules.onCancelParent === 'ask'
            ? t('perguntar se as sub-tarefas devem ser canceladas também.')
            : rules.onCancelParent === 'cascade'
              ? t('cancelar as sub-tarefas em aberto junto, sem perguntar.')
              : t('mover só a história. As sub-tarefas ficam onde estão.')
        }
        control={
          <SelectField
            aria-label={t('Ao cancelar uma história')}
            options={CANCEL_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            value={rules.onCancelParent}
            onChange={(onCancelParent) => set({ onCancelParent })}
          />
        }
      />

      <Rule
        title={t('Última sub-tarefa concluída')}
        active={rules.onAllChildrenDone !== 'off'}
        when={t('uma sub-tarefa é concluída e a história não tem mais nenhuma sub-tarefa em aberto')}
        then={
          rules.onAllChildrenDone === 'ask'
            ? t('perguntar se a história deve ir para a coluna de conclusão ({names}).', { names: names('done') })
            : rules.onAllChildrenDone === 'auto'
              ? t('mover a história para a coluna de conclusão ({names}), sem perguntar.', { names: names('done') })
              : t('deixar a história onde está.')
        }
        control={
          <SelectField
            aria-label={t('Ao concluir a última sub-tarefa')}
            options={COMPLETE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            value={rules.onAllChildrenDone}
            onChange={(onAllChildrenDone) => set({ onAllChildrenDone })}
          />
        }
      />

      <Rule
        title={t('Preencher o modelo sugerido')}
        active={rules.autoApplyModelSuggestion}
        when={t('um card é criado ou um atributo dele muda, e o campo de modelo está vazio ou ainda tem a sugestão anterior')}
        then={
          rules.autoApplyModelSuggestion
            ? t('preencher o modelo com a sugestão das regras. Um modelo escolhido à mão nunca é trocado.')
            : t('não mexer no modelo. A sugestão só é aplicada pelo botão no card.')
        }
        control={
          <SwitchField
            label={t('Preencher')}
            checked={rules.autoApplyModelSuggestion}
            onChange={(autoApplyModelSuggestion) => set({ autoApplyModelSuggestion })}
          />
        }
      />

      <Rule
        title={t('Excluir card')}
        active={rules.confirmTrash !== 'never'}
        when={t('um card é movido para a lixeira')}
        then={confirmThen(rules.confirmTrash, true)}
        control={confirmSelect('confirmTrash', t('Ao excluir um card'))}
      />

      <Rule
        title={t('Arquivar card')}
        active={rules.confirmArchive !== 'never'}
        when={t('um card é arquivado')}
        then={confirmThen(rules.confirmArchive, false)}
        control={confirmSelect('confirmArchive', t('Ao arquivar um card'))}
      />
    </div>
  );
}
