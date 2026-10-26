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
const library = (records: ExecutionPolicyRecord[], extra: Partial<PolicyReply['library']> = {}) => ({
  library: { snapshot: { version: 1 as const, records }, ...builtinPolicyCatalog(useBoardStore.getState().state!), ...extra },
});
/** A tela lê as regras ao montar, sem clique. */
async function open(records: ExecutionPolicyRecord[] = [record()], extra: Partial<PolicyReply['library']> = {}) {
  renderThemed(<ExecutionPoliciesSettings profileId="claude" />);
  await waitFor(() => expect(sentOf('executionPolicy.read')).toHaveLength(1));
  reply(library(records, extra));
  await screen.findByRole('button', { name: 'Montar nova regra' });
}
const confirmSaves = async (count: number) => {
  for (let i = 1; i <= count; i++) {
    await waitFor(() => expect(sentOf('settings.executionPolicy.save')).toHaveLength(i));
    confirmLast();
  }
};

it('a lista lê as regras ao montar e mostra cada uma como uma frase: quando, usa no lugar e como', async () => {
  await open();
  expect(posted).toHaveBeenCalled();
  const row = screen.getByRole('row', { name: /Quota da implementação/ });
  expect(within(row).getByText(/esgota a cota/)).toBeInTheDocument();
  expect(within(row).getByText(/, depois /)).toBeInTheDocument();
  expect(within(row).getByText('Troca sozinho')).toBeInTheDocument();
  // a regra do fixture tem condições de ação e origem: a lista avisa que há mais
  expect(within(row).getByText('+ condições')).toBeInTheDocument();
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('edita e salva em um clique: a gravação já vai revisada, com a versão da base', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.clear(screen.getByRole('textbox', { name: 'Nome da regra' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome da regra' }), 'Regra revisada');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({
    expectedRevision: 1,
    reviewed: true,
    policy: { name: 'Regra revisada', action: 'auto' },
  });
  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  // conflito de versão: o rascunho fica, e recarregar troca só a base
  confirmLast(false, 'A política mudou. Releia antes de salvar.');
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Recarregar e salvar de novo' }));
  reply(library([{ ...record(policy({ name: 'Mudança concorrente' })), revision: 2 }]));
  expect(await screen.findByRole('textbox', { name: 'Nome da regra' })).toHaveValue('Regra revisada');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ expectedRevision: 2, policy: { name: 'Regra revisada' } });
  confirmLast();
  await waitFor(() => expect(sentOf('executionPolicy.read')).toHaveLength(3));
  reply(library([{ ...record(policy({ name: 'Regra revisada' })), revision: 3 }]));
  await screen.findByRole('row', { name: /Regra revisada/ });
  expect(screen.queryByRole('textbox', { name: 'Nome da regra' })).toBeNull();
});
it('destino num agente desligado: a lista e o editor avisam, sem impedir salvar (história 12)', async () => {
  expect(useBoardStore.getState().state!.board.aiProfiles.find((p) => p.id === 'codex-acp')?.enabled).toBe(false);
  await open([record(policy({ targets: [{ profileId: 'codex-acp', model: null, effort: null }] }))]);
  expect(screen.getByText('(agente desligado)')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('note')).toHaveTextContent(/O perfil Codex · ACP está desligado: a política pode ser salva/);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ reviewed: true, policy: { targets: [{ profileId: 'codex-acp' }] } });
});
it('regra pendente de revisão: o interruptor fica travado e "Revisar e ligar" grava revisada e ligada', async () => {
  await open([{ ...record(policy({ enabled: false })), review: 'pending' }]);
  expect(screen.getByText('Precisa da sua revisão')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Regra Quota da implementação em uso' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Revisar e ligar' }));
  await userEvent.click(screen.getByRole('switch', { name: 'Ligada' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ expectedRevision: 1, reviewed: true, policy: { enabled: true } });
});
it('o interruptor da lista desliga a regra com uma gravação revisada', async () => {
  await open();
  await userEvent.click(screen.getByRole('switch', { name: 'Regra Quota da implementação em uso' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ expectedRevision: 1, reviewed: true, policy: { enabled: false } });
});
it('a ordem da lista é a prioridade: descer renumera em duas passadas, sem empatar duas regras ligadas', async () => {
  await open([record(policy({ id: 'a', name: 'Primeira', priority: 10 })), record(policy({ id: 'b', name: 'Segunda', priority: 20 }))]);
  const first = screen.getByRole('row', { name: /Primeira/ });
  await userEvent.click(within(first).getByRole('button', { name: 'Descer' }));
  await confirmSaves(4);
  const writes = sentOf('settings.executionPolicy.save');
  // primeiro a faixa alta (b, a), depois a definitiva: b fica na frente
  expect(writes.map((w) => [w.policy.id, w.policy.priority, w.expectedRevision])).toEqual([
    ['b', 500000, 1],
    ['a', 500010, 1],
    ['b', 0, 2],
    ['a', 10, 2],
  ]);
  expect(writes.every((w) => w.reviewed)).toBe(true);
});
it('regra nova: começa sem modelo; o que falha é só do agente da tela e o destino não oferece ele mesmo', async () => {
  await open([]);
  expect(screen.getByText(/Nenhuma regra para .*: ao esgotar a cota, o card espera a renovação\./)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Montar nova regra' }));
  expect(screen.getByRole('radio', { name: /Troca sozinho/ })).toBeChecked();
  // sem o modelo que falha, nada salva e o destino espera
  expect(screen.getByRole('button', { name: 'Adicionar à lista' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Modelo 1' })).toBeDisabled();
  // o modelo que falha: só os do agente da tela, num grupo só
  await userEvent.click(screen.getByRole('combobox', { name: 'Modelo que falha' }));
  const groups = within(screen.getByRole('listbox')).getAllByRole('group');
  expect(groups).toHaveLength(1);
  const origin = within(groups[0]!).getAllByRole('option')[0]!.textContent!;
  await userEvent.click(within(groups[0]!).getAllByRole('option')[0]!);
  // o destino oferece todos os modelos, menos o que falha
  await userEvent.click(screen.getByRole('combobox', { name: 'Modelo 1' }));
  const own = within(screen.getByRole('listbox')).getAllByRole('group')[0]!;
  expect(within(own).queryByRole('option', { name: origin })).toBeNull();
  const target = within(own).getAllByRole('option')[0]!;
  const targetLabel = target.textContent!;
  await userEvent.click(target);
  expect(screen.getByRole('combobox', { name: 'Modelo 1' })).toHaveTextContent(targetLabel);
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar à lista' }));
  const sent = lastSent('settings.executionPolicy.save');
  expect(sent).toMatchObject({
    expectedRevision: 0,
    reviewed: true,
    policy: { enabled: true, action: 'auto', conditions: { profileIds: ['claude'], failures: ['quota'], explicit: 'include' } },
  });
  expect(sent.policy.conditions.models).toHaveLength(1);
  expect(sent.policy.name).toMatch(/→/);
  expect(sent.policy.targets).toHaveLength(1);
  expect(sent.policy.targets[0]!.model).not.toBe(sent.policy.conditions.models[0]);
});
it('trocar o modelo que falha limpa os destinos, e a linha vazia não salva', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('combobox', { name: 'Modelo 2' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', { name: 'Modelo que falha' }));
  const options = within(screen.getByRole('listbox')).getAllByRole('option');
  await userEvent.click(options.find((o) => o.getAttribute('aria-selected') !== 'true')!);
  expect(screen.queryByRole('combobox', { name: 'Modelo 2' })).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Modelo 1' })).toHaveTextContent('Escolha o modelo');
  expect(screen.getByRole('button', { name: 'Salvar regra' })).toBeDisabled();
  expect(screen.getByText('Escolha o modelo de cada linha de "Usar no lugar", ou remova a linha vazia.')).toBeInTheDocument();
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('a tela de um agente mostra só as regras do modelo dele que falha', async () => {
  await open([
    record(),
    record(policy({ id: 'outra', name: 'Regra do Cursor', priority: 20, conditions: { ...policy().conditions, profileIds: ['cursor'] } })),
  ]);
  expect(screen.getByRole('row', { name: /Quota da implementação/ })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /Regra do Cursor/ })).toBeNull();
});
it('Perguntar antes vira a ação "offer"; Avançado troca para bloquear e esvazia os destinos', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByRole('radio', { name: /Pergunta antes/ }));
  expect(screen.getByText(/o board pergunta se segue em/)).toBeInTheDocument();
  await userEvent.click(screen.getByText('Avançado'));
  await choose(screen.getByRole('combobox', { name: 'Ação' }), 'Bloqueia o card');
  expect(screen.getByText(/o card fica bloqueado/)).toBeInTheDocument();
  await userEvent.clear(screen.getByRole('spinbutton', { name: 'Máximo de tentativas' }));
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Máximo de tentativas' }), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save').policy).toMatchObject({ action: 'block', targets: [], limits: { maxAttempts: 4 } });
});
it('Testar as regras: a regra escolhida vai como rascunho ligado, com o cenário dela, e o resultado fica desatualizado quando as regras mudam', async () => {
  await open([record(policy({ enabled: false }))]);
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  // a regra do fixture vira o cenário: o modelo de origem dela (claude · opus, no catálogo do board) já vem escolhido
  expect(screen.getByRole('combobox', { name: 'Regra a testar' })).toHaveTextContent('Quota da implementação (desligada)');
  expect(screen.getByRole('combobox', { name: 'Modelo que falha no teste' })).toHaveTextContent(/Opus/);
  await userEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }));
  const scenario = lastSent('executionPolicy.simulate').scenario;
  // a regra desligada é testada como se estivesse ligada; só na cópia da simulação
  expect(scenario.draft).toMatchObject({ id: 'quota', enabled: true });
  expect(scenario).toMatchObject({
    sourceValue: expect.stringMatching(/^claude:opus/),
    failure: 'quota',
    context: { action: 'work', origin: 'manual' },
  });
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
  // O veredito leva o ícone de falha junto do texto, não só a palavra.
  expect(screen.getByText('Não passou').querySelector('svg.lucide-x')).not.toBeNull();
  expect(screen.getByText(/A regra não se aplica a este cenário/)).toBeInTheDocument();
  act(() =>
    useBoardStore.setState({ state: { ...useBoardStore.getState().state!, executionPolicyRevision: 'changed-in-another-window' } }),
  );
  expect(screen.getByText(/Resultado desatualizado/)).toBeInTheDocument();
});
it('sem nenhuma regra do agente, o bloco não oferece testar nem revisar conflitos, só a IA', async () => {
  await open([]);
  expect(screen.queryByText('Testar as regras, pedir sugestão à IA e reservas antigas')).toBeNull();
  await userEvent.click(screen.getByText('Pedir sugestão à IA e reservas antigas'));
  expect(screen.queryByRole('region', { name: 'Testar as regras' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Simular sem executar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Revisar conflitos' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Criar com ajuda de IA' })).toBeInTheDocument();
});
it('Testar as regras avisa quando outra regra, antes na lista, decidiu no lugar da escolhida', async () => {
  await open([record(policy({ id: 'primeira', name: 'Primeira', priority: 5 })), record()]);
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  await choose(screen.getByRole('combobox', { name: 'Regra a testar' }), 'Quota da implementação');
  await userEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }));
  reply(
    {
      simulation: {
        hypothetical: true,
        problems: [],
        requested: { state: 'resolved', from: 'card', explicit: true, target: { profileId: 'claude', model: 'opus', effort: null } },
        decision: {
          action: 'fallback',
          reason: 'fallback-permitted',
          policy: { id: 'primeira', revision: 1 },
          target: { profileId: 'claude', model: 'haiku', effort: null },
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
  await screen.findByText(/O board segue com/);
  // O veredito leva o ícone de falha junto do texto, não só a palavra.
  expect(screen.getByText('Não passou').querySelector('svg.lucide-x')).not.toBeNull();
  expect(screen.getByText('Quem decidiu foi a regra Primeira, que vem antes na lista.')).toBeInTheDocument();
});
it('Testar as regras diz que passou quando a regra escolhida decidiu como foi configurada', async () => {
  await open();
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  await userEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }));
  reply(
    {
      simulation: {
        hypothetical: true,
        problems: [],
        requested: { state: 'resolved', from: 'card', explicit: true, target: { profileId: 'claude', model: 'opus', effort: null } },
        decision: {
          action: 'fallback',
          reason: 'fallback-permitted',
          policy: { id: 'quota', revision: 1 },
          target: { profileId: 'claude', model: 'haiku', effort: null },
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
  expect((await screen.findByText('Passou')).querySelector('svg.lucide-check')).not.toBeNull();
  expect(screen.getByText('A regra Quota da implementação decidiu como você configurou.')).toBeInTheDocument();
});
it('o editor simula o rascunho dentro de Avançado, sem gravar', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByText('Avançado'));
  // o editor vem antes da lista: o primeiro Simular é o do rascunho (o outro, no fim da seção, é o das regras salvas)
  await userEvent.click(screen.getAllByRole('button', { name: 'Simular sem executar' })[0]!);
  expect(lastSent('executionPolicy.simulate').scenario.draft).toMatchObject({ id: 'quota', name: 'Quota da implementação' });
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('versões anteriores: carrega dentro de Avançado e usa a antiga como rascunho com a versão atual', async () => {
  await open([{ ...record(), revision: 3 }]);
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByText('Avançado'));
  await userEvent.click(screen.getByRole('button', { name: 'Ver versões anteriores' }));
  reply({ history: [record(policy({ name: 'Versão anterior' }))], nextBefore: null });
  await screen.findByText(/Versão 1 ·/);
  await userEvent.click(screen.getByRole('button', { name: 'Usar versão como rascunho' }));
  expect(screen.getByRole('textbox', { name: 'Nome da regra' })).toHaveValue('Versão anterior');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  expect(lastSent('settings.executionPolicy.save')).toMatchObject({ expectedRevision: 3, policy: { name: 'Versão anterior' } });
});
it('a proposta da IA aparece antes de qualquer gravação e só chega ao editor como rascunho', async () => {
  await open();
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  await userEvent.click(screen.getByRole('button', { name: 'Criar com ajuda de IA' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Objetivo da política' }), 'trocar quando a quota acabar');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir proposta' }));
  expect(lastSent('executionPolicy.assist').input).toMatchObject({
    mode: 'create',
    goal: 'trocar quando a quota acabar',
    draft: null,
    profileId: 'claude',
  });
  const proposed = { ...policy(), id: 'ia', name: 'Proposta da IA', enabled: false };
  reply({ assistance: { explanation: 'Troca só após a quota.', policy: proposed, problems: [], scenarios: [] } }, 'executionPolicy.assist');
  await screen.findByText('Troca só após a quota.');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Abrir proposta no editor' }));
  expect(screen.getByRole('textbox', { name: 'Nome da regra' })).toHaveValue('Proposta da IA');
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('sem IA disponível, o assistente mostra o motivo e a lista continua editável', async () => {
  await open();
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  await userEvent.click(screen.getByRole('button', { name: 'Criar com ajuda de IA' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Objetivo da política' }), 'objetivo');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir proposta' }));
  reply({ error: 'A CLI do Claude Code não foi encontrada: veja o aviso no topo do board.' }, 'executionPolicy.assist');
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar assistente' }));
  expect(screen.getByRole('button', { name: 'Montar nova regra' })).toBeEnabled();
});
it('mostra o aviso das reservas antigas: propostas pendentes e regras sem conversão', async () => {
  await open([{ ...record(policy({ id: 'legacy-r1', name: 'Reserva migrada da regra: Backend', enabled: false })), review: 'pending' }], {
    legacy: [
      { ruleId: 'r1', ruleName: 'Backend', policyId: 'legacy-r1', status: 'proposed', review: 'pending' },
      { ruleId: 'r2', ruleName: '', policyId: null, status: 'unconvertible', review: null, reason: 'model-missing' },
    ],
  });
  await userEvent.click(screen.getByText('Testar as regras, pedir sugestão à IA e reservas antigas'));
  const note = await screen.findByRole('note');
  expect(within(note).getByText(/Nada troca de agente até você revisar e ligar a regra/)).toBeInTheDocument();
  expect(within(note).getByText('Regra "Backend": proposta pendente de revisão')).toBeInTheDocument();
  expect(within(note).getByText('Regra "r2": sem conversão (o modelo não está no catálogo)')).toBeInTheDocument();
  expect(sentOf('settings.executionPolicy.save')).toHaveLength(0);
});
it('o erro de ciclo do host chega com o nome da outra regra, também traduzido', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
  // o erro chega depois: a tela o mostra já no idioma trocado
  setLocale('en');
  confirmLast(
    false,
    'Esta regra fecha um ciclo com "Volta" (Cursor · CLI): o card voltaria a um modelo que já falhou. Tire esse destino de uma das regras.',
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This rule closes a cycle with "Volta" (Cursor · CLI): the card would go back to a model that already failed.',
  );
});
