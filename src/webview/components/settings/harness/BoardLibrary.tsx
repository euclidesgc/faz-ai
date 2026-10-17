import { useEffect, useState } from 'react';
import { Badge, Callout, Tabs, TextField } from '@radix-ui/themes';
import { selectableOfKind } from '../../../../shared/artifacts';
import { HARNESS_TOPICS, type HarnessTopic } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { BoardList } from './BoardList';
import { LibraryImport } from './LibraryImport';
import { LibraryEditor } from './LibraryEditor';
import { ai } from '../../../commands';
import { onHostMessage } from '../../../vscode';
import { kindOfSelectable, type LibraryArtifactInput, type ArtifactKind } from '../../../../shared/artifacts';
import { t } from '../../../i18n';

/** A biblioteca pertence ao board: a ferramenta selecionada só decide como executar os artefatos. */
export function BoardLibrary() {
  const state = useBoardStore((s) => s.state)!;
  const library = state.harness.library;
  const [directory, setDirectory] = useState(library?.directory ?? '');
  const [editor, setEditor] = useState<{ kind: ArtifactKind; guided?: boolean; initial?: LibraryArtifactInput } | null>(null);
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type === 'harness.library.content') setEditor({ kind: msg.input.kind, initial: msg.input });
      }),
    [],
  );
  const [query, setQuery] = useState('');
  const storedTopic = useBoardStore((s) => s.harnessTopic);
  const topic: HarnessTopic = ['rules', 'skill', 'agent', 'mcp'].includes(storedTopic) ? storedTopic : 'rules';
  const setTopic = (topic: HarnessTopic) => {
    useBoardStore.setState({ harnessTopic: topic });
    setEditor(null);
  };
  useEffect(() => setDirectory(library?.directory ?? ''), [library?.directory]);
  const save = useAction(() => harness.setLibraryDirectory(directory));
  const open = useAction(() => harness.openLibrary());
  const { run: refresh, busy: refreshing } = useAction(() => harness.refresh());
  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  const topics = HARNESS_TOPICS.filter((x) => x.kind);
  return (
    <div className="scope-harness board-library">
      <SectionHeader
        title={t('Biblioteca do board')}
        actions={
          <ActionButton
            variant="soft"
            color="gray"
            loading={refreshing}
            hint={t('Reconhece skills coladas na pasta e atualiza a lista sem apagar seus arquivos.')}
            onClick={() => void refresh()}
          >
            {t('Atualizar lista')}
          </ActionButton>
        }
      >
        {t(
          'Crie, importe e gerencie os artefatos deste board. Cada aba reúne um tipo, disponível com qualquer ferramenta de IA conectada.',
        )}
      </SectionHeader>
      <details className="library-storage">
        <summary>{t('Armazenamento da biblioteca')}</summary>
        <label className="form-field">
          <span>{t('Pasta da biblioteca')}</span>
          <TextField.Root
            aria-label={t('Pasta da biblioteca')}
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder={t('Caminho completo de uma pasta vazia')}
          />
        </label>
        <p className="muted small">{t('Esta é a pasta de destino do board. A pasta de origem é escolhida na importação abaixo.')}</p>
        <div className="row wrap">
          <ActionButton
            variant="soft"
            loading={save.busy}
            disabled={!directory.trim() || directory === library?.directory}
            disabledReason={t('Informe uma nova pasta para a biblioteca.')}
            hint={t('Copia a biblioteca para a nova pasta e passa a usá-la. A pasta anterior é preservada.')}
            onClick={() => void save.run()}
          >
            {t('Salvar pasta')}
          </ActionButton>
          <ActionButton
            variant="soft"
            color="gray"
            loading={open.busy}
            disabled={!library?.directory}
            disabledReason={t('A biblioteca ainda não está disponível.')}
            hint={t('Abre a pasta da biblioteca no gerenciador de arquivos do sistema.')}
            onClick={() => void open.run()}
          >
            {t('Abrir pasta')}
          </ActionButton>
        </div>
        <p className="muted small">
          {t(
            'A biblioteca é local e particular. As skills importadas não são distribuídas com a extensão. Atualizações da origem só entram quando você pede.',
          )}
        </p>
        <p className="muted small">
          {t(
            'Você pode colar pastas de skills aqui. Cada pasta deve conter SKILL.md; os arquivos de apoio vão junto. Ao voltar à tela ou clicar em Atualizar lista, elas aparecem em Skills, no modo Pelo card.',
          )}
        </p>
      </details>
      {library?.warnings?.map((warning) => (
        <Callout.Root key={warning.path} color="amber" size="1">
          <Callout.Text>
            {warning.reason === 'duplicate'
              ? t(
                  'A pasta "{path}" tem o mesmo nome de uma skill já cadastrada. Seus arquivos foram preservados; renomeie a pasta para importar outra skill.',
                  { path: warning.path },
                )
              : warning.reason === 'invalid'
                ? t('A pasta "{path}" precisa de um nome com letras minúsculas, números e hífens.', { path: warning.path })
                : t('Não foi possível ler "{path}". Os arquivos foram preservados; confira o SKILL.md e os limites abaixo.', {
                    path: warning.path,
                  })}
          </Callout.Text>
        </Callout.Root>
      ))}
      {!!library?.warnings?.length && (
        <p className="muted small">
          {t(
            'Cada skill aceita arquivos de até 512 KB, até 100 arquivos de apoio e 5 MB no total. Itens omitidos aparecem na lista do board.',
          )}
        </p>
      )}
      <LibraryImport />
      <TextField.Root
        type="search"
        aria-label={t('Buscar na biblioteca')}
        placeholder={t('Buscar por nome ou descrição…')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Tabs.Root value={topic} onValueChange={(value) => setTopic(value as HarnessTopic)}>
        <Tabs.List>
          {topics.map((x) => (
            <Tabs.Trigger key={x.id} value={x.id}>
              {t(x.label)}
              {!!library?.artifacts.some((a) => selectableOfKind(a.kind) === x.kind) && (
                <Badge size="1" variant="soft">
                  {library.artifacts.filter((a) => selectableOfKind(a.kind) === x.kind).length}
                </Badge>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {topics.map((x) => (
          <Tabs.Content key={x.id} value={x.id}>
            <div className="actions-toolbar">
              <ActionButton hint={t('Cria um artefato nesta aba.')} onClick={() => setEditor({ kind: kindOfSelectable(x.kind!) })}>
                {t('Criar')}
              </ActionButton>
              {x.kind !== 'mcp' && (
                <>
                  <ActionButton
                    variant="soft"
                    hint={t('Responda às perguntas e revise o conteúdo antes de salvar.')}
                    onClick={() => setEditor({ kind: kindOfSelectable(x.kind!), guided: true })}
                  >
                    {t('Assistente guiado')}
                  </ActionButton>
                  <ActionButton
                    variant="soft"
                    disabled={state.chat.busy}
                    disabledReason={t('Aguarde a resposta da IA.')}
                    hint={t('A IA analisa o projeto e cria sugestões na biblioteca. Acompanhe pela conversa do board.')}
                    onClick={() => {
                      if (x.kind === 'instructions') ai.suggestRules();
                      else if (x.kind === 'skill') ai.suggestSkills();
                      else ai.suggestAgents();
                      useBoardStore.getState().setChatOpen(true);
                    }}
                  >
                    {t('Gerar com base no projeto')}
                  </ActionButton>
                </>
              )}
            </div>
            {editor?.kind === kindOfSelectable(x.kind!) && (
              <LibraryEditor key={editor.initial?.id ?? `${editor.kind}-${editor.guided}`} {...editor} onClose={() => setEditor(null)} />
            )}
            {x.kind === 'mcp' && (
              <p className="muted small">
                {t(
                  'Conecte sua ferramenta ao MCP faz-ai uma vez. Os servidores desta aba são acessados por list_board_mcp_tools e call_board_mcp_tool, sem copiar configurações entre ferramentas.',
                )}
              </p>
            )}
            <BoardList kind={x.kind!} query={query} onOpenCatalog={() => setEditor({ kind: kindOfSelectable(x.kind!) })} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
