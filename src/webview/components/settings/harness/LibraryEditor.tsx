import { useState } from 'react';
import { Button, Card, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import type { ArtifactKind, LibraryArtifactInput } from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';
import { ARTIFACT_LABELS } from './LibraryImport';
import { MarkdownEditor } from '../../MarkdownEditor';
import { LIBRARY_GUIDE } from './libraryGuide';
import { LibraryAgentEditor } from './LibraryAgentEditor';
import { t } from '../../../i18n';

export function LibraryEditor(props: { kind: ArtifactKind; initial?: LibraryArtifactInput; guided?: boolean; onClose: () => void }) {
  return props.kind === 'agent' ? (
    <LibraryAgentEditor initial={props.initial} guided={props.guided} onClose={props.onClose} />
  ) : (
    <ArtifactEditor {...props} kind={props.kind} />
  );
}

/** Criação neutra com revisão final; o mesmo editor mantém metadados e dependências na edição. */
function ArtifactEditor({
  kind,
  initial,
  guided = false,
  onClose,
}: {
  kind: Exclude<ArtifactKind, 'agent'>;
  initial?: LibraryArtifactInput;
  guided?: boolean;
  onClose: () => void;
}) {
  const sections = LIBRARY_GUIDE[kind];
  const reviewStep = sections.length;
  const [step, setStep] = useState(guided ? 0 : sections.length);
  const current = sections[step];
  const [name, setName] = useState(initial?.name ?? (kind === 'rule' ? 'AGENTS.md' : ''));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [body, setBody] = useState(initial?.body ?? '');
  const [draftedInputs, setDraftedInputs] = useState('');
  const [json, setJson] = useState(
    JSON.stringify(initial?.server ?? { command: 'npx', args: ['-y', 'nome-do-servidor'], env: {} }, null, 2),
  );
  const [jsonMode, setJsonMode] = useState(!!initial);
  const [transport, setTransport] = useState(initial?.server?.url ? 'http' : 'stdio');
  const [command, setCommand] = useState(String(initial?.server?.command ?? 'npx'));
  const [args, setArgs] = useState(JSON.stringify(initial?.server?.args ?? ['-y', 'nome-do-servidor']));
  const [url, setUrl] = useState(String(initial?.server?.url ?? ''));
  const [formatError, setFormatError] = useState('');
  const [replaceServer, setReplaceServer] = useState(!initial?.mcpCredential);
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
    const server = kind === 'mcp' && replaceServer ? (jsonMode ? parsedServer() : formServer()) : undefined;
    await harness.saveLibraryArtifact({
      id: initial?.id,
      kind,
      name,
      description,
      body,
      ...(server ? { server } : {}),
    });
    onClose();
  });
  const next = () => {
    const inputs = JSON.stringify(answers);
    if (step === reviewStep - 1 && draftedInputs !== inputs) {
      setDraftedInputs(inputs);
      setBody(
        [
          `# ${name || t(ARTIFACT_LABELS[kind])}`,
          ...sections.flatMap((section, index) => {
            const answer = answers[index]?.trim();
            return answer ? [`## ${t(section.title)}\n\n${answer}`] : [];
          }),
        ].join('\n\n'),
      );
    }
    setStep(step + 1);
  };
  return (
    <Card className="draft-card wizard library-editor" aria-label={t('Editor da biblioteca')}>
      <div className="wizard-head">
        <strong>
          {t(ARTIFACT_LABELS[kind])} · {current ? t(current.title) : t('Revisar e salvar')}
        </strong>
        {guided && (
          <ol className="library-wizard-steps" aria-label={t('Etapas do assistente')}>
            {[...sections.map((section) => section.title), 'Revisar e salvar'].map((question, index) => (
              <li key={question} aria-current={step === index ? 'step' : undefined}>
                <span>
                  {index + 1}. {t(question)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {guided && current && (
        <section className="library-guide-question">
          <p className="muted small">{t(current.hint)}</p>
          <FormField
            label={t(current.title)}
            hint={t('Escreva com suas palavras ou use o exemplo e adapte ao seu projeto. As etapas após a primeira são opcionais.')}
          >
            {(id) => (
              <MarkdownEditor
                id={id}
                ariaLabel={t(current.title)}
                value={answers[step] ?? ''}
                onChange={(value) => setAnswers({ ...answers, [step]: value })}
                placeholder={t('{instruction}\n\nExemplo:\n{example}', { instruction: t(current.hint), example: t(current.example) })}
                minRows={5}
              />
            )}
          </FormField>
          <div className="library-guide-example">
            <strong>{t('Exemplo para adaptar')}</strong>
            <p>{t(current.example)}</p>
            <Button
              size="1"
              variant="soft"
              onClick={() =>
                setAnswers({ ...answers, [step]: answers[step]?.trim() ? `${answers[step]}\n\n${t(current.example)}` : t(current.example) })
              }
            >
              {t('Usar este exemplo')}
            </Button>
          </div>
        </section>
      )}
      {step === reviewStep && (
        <>
          {guided && (
            <p className="muted small">{t('Revise o Markdown montado com suas respostas. Ajuste o nome e o conteúdo antes de salvar.')}</p>
          )}
          <FormField label={t('Nome')}>
            {(id) => (
              <TextField.Root id={id} aria-label={t('Nome')} value={name} disabled={!!initial} onChange={(e) => setName(e.target.value)} />
            )}
          </FormField>
          {kind !== 'rule' && (
            <FormField
              label={kind === 'mcp' ? t('Para que serve este MCP?') : t('Descrição')}
              hint={
                kind === 'mcp'
                  ? t(
                      'Explique o que este MCP oferece e quando usá-lo. Exemplo: consulta issues e pull requests do GitHub para acompanhar o desenvolvimento.',
                    )
                  : undefined
              }
            >
              {(id) =>
                kind === 'mcp' ? (
                  <TextArea
                    id={id}
                    aria-label={t('Para que serve este MCP?')}
                    rows={3}
                    value={description}
                    placeholder={t('Exemplo: consulta issues e pull requests do GitHub para acompanhar o desenvolvimento.')}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                ) : (
                  <TextField.Root
                    id={id}
                    aria-label={t('Descrição')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )
              }
            </FormField>
          )}
          {kind !== 'mcp' ? (
            <div className="form-field">
              <span>{t('Conteúdo')}</span>
              <MarkdownEditor value={body} onChange={setBody} minRows={12} placeholder={t('Conteúdo')} />
            </div>
          ) : (
            <>
              {initial?.mcpCredential && (
                <>
                  <p className="muted small">
                    {t(
                      'A configuração salva fica apenas no host e não é devolvida ao editor. Sem substituir, os valores atuais são preservados.',
                    )}
                  </p>
                  {initial.mcpCredential.review === 'pending' && (
                    <p className="muted small">
                      {t('Este MCP está pendente de revisão. Informe uma nova definição para revisar e habilitar a execução.')}
                    </p>
                  )}
                  {!initial.mcpCredential.available && (
                    <p className="muted small">{t('A configuração local desta referência não está disponível nesta máquina.')}</p>
                  )}
                  <label className="row">
                    <Checkbox checked={replaceServer} onCheckedChange={(checked) => setReplaceServer(checked === true)} />
                    {t('Substituir a configuração salva')}
                  </label>
                </>
              )}
              {replaceServer && (
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
                              <TextField.Root
                                id={id}
                                aria-label={t('Comando')}
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                              />
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
        {step < reviewStep ? (
          <Button disabled={step === 0 && !answers[0]?.trim()} onClick={next}>
            {step > 0 && !answers[step]?.trim() ? t('Pular esta parte') : t('Continuar')}
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
