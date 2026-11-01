import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, TextArea, TextField } from '@radix-ui/themes';
import type { ArtifactAssistDraft } from '../../../../shared/artifactAssistant';
import { boardFrontmatter, isFolderPath, isSemver, normalizeTools, type NeutralTool } from '../../../../shared/artifactTools';
import { defaultVersion, isActive, type AgentMeta, type BoardArtifact } from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { getLocale, t } from '../../../i18n';
import { requestArtifactAssistance } from '../../../request';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, ChipsEditor, FormField, IconSuggest, SelectField } from '../../ui';
import { MarkdownEditor } from '../../MarkdownEditor';
import { CompatPanel, ExportPreview, FrontmatterPanel, skillRef, splitDocument } from './FormPanels';
import { ToolGrid } from './ToolGrid';
import { useArtifactText } from './useArtifactText';

const ROOT = '__root';
const NEW_FOLDER = '__new';
const INHERIT = '__inherit';
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EMPTY_META: AgentMeta = {
  skills: [],
  mcpServers: [],
  model: '',
  tools: { categories: [], native: { tool: '', allow: [], deny: [] } },
};

/**
 * "Nova skill" / "Novo agente" e a edição deles: o mesmo formulário com as variações de cada tipo. Ao lado, o que o
 * board grava (frontmatter), a compatibilidade entre skills e agentes e a prévia do que vai para a ferramenta do projeto.
 */
export function ArtifactFormModal({
  kind,
  artifact,
  initial,
  onClose,
  onAssist,
}: {
  kind: 'skill' | 'agent';
  /** o artefato a editar; ausente = novo */
  artifact?: BoardArtifact;
  /** pré-preenchimento (do "Criar com IA" ou do "Duplicar") */
  initial?: Partial<ArtifactAssistDraft>;
  onClose: () => void;
  onAssist: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const library = state.harness.library;
  const artifacts = library?.artifacts ?? [];
  const skillFolders = library?.skillFolders ?? [];
  const isAgent = kind === 'agent';
  // a skill gerada pela extensão (skill do fluxo) é só de leitura
  const readonly = !!artifact?.generated;

  const [name, setName] = useState(artifact?.name ?? initial?.name ?? '');
  const [description, setDescription] = useState(artifact?.description ?? initial?.description ?? '');
  const [version, setVersion] = useState(artifact?.version ?? initial?.version ?? defaultVersion(kind));
  const [tools, setTools] = useState<NeutralTool[]>(artifact?.tools ?? initial?.tools ?? []);
  const [suggested, setSuggested] = useState<NeutralTool[]>(initial?.tools ?? []);
  const [folder, setFolder] = useState(artifact?.folder ?? initial?.folder ?? '');
  const [newFolder, setNewFolder] = useState(false);
  const [skills, setSkills] = useState<string[]>(artifact?.agent?.skills ?? initial?.skills ?? []);
  const [model, setModel] = useState(artifact?.agent?.model ?? initial?.model ?? '');
  const [goal, setGoal] = useState('');

  // a skill existente: o SKILL.md vem do host; o frontmatter original volta junto ao salvar (guarda as outras opções YAML)
  const read = useArtifactText('skill', !isAgent ? artifact?.name : undefined);
  const originalMeta = useRef('');
  const [body, setBody] = useState(() =>
    isAgent ? (artifact?.body ?? initial?.body ?? '') : artifact ? '' : splitDocument(initial?.body ?? '').body,
  );
  const [loaded, setLoaded] = useState(isAgent || !artifact);
  useEffect(() => {
    if (read.text === null) return;
    const doc = splitDocument(read.text);
    originalMeta.current = doc.meta;
    setBody(doc.body);
    setLoaded(true);
  }, [read.text]);

  const taken = artifacts.filter((a) => a.kind === kind && a.id !== artifact?.id).map((a) => a.name);
  const trimmedName = name.trim();
  const trimmedFolder = folder.trim().replace(/^\/+|\/+$/g, '');
  const problems = {
    name: artifact
      ? null
      : !trimmedName
        ? t('Dê um nome.')
        : !NAME_PATTERN.test(trimmedName)
          ? t('Use letras minúsculas, números e hífens.')
          : taken.includes(trimmedName)
            ? t('Já existe um item com este nome.')
            : null,
    version: isSemver(version) ? null : t('Use o formato 1.0.0.'),
    folder: !isAgent && !isFolderPath(trimmedFolder) ? t('Use letras minúsculas, números e hífens, com "/" entre os níveis.') : null,
    description: !artifact && !description.trim() ? t('Escreva a descrição.') : null,
    body: body.trim() ? null : isAgent ? t('Escreva o prompt do agente.') : t('Escreva as instruções da skill.'),
  };
  const firstProblem = !loaded ? t('Lendo a skill…') : (Object.values(problems).find(Boolean) ?? null);
  const showName = problems.name && trimmedName ? problems.name : null;

  const folderValue = newFolder ? NEW_FOLDER : trimmedFolder === '' ? ROOT : trimmedFolder;
  const folderOptions = [
    { value: ROOT, label: t('Raiz da biblioteca') },
    ...[...new Set([...skillFolders, ...(trimmedFolder && !newFolder ? [trimmedFolder] : [])])].map((f) => ({ value: f, label: f })),
    { value: NEW_FOLDER, label: t('Nova pasta…') },
  ];
  const catalog = state.board.modelCatalog.filter((m) => m.tool === state.board.aiTool);
  const modelOptions = [
    { value: INHERIT, label: 'inherit' },
    ...catalog.map((m) => ({ value: m.id, label: m.label })),
    ...(model && !catalog.some((m) => m.id === model) ? [{ value: model, label: model }] : []),
  ];
  const skillChoices = [...new Set([...artifacts.filter((a) => a.kind === 'skill' && isActive(a)).map(skillRef), ...skills])].sort();

  const draftOf = (): ArtifactAssistDraft => ({
    name: trimmedName,
    description,
    version,
    body,
    tools,
    ...(isAgent ? { skills, model } : { folder: trimmedFolder }),
  });
  const frontmatter = useMemo(
    () =>
      boardFrontmatter({
        kind,
        name: trimmedName,
        description,
        version,
        tools,
        ...(isAgent ? { skills, model } : { folder: trimmedFolder }),
      }),
    [kind, isAgent, trimmedName, description, version, tools, skills, model, trimmedFolder],
  );

  const chatBusy = state.chat.busy;
  const suggest = useAction(async () => {
    const result = await requestArtifactAssistance(
      { mode: 'suggest', kind, goal: goal.trim(), answers: [], draft: draftOf(), language: getLocale() },
      (state.board.runner.timeoutMinutes + 1) * 60_000,
    );
    const d = result.draft;
    if (!artifact && d.name) setName(d.name);
    if (d.description) setDescription(d.description);
    if (isSemver(d.version)) setVersion(d.version);
    const picked = normalizeTools(kind, d.tools);
    setTools(picked);
    setSuggested(picked);
    if (isAgent) {
      if (d.skills) setSkills(d.skills);
      if (d.model !== undefined) setModel(d.model);
    } else if (d.folder !== undefined) {
      setFolder(d.folder);
      setNewFolder(!!d.folder && !skillFolders.includes(d.folder));
    }
    if (d.body.trim()) setBody(isAgent ? d.body : splitDocument(d.body).body);
  });

  const save = useAction(async (active: boolean) => {
    const text = !isAgent && originalMeta.current ? originalMeta.current + body : body;
    await harness.saveLibraryArtifact({
      ...(artifact ? { id: artifact.id } : {}),
      kind,
      name: trimmedName,
      description: description.trim(),
      body: text,
      version: version.trim(),
      tools,
      ...(isAgent ? { agent: { ...(artifact?.agent ?? EMPTY_META), skills, model } } : { folder: trimmedFolder }),
      ...(artifact ? {} : { active }),
    });
    onClose();
  });
  const canSave = !readonly && !firstProblem;
  const busy = save.busy || suggest.busy;
  const title = artifact ? (isAgent ? t('Editar agente') : t('Editar skill')) : isAgent ? t('Novo agente') : t('Nova skill');
  const goalLabel = isAgent ? t('Qual é o objetivo deste agente?') : t('O que esta skill deve ensinar?');

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !save.busy && onClose()}>
      <Dialog.Content className="board-dialog board-dialog-xl scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <header className="board-dialog-head">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>
            {readonly
              ? t('Skill gerada pela extensão: só para leitura.')
              : isAgent
                ? t('O papel de uma sessão: o prompt, as tools que ela recebe e as skills que lê em toda execução.')
                : t('Instruções que a IA lê quando a skill é vinculada a um card, e as tools de que ela precisa.')}
          </Dialog.Description>
        </header>

        <div className="artifact-form board-dialog-scroll">
          <div className="artifact-form-main">
            {!artifact && !readonly && (
              <div className="suggest-box">
                <FormField label={goalLabel}>
                  {(id) => (
                    <TextArea
                      id={id}
                      rows={2}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder={
                        isAgent
                          ? t('Ex.: revisar pull requests e apontar riscos antes do merge')
                          : t('Ex.: como escrever testes de interface com Testing Library')
                      }
                    />
                  )}
                </FormField>
                <ActionButton
                  variant="soft"
                  loading={suggest.busy}
                  disabled={!goal.trim() || chatBusy}
                  disabledReason={
                    chatBusy ? t('A IA está respondendo no chat. Espere terminar.') : t('Escreva o objetivo para a IA sugerir.')
                  }
                  hint={t('A IA lê o objetivo e preenche nome, descrição, tools e instruções. Você revisa antes de salvar.')}
                  onClick={() => void suggest.run()}
                >
                  <IconSuggest aria-hidden /> {t('Sugerir configuração')}
                </ActionButton>
                {suggest.error && (
                  <p role="alert" className="form-error">
                    {suggest.error}
                  </p>
                )}
              </div>
            )}

            <div className="artifact-form-row">
              <FormField label={t('Nome')} hint={showName ?? t('Letras minúsculas, números e hífens.')}>
                {(id) => (
                  <TextField.Root
                    id={id}
                    value={name}
                    disabled={!!artifact || readonly}
                    spellCheck={false}
                    color={showName ? 'red' : undefined}
                    aria-invalid={showName ? true : undefined}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t('Versão')} hint={problems.version ?? undefined}>
                {(id) => (
                  <TextField.Root
                    id={id}
                    value={version}
                    disabled={readonly}
                    spellCheck={false}
                    color={problems.version ? 'red' : undefined}
                    aria-invalid={problems.version ? true : undefined}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                )}
              </FormField>
            </div>

            {isAgent ? (
              <FormField label={t('Modelo')} hint={t('"inherit" usa o modelo do card ou da sessão.')}>
                {(id) => (
                  <SelectField
                    id={id}
                    aria-label={t('Modelo')}
                    options={modelOptions}
                    value={model || INHERIT}
                    onChange={(v) => setModel(v === INHERIT ? '' : v)}
                  />
                )}
              </FormField>
            ) : (
              <FormField label={t('Pasta')} hint={problems.folder ?? t('Só organiza a biblioteca; a skill é citada como pasta/nome.')}>
                {(id) => (
                  <div className="field-with-action">
                    <SelectField
                      id={id}
                      aria-label={t('Pasta')}
                      options={folderOptions}
                      value={folderValue}
                      disabled={readonly}
                      onChange={(v) => {
                        setNewFolder(v === NEW_FOLDER);
                        setFolder(v === ROOT || v === NEW_FOLDER ? '' : v);
                      }}
                    />
                    {newFolder && (
                      <TextField.Root
                        aria-label={t('Nome da nova pasta')}
                        placeholder="front/testes"
                        value={folder}
                        spellCheck={false}
                        color={problems.folder ? 'red' : undefined}
                        onChange={(e) => setFolder(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </FormField>
            )}

            <FormField label={t('Descrição')} hint={problems.description ?? t('Uma frase: é por ela que a IA escolhe quando usar.')}>
              {(id) => <TextField.Root id={id} value={description} disabled={readonly} onChange={(e) => setDescription(e.target.value)} />}
            </FormField>

            <FormField
              label={isAgent ? t('Tools que o agente concede') : t('Tools de que a skill precisa')}
              hint={
                isAgent
                  ? t('O agente só usa o que concede aqui.')
                  : t('Um agente só roda esta skill por inteiro se conceder as mesmas tools.')
              }
            >
              {() => <ToolGrid kind={kind} value={tools} onChange={setTools} suggested={suggested} disabled={readonly} />}
            </FormField>

            {isAgent && (
              <FormField
                label={t('Skills padrão')}
                hint={t('Lidas em toda execução com este agente, somadas às skills vinculadas no card. Só as skills ativas.')}
              >
                {() => (
                  <ChipsEditor
                    options={skillChoices}
                    values={skills}
                    onChange={setSkills}
                    empty={t('Nenhuma skill ativa na biblioteca.')}
                  />
                )}
              </FormField>
            )}

            <FormField
              label={isAgent ? t('Prompt de sistema') : t('Instruções da skill')}
              hint={read.error ?? (!loaded ? t('Lendo a skill…') : undefined)}
            >
              {(id) => (
                <MarkdownEditor
                  id={id}
                  ariaLabel={isAgent ? t('Prompt de sistema') : t('Instruções da skill')}
                  minRows={12}
                  value={body}
                  onChange={readonly ? () => undefined : setBody}
                />
              )}
            </FormField>
          </div>

          <aside className="artifact-form-side" aria-label={t('Painel do arquivo')}>
            <FrontmatterPanel text={frontmatter} />
            <CompatPanel kind={kind} tools={tools} skills={skills} self={artifact?.name} />
            <ExportPreview kind={kind} tools={tools} />
          </aside>
        </div>

        {save.error && (
          <p role="alert" className="form-error">
            {save.error}
          </p>
        )}
        <footer className="board-dialog-footer">
          {!artifact && (
            <ActionButton variant="ghost" hint={t('Fecha este formulário e deixa a IA fazer perguntas, uma por vez.')} onClick={onAssist}>
              <IconSuggest aria-hidden /> {t('Criar com IA')}
            </ActionButton>
          )}
          <span className="spacer" />
          <ActionButton variant="soft" color="gray" hint={t('Fecha sem salvar.')} onClick={onClose} disabled={save.busy}>
            {readonly ? t('Fechar') : t('Cancelar')}
          </ActionButton>
          {!readonly &&
            (artifact ? (
              <ActionButton
                disabled={!canSave || busy}
                disabledReason={firstProblem}
                loading={save.busy}
                hint={t('Grava as alterações; o item continua ativo ou inativo como estava.')}
                onClick={() => void save.run(false)}
              >
                {t('Salvar')}
              </ActionButton>
            ) : (
              <>
                <ActionButton
                  variant="soft"
                  disabled={!canSave || busy}
                  disabledReason={firstProblem}
                  loading={save.busy}
                  hint={t('Grava na biblioteca sem ativar.')}
                  onClick={() => void save.run(false)}
                >
                  {t('Salvar inativa')}
                </ActionButton>
                <ActionButton
                  disabled={!canSave || busy}
                  disabledReason={firstProblem}
                  loading={save.busy}
                  hint={t('Grava e ativa: passa a poder ser vinculado aos cards.')}
                  onClick={() => void save.run(true)}
                >
                  {t('Salvar e ativar')}
                </ActionButton>
              </>
            ))}
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
