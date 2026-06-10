import React from 'react';
import { useAtom } from 'jotai';
import i18n from '../../../i18n';
import { appLanguageAtom, setAppLanguageAtom } from '../../../store/atoms/appSettings';

const LANGUAGES = [
  { id: 'zh-CN', name: '中文（简体）', nameEn: 'Chinese (Simplified)' },
  { id: 'en', name: 'English', nameEn: 'English' },
];

export function LanguagePanel() {
  const [currentLang] = useAtom(appLanguageAtom);
  const [, setLang] = useAtom(setAppLanguageAtom);

  const handleChange = (langId: string) => {
    setLang(langId);
    i18n.changeLanguage(langId);
  };

  return (
    <div className="provider-panel flex flex-col gap-6 p-6">
      <div className="provider-panel-header pb-4 border-b border-[var(--nim-border)]">
        <h3 className="text-xl font-semibold text-[var(--nim-text)]">
          {currentLang === 'zh-CN' ? '语言' : 'Language'}
        </h3>
        <p className="text-sm text-[var(--nim-text-muted)] mt-1">
          {currentLang === 'zh-CN' ? '选择界面显示语言' : 'Choose your interface language'}
        </p>
      </div>

      <div className="space-y-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            onClick={() => handleChange(lang.id)}
            className={`w-full p-4 text-left rounded-lg border transition-all ${
              currentLang === lang.id
                ? 'border-[var(--nim-primary)] bg-[var(--nim-primary-subtle)]'
                : 'border-[var(--nim-border)] hover:bg-[var(--nim-bg-hover)]'
            }`}
          >
            <div className="font-medium text-[var(--nim-text)] text-base">{lang.name}</div>
            {currentLang === lang.id && (
              <div className="text-xs text-[var(--nim-primary)] mt-1">
                {currentLang === 'zh-CN' ? '当前语言' : 'Current language'}
              </div>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--nim-text-faint)]">
        {currentLang === 'zh-CN'
          ? '切换语言后界面将立即更新。部分内容可能仍显示为原始语言。'
          : 'The interface will update immediately after switching. Some content may still appear in the original language.'}
      </p>
    </div>
  );
}
