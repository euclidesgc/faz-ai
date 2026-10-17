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
import { InstallSkills } from './InstallSkills';
import { t } from '../../../i18n';

/** A biblioteca pertence ao board: a ferramenta selecionada só decide como executar os artefatos. */
export function BoardLibrary() {
  const state = useBoardStore((s) => s.state)!;
  const library = state.harness.library;
  const [directory, setDirectory] = useState(library?.directory ?? '');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<HarnessTopic>('skill');
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
    <div className="scope-harness">
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
          'Skills, agentes e regras copiados para este board ficam disponíveis com qualquer ferramenta de IA. As fontes originais são preservadas.',
        )}
      </SectionHeader>
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
      <InstallSkills
        tool={state.board.aiTool}
        library
        onImported={() => {
          setTopic('skill');
          setQuery('');
        }}
      />
      <p className="muted small">
        {t(
          'Cada skill aceita arquivos de até 512 KB, até 100 arquivos de apoio e 5 MB no total. Itens omitidos aparecem na lista do board.',
        )}
      </p>
      <p className="muted small">
        {t(
          'As skills aparecem no campo Skills dos cards e no planejamento. Pelo card só entra quando escolhido; Sempre entra em toda execução.',
        )}
      </p>
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
            <BoardList
              kind={x.kind!}
              query={query}
              onOpenCatalog={(origin) => useBoardStore.setState({ harnessTab: state.board.aiTool, harnessOrigin: origin })}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
