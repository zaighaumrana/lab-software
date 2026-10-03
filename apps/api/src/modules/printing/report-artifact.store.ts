import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, realpath, lstat, open, link, unlink, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const pdfHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function contained(root: string, path: string) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

/** Production resolver only; tests construct a store with their own temporary root. */
export function persistentReportRoot(): string {
  const configured = process.env.REPORT_STORAGE_ROOT;
  const root = configured ?? (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'LabFlow')
    : join(homedir(), '.local', 'share', 'labflow'));
  if (!isAbsolute(root) || contained(resolve(tmpdir()), resolve(root))) {
    throw new Error('REPORT_STORAGE_ROOT must be an absolute persistent directory outside temporary storage');
  }
  for (let path = resolve(root); ; path = dirname(path)) {
    if (['src','dist'].includes(basename(path).toLowerCase())) throw new Error('Report storage must be outside source/build directories');
    if (existsSync(join(path, '.git'))) throw new Error('Report storage must be outside Git repositories');
    if (dirname(path) === path) break;
  }
  return resolve(root);
}

export class ReportArtifactStore {
  constructor(readonly root: string) {
    if (!isAbsolute(root)) throw new Error('Artifact root must be absolute');
  }

  private directory(tenantId: string, reportId: string, versionNo: number) {
    if (![tenantId, reportId].every(id => /^[a-zA-Z0-9_-]+$/.test(id)) ||
      !Number.isSafeInteger(versionNo) || versionNo < 1) throw new Error('Invalid internal artifact identity');
    return `reports/${tenantId}/${reportId}/version-${versionNo}`;
  }

  private async safeDirectory(key: string) {
    await mkdir(this.root, { recursive: true });
    const realRoot = await realpath(this.root);
    let path = realRoot;
    for (const part of key.split('/')) {
      if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw new Error('Invalid artifact directory');
      path = join(path, part);
      await mkdir(path, { recursive: true });
      if ((await lstat(path)).isSymbolicLink() || !contained(realRoot, await realpath(path))) {
        throw new Error('Artifact directory escapes storage root');
      }
    }
    return path;
  }

  async publish(tenantId: string, reportId: string, versionNo: number, bytes: Buffer) {
    if (!bytes.length || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Renderer did not return a PDF');
    const directoryKey = this.directory(tenantId, reportId, versionNo);
    const directory = await this.safeDirectory(directoryKey);
    const id = randomUUID();
    const staging = join(directory, `${id}.tmp`);
    const final = join(directory, `${id}.pdf`);
    const handle = await open(staging, 'wx', 0o600);
    try {
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      // Atomic create-only publication; even another process cannot overwrite this path.
      await link(staging, final);
      if (process.platform !== 'win32') {
        const dir = await open(directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
      }
    } finally { await unlink(staging).catch(() => {}); }
    return { pdfPath: `${directoryKey}/${id}.pdf`, pdfSha256: pdfHash(bytes), pdfByteSize: bytes.length };
  }

  private async file(tenantId: string, reportId: string, versionNo: number, key: string) {
    const prefix = `${this.directory(tenantId, reportId, versionNo)}/`;
    if (!key.startsWith(prefix) || !/^[a-f0-9-]{36}\.pdf$/.test(key.slice(prefix.length))) {
      throw new Error('Artifact key is outside this report version');
    }
    const directory = await this.safeDirectory(prefix.slice(0, -1));
    const path = join(directory, key.slice(prefix.length));
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Artifact file cannot be a symbolic link');
    return path;
  }

  async read(tenantId: string, reportId: string, versionNo: number,
    metadata: { pdfPath: string; pdfSha256: string; pdfByteSize: number }) {
    const bytes = await readFile(await this.file(tenantId, reportId, versionNo, metadata.pdfPath));
    if (bytes.length !== metadata.pdfByteSize || pdfHash(bytes) !== metadata.pdfSha256) {
      throw new Error('Canonical report PDF failed its size/hash integrity check');
    }
    return bytes;
  }

  async removeCandidate(tenantId: string, reportId: string, versionNo: number, key: string) {
    await unlink(await this.file(tenantId, reportId, versionNo, key));
  }
}
