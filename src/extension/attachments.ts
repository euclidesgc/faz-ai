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

/** Arquivos de anexos em disco: <baseDir>/<cardId>/<id>-<nome>. */
export class AttachmentStore {
  constructor(readonly baseDir: string) {}

  pathOf(a: Pick<Attachment, 'cardId' | 'storedName'>): string {
    return path.join(this.baseDir, a.cardId, a.storedName);
  }

  importFile(cardId: string, srcPath: string): Omit<Attachment, 'createdAt' | 'artifact'> {
    const size = fs.statSync(srcPath).size;
    this.checkSize(size);
    const rec = this.record(cardId, path.basename(srcPath), size);
    fs.mkdirSync(path.join(this.baseDir, cardId), { recursive: true });
    fs.copyFileSync(srcPath, this.pathOf(rec));
    return rec;
  }

  importData(cardId: string, filename: string, base64: string): Omit<Attachment, 'createdAt' | 'artifact'> {
    const buf = Buffer.from(base64, 'base64');
    this.checkSize(buf.length);
    const rec = this.record(cardId, filename, buf.length);
    fs.mkdirSync(path.join(this.baseDir, cardId), { recursive: true });
    fs.writeFileSync(this.pathOf(rec), buf);
    return rec;
  }

  remove(a: Pick<Attachment, 'cardId' | 'storedName'>): void {
    fs.rmSync(this.pathOf(a), { force: true });
  }

  removeCard(cardId: string): void {
    fs.rmSync(path.join(this.baseDir, cardId), { recursive: true, force: true });
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
