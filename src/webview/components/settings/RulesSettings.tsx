import type { ReactNode } from 'react';
import { DEFAULT_RULES, type BoardRules, type CancelChildrenMode, type CompleteParentMode, type ConfirmMode } from '../../../shared/rules';
import { columnsOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { Button, EnumSelect } from '../ui';

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
    <section className={`settings-block rule ${active ? '' : 'off'}`}>
      <div className="row">
        <h3>{title}</h3>
        <span className={`pill ${active ? '' : 'off'}`}>{active ? 'Ativa' : 'Desligada'}</span>
      </div>
      {control}
      <div className="when">
        <span>
          <b>Quando</b> {when}
        </span>
        <span>
          <b>Então</b> {then}
        </span>
      </div>
    </section>
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
          .map((c) => `"${c.name}"`)
      : [];
    return list.length ? list.join(', ') : 'nenhuma coluna definida ainda';
  };
  const changed = (Object.keys(DEFAULT_RULES) as (keyof BoardRules)[]).some((k) => rules[k] !== DEFAULT_RULES[k]);

  const confirmSelect = (key: 'confirmTrash' | 'confirmArchive') => (
    <EnumSelect options={CONFIRM_OPTIONS} value={rules[key]} onChange={(mode) => set({ [key]: mode })} />
  );
  const confirmThen = (mode: ConfirmMode, verb: string) =>
    mode === 'always'
      ? `sempre pedir confirmação antes de ${verb}.`
      : mode === 'never'
        ? `${verb} direto, sem perguntar. As sub-tarefas e os anexos vão junto do mesmo jeito.`
        : `avisar e pedir confirmação se o card levar sub-tarefas ou anexos junto; cards simples seguem direto.`;

  return (
    <div>
      <div className="row">
        <h2>Regras</h2>
        <span className="spacer" />
        <Button variant="ghost" size="small" disabled={!changed} onClick={() => set(DEFAULT_RULES)}>
          Restaurar padrões
        </Button>
      </div>
      <p className="muted">
        Regras deste board. O que conta como conclusão ou cancelamento vem de "Esta coluna representa", no menu ⋯ de cada coluna.
      </p>

      <Rule
        title="Concluir história com sub-tarefas em aberto"
        active={rules.blockDoneWithOpenChildren}
        when={`uma história é movida para uma coluna de conclusão (${names('done')}) e ainda tem sub-tarefas em aberto`}
        then={
          rules.blockDoneWithOpenChildren
            ? 'bloquear o movimento e avisar quantas sub-tarefas faltam.'
            : 'permitir. As sub-tarefas ficam onde estão.'
        }
        control={
          <label className="switch">
            <input
              type="checkbox"
              checked={rules.blockDoneWithOpenChildren}
              onChange={(e) => set({ blockDoneWithOpenChildren: e.target.checked })}
            />
            Bloquear
          </label>
        }
      />

      <Rule
        title="Avançar de fase com sub-tarefas da fase em aberto"
        active={rules.blockPhaseAdvanceWithOpenChildren}
        when={'uma história é movida para uma coluna mais adiante e ainda tem sub-tarefas em aberto cujo campo "Fase" é a coluna atual'}
        then={
          rules.blockPhaseAdvanceWithOpenChildren
            ? 'bloquear o movimento e avisar quantas sub-tarefas da fase faltam. Voltar de coluna e cancelar continuam livres.'
            : 'permitir. As sub-tarefas ficam onde estão.'
        }
        control={
          <label className="switch">
            <input
              type="checkbox"
              checked={rules.blockPhaseAdvanceWithOpenChildren}
              onChange={(e) => set({ blockPhaseAdvanceWithOpenChildren: e.target.checked })}
            />
            Bloquear
          </label>
        }
      />

      <Rule
        title="Cancelar história com sub-tarefas em aberto"
        active={rules.onCancelParent !== 'keep'}
        when={`uma história é movida para uma coluna de cancelamento (${names('cancelled')}) e ainda tem sub-tarefas em aberto`}
        then={
          rules.onCancelParent === 'ask'
            ? 'perguntar se as sub-tarefas devem ser canceladas também.'
            : rules.onCancelParent === 'cascade'
              ? 'cancelar as sub-tarefas em aberto junto, sem perguntar.'
              : 'mover só a história. As sub-tarefas ficam onde estão.'
        }
        control={
          <EnumSelect options={CANCEL_OPTIONS} value={rules.onCancelParent} onChange={(onCancelParent) => set({ onCancelParent })} />
        }
      />

      <Rule
        title="Última sub-tarefa concluída"
        active={rules.onAllChildrenDone !== 'off'}
        when="uma sub-tarefa é concluída e a história não tem mais nenhuma sub-tarefa em aberto"
        then={
          rules.onAllChildrenDone === 'ask'
            ? `perguntar se a história deve ir para a coluna de conclusão (${names('done')}).`
            : rules.onAllChildrenDone === 'auto'
              ? `mover a história para a coluna de conclusão (${names('done')}), sem perguntar.`
              : 'deixar a história onde está.'
        }
        control={
          <EnumSelect
            options={COMPLETE_OPTIONS}
            value={rules.onAllChildrenDone}
            onChange={(onAllChildrenDone) => set({ onAllChildrenDone })}
          />
        }
      />

      <Rule
        title="Preencher o modelo sugerido"
        active={rules.autoApplyModelSuggestion}
        when="um card é criado ou um atributo dele muda, e o campo de modelo está vazio ou ainda tem a sugestão anterior"
        then={
          rules.autoApplyModelSuggestion
            ? 'preencher o modelo com a sugestão das regras. Um modelo escolhido à mão nunca é trocado.'
            : 'não mexer no modelo. A sugestão só é aplicada pelo botão no card.'
        }
        control={
          <label className="switch">
            <input
              type="checkbox"
              checked={rules.autoApplyModelSuggestion}
              onChange={(e) => set({ autoApplyModelSuggestion: e.target.checked })}
            />
            Preencher
          </label>
        }
      />

      <Rule
        title="Excluir card"
        active={rules.confirmTrash !== 'never'}
        when="um card é movido para a lixeira"
        then={confirmThen(rules.confirmTrash, 'excluir')}
        control={confirmSelect('confirmTrash')}
      />

      <Rule
        title="Arquivar card"
        active={rules.confirmArchive !== 'never'}
        when="um card é arquivado"
        then={confirmThen(rules.confirmArchive, 'arquivar')}
        control={confirmSelect('confirmArchive')}
      />
    </div>
  );
}
