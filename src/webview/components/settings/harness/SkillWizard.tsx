import { useMemo, useState } from 'react';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { SKILL_FILE_PATTERN, SKILL_FOLDERS, SKILL_NAME_PATTERN, type AiTool } from '../../../../shared/harness';
import { createTargets } from '../../../../shared/harnessCatalog';
import { toItemName } from '../../../../shared/harnessProject';
import {
  DEFAULT_SKILL_LIMITS,
  SKILL_WIZARD_STEPS,
  proposeSkillSteps,
  renderSkill,
  skillNameFromTask,
} from '../../../../shared/skillWizard';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Chip, FormField, IconClose } from '../../ui';
import { StringListEditor, WizardQuestion, WizardShell } from './Wizard';
import { TargetPicker } from './TargetPicker';
import { GLOBAL_WARNING } from './text';
import { useProjectProfile } from './useProjectProfile';
import { t } from '../../../i18n';

const STEPS = SKILL_WIZARD_STEPS;

/**
 * "Criar skill com ajuda": seis passos para escrever um SKILL.md no formato da ferramenta, com os passos propostos a
 * partir dos verbos da tarefa e dos comandos do projeto. A skill é gravada na pasta do escopo escolhido e enviada ao
 * board em "Pelo card": não entra no contexto sozinha. Nada é gravado antes do último passo.
 */
export function SkillWizard({ tool, scope, onClose }: { tool: AiTool; scope: 'project' | 'user'; onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const { profile } = useProjectProfile();
  const targets = createTargets(tool).filter((c) => c.scope === scope && c.layout === 'skills');
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(targets[0]?.source ?? -1);
  const [task, setTask] = useState('');
  const [trigger, setTrigger] = useState('');
  const [steps, setSteps] = useState<string[] | null>(null);
  const [limits, setLimits] = useState<string[]>(DEFAULT_SKILL_LIMITS);
  const [files, setFiles] = useState<string[]>([]);
  const [fileDraft, setFileDraft] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const proposed = useMemo(() => proposeSkillSteps(task, profile), [task, profile]);
  const effectiveSteps = steps ?? proposed;
  const skillName = name ?? skillNameFromTask(task);
  const target = targets.find((x) => x.source === source);
  const items = state.harness.inventory.find((x) => x.tool === tool)?.items ?? [];
  const nameOk = SKILL_NAME_PATTERN.test(skillName) && !items.some((i) => i.kind === 'skill' && i.scope === scope && i.name === skillName);
  const draft = renderSkill({ name: skillName, task, trigger, steps: effectiveSteps, limits, files });
  const body = text ?? draft;

  const fileOk =
    SKILL_FILE_PATTERN.test(fileDraft.trim()) &&
    fileDraft.trim() !== 'SKILL.md' &&
    !files.includes(fileDraft.trim()) &&
    fileDraft.trim().includes('/');
  const addFile = () => {
    if (!fileOk) return;
    setFiles([...files, fileDraft.trim()]);
    setFileDraft('');
  };

  const finish = () => {
    if (!target) return;
    harness.writeItem(tool, target.source, skillName, body, files);
    // a skill nasce "Pelo card": criar pelo assistente é querer indicá-la nos cards, não carregá-la sempre
    harness.setSelection([{ kind: 'skill', location: target.label.replace('<nome>', skillName) }], 'contextual');
    onClose();
  };

  const disabled = step === 0 ? !task.trim() || !target : step === 1 ? !trigger.trim() : step === 5 ? !nameOk || !body.trim() : false;

  return (
    <WizardShell
      label={t('Criar skill com ajuda')}
      steps={STEPS}
      step={step}
      onBack={() => setStep(step - 1)}
      onNext={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
      onCancel={onClose}
      finishLabel={t('Criar skill')}
      nextDisabled={disabled}
    >
      {step === 0 && (
        <WizardQuestion
          question={t('Que tarefa a skill ensina? Uma frase: ela vira a descrição da skill.')}
          example={t('Escrever uma migração nova do banco, subindo a versão do schema e sem editar migração antiga.')}
        >
          <FormField label={t('A tarefa')} hint={t('Uma tarefa só: skill estreita é mais precisa e pesa menos no contexto.')}>
            {(id) => <TextArea id={id} autoFocus rows={2} value={task} onChange={(e) => setTask(e.target.value)} />}
          </FormField>
          {targets.length === 0 && <p className="muted small">{t('Este escopo não tem pasta de skills para a ferramenta escolhida.')}</p>}
        </WizardQuestion>
      )}

      {step === 1 && (
        <WizardQuestion
          question={t('Quando a IA deve usá-la? Diga os tipos de pedido ou de arquivo.')}
          example={t('o pedido falar de migração, schema ou banco de dados, ou mexer em arquivos de src/db/')}
        >
          <FormField label={t('Use quando…')} hint={t('Entra na descrição; é por ela que você indica a skill num card com segurança.')}>
            {(id) => <TextArea id={id} autoFocus rows={2} value={trigger} onChange={(e) => setTrigger(e.target.value)} />}
          </FormField>
        </WizardQuestion>
      )}

      {step === 2 && (
        <WizardQuestion
          question={t('Qual é o passo a passo? Ajuste os que proponho a partir do projeto.')}
          example={t('Ler a última migração, escrever a nova com o próximo número, rodar os testes.')}
        >
          <StringListEditor label={t('Passo')} items={effectiveSteps} onChange={setSteps} placeholder={t('Mais um passo…')} />
          {steps !== null && (
            <Button variant="ghost" size="1" onClick={() => setSteps(null)}>
              {t('Voltar aos passos propostos')}
            </Button>
          )}
        </WizardQuestion>
      )}

      {step === 3 && (
        <WizardQuestion
          question={t('O que a skill nunca faz? Limites deixam o escopo pequeno.')}
          example={t('Nunca edita uma migração que já foi publicada.')}
        >
          <StringListEditor label={t('Limite')} items={limits} onChange={setLimits} placeholder={t('Mais um limite…')} />
        </WizardQuestion>
      )}

      {step === 4 && (
        <WizardQuestion
          question={t('Precisa de arquivos de apoio? Opcional.')}
          example={t('references/ultima-migracao.md, com um exemplo de migração do projeto.')}
        >
          <p className="muted small">{SKILL_FOLDERS.map((f) => `${f.label}: ${t(f.hint)}`).join(' ')}</p>
          <div className="chips-editor">
            {SKILL_FOLDERS.map((f) => (
              <Chip key={f.id} on={fileDraft.startsWith(`${f.id}/`)} title={t(f.hint)} onClick={() => setFileDraft(`${f.id}/`)}>
                {f.label}/
              </Chip>
            ))}
          </div>
          <div className="string-list-row">
            <TextField.Root
              aria-label={t('Novo arquivo de apoio')}
              className="grow"
              value={fileDraft}
              placeholder="references/exemplo.md"
              onChange={(e) => setFileDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFile()}
            />
            <Button variant="soft" color="gray" size="1" disabled={!fileOk} onClick={addFile}>
              {t('Acrescentar')}
            </Button>
          </div>
          {fileDraft.trim() && !fileOk && (
            <p className="muted small">{t('Use pasta/arquivo.ext, com letras, números, hífen, ponto e sublinhado.')}</p>
          )}
          <div className="chips-editor">
            {files.map((f) => (
              <Chip key={f} on title={t('Tirar {name} da lista', { name: f })} onClick={() => setFiles(files.filter((x) => x !== f))}>
                {f} <IconClose />
              </Chip>
            ))}
            {files.length === 0 && <span className="muted small">{t('Nenhum arquivo de apoio.')}</span>}
          </div>
          {files.length > 0 && (
            <p className="muted small">{t('Os arquivos são criados vazios na pasta da skill; escreva o conteúdo depois.')}</p>
          )}
        </WizardQuestion>
      )}

      {step === 5 && (
        <WizardQuestion question={t('Confira a skill. Nada é gravado antes do botão de baixo.')}>
          {targets.length > 1 && <TargetPicker label={t('Onde')} targets={targets} value={source} onChange={setSource} />}
          <FormField label={t('Nome da skill')} hint={skillName && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
            {(id) => (
              <TextField.Root
                id={id}
                color={skillName && !nameOk ? 'red' : undefined}
                value={skillName}
                onChange={(e) => setName(toItemName(e.target.value))}
              />
            )}
          </FormField>
          <dl className="wizard-summary">
            <dt>{t('Onde')}</dt>
            <dd>
              <code>{target ? target.label.replace('<nome>', skillName) : ''}</code>
            </dd>
            <dt>{t('No board')}</dt>
            <dd>{t('Pelo card: só entra quando um card a indica')}</dd>
          </dl>
          <FormField label={t('SKILL.md')}>
            {(id) => (
              <>
                <TextArea
                  id={id}
                  className="code-area"
                  rows={14}
                  spellCheck={false}
                  value={body}
                  onChange={(e) => setText(e.target.value)}
                />
                {text !== null && (
                  <Button variant="ghost" size="1" onClick={() => setText(null)}>
                    {t('Refazer o rascunho com as respostas')}
                  </Button>
                )}
              </>
            )}
          </FormField>
          {scope === 'user' && <p className="muted small">{t(GLOBAL_WARNING)}</p>}
        </WizardQuestion>
      )}
    </WizardShell>
  );
}
