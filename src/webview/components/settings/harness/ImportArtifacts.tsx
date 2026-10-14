import { useState } from 'react';
import { Button, TextField } from '@radix-ui/themes';
import type { AiTool } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { isWeb } from '../../../vscode';
import { FormActions } from './FormActions';
import { t } from '../../../i18n';

/**
 * "Importar artefatos": o board varre uma pasta fora do projeto e da pasta global atrás de artefatos no formato
 * da ferramenta e os oferece em Importados. No editor, a pasta vem do seletor; no navegador não há seletor,
 * então a pessoa digita o caminho (do servidor, onde o board roda).
 */
export function ImportArtifacts({ tool }: { tool: AiTool }) {
  const [typing, setTyping] = useState(false);
  const [dir, setDir] = useState('');
  // escolher a pasta e varrê-la leva um tempo: o botão mostra a espera até o host confirmar
  const pick = useAction(() => harness.pickImport(tool));
  const add = useAction((folder: string) => harness.addImport(tool, folder));
  const title = t('Escolhe uma pasta e procura nela skills, agentes, comandos, hooks e servidores MCP no formato da ferramenta.');
  if (!isWeb)
    return (
      <Button variant="soft" color="gray" title={title} loading={pick.busy} onClick={() => void pick.run()}>
        {t('Importar artefatos')}
      </Button>
    );
  if (!typing)
    return (
      <Button variant="soft" color="gray" title={title} onClick={() => setTyping(true)}>
        {t('Importar artefatos')}
      </Button>
    );
  const close = () => {
    setTyping(false);
    setDir('');
  };
  const submit = async () => {
    if (await add.run(dir.trim())) close();
  };
  return (
    <div className="import-form">
      <TextField.Root
        autoFocus
        aria-label={t('Caminho da pasta a importar')}
        placeholder={t('Caminho da pasta, no computador onde o board roda')}
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && dir.trim() && void submit()}
      />
      <FormActions label={t('Importar')} disabled={!dir.trim()} loading={add.busy} onSubmit={() => void submit()} onCancel={close} />
    </div>
  );
}
