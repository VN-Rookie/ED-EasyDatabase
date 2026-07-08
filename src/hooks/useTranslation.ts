import { useSettingsStore } from "../stores/settingsStore";
import { translations, type TranslationKey } from "../lib/i18n/mapping";

export function useTranslation() {
  const language = useSettingsStore((s) => s.settings.language) || "en";

  const t = (key: TranslationKey): string => {
    // Falls back to en if the translation for selected language or key is missing
    const langDict = translations[language] || translations.en;
    return langDict[key] || translations.en[key] || key;
  };

  return { t, language };
}
