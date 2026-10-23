// Evidência local do host: não pertence ao export do board nem possui endpoint de escrita na UI/MCP.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { API_CAPABILITY_CHECKS, EXECUTOR_CAPABILITIES, type CapabilityEvidence } from '../../shared/executionAdmission';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const DAY = 24 * 60 * 60 * 1000;
/**
 * A evidência por construção do modo API: um recibo por check de `API_CAPABILITY_CHECKS`, todos
 * `passed`, para um vínculo (que já prende a versão da extensão, o endpoint, o modelo e o digest da
 * chave). Não sonda nada: o recibo é o digest da afirmação (fonte, capacidade, check e vínculo), e quem
 * dá valor a ela é a assinatura do host, feita por `recordByConstruction` com a mesma chave local das
 * provas das sondas. A validade é a mesma das sondas; como refazer não custa nada, vencer só obriga o
 * host a afirmar de novo para o vínculo atual.
 */
export function constructionEvidence(binding: string, now: number, ttlMs = 14 * DAY): CapabilityEvidence[] {
  if (!/^[a-f0-9]{64}$/.test(binding)) throw new Error('Vínculo de evidência inválido.');
  return EXECUTOR_CAPABILITIES.map((capability) => ({
    version: 1,
    capability,
    source: 'by-construction',
    binding,
    checkedAt: now,
    expiresAt: now + ttlMs,
    checks: API_CAPABILITY_CHECKS[capability].map((id) => ({
      id,
      outcome: 'passed' as const,
      receipt: createHash('sha256')
        .update(canonical({ source: 'by-construction', capability, check: id, binding }))
        .digest('hex'),
    })),
  }));
}
/** O índice do vínculo da última prova por perfil (não começa com um hash, então `load` nunca o lê como evidência). */
const PROFILES_FILE = 'profiles.json';
export class CapabilityEvidenceStore {
  constructor(private readonly directory: string) {}
  private key(create: boolean): Buffer {
    const file = path.join(this.directory, 'local.key');
    if (create) {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      if (fs.lstatSync(this.directory).isSymbolicLink()) throw new Error('Pasta de evidências inválida.');
      try {
        fs.writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    const key = fs.readFileSync(file);
    if (key.length !== 32) throw new Error('Chave local das evidências inválida.');
    return key;
  }
  /** Usado somente pelo host: o verificador, após coletar os recibos dos probes, e `recordByConstruction`. */
  record(evidence: CapabilityEvidence): void {
    if (!/^[a-f0-9]{64}$/.test(evidence.binding)) throw new Error('Vínculo de evidência inválido.');
    if (evidence.source !== 'host-probe' && evidence.source !== 'by-construction') throw new Error('Fonte de evidência inválida.');
    const key = this.key(true);
    const signature = createHmac('sha256', key).update(canonical(evidence)).digest('hex');
    const file = path.join(this.directory, `${evidence.binding}-${randomUUID()}.json`);
    const temp = `${file}.tmp`;
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ evidence, signature }));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  /**
   * Afirma e assina a evidência por construção de um vínculo do modo API. Só o host chama (o driver da
   * API, quando a execução ou o Conectar não acham prova em vigor para o vínculo atual); a IA e a tela não
   * têm caminho até aqui, e a evidência só vale para o transporte `api` (`evidenceSource`).
   */
  recordByConstruction(binding: string, now: number, ttlMs?: number): CapabilityEvidence[] {
    const rows = constructionEvidence(binding, now, ttlMs);
    for (const row of rows) this.record(row);
    return rows;
  }
  /**
   * Guarda o vínculo da última prova de cada perfil, para o host saber quando ela perdeu a validade (o
   * vínculo atual é outro) e avisar ou refazer. Só o id do perfil e o hash: nada do ambiente nem do
   * comando. Não é prova nem passa pela assinatura: decide só o aviso e a nova verificação, nunca a
   * admissão, que continua lendo as evidências assinadas do vínculo atual.
   */
  remember(profileId: string, binding: string): void {
    if (!/^[a-f0-9]{64}$/.test(binding)) throw new Error('Vínculo de evidência inválido.');
    const all = { ...this.lastBindings(), [profileId]: binding };
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, PROFILES_FILE);
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ version: 1, profiles: all }), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  /** O vínculo da última prova gravada para o perfil; null quando ele nunca foi verificado (ou o índice não se lê). */
  lastBinding(profileId: string): string | null {
    const binding = this.lastBindings()[profileId];
    return typeof binding === 'string' && /^[a-f0-9]{64}$/.test(binding) ? binding : null;
  }
  private lastBindings(): Record<string, string> {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(this.directory, PROFILES_FILE), 'utf8')) as { profiles?: unknown };
      const profiles = data.profiles;
      return profiles && typeof profiles === 'object' && !Array.isArray(profiles) ? { ...(profiles as Record<string, string>) } : {};
    } catch {
      // índice ausente ou estragado: nenhum perfil tem prova anterior conhecida, e o aviso simplesmente não aparece
      return {};
    }
  }
  /** Falha de integridade bloqueia a leitura; não recorre a uma evidência antiga silenciosamente. */
  load(binding: string): CapabilityEvidence[] {
    if (!/^[a-f0-9]{64}$/.test(binding)) throw new Error('Vínculo de evidência inválido.');
    if (!fs.existsSync(this.directory)) return [];
    const files = fs.readdirSync(this.directory).filter((name) => name.startsWith(`${binding}-`) && name.endsWith('.json'));
    if (!files.length) return [];
    if (files.length > 10000) throw new Error('Excesso de evidências locais; revisão necessária.');
    const key = this.key(false);
    return files.map((name) => {
      try {
        const { evidence, signature } = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')) as {
          evidence: CapabilityEvidence;
          signature: string;
        };
        if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || evidence.binding !== binding) throw new Error();
        const expected = createHmac('sha256', key).update(canonical(evidence)).digest();
        if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new Error();
        return evidence;
      } catch {
        throw new Error('Evidência local inválida ou alterada; admissão bloqueada.');
      }
    });
  }
}
