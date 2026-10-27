import { Badge } from '@radix-ui/themes';
import { AGENT_SUGGESTIONS, type AgentSuggestion } from '../../../../shared/agentSuggestions';
import { ai, harness, settings } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, ActionIconButton, DeleteButton, IconAgents, IconPlus, IconTrash } from '../../ui';
import { t } from '../../../i18n';

/**
 * A barra da aba Agentes: novo agente, assistente, sugestões prontas, "Sugerir agentes com IA" e "Recriar os de
 * fábrica". Quem a usa decide o que "novo" e "assistente" abrem.
 */
export function AgentsToolbar({
  onNew,
  onWizard,
}: {
  onNew: () => void;
  /** abre o assistente, limpo ou com uma sugestão pronta */
  onWizard: (preset?: AgentSuggestion) => void;
}) {
  const busy = useBoardStore((s) => s.state!.chat.busy);
  const seed = useAction(() => harness.seedAgents(true));
  return (
    <>
      <div className="actions-toolbar">
        <span className="toolbar-group">
          <ActionButton hint={t('Abre o formulário de um agente novo; ele é gravado no board ao salvar.')} onClick={onNew}>
            <IconPlus /> {t('Novo agente')}
          </ActionButton>
          <ActionButton
            variant="soft"
            color="gray"
            hint={t('Um passo a passo com exemplos e sugestões para criar um agente de escopo reduzido.')}
            onClick={() => onWizard()}
          >
            <IconAgents /> {t('Criar agente com ajuda')}
          </ActionButton>
        </span>
        <span className="toolbar-group">
          <ActionButton
            variant="soft"
            color="gray"
            disabled={busy}
            disabledReason={t('A IA ainda está respondendo no chat do board.')}
            hint={t('A IA lê o projeto e cria ou ajusta os agentes; acompanhe no chat do board.')}
            onClick={() => ai.suggestAgents()}
          >
            {t('Sugerir agentes com IA')}
          </ActionButton>
          <ActionButton
            variant="ghost"
            loading={seed.busy}
            hint={t('Cria de novo os agentes de fábrica que não existem mais; não mexe nos que existem.')}
            onClick={() => void seed.run()}
          >
            {t('Recriar os de fábrica')}
          </ActionButton>
        </span>
      </div>
      <div className="actions-toolbar agent-ready" role="group" aria-label={t('Sugestões prontas')}>
        <span className="muted small">{t('Sugestões prontas:')}</span>
        {AGENT_SUGGESTIONS.map((s) => (
          <ActionButton
            key={s.id}
            variant="soft"
            color="gray"
            size="1"
            hint={t('Abre o assistente com as respostas preenchidas, para você ajustar e confirmar.')}
            onClick={() => onWizard(s)}
          >
            {t(s.label)}
          </ActionButton>
        ))}
      </div>
    </>
  );
}

/** O agente padrão das instruções: o valor de `runner.defaultAgent`, o mesmo que o Executor escolhe. */
export const useDefaultAgent = (): string => useBoardStore((s) => s.state!.board.runner.defaultAgent);

/** O selo "padrão", só no agente que executa quando nem o card nem a fase escolhem um. */
export function DefaultAgentBadge({ name }: { name: string }) {
  const isDefault = useDefaultAgent() === name;
  if (!isDefault) return null;
  return (
    <Badge color="indigo" variant="soft">
      {t('padrão das instruções')}
    </Badge>
  );
}

/** "Tornar padrão" (das instruções, no rótulo acessível e na dica): grava `runner.defaultAgent`; não aparece no que já é o padrão. */
export function MakeDefaultButton({ name }: { name: string }) {
  if (useDefaultAgent() === name) return null;
  return (
    <ActionButton
      variant="ghost"
      size="1"
      aria-label={t('Tornar {name} o agente padrão das instruções', { name })}
      hint={t('Torna este o agente padrão das instruções: ele conduz os cards que não indicam um agente, nem pela coluna.')}
      onClick={() => settings.updateBoard({ runner: { defaultAgent: name } })}
    >
      {t('Tornar padrão')}
    </ActionButton>
  );
}

/** Apagar o agente do board; no padrão fica desabilitado, com o motivo. */
export function DeleteAgentButton({ name, location }: { name: string; location?: string }) {
  if (useDefaultAgent() === name)
    return (
      <ActionIconButton
        variant="ghost"
        color="gray"
        size="1"
        aria-label={t('Apagar o agente {name}', { name })}
        hint={t('Apagar o agente')}
        disabled
        disabledReason={t('Este é o agente padrão das instruções. Torne outro agente o padrão das instruções antes de apagar este.')}
      >
        <IconTrash />
      </ActionIconButton>
    );
  return (
    <DeleteButton
      title={t('Apagar o agente')}
      aria-label={t('Apagar o agente {name}', { name })}
      question={t('Apagar o agente "{name}"?', { name })}
      message={t('O agente é removido do board{location}. Colunas e cards que o usam voltam ao padrão.', {
        location: location ? ` (${location})` : '',
      })}
      onConfirm={() => void harness.deleteAgent(name)}
    />
  );
}
