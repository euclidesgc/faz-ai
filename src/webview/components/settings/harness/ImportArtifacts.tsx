import { useState } from 'react';
import { Button, TextField } from '@radix-ui/themes';
import type { AiTool } from '../../../../shared/harness';
import { harness } from '../../../commands';
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
  const title = t('Escolhe uma pasta e procura nela skills, agentes, comandos, hooks e servidores MCP no formato da ferramenta.');
  if (!isWeb)
    return (
      <Button variant="soft" color="gray" title={title} onClick={() => harness.pickImport(tool)}>
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
  const submit = () => {
    harness.addImport(tool, dir.trim());
    close();
  };
  return (
    <div className="import-form">
      <TextField.Root
        autoFocus
        aria-label={t('Caminho da pasta a importar')}
        placeholder={t('Caminho da pasta, no computador onde o board roda')}
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && dir.trim() && submit()}
      />
      <FormActions label={t('Importar')} disabled={!dir.trim()} onSubmit={submit} onCancel={close} />
    </div>
  );
}
