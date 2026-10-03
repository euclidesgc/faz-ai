import { useState } from 'react';
import { SKILL_FILE_PATTERN, SKILL_FOLDERS, type AiTool, type HarnessItem } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Button, DeleteButton, EnumSelect } from '../../ui';
import { GLOBAL_WARNING } from './text';

const FOLDERS = SKILL_FOLDERS.map((x) => ({ value: x.id, label: `${x.label}/` }));

/** Arquivos de apoio de uma skill: referências, modelos e scripts que o SKILL.md indica. */
export function SkillFiles({ tool, skill, editable }: { tool: AiTool; skill: HarnessItem; editable: boolean }) {
  const ask = useBoardStore((s) => s.ask);
  const [folder, setFolder] = useState(SKILL_FOLDERS[0]!.id);
  const [name, setName] = useState('');
  const [link, setLink] = useState(true);
  const files = skill.files ?? [];
  const rel = `${folder}/${name.trim()}`;
  const ok = name.trim() !== '' && SKILL_FILE_PATTERN.test(rel) && !files.includes(rel);
  const create = () => {
    const run = () => {
      harness.createSkillFile(tool, skill.path, rel, link);
      setName('');
    };
    if (skill.scope === 'user')
      ask({ title: 'Criar arquivo numa skill da pasta do usuário?', message: GLOBAL_WARNING, confirmLabel: 'Criar', onConfirm: run });
    else run();
  };
  return (
    <div className="skill-files">
      {files.length === 0 && <span className="muted small">Sem arquivos de apoio.</span>}
      {files.map((f) => (
        <div key={f} className="row">
          <code>{f}</code>
          <span className="spacer" />
          <Button variant="ghost" size="small" onClick={() => harness.openSkillFile(tool, skill.path, f)}>
            Abrir
          </Button>
          {editable && (
            <DeleteButton
              title="Apagar o arquivo"
              question={`Apagar "${f}"?`}
              message={`O arquivo sai da skill "${skill.name}". Se o SKILL.md aponta para ele, ajuste o texto.`}
              onConfirm={() => harness.deleteSkillFile(tool, skill.path, f)}
            />
          )}
        </div>
      ))}
      {editable && (
        <div className="row">
          <EnumSelect title={SKILL_FOLDERS.find((x) => x.id === folder)!.hint} options={FOLDERS} value={folder} onChange={setFolder} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="modelo-de-repositorio.ts" spellCheck={false} />
          <label className="switch" title="As ferramentas só leem um arquivo de apoio quando o SKILL.md aponta para ele">
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
            Citar no SKILL.md
          </label>
          <Button size="small" disabled={!ok} onClick={create}>
            Novo arquivo
          </Button>
        </div>
      )}
    </div>
  );
}
