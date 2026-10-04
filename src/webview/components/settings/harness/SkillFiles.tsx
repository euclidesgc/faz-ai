import { useState } from 'react';
import { SKILL_FILE_PATTERN, SKILL_FOLDERS, type AiTool, type HarnessItem } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Button, TextField } from '@radix-ui/themes';
import { DeleteButton, SelectField, SwitchField } from '../../ui';
import { GLOBAL_WARNING } from './text';
import { t } from '../../../i18n';

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
      ask({
        title: t('Criar arquivo numa skill da pasta do usuário?'),
        message: t(GLOBAL_WARNING),
        confirmLabel: t('Criar'),
        onConfirm: run,
      });
    else run();
  };
  return (
    <div className="skill-files">
      {files.length === 0 && <span className="muted small">{t('Sem arquivos de apoio.')}</span>}
      {files.map((f) => (
        <div key={f} className="row">
          <code>{f}</code>
          <span className="spacer" />
          <Button variant="ghost" size="1" onClick={() => harness.openSkillFile(tool, skill.path, f)}>
            {t('Abrir no editor')}
          </Button>
          {editable && (
            <DeleteButton
              title={t('Apagar o arquivo')}
              question={t('Apagar "{file}"?', { file: f })}
              message={t('O arquivo sai da skill "{name}". Se o SKILL.md aponta para ele, ajuste o texto.', { name: skill.name })}
              onConfirm={() => harness.deleteSkillFile(tool, skill.path, f)}
            />
          )}
        </div>
      ))}
      {editable && (
        <div className="row">
          <SelectField aria-label={t('Pasta do arquivo')} options={FOLDERS} value={folder} onChange={setFolder} />
          <TextField.Root
            aria-label={t('Nome do arquivo')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="modelo-de-repositorio.ts"
            spellCheck={false}
          />
          <SwitchField
            label={t('Citar no SKILL.md')}
            title={t('As ferramentas só leem um arquivo de apoio quando o SKILL.md aponta para ele')}
            checked={link}
            onChange={setLink}
          />
          <Button variant="soft" color="gray" disabled={!ok} onClick={create}>
            {t('Novo arquivo')}
          </Button>
        </div>
      )}
    </div>
  );
}
