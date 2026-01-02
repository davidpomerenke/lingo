/**
 * Language configuration and utilities
 * Single source of truth for all language metadata
 */

// Complete language data: display info, script type, support level, ISO code
interface LanguageInfo {
  nativeName: string;
  flag: string;
  code?: string;        // ISO 639-1 code for transcription
  nonLatin?: boolean;   // Uses non-Latin script
  rtl?: boolean;        // Right-to-left
  supported?: boolean;  // Well-supported by AI (default true if has code)
}

export const LANGUAGES: Record<string, LanguageInfo> = {
  // Major world languages
  "English": { nativeName: "English", flag: "🇬🇧", code: "en" },
  "Spanish": { nativeName: "Español", flag: "🇪🇸", code: "es" },
  "French": { nativeName: "Français", flag: "🇫🇷", code: "fr" },
  "German": { nativeName: "Deutsch", flag: "🇩🇪", code: "de" },
  "Italian": { nativeName: "Italiano", flag: "🇮🇹", code: "it" },
  "Portuguese": { nativeName: "Português", flag: "🇵🇹", code: "pt" },
  "Russian": { nativeName: "Русский", flag: "🇷🇺", code: "ru", nonLatin: true },
  "Chinese": { nativeName: "中文", flag: "🇨🇳", code: "zh", nonLatin: true },
  "Japanese": { nativeName: "日本語", flag: "🇯🇵", code: "ja", nonLatin: true },
  "Korean": { nativeName: "한국어", flag: "🇰🇷", code: "ko", nonLatin: true },
  "Arabic": { nativeName: "العربية", flag: "🇸🇦", code: "ar", nonLatin: true, rtl: true },
  "Hindi": { nativeName: "हिन्दी", flag: "🇮🇳", code: "hi", nonLatin: true },
  
  // European languages
  "Dutch": { nativeName: "Nederlands", flag: "🇳🇱", code: "nl" },
  "Greek": { nativeName: "Ελληνικά", flag: "🇬🇷", code: "el", nonLatin: true },
  "Polish": { nativeName: "Polski", flag: "🇵🇱", code: "pl" },
  "Swedish": { nativeName: "Svenska", flag: "🇸🇪", code: "sv" },
  "Norwegian": { nativeName: "Norsk", flag: "🇳🇴", code: "no" },
  "Danish": { nativeName: "Dansk", flag: "🇩🇰", code: "da" },
  "Finnish": { nativeName: "Suomi", flag: "🇫🇮", code: "fi" },
  "Czech": { nativeName: "Čeština", flag: "🇨🇿", code: "cs" },
  "Hungarian": { nativeName: "Magyar", flag: "🇭🇺", code: "hu" },
  "Romanian": { nativeName: "Română", flag: "🇷🇴", code: "ro" },
  "Ukrainian": { nativeName: "Українська", flag: "🇺🇦", code: "uk", nonLatin: true },
  "Turkish": { nativeName: "Türkçe", flag: "🇹🇷", code: "tr" },
  "Bulgarian": { nativeName: "Български", flag: "🇧🇬", code: "bg", nonLatin: true },
  "Croatian": { nativeName: "Hrvatski", flag: "🇭🇷", code: "hr" },
  "Serbian": { nativeName: "Српски", flag: "🇷🇸", code: "sr", nonLatin: true },
  "Slovak": { nativeName: "Slovenčina", flag: "🇸🇰", code: "sk" },
  "Slovenian": { nativeName: "Slovenščina", flag: "🇸🇮", code: "sl" },
  "Lithuanian": { nativeName: "Lietuvių", flag: "🇱🇹", code: "lt" },
  "Latvian": { nativeName: "Latviešu", flag: "🇱🇻", code: "lv" },
  "Estonian": { nativeName: "Eesti", flag: "🇪🇪", code: "et" },
  "Icelandic": { nativeName: "Íslenska", flag: "🇮🇸", code: "is" },
  "Irish": { nativeName: "Gaeilge", flag: "🇮🇪", code: "ga" },
  "Welsh": { nativeName: "Cymraeg", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", code: "cy" },
  "Scottish Gaelic": { nativeName: "Gàidhlig", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  "Catalan": { nativeName: "Català", flag: "🇪🇸", code: "ca" },
  "Basque": { nativeName: "Euskara", flag: "🇪🇸", code: "eu" },
  "Galician": { nativeName: "Galego", flag: "🇪🇸", code: "gl" },
  "Albanian": { nativeName: "Shqip", flag: "🇦🇱", code: "sq" },
  "Macedonian": { nativeName: "Македонски", flag: "🇲🇰", code: "mk", nonLatin: true },
  "Bosnian": { nativeName: "Bosanski", flag: "🇧🇦", code: "bs" },
  "Maltese": { nativeName: "Malti", flag: "🇲🇹" },
  "Luxembourgish": { nativeName: "Lëtzebuergesch", flag: "🇱🇺" },
  "Belarusian": { nativeName: "Беларуская", flag: "🇧🇾", nonLatin: true },
  
  // Asian languages
  "Vietnamese": { nativeName: "Tiếng Việt", flag: "🇻🇳", code: "vi" },
  "Thai": { nativeName: "ไทย", flag: "🇹🇭", code: "th", nonLatin: true },
  "Indonesian": { nativeName: "Bahasa Indonesia", flag: "🇮🇩", code: "id" },
  "Malay": { nativeName: "Bahasa Melayu", flag: "🇲🇾", code: "ms" },
  "Filipino": { nativeName: "Filipino", flag: "🇵🇭", code: "tl" },
  "Tagalog": { nativeName: "Tagalog", flag: "🇵🇭", code: "tl" },
  "Bengali": { nativeName: "বাংলা", flag: "🇧🇩", code: "bn", nonLatin: true },
  "Tamil": { nativeName: "தமிழ்", flag: "🇮🇳", code: "ta", nonLatin: true },
  "Telugu": { nativeName: "తెలుగు", flag: "🇮🇳", code: "te", nonLatin: true },
  "Marathi": { nativeName: "मराठी", flag: "🇮🇳", code: "mr", nonLatin: true },
  "Gujarati": { nativeName: "ગુજરાતી", flag: "🇮🇳", code: "gu", nonLatin: true },
  "Kannada": { nativeName: "ಕನ್ನಡ", flag: "🇮🇳", code: "kn", nonLatin: true },
  "Malayalam": { nativeName: "മലയാളം", flag: "🇮🇳", code: "ml", nonLatin: true },
  "Punjabi": { nativeName: "ਪੰਜਾਬੀ", flag: "🇮🇳", code: "pa", nonLatin: true },
  "Urdu": { nativeName: "اردو", flag: "🇵🇰", code: "ur", nonLatin: true, rtl: true },
  "Nepali": { nativeName: "नेपाली", flag: "🇳🇵", code: "ne", nonLatin: true },
  "Sinhala": { nativeName: "සිංහල", flag: "🇱🇰", code: "si", nonLatin: true },
  "Burmese": { nativeName: "မြန်မာဘာသာ", flag: "🇲🇲", nonLatin: true },
  "Khmer": { nativeName: "ខ្មែរ", flag: "🇰🇭", nonLatin: true },
  "Lao": { nativeName: "ລາວ", flag: "🇱🇦", nonLatin: true },
  "Mongolian": { nativeName: "Монгол", flag: "🇲🇳", nonLatin: true },
  "Kazakh": { nativeName: "Қазақ", flag: "🇰🇿", code: "kk", nonLatin: true },
  "Uzbek": { nativeName: "Oʻzbek", flag: "🇺🇿", code: "uz" },
  "Georgian": { nativeName: "ქართული", flag: "🇬🇪", code: "ka", nonLatin: true },
  "Armenian": { nativeName: "Հdelays", flag: "🇦🇲", code: "hy", nonLatin: true },
  "Azerbaijani": { nativeName: "Azərbaycan", flag: "🇦🇿", code: "az" },
  
  // Middle Eastern languages
  "Hebrew": { nativeName: "עברית", flag: "🇮🇱", code: "he", nonLatin: true, rtl: true },
  "Persian": { nativeName: "فارسی", flag: "🇮🇷", code: "fa", nonLatin: true, rtl: true },
  "Kurdish": { nativeName: "Kurdî", flag: "🇮🇶", code: "ku", nonLatin: true, rtl: true },
  "Pashto": { nativeName: "پښتو", flag: "🇦🇫", code: "ps", nonLatin: true, rtl: true },
  "Dari": { nativeName: "دری", flag: "🇦🇫", code: "fa", nonLatin: true, rtl: true },
  
  // African languages
  "Swahili": { nativeName: "Kiswahili", flag: "🇰🇪", code: "sw" },
  "Amharic": { nativeName: "አማርኛ", flag: "🇪🇹", code: "am", nonLatin: true },
  "Hausa": { nativeName: "Hausa", flag: "🇳🇬" },
  "Yoruba": { nativeName: "Yorùbá", flag: "🇳🇬" },
  "Igbo": { nativeName: "Igbo", flag: "🇳🇬" },
  "Zulu": { nativeName: "isiZulu", flag: "🇿🇦" },
  "Xhosa": { nativeName: "isiXhosa", flag: "🇿🇦" },
  "Afrikaans": { nativeName: "Afrikaans", flag: "🇿🇦", code: "af" },
  "Somali": { nativeName: "Soomaali", flag: "🇸🇴" },
  "Tigrinya": { nativeName: "ትግርኛ", flag: "🇪🇷", nonLatin: true },
  "Oromo": { nativeName: "Afaan Oromoo", flag: "🇪🇹" },
  "Malagasy": { nativeName: "Malagasy", flag: "🇲🇬" },
  
  // Classical & constructed languages
  "Latin": { nativeName: "Latina", flag: "🏛️", code: "la" },
  "Ancient Greek": { nativeName: "Ἑλληνική", flag: "🏛️", nonLatin: true },
  "Sanskrit": { nativeName: "संस्कृतम्", flag: "🕉️", nonLatin: true },
  "Classical Chinese": { nativeName: "文言文", flag: "📜", nonLatin: true },
  "Esperanto": { nativeName: "Esperanto", flag: "🌍" },
};

// All available language names
export const ALL_LANGUAGES = Object.keys(LANGUAGES);

// Helper functions
export function getLanguageInfo(name: string) {
  const data = LANGUAGES[name];
  return {
    name,
    nativeName: data?.nativeName || name,
    flag: data?.flag || "🌐",
  };
}

export function isNonLatinLanguage(lang: string): boolean {
  return LANGUAGES[lang]?.nonLatin ?? false;
}

export function isRtlLanguage(lang: string): boolean {
  return LANGUAGES[lang]?.rtl ?? false;
}

export function isSupportedLanguage(lang: string): boolean {
  const info = LANGUAGES[lang];
  // Supported if explicitly marked or has a language code
  return info?.supported ?? !!info?.code;
}

export function getLanguageCode(lang: string): string | undefined {
  return LANGUAGES[lang]?.code;
}

// For backwards compatibility
export const NON_LATIN_LANGUAGES = new Set(
  Object.entries(LANGUAGES).filter(([, v]) => v.nonLatin).map(([k]) => k)
);

