import { useEffect, useState } from 'react';
import { Badge, Tabs, TextField } from '@radix-ui/themes';
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
  const topics = HARNESS_TOPICS.filter((x) => x.kind);
  return (
    <div className="scope-harness">
      <SectionHeader title={t('Biblioteca do board')}>
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
          hint={t('Abre a pasta da biblioteca no editor.')}
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
      <InstallSkills tool={state.board.aiTool} library />
      <p className="muted small">
        {t(
          'Cada skill aceita arquivos de até 512 KB, até 100 arquivos de apoio e 5 MB no total. Itens omitidos aparecem na lista do board.',
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
