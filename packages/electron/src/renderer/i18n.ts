import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCommon from './locales/zh-CN/common.json';
import zhNavigation from './locales/zh-CN/navigation.json';
import zhSettings from './locales/zh-CN/settings.json';
import zhDialogs from './locales/zh-CN/dialogs.json';
import zhAgent from './locales/zh-CN/agent.json';
import zhEditor from './locales/zh-CN/editor.json';

import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enSettings from './locales/en/settings.json';
import enDialogs from './locales/en/dialogs.json';
import enAgent from './locales/en/agent.json';
import enEditor from './locales/en/editor.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': {
        common: zhCommon,
        navigation: zhNavigation,
        settings: zhSettings,
        dialogs: zhDialogs,
        agent: zhAgent,
        editor: zhEditor,
      },
      en: {
        common: enCommon,
        navigation: enNavigation,
        settings: enSettings,
        dialogs: enDialogs,
        agent: enAgent,
        editor: enEditor,
      },
    },
    lng: 'zh-CN',
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
