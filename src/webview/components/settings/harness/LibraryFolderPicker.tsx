import { useEffect, useState } from 'react';
import { Button, Dialog, TextField } from '@radix-ui/themes';
import type { HostToWebview } from '../../../../shared/messages';
import { harness } from '../../../commands';
import { onHostMessage } from '../../../vscode';
import { useAction } from '../../../useAction';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';

/** Navega nas pastas do computador que executa o board; o navegador não expõe caminhos pelo seletor de arquivos. */
export function LibraryFolderPicker({ onClose, onSelect }: { onClose(): void; onSelect(path: string): void }) {
  const [listing, setListing] = useState<Extract<HostToWebview, { type: 'harness.library.foldersResult' }>>();
  const [path, setPath] = useState('');
  const browse = useAction((directory: string) => harness.listLibraryFolders(directory));
  const { run } = browse;
  useEffect(() => {
    const off = onHostMessage((msg) => {
      if (msg.type === 'harness.library.foldersResult') {
        setListing(msg);
        setPath(msg.directory);
      }
    });
    void run('');
    return off;
  }, [run]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content maxWidth="600px">
        <Dialog.Title>{t('Selecionar pasta da biblioteca')}</Dialog.Title>
        <Dialog.Description>
          {t(
            'Escolha uma pasta no computador que executa o board. Para criar um novo destino, acrescente o nome no campo Pasta da biblioteca e salve.',
          )}
        </Dialog.Description>
        <div className="actions-toolbar">
          <TextField.Root aria-label={t('Navegar para a pasta')} value={path} onChange={(e) => setPath(e.target.value)} />
          <ActionButton loading={browse.busy} hint={t('Lista as subpastas deste caminho.')} onClick={() => void run(path)}>
            {t('Abrir')}
          </ActionButton>
        </div>
        {browse.error && <p role="alert">{browse.error}</p>}
        <div className="library-folder-list" aria-busy={browse.busy}>
          {listing && (
            <Button variant="ghost" disabled={browse.busy || listing.parent === listing.directory} onClick={() => void run(listing.parent)}>
              {t('Pasta acima')}
            </Button>
          )}
          {listing?.folders.map((folder) => (
            <Button key={folder.path} variant="soft" color="gray" disabled={browse.busy} onClick={() => void run(folder.path)}>
              {folder.name}
            </Button>
          ))}
        </div>
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button disabled={!listing || browse.busy} onClick={() => listing && onSelect(listing.directory)}>
            {t('Usar esta pasta')}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
