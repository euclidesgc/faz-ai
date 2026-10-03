import { useEffect, useState } from 'react';
import { Button, TextArea } from '@radix-ui/themes';

/** Editor de texto simples com salvar/descartar; `saved` é o conteúdo que está no disco. */
export function FileEditor({ saved, onSave, onClose }: { saved: string; onSave: (content: string) => void; onClose: () => void }) {
  const [text, setText] = useState(saved);
  // se o arquivo mudou por fora e não há edição local pendente, acompanha o disco
  const [base, setBase] = useState(saved);
  useEffect(() => {
    if (text === base) setText(saved);
    setBase(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const dirty = text !== saved;
  return (
    <div className="file-editor">
      <TextArea className="code-area" value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} />
      <div className="form-actions">
        {dirty && <span className="muted small">Alterações não salvas</span>}
        <Button variant="soft" color="gray" onClick={onClose}>
          {dirty ? 'Descartar' : 'Fechar'}
        </Button>
        <Button disabled={!dirty} onClick={() => onSave(text)}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
