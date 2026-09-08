import i18n from '../i18n';
import en from '../vendor/folia/i18n/locales/en';
import zhCN from '../vendor/folia/i18n/locales/zh-CN';
import indonesian from '../vendor/folia/i18n/locales/in';

// Embedded renderers share Studio's language lifecycle. Importing Folia's
// standalone config would reinitialize the singleton and erase Studio's keys.
function flatten(source: object, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result[path] = value;
    else if (value && typeof value === 'object') Object.assign(result, flatten(value, path));
  }
  return result;
}
for (const [language, source] of Object.entries({ en, 'zh-CN': zhCN, id: indonesian })) {
  // Preserve Studio's existing wording and add only the renderer's missing keys.
  i18n.addResourceBundle(language, 'translation', flatten(source), true, false);
}
export default i18n;
