import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { choose, confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { ExecutionPoliciesSettings } from '../../src/webview/components/settings/policies/ExecutionPoliciesSettings';
import { builtinPolicyCatalog } from '../../src/shared/policyManagement';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { setLocale } from '../../src/webview/i18n';
import { record, policy } from '../fixtures/executionPolicy';
import type { PolicyReply } from '../../src/shared/policyManagement';
import type { ExecutionPolicyRecord } from '../../src/shared/executionPolicies';

beforeEach(async () => {
  await seedBoard();
  setLocale('pt-BR');
});
function reply(
  value: PolicyReply,
  type: 'executionPolicy.read' | 'executionPolicy.simulate' | 'executionPolicy.assist' = 'executionPolicy.read',
) {
  const message = lastSent(type);
  act(() =>
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'executionPolicy.result', requestId: message.requestId, ...value } })),
  );
}
async function open(records: ExecutionPolicyRecord[] = [record()]) {
  renderThemed(<ExecutionPoliciesSettings />);
  expect(posted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Gerenciar políticas' }));
  reply({ library: { snapshot: { version: 1, records }, ...builtinPolicyCatalog(useBoardStore.getState().state!) } });
  await screen.findByRole('button', { name: 'Nova política' });
}
it('edita sem gravar e exige comparação e confirmação de revisão', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.clear(screen.getByRole('textbox', { name: 'Nome da política' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome da política' }), 'Política revisada');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  expect(screen.getByRole('button', { name: 'Confirmar revisão e salvar' })).toBeDisabled();
  expect(screen.getByText('Quota da implementação')).toBeInTheDocument();
  expect(screen.getByText('Política revisada')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Revisei as condições, os destinos e os limites desta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar revisão e salvar' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({
    expectedRevision: 1,
    reviewed: true,
    policy: { name: 'Política revisada' },
  });
  expect(screen.getAllByRole('button', { name: 'Salvando…' }).every((b) => b.hasAttribute('disabled'))).toBe(true);
  confirmLast(false, 'A política mudou. Releia antes de salvar.');
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar à edição' }));
  expect(screen.getByRole('textbox', { name: 'Nome da política' })).toHaveValue('Política revisada');
});
it('salva como pendente sem conceder revisão e só fecha após a confirmação do host', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar como pendente de revisão' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ reviewed: false, expectedRevision: 1 });
  confirmLast();
  await waitFor(() => expect(sentOf('executionPolicy.read')).toHaveLength(2));
  reply({
    library: {
      snapshot: { version: 1, records: [{ ...record(), revision: 2, review: 'pending' }] },
      ...builtinPolicyCatalog(useBoardStore.getState().state!),
    },
  });
  await screen.findByText('Pendente de revisão');
});
it('simula no host, mostra hipóteses e marca resultado desatualizado ao editar', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }));
  expect(lastSent('executionPolicy.simulate').scenario.effects).toBe('unknown');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
  reply(
    {
      simulation: {
        hypothetical: true,
        problems: [],
        requested: { state: 'resolved', from: 'card', explicit: true, target: { profileId: 'claude', model: 'opus', effort: null } },
        decision: {
          action: 'reconcile',
          reason: 'reconciliation-required',
          policy: null,
          target: null,
          alternatives: [],
          rejected: [],
          budget: null,
          nextAttempt: 2,
          notBefore: null,
          visited: [],
          consumption: [null],
        },
      },
    },
    'executionPolicy.simulate',
  );
  await screen.findByText('É preciso reconciliar o trabalho antes de tentar novamente.');
  act(() =>
    useBoardStore.setState({ state: { ...useBoardStore.getState().state!, executionPolicyRevision: 'changed-in-another-window' } }),
  );
  expect(screen.getByText(/Resultado desatualizado/)).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome da política' }), ' alterada');
  expect(screen.getByText(/Resultado desatualizado/)).toBeInTheDocument();
});
it('histórico carrega versões e usa a antiga como novo rascunho com a revisão atual', async () => {
  await open([{ ...record(), revision: 3 }]);
  await userEvent.click(screen.getByRole('button', { name: 'Histórico' }));
  reply({ history: [record(policy({ name: 'Versão anterior' }))], nextBefore: null });
  await screen.findByText('Versão anterior');
  await userEvent.click(screen.getByRole('button', { name: 'Usar versão como rascunho' }));
  expect(screen.getByRole('textbox', { name: 'Nome da política' })).toHaveValue('Versão anterior');
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar como pendente de revisão' }));
  expect(lastSent('settings.executionPolicy.save').expectedRevision).toBe(3);
});
it('edita destinos ordenados e limites sem reconstruir o avaliador na interface', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const targets = screen.getAllByRole('group').filter((group) => within(group).queryByText(/^Destino [12]$/));
  expect(targets).toHaveLength(2);
  await userEvent.click(within(targets[1]!).getByRole('button', { name: 'Subir destino' }));
  await choose(screen.getByRole('combobox', { name: 'Ação da política' }), 'Oferecer alternativas');
  await userEvent.clear(screen.getByRole('spinbutton', { name: 'Máximo de tentativas' }));
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Máximo de tentativas' }), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar como pendente de revisão' }));
  expect(lastSent('settings.executionPolicy.save').policy).toMatchObject({
    action: 'offer',
    targets: [{ profileId: 'cursor' }, { profileId: 'claude' }],
    limits: { maxAttempts: 4 },
  });
});
it('recarrega a versão concorrente sem perder o rascunho e exige nova comparação', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.clear(screen.getByRole('textbox', { name: 'Nome da política' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome da política' }), 'Minha proposta');
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Revisei as condições, os destinos e os limites desta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Recarregar versão para comparar' }));
  reply({
    library: {
      snapshot: { version: 1, records: [{ ...record(policy({ name: 'Mudança concorrente' })), revision: 2 }] },
      ...builtinPolicyCatalog(useBoardStore.getState().state!),
    },
  });
  expect(await screen.findByRole('textbox', { name: 'Nome da política' })).toHaveValue('Minha proposta');
  await userEvent.click(screen.getByRole('button', { name: 'Comparar política antes de salvar' }));
  expect(screen.getByText('Mudança concorrente')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar revisão e salvar' })).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Revisei as condições, os destinos e os limites desta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar revisão e salvar' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ expectedRevision: 2, policy: { name: 'Minha proposta' } });
});
it('Próxima execução simula sem rascunho, pelo host', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }));
  expect(lastSent('executionPolicy.simulate').scenario.draft).toBeNull();
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('mostra a proposta da IA antes de qualquer gravação e só a entrega ao editor como rascunho', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Criar com ajuda de IA' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Objetivo da política' }), 'trocar quando a quota acabar');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir proposta' }));
  const sent = lastSent('executionPolicy.assist');
  expect(sent.input).toMatchObject({ mode: 'create', goal: 'trocar quando a quota acabar', draft: null });
  const proposed = { ...policy(), id: 'ia', name: 'Proposta da IA', enabled: false };
  reply({ assistance: { explanation: 'Troca só após a quota.', policy: proposed, problems: [], scenarios: [] } }, 'executionPolicy.assist');
  await screen.findByText('Troca só após a quota.');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Abrir proposta no editor' }));
  expect(screen.getByRole('textbox', { name: 'Nome da política' })).toHaveValue('Proposta da IA');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('mostra o motivo quando a IA não está disponível e mantém o editor manual', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Criar com ajuda de IA' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Objetivo da política' }), 'objetivo');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir proposta' }));
  reply({ error: 'A CLI do Claude Code não foi encontrada: veja o aviso no topo do board.' }, 'executionPolicy.assist');
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar assistente' }));
  expect(screen.getByRole('button', { name: 'Nova política' })).toBeEnabled();
});
