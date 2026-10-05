import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Attachment } from '../shared/model';
import { newId } from './db/ids';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const mimeOf = (filename: string): string => MIME[path.extname(filename).slice(1).toLowerCase()] ?? 'application/octet-stream';
/** Nome seguro para um arquivo: só o nome base, sem caracteres especiais, até 120 caracteres. */
export const safeName = (filename: string): string =>
  path
    .basename(filename)
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120) || 'arquivo';

/**
 * Um trecho de caminho que não sai da pasta onde é usado: não vazio, sem separador (`/`, `\`), sem `:`
 * (unidade no Windows), sem NUL e diferente de `.` e `..`. Vale para id de card e nome gravado de anexo.
 */
export const isSafeSegment = (s: string): boolean => !!s && s !== '.' && s !== '..' && !/[\\/:\0]/.test(s);

/** Arquivos de anexos em disco: <baseDir>/<cardId>/<id>-<nome>. */
export class AttachmentStore {
  constructor(readonly baseDir: string) {}

  pathOf(a: Pick<Attachment, 'cardId' | 'storedName'>): string {
    return this.inside(a.cardId, a.storedName);
  }

  /**
   * O caminho de `parts` sob `baseDir`, recusado se resolver fora dela (ou nela mesma): um id de card ou
   * nome gravado vindo de um arquivo importado não pode ler, gravar nem apagar fora da pasta de anexos.
   */
  private inside(...parts: string[]): string {
    const base = path.resolve(this.baseDir);
    const full = path.resolve(base, ...parts);
    const rel = path.relative(base, full);
    if (!parts.every(isSafeSegment) || !rel || rel.startsWith('..') || path.isAbsolute(rel))
      throw new Error('Caminho de anexo fora da pasta de anexos');
    return full;
  }

  importFile(cardId: string, srcPath: string): Omit<Attachment, 'createdAt' | 'artifact'> {
    const size = fs.statSync(srcPath).size;
    this.checkSize(size);
    const rec = this.record(cardId, path.basename(srcPath), size);
    fs.mkdirSync(path.dirname(this.pathOf(rec)), { recursive: true });
    fs.copyFileSync(srcPath, this.pathOf(rec));
    return rec;
  }

  importData(cardId: string, filename: string, base64: string): Omit<Attachment, 'createdAt' | 'artifact'> {
    const buf = Buffer.from(base64, 'base64');
    this.checkSize(buf.length);
    const rec = this.record(cardId, filename, buf.length);
    fs.mkdirSync(path.dirname(this.pathOf(rec)), { recursive: true });
    fs.writeFileSync(this.pathOf(rec), buf);
    return rec;
  }

  remove(a: Pick<Attachment, 'cardId' | 'storedName'>): void {
    fs.rmSync(this.pathOf(a), { force: true });
  }

  removeCard(cardId: string): void {
    fs.rmSync(this.inside(cardId), { recursive: true, force: true });
  }

  /**
   * Move as pastas dos cards para `<baseDir>.bak-<data e hora>`, ao lado da pasta de anexos (a importação
   * guarda assim os anexos do board substituído, junto com o `.bak` do banco). Devolve a pasta de backup,
   * ou `undefined` se nenhum card tinha pasta. Card que não puder ser movido fica onde está.
   */
  backupCards(cardIds: string[], now = Date.now()): string | undefined {
    const dirs = cardIds.map((id) => this.inside(id)).filter((d) => fs.existsSync(d));
    if (!dirs.length) return undefined;
    const stamp = new Date(now).toISOString().slice(0, 19).replace(/:/g, '-');
    let dest = `${path.resolve(this.baseDir)}.bak-${stamp}`;
    for (let i = 2; fs.existsSync(dest); i++) dest = `${path.resolve(this.baseDir)}.bak-${stamp}-${i}`;
    fs.mkdirSync(dest, { recursive: true });
    for (const d of dirs) {
      const to = path.join(dest, path.basename(d));
      try {
        fs.renameSync(d, to);
      } catch {
        // outro disco ou arquivo preso: copia e apaga; se nem isso der, a pasta fica onde está
        try {
          fs.cpSync(d, to, { recursive: true });
          fs.rmSync(d, { recursive: true, force: true });
        } catch {
          /* fica no lugar */
        }
      }
    }
    return dest;
  }

  private checkSize(size: number): void {
    if (size > MAX_ATTACHMENT_BYTES) throw new Error('Anexo maior que 20 MB');
  }

  private record(cardId: string, filename: string, size: number): Omit<Attachment, 'createdAt' | 'artifact'> {
    const id = newId();
    const clean = safeName(filename);
    return { id, cardId, filename: clean, storedName: `${id.slice(0, 8)}-${clean}`, mime: mimeOf(clean), size };
  }
}
