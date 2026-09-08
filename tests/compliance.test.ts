import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, expect, it } from 'vitest';
import { collectSourceFiles, createComplianceArtifacts, isSourcePath } from '../scripts/compliance';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'verse-compliance-test-'));
  temporary.push(root);
  const put = async (name: string, text = name) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), text); };
  for (const name of ['tsconfig.json', 'vite.config.ts', 'index.html', 'folia.html', 'timestamp.html', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore', '.gitattributes', '.env.example', 'src/App.tsx', 'tests/example.test.ts', 'scripts/compliance.ts', 'public/privacy.html', 'public/licenses.html']) await put(name);
  await put('package.json', '{"name":"example"}');
  await put('package-lock.json', '{"packages":{}}');
  const assets = ['components/visualizer/cappella/avatar/README.md', 'components/visualizer/cappella/emo/README.md', 'components/visualizer/cappella/avatar/example.png'];
  await put('src/vendor/folia/MANIFEST.json', JSON.stringify({ files: assets.map(file => ({ path: file })) }));
  for (const asset of assets) await put(`src/vendor/folia/${asset}`);
  return { root, put };
}

it('archives code and declared upstream assets while excluding credentials, media and temporary QA', async () => {
  const { root, put } = await fixture();
  const excluded = ['.env', '.env.local', '.env.production', '.private/analytics.js', '.git/config', 'node_modules/private/package.json', 'dist/index.html', 'src/qa-session.ts', 'src/secrets/key.ts', 'src/uploads/song.mp3', 'src/user-project.json', 'public/private-cover.png', 'public/qa-session.html', 'qa-session.html'];
  for (const name of excluded) await put(name, 'PRIVATE TEST DATA');
  const files = await collectSourceFiles(root);
  expect(files['src/App.tsx']).toBeDefined();
  expect(files['.env.example']).toBeDefined();
  expect(files['.gitattributes']).toBeDefined();
  expect(files['src/vendor/folia/components/visualizer/cappella/avatar/example.png']).toBeDefined();
  for (const name of excluded) expect(files[name]).toBeUndefined();
  expect(Object.values(files).some(data => strFromU8(data).includes('PRIVATE TEST DATA'))).toBe(false);
  expect(isSourcePath('src/../../private.ts', new Set())).toBe(false);
  expect(isSourcePath('/etc/passwd', new Set())).toBe(false);
});

it('rejects symlinks rather than exposing a file outside the source snapshot', async () => {
  const { root, put } = await fixture();
  await put('private.txt', 'DO NOT PUBLISH');
  await symlink(path.join(root, 'private.txt'), path.join(root, 'src/external.ts'));
  await expect(collectSourceFiles(root)).rejects.toThrow('non-regular file');
});

it('includes matching source hashes and legal artifacts in the downloadable ZIP', async () => {
  const { root } = await fixture();
  const artifacts = await createComplianceArtifacts(root);
  const files = unzipSync(artifacts['source/verse-studio-source.zip']);
  const manifest = JSON.parse(strFromU8(files['SOURCE_MANIFEST.json'])) as { files: Record<string, string> };
  for (const [name, hash] of Object.entries(manifest.files)) expect(createHash('sha256').update(files[name]).digest('hex')).toBe(hash);
  expect(files['public/legal/LICENSE.txt']).toEqual(artifacts['legal/LICENSE.txt']);
  expect(files['public/legal/dependency-notices.txt']).toEqual(artifacts['legal/dependency-notices.txt']);
  expect(Object.keys(files).some(name => name.startsWith('node_modules/'))).toBe(false);
});
