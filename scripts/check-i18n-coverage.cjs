// One-off check: en vs target-locale key coverage and t('...') usage coverage.
// Usage: node scripts/check-i18n-coverage.cjs [locale]   (default: id)
const fs = require('fs');
const path = require('path');
const locale = process.argv[2] || 'id';
const messagesVar = { 'zh-CN': 'zh', 'zh-TW': 'tw', 'pt-BR': 'ptBR' }[locale] || locale;
const src = fs.readFileSync(path.join(__dirname, '../src/i18n.ts'), 'utf8');

function scanFrom(text, startIdx) {
  // startIdx points at '{'. Return [keys, endIdx] with brace matching.
  let depth = 0, i = startIdx;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  const body = text.slice(startIdx, i + 1);
  const keys = new Set();
  for (const m of body.matchAll(/['"]([A-Za-z0-9.\-]+)['"]\s*:/g)) keys.add(m[1]);
  return [keys, i];
}

const enStart = src.indexOf('const en: Record<string, string> = {');
const [enBase] = scanFrom(src, src.indexOf('{', enStart));
const enKeys = new Set(enBase);
for (const m of src.matchAll(/Object\.assign\(en, \{/g)) {
  const [keys] = scanFrom(src, src.indexOf('{', m.index) );
  for (const k of keys) enKeys.add(k);
}
// The timestamp page adds its own en bundle at runtime (src/timestamp/messages.ts).
const messages = fs.readFileSync(path.join(__dirname, '../src/timestamp/messages.ts'), 'utf8');
const [msgKeys] = scanFrom(messages, messages.indexOf('{', messages.indexOf('const en = {')));
for (const k of msgKeys) enKeys.add(k);
// Capture export keys are generated from captureCopy for every locale.
for (const k of ['export.captureMethod','export.methodDetails','export.realtimeLabel','export.recordingLabel','export.settingsTitle','export.nativeFallback','export.layeredFallback','export.captureStandard','export.captureLayered','export.captureNative','export.captureDirect','export.captureWorker','export.layeredActive','export.nativeActive','export.directActive','export.workerActive','export.layeredNotice','export.nativeNotice','export.directNotice','export.workerNotice']) enKeys.add(k);

// Collect the target locale's keys: main dictionary entry + messages bundle.
const localeKeys = new Set();
const locMatch = src.match(new RegExp(`\\n  (?:'${locale}'|${locale}):\\{`));
if (!locMatch) { console.error(`No localizations entry found for ${locale}`); process.exit(1); }
const [locKeys] = scanFrom(src, src.indexOf('{', locMatch.index + locMatch[0].length - 1));
for (const k of locKeys) localeKeys.add(k);
const msgMatch = messages.match(new RegExp(`const ${messagesVar} = \\{`));
if (msgMatch) {
  const [locMsgKeys] = scanFrom(messages, messages.indexOf('{', msgMatch.index));
  for (const k of locMsgKeys) localeKeys.add(k);
}

// Keys that never need a translation in the dictionary: forced at runtime (line 735) or generated from captureCopy.
const captureKeys = new Set(['export.captureMethod','export.methodDetails','export.realtimeLabel','export.recordingLabel','export.settingsTitle','export.nativeFallback','export.layeredFallback','export.layeredActive','export.nativeActive','export.directActive','export.workerActive','export.layeredNotice','export.nativeNotice','export.directNotice','export.workerNotice']);
const runtimeForced = new Set(['ui.waitingForMusic', ...[...enKeys].filter(k => k.startsWith('export.capture') || captureKeys.has(k))]);
const missing = [...enKeys].filter(k => !localeKeys.has(k) && !runtimeForced.has(k));
const extra = [...localeKeys].filter(k => !enKeys.has(k));
console.log(`[${locale}] en keys: ${enKeys.size} | ${locale} keys: ${localeKeys.size}`);
console.log(`[${locale}] missing: ${missing.length ? missing : 'none'}`);
console.log(`[${locale}] extra: ${extra.length ? extra : 'none'}`);

// Scan t('...') literals across src.
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name === 'vendor' || e.name === 'node_modules') continue; walk(p); } else if (/\.(tsx?|css)$/.test(e.name)) files.push(p); } })(path.join(__dirname, '../src'));
const used = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
}
const notDefined = [...used].filter(k => !enKeys.has(k));
console.log('t() literals used:', used.size);
console.log('used but not in en:', notDefined.length ? notDefined : 'none');
