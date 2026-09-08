import { BellRing, Cloud, Languages, MonitorCog, Palette, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlobalPreferences, UiTheme } from '../domain/preferences';
import { languages } from '../i18n';
import { Modal } from './Modal';

export function SettingsModal({ value, change, close }: { value:GlobalPreferences; change:(patch:Partial<GlobalPreferences>)=>void; close:()=>void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  return <Modal title={t('settings.title')} close={close} wide>
    <div className="settings-groups">
      <section className="settings-section"><div className="settings-section-title"><Palette size={16}/><span><strong>{t('settings.appearance')}</strong><small>{t('settings.appearanceNote')}</small></span></div><div className="settings-choice-grid">{(['system','dark','light'] as UiTheme[]).map(theme=><button key={theme} className={value.theme===theme?'selected':''} onClick={()=>change({theme})}><MonitorCog size={15}/><span>{t(`settings.theme.${theme}`)}</span></button>)}</div></section>
      <section className="settings-section"><div className="settings-section-title"><Languages size={16}/><span><strong>{t('settings.language')}</strong><small>{t('settings.languageNote')}</small></span></div><label className="settings-select"><span>{t('language.label')}</span><select value={language} onChange={event=>void i18n.changeLanguage(event.target.value)}>{languages.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label></section>
      <section className="settings-section"><div className="settings-section-title"><Sparkles size={16}/><span><strong>{t('settings.accessibility')}</strong><small>{t('settings.accessibilityNote')}</small></span></div><label className="settings-toggle"><span>{t('settings.reduceMotion')}<small>{t('settings.reduceMotionNote')}</small></span><input type="checkbox" checked={value.reduceMotion} onChange={event=>change({reduceMotion:event.target.checked})}/></label><label className="settings-toggle"><span>{t('settings.tooltips')}<small>{t('settings.tooltipsNote')}</small></span><input type="checkbox" checked={value.showTooltips} onChange={event=>change({showTooltips:event.target.checked})}/></label><label className="settings-toggle"><span>{t('settings.exportConfirm')}<small>{t('settings.exportConfirmNote')}</small></span><input type="checkbox" checked={value.confirmDiscardExport} onChange={event=>change({confirmDiscardExport:event.target.checked})}/></label></section>
      <section className="settings-section settings-future"><div className="settings-section-title"><Cloud size={16}/><span><strong>{t('settings.future')}</strong><small>{t('settings.futureNote')}</small></span></div><div className="future-settings-row"><BellRing size={15}/><span><strong>{t('settings.cloudSync')}</strong><small>{t('settings.cloudSyncNote')}</small></span><span className="coming-soon">{t('settings.comingSoon')}</span></div></section>
    </div>
  </Modal>;
}
