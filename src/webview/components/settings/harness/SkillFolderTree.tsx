import { useState, type CSSProperties } from 'react';
import { TextField } from '@radix-ui/themes';
import { folderTree, type FolderNode } from '../../../../shared/artifactLibrary';
import { isFolderPath } from '../../../../shared/artifactTools';
import type { BoardArtifact } from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { ActionButton, IconFolder, IconPlus } from '../../ui';
import { t } from '../../../i18n';

/**
 * O painel de pastas das skills: "Todas" no topo e as pastas com os níveis de baixo, cada uma com a contagem de skills
 * (as subpastas entram). Clicar filtra a lista; "Nova pasta" cria dentro da selecionada.
 */
export function SkillFolderTree({
  folders,
  skills,
  selected,
  onSelect,
}: {
  folders: readonly string[];
  skills: readonly BoardArtifact[];
  /** a pasta selecionada; `null` = todas */
  selected: string | null;
  onSelect: (folder: string | null) => void;
}) {
  const tree = folderTree(folders, skills);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const create = useAction((path: string) => harness.addSkillFolder(path));
  // a pasta nova nasce dentro da selecionada
  const full = selected ? `${selected}/${name.trim()}` : name.trim();

  const close = () => {
    setAdding(false);
    setName('');
    setProblem(null);
  };
  const submit = async () => {
    if (!name.trim() || !isFolderPath(full)) {
      setProblem(t('Use letras minúsculas, números e hífens; "/" separa os níveis.'));
      return;
    }
    if (await create.run(full)) {
      onSelect(full);
      close();
    }
  };

  const item = (n: FolderNode, depth: number): JSX.Element => (
    <li key={n.path}>
      <button
        type="button"
        className="folder-item"
        style={{ '--depth': depth } as CSSProperties}
        aria-pressed={selected === n.path}
        onClick={() => onSelect(n.path)}
      >
        <IconFolder />
        <span className="folder-name">{n.name}</span>
        <span className="muted small">{n.count}</span>
      </button>
      {n.children.length > 0 && <ul>{n.children.map((c) => item(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <nav className="folder-tree" aria-label={t('Pastas de skills')}>
      <ul>
        <li>
          <button type="button" className="folder-item" aria-pressed={selected === null} onClick={() => onSelect(null)}>
            <span className="folder-name">{t('Todas')}</span>
            <span className="muted small">{skills.length}</span>
          </button>
          <ul>{tree.map((n) => item(n, 1))}</ul>
        </li>
      </ul>
      {adding ? (
        <div className="folder-new">
          <TextField.Root
            size="1"
            autoFocus
            aria-label={t('Nome da pasta')}
            placeholder={selected ? t('nova-pasta (dentro de {folder})', { folder: selected }) : t('nova-pasta')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') close();
            }}
          />
          {problem && (
            <span className="error small" role="alert">
              {problem}
            </span>
          )}
          <span className="row-actions">
            <ActionButton size="1" variant="soft" color="gray" hint={t('Descarta a pasta nova.')} onClick={close}>
              {t('Cancelar')}
            </ActionButton>
            <ActionButton
              size="1"
              loading={create.busy}
              disabled={!name.trim()}
              disabledReason={t('Informe o nome da pasta.')}
              hint={t('Cria a pasta; ela fica no painel mesmo sem skills.')}
              onClick={() => void submit()}
            >
              {t('Criar pasta')}
            </ActionButton>
          </span>
        </div>
      ) : (
        <ActionButton
          size="1"
          variant="ghost"
          hint={selected ? t('Cria uma pasta dentro de "{folder}".', { folder: selected }) : t('Cria uma pasta na raiz das skills.')}
          onClick={() => setAdding(true)}
        >
          <IconPlus /> {t('Nova pasta')}
        </ActionButton>
      )}
    </nav>
  );
}
