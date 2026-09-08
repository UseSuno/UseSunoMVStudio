import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Plugin } from 'vite';

const rootFiles = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'folia.html', 'timestamp.html', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore', '.gitattributes', '.env.example']);
const publicFiles = new Set(['public/favicon.svg', 'public/privacy.html', 'public/licenses.html']);
const scriptFiles = new Set(['scripts/compliance.ts', 'scripts/vendor-folia.py', 'scripts/probe-video.mjs', 'scripts/folia-patches/series.json', 'scripts/folia-patches/README.md']);
const blockedPart = /^(?:\.|node_modules$|dist$|uploads?$|user[-_]?(?:data|media)$|secrets?$|credentials?$|tmp$|qa(?:[-_.]|$))/i;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// This is a source allowlist, never an archive of the workspace or browser data.
export function isSourcePath(file: string, upstreamAssets: ReadonlySet<string>): boolean {
  if (file === '.gitignore' || file === '.gitattributes' || file === '.env.example') return true;
  if (file.includes('\\') || file.startsWith('/') || file.split('/').some(part => blockedPart.test(part))) return false;
  return rootFiles.has(file) || publicFiles.has(file) || scriptFiles.has(file)
    || /^src\/.*\.(?:ts|tsx|css|js|mjs)$/.test(file)
    || file === 'src/vendor/folia/MANIFEST.json'
    || /^tests\/[\w-]+\.test\.ts$/.test(file)
    || /^scripts\/folia-patches\/[\w-]+\.patch$/.test(file)
    || upstreamAssets.has(file);
}

async function walk(root: string, relative: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (blockedPart.test(entry.name)) continue;
    const next = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Source archive refuses non-regular file: ${next}`);
    if (entry.isDirectory()) result.push(...await walk(root, next));
    else result.push(next);
  }
  return result;
}

export async function collectSourceFiles(root: string): Promise<Record<string, Uint8Array>> {
  const manifest = JSON.parse(await readFile(path.join(root, 'src/vendor/folia/MANIFEST.json'), 'utf8')) as { files: { path: string }[] };
  const assets = new Set(manifest.files.filter(file => /\.(?:png|jpg|jpeg|webp|svg|md)$/.test(file.path)).map(file => `src/vendor/folia/${file.path}`));
  const paths = new Set([...rootFiles, ...(await Promise.all(['src', 'tests', 'scripts', 'public'].map(dir => walk(root, dir)))).flat()]);
  const files: Record<string, Uint8Array> = {};
  for (const file of [...paths].sort()) {
    if (!isSourcePath(file, assets)) continue;
    const absolute = path.join(root, file);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Source archive refuses non-regular file: ${file}`);
    files[file] = new Uint8Array(await readFile(absolute));
  }
  return files;
}

export async function dependencyNotices(root: string): Promise<string> {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string; dev?: boolean; optional?: boolean }> };
  const sections: string[] = ['Third-party packages included in the locked production dependency tree.\nSource package links identify the exact installed versions; npm ci restores them from package-lock.json.\nFolia and built-in image provenance are documented separately in THIRD_PARTY_NOTICES.md.'];
  for (const [location, locked] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!location.startsWith('node_modules/') || locked.dev) continue;
    const dir = path.join(root, location);
    let raw: string;
    try { raw = await readFile(path.join(dir, 'package.json'), 'utf8'); }
    catch (error) { if (locked.optional) continue; throw error; }
    const pkg = JSON.parse(raw) as { name: string; version: string; license?: string; repository?: string | { url?: string } };
    if (pkg.version !== locked.version) throw new Error(`Dependency differs from lockfile: ${pkg.name}`);
    const licenseFiles = (await readdir(dir)).filter(name => /^(?:licen[sc]e|copying|notice|copyright)(?:[.-].*)?$/i.test(name));
    const texts = await Promise.all(licenseFiles.map(async name => {
      const file = path.join(dir, name);
      return (await lstat(file)).isFile() ? `${name}\n${await readFile(file, 'utf8')}` : '';
    }));
    const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    const source = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').pop()}-${pkg.version}.tgz`;
    sections.push(`${pkg.name} ${pkg.version}\nLicense: ${pkg.license || 'See package source'}\nSource: ${source}\n${repository ? `Repository: ${repository}\n` : ''}\n${texts.filter(Boolean).join('\n\n') || 'See the exact source package above for its license and copyright notices.'}`);
  }
  return sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
}

const fingerprint = (files: Record<string, Uint8Array>) => sha256(strToU8(JSON.stringify(Object.entries(files).map(([name, data]) => [name, sha256(data)]))));

export async function createComplianceArtifacts(root: string, sourceFiles?: Record<string, Uint8Array>): Promise<Record<string, Uint8Array>> {
  const files = { ...(sourceFiles ?? await collectSourceFiles(root)) };
  const notices = strToU8(await dependencyNotices(root));
  const legal = {
    'legal/LICENSE.txt': files.LICENSE,
    'legal/THIRD_PARTY_NOTICES.md': files['THIRD_PARTY_NOTICES.md'],
    'legal/dependency-notices.txt': notices,
    'legal/cappella-avatar-notice.md': files['src/vendor/folia/components/visualizer/cappella/avatar/README.md'],
    'legal/cappella-emoji-notice.md': files['src/vendor/folia/components/visualizer/cappella/emo/README.md'],
  };
  for (const [name, data] of Object.entries(legal)) {
    if (!data) throw new Error(`Missing legal artifact: ${name}`);
    files[`public/${name}`] = data;
  }
  files['SOURCE_MANIFEST.json'] = strToU8(JSON.stringify({ format: 1, files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha256(data)])) }, null, 2) + '\n');
  const input: Zippable = {};
  for (const [name, data] of Object.entries(files)) input[name] = [data, { mtime: new Date('2026-01-01T00:00:00Z') }];
  return { ...legal, 'source/verse-studio-source.zip': zipSync(input, { level: 6 }) };
}

export function complianceArtifacts(): Plugin {
  let root = '';
  let source: Record<string, Uint8Array> | undefined;
  return {
    name: 'verse-source-and-notices',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = (request.url || '').split('?')[0].replace(/^\//, '');
        if (!['source/verse-studio-source.zip', 'legal/LICENSE.txt', 'legal/THIRD_PARTY_NOTICES.md', 'legal/dependency-notices.txt', 'legal/cappella-avatar-notice.md', 'legal/cappella-emoji-notice.md'].includes(pathname)) return next();
        try {
          const artifacts = await createComplianceArtifacts(root);
          response.setHeader('Content-Type', pathname.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          if (pathname.endsWith('.zip')) response.setHeader('Content-Disposition', 'attachment; filename="verse-studio-source.zip"');
          response.end(artifacts[pathname]);
        } catch (error) { next(error); }
      });
    },
    async buildStart() { source = await collectSourceFiles(root); },
    async generateBundle() {
      const current = await collectSourceFiles(root);
      if (source && fingerprint(source) !== fingerprint(current)) throw new Error('Source changed during build. Rebuild to publish a matching source archive.');
      for (const id of this.getModuleIds()) {
        if (!id.startsWith(root + path.sep)) continue;
        const local = path.relative(root, id.split('?')[0]).split(path.sep).join('/');
        if (!local.startsWith('node_modules/') && !current[local]) throw new Error(`Build depends on a file excluded from the source archive: ${local}`);
      }
      for (const [fileName, bytes] of Object.entries(await createComplianceArtifacts(root, current))) this.emitFile({ type: 'asset', fileName, source: bytes });
    },
  };
}
