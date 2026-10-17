import { useState } from 'react';
import { Button, Card, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import type { ArtifactKind, LibraryArtifactInput, ToolCategory } from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';
import { useBoardStore } from '../../../store/boardStore';
import { useProjectProfile } from './useProjectProfile';
import { ARTIFACT_LABELS } from './LibraryImport';
import { t } from '../../../i18n';

const QUESTIONS = ['Objetivo e uso', 'Convenções e limites', 'Revisar e salvar'];
const GOALS = {
  rule: 'Quais regras gerais devem orientar as alterações neste projeto?',
  skill: 'Qual tarefa repetida esta skill deve ensinar e quando deve ser usada?',
  agent: 'Qual responsabilidade este subagente terá e quando deve ser escolhido?',
  mcp: '',
};
const DETAILS = {
  rule: 'Quais convenções e limites devem ser respeitados?',
  skill: 'Quais são as entradas, os passos e o resultado esperado da tarefa?',
  agent: 'O que o subagente deve entregar e quais decisões ele não pode tomar sozinho?',
  mcp: '',
};
const OPTIONS = [
  'Executar os testes do projeto',
  'Seguir os padrões existentes',
  'Preservar alterações do usuário',
  'Validar antes de concluir',
];
const CATEGORY_LABELS = { read: 'Leitura', edit: 'Edição', run: 'Comandos', net: 'Rede', agents: 'Subagentes' } as const;

/** Criação neutra com revisão final; o mesmo editor mantém metadados e dependências na edição. */
export function LibraryEditor({
  kind,
  initial,
  guided = false,
  onClose,
}: {
  kind: ArtifactKind;
  initial?: LibraryArtifactInput;
  guided?: boolean;
  onClose: () => void;
}) {
  const { profile } = useProjectProfile();
  const artifacts = useBoardStore((s) => s.state!.harness.library?.artifacts ?? []);
  const [step, setStep] = useState(guided ? 0 : 2);
  const [name, setName] = useState(initial?.name ?? (kind === 'rule' ? 'AGENTS.md' : ''));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [goal, setGoal] = useState('');
  const [limits, setLimits] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [body, setBody] = useState(initial?.body ?? '');
  const [agent, setAgent] = useState(
    initial?.agent ?? {
      skills: [],
      mcpServers: [],
      model: '',
      tools: { categories: [], native: { tool: '' as const, allow: [], deny: [] } },
    },
  );
  const [json, setJson] = useState(
    JSON.stringify(initial?.server ?? { command: 'npx', args: ['-y', 'nome-do-servidor'], env: {} }, null, 2),
  );
  const [jsonMode, setJsonMode] = useState(!!initial);
  const [transport, setTransport] = useState(initial?.server?.url ? 'http' : 'stdio');
  const [command, setCommand] = useState(String(initial?.server?.command ?? 'npx'));
  const [args, setArgs] = useState(JSON.stringify(initial?.server?.args ?? ['-y', 'nome-do-servidor']));
  const [url, setUrl] = useState(String(initial?.server?.url ?? ''));
  const [formatError, setFormatError] = useState('');
  const parsedServer = (): Record<string, unknown> => {
    let value = JSON.parse(json) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('Definição MCP inválida.'));
    if (value.mcpServers) {
      const entries = Object.entries(value.mcpServers as Record<string, Record<string, unknown>>);
      if (entries.length !== 1) throw new Error(t('Cole uma definição por vez ou importe o arquivo JSON pela pasta.'));
      value = entries[0]![1];
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('Definição MCP inválida.'));
    }
    return value;
  };
  const formServer = (): Record<string, unknown> => {
    const parsed = parsedServer();
    const server = { ...parsed };
    for (const key of ['command', 'args', 'url', 'type']) delete server[key];
    return {
      ...server,
      ...(transport === 'http' ? { url, type: parsed.type === 'sse' ? 'sse' : 'http' } : { command, args: JSON.parse(args) as unknown }),
    };
  };
  const switchFormat = (checked: boolean) => {
    try {
      if (checked) setJson(JSON.stringify(formServer(), null, 2));
      else {
        const server = parsedServer();
        setJson(JSON.stringify(server, null, 2));
        setTransport(server.url ? 'http' : 'stdio');
        setCommand(String(server.command ?? ''));
        setArgs(JSON.stringify(server.args ?? []));
        setUrl(String(server.url ?? ''));
      }
      setFormatError('');
      setJsonMode(checked);
    } catch {
      setFormatError(t('Definição MCP inválida.'));
    }
  };
  const save = useAction(async () => {
    const server = kind === 'mcp' ? (jsonMode ? parsedServer() : formServer()) : undefined;
    await harness.saveLibraryArtifact({
      id: initial?.id,
      kind,
      name,
      description,
      body,
      ...(kind === 'agent' ? { agent } : {}),
      ...(server ? { server } : {}),
    });
    onClose();
  });
  const next = () => {
    if (step === 1) {
      const conventions = picked.map((x) => `- ${t(x)}`).join('\n');
      const commands = Object.entries(profile.scripts)
        .filter(([key]) => /test|lint|check/.test(key))
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');
      setBody(
        `# ${name || t(ARTIFACT_LABELS[kind])}\n\n${goal}\n\n## ${t('Convenções e limites')}\n${conventions}\n${limits}\n\n## ${t('Verificação')}\n${commands}`,
      );
    }
    setStep(step + 1);
  };
  return (
    <Card className="draft-card wizard" aria-label={t('Editor da biblioteca')}>
      <div className="wizard-head">
        <strong>
          {t(ARTIFACT_LABELS[kind])} · {t(QUESTIONS[step]!)}
        </strong>
        {guided && <p className="muted small">{t('Passo {n} de {total}', { n: step + 1, total: 3 })}</p>}
      </div>
      {step === 0 && (
        <>
          <p>{t(GOALS[kind])}</p>
          <FormField label={t('Objetivo')}>
            {(id) => <TextArea id={id} aria-label={t('Objetivo')} value={goal} onChange={(e) => setGoal(e.target.value)} />}
          </FormField>
          <p className="muted small">
            {t('Detectado no projeto: {text}', { text: [...profile.languages, ...profile.tools].join(', ') || profile.readme || '—' })}
          </p>
          <div className="row wrap">
            {profile.folders.map((folder) => (
              <Button key={folder} variant="soft" size="1" onClick={() => setGoal(`${goal}${goal ? '\n' : ''}${folder}`)}>
                {folder}
              </Button>
            ))}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <p>{t(DETAILS[kind])}</p>
          {OPTIONS.map((option) => (
            <label className="row" key={option}>
              <Checkbox
                checked={picked.includes(option)}
                onCheckedChange={(checked) => setPicked(checked ? [...picked, option] : picked.filter((x) => x !== option))}
              />
              {t(option)}
            </label>
          ))}
          <FormField label={t('Outras instruções')}>
            {(id) => <TextArea id={id} aria-label={t('Outras instruções')} value={limits} onChange={(e) => setLimits(e.target.value)} />}
          </FormField>
        </>
      )}
      {step === 2 && (
        <>
          <FormField label={t('Nome')}>
            {(id) => (
              <TextField.Root id={id} aria-label={t('Nome')} value={name} disabled={!!initial} onChange={(e) => setName(e.target.value)} />
            )}
          </FormField>
          <FormField label={t('Descrição')}>
            {(id) => (
              <TextField.Root id={id} aria-label={t('Descrição')} value={description} onChange={(e) => setDescription(e.target.value)} />
            )}
          </FormField>
          {kind !== 'mcp' ? (
            <FormField label={t('Conteúdo')}>
              {(id) => <TextArea id={id} aria-label={t('Conteúdo')} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />}
            </FormField>
          ) : (
            <>
              <label className="row">
                <Checkbox checked={jsonMode} onCheckedChange={(checked) => switchFormat(!!checked)} />
                {t('Editar JSON diretamente')}
              </label>
              {jsonMode ? (
                <FormField label={t('Definição JSON do MCP')}>
                  {(id) => (
                    <TextArea
                      id={id}
                      aria-label={t('Definição JSON do MCP')}
                      rows={12}
                      value={json}
                      onChange={(e) => setJson(e.target.value)}
                    />
                  )}
                </FormField>
              ) : (
                <>
                  <div className="row">
                    <Button variant={transport === 'stdio' ? 'solid' : 'soft'} onClick={() => setTransport('stdio')}>
                      stdio
                    </Button>
                    <Button variant={transport === 'http' ? 'solid' : 'soft'} onClick={() => setTransport('http')}>
                      HTTP
                    </Button>
                  </div>
                  {transport === 'http' ? (
                    <FormField label="URL">
                      {(id) => <TextField.Root id={id} aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />}
                    </FormField>
                  ) : (
                    <>
                      <FormField label={t('Comando')}>
                        {(id) => (
                          <TextField.Root id={id} aria-label={t('Comando')} value={command} onChange={(e) => setCommand(e.target.value)} />
                        )}
                      </FormField>
                      <FormField label={t('Argumentos (lista JSON)')}>
                        {(id) => (
                          <TextField.Root
                            id={id}
                            aria-label={t('Argumentos (lista JSON)')}
                            value={args}
                            onChange={(e) => setArgs(e.target.value)}
                          />
                        )}
                      </FormField>
                    </>
                  )}
                </>
              )}
              <p className="muted small">
                {t(
                  'O board conecta servidores stdio e HTTP e disponibiliza suas ferramentas pelo MCP faz-ai. Variáveis e cabeçalhos ficam na configuração local; use o JSON para informá-los.',
                )}
              </p>
            </>
          )}
          {kind === 'agent' && (
            <>
              <FormField label={t('Modelo')} hint={t('Vazio usa o modelo do card ou da sessão.')}>
                {(id) => (
                  <TextField.Root
                    id={id}
                    aria-label={t('Modelo')}
                    value={agent.model}
                    onChange={(e) => setAgent({ ...agent, model: e.target.value })}
                  />
                )}
              </FormField>
              <p>{t('Ferramentas permitidas')}</p>
              <div className="row wrap">
                {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                  <label className="row" key={category}>
                    <Checkbox
                      checked={agent.tools.categories.includes(category as ToolCategory)}
                      onCheckedChange={(checked) =>
                        setAgent({
                          ...agent,
                          tools: {
                            categories: checked
                              ? [...agent.tools.categories, category as ToolCategory]
                              : agent.tools.categories.filter((c) => c !== category),
                            native: { tool: '', allow: [], deny: [] },
                          },
                        })
                      }
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
              {(['skill', 'mcp'] as const).map((type) => (
                <section key={type}>
                  <p>{t(ARTIFACT_LABELS[type])}</p>
                  {artifacts
                    .filter((a) => a.kind === type)
                    .map((a) => {
                      const field = type === 'skill' ? 'skills' : 'mcpServers';
                      return (
                        <label className="row" key={a.id}>
                          <Checkbox
                            checked={agent[field].includes(a.name)}
                            onCheckedChange={(checked) =>
                              setAgent({
                                ...agent,
                                [field]: checked ? [...agent[field], a.name] : agent[field].filter((n) => n !== a.name),
                              })
                            }
                          />
                          {a.name}
                        </label>
                      );
                    })}
                </section>
              ))}
            </>
          )}
          {kind === 'rule' && <p className="muted small">{t('A regra será salva desligada. Revise e ative quando estiver pronta.')}</p>}
        </>
      )}
      {(save.error || formatError) && <p role="alert">{save.error || formatError}</p>}
      <div className="form-actions">
        <Button variant="ghost" disabled={save.busy} onClick={onClose}>
          {t('Cancelar')}
        </Button>
        {guided && step > 0 && (
          <Button variant="soft" onClick={() => setStep(step - 1)}>
            {t('Voltar')}
          </Button>
        )}
        {step < 2 ? (
          <Button disabled={step === 0 && !goal.trim()} onClick={next}>
            {t('Continuar')}
          </Button>
        ) : (
          <ActionButton
            loading={save.busy}
            disabled={!name.trim() || (kind !== 'mcp' && !body.trim())}
            disabledReason={t('Preencha nome e conteúdo.')}
            hint={t('Salva apenas na biblioteca deste board.')}
            onClick={() => void save.run()}
          >
            {t('Salvar na biblioteca')}
          </ActionButton>
        )}
      </div>
    </Card>
  );
}
