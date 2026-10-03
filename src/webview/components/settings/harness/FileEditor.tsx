import { useEffect, useState } from 'react';
import { Button } from '../../ui';

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
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} />
      <div className="row">
        <Button variant="primary" disabled={!dirty} onClick={() => onSave(text)}>
          Salvar
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {dirty ? 'Descartar' : 'Fechar'}
        </Button>
        {dirty && <span className="muted small">Alterações não salvas</span>}
      </div>
    </div>
  );
}
