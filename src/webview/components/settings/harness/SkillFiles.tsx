import { useEffect, useState } from 'react';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { SKILL_FILE_PATTERN, SKILL_FOLDERS } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { DeleteButton, FormField, SelectField, SwitchField } from '../../ui';
import { useArtifactText } from './useArtifactText';
import { t } from '../../../i18n';

const FOLDERS = SKILL_FOLDERS.map((x) => ({ value: x.id, label: `${x.label}/` }));

/** Edita o texto de um arquivo de apoio da skill do board: lê pelo host e grava com `harness.skillFile.write`. */
function FileEditor({ skill, file, onClose }: { skill: string; file: string; onClose: () => void }) {
  const read = useArtifactText('skill', skill, file);
  const [text, setText] = useState('');
  useEffect(() => {
    if (read.text !== null) setText(read.text);
  }, [read.text]);
  const save = useAction(() => harness.writeBoardSkillFile(skill, file, text));
  return (
    <div className="wizard-body">
      <FormField label={t('Conteúdo de {file}', { file })} hint={read.loading ? t('Lendo o arquivo…') : undefined}>
        {(id) => (
          <TextArea
            id={id}
            className="code-area"
            rows={10}
            spellCheck={false}
            disabled={read.text === null}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </FormField>
      {(read.error || save.error) && (
        <p className="wizard-warning" role="alert">
          {read.error ?? save.error}
        </p>
      )}
      <div className="form-actions">
        <Button variant="ghost" onClick={onClose}>
          {t('Fechar')}
        </Button>
        <Button
          disabled={read.text === null || save.busy}
          loading={save.busy}
          onClick={async () => {
            if (await save.run()) onClose();
          }}
        >
          {t('Salvar arquivo')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Arquivos de apoio de uma skill do board: referências, modelos e scripts que o SKILL.md indica. Adicionar e editar
 * mandam `harness.skillFile.write`; apagar manda `harness.skillFile.delete`. Os limites de tamanho e de quantidade
 * vêm do host e aparecem como aviso.
 */
export function SkillFiles({ skill, files, editable = true }: { skill: string; files: string[]; editable?: boolean }) {
  const [folder, setFolder] = useState(SKILL_FOLDERS[0]!.id);
  const [name, setName] = useState('');
  const [link, setLink] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const rel = `${folder}/${name.trim()}`;
  const ok = name.trim() !== '' && SKILL_FILE_PATTERN.test(rel) && !files.includes(rel);
  const add = useAction(() => harness.writeBoardSkillFile(skill, rel, '', link));
  const create = async () => {
    if (await add.run()) {
      setName('');
      setEditing(rel);
    }
  };
  return (
    <div className="skill-files">
      {files.length === 0 && <span className="muted small">{t('Sem arquivos de apoio.')}</span>}
      {files.map((f) => (
        <div key={f}>
          <div className="row">
            <code>{f}</code>
            <span className="spacer" />
            <Button variant="ghost" size="1" onClick={() => setEditing(editing === f ? null : f)}>
              {editing === f ? t('Fechar') : t('Editar')}
            </Button>
            {editable && (
              <DeleteButton
                title={t('Apagar o arquivo')}
                question={t('Apagar "{file}"?', { file: f })}
                message={t('O arquivo sai da skill "{name}". Se o SKILL.md aponta para ele, ajuste o texto.', { name: skill })}
                onConfirm={() => {
                  if (editing === f) setEditing(null);
                  return void harness.deleteBoardSkillFile(skill, f);
                }}
              />
            )}
          </div>
          {editing === f && <FileEditor key={f} skill={skill} file={f} onClose={() => setEditing(null)} />}
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
          <Button variant="soft" color="gray" disabled={!ok || add.busy} loading={add.busy} onClick={() => void create()}>
            {t('Novo arquivo')}
          </Button>
        </div>
      )}
      {add.error && (
        <p className="wizard-warning" role="alert">
          {add.error}
        </p>
      )}
    </div>
  );
}
