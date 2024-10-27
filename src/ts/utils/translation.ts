import translate from 'google-translate-api-x';
import settings from '../settings';

const preferred_lang = settings.language;

/**
 * Translates a message to the preferred language
 * @param message - Message to translate
 * @returns Translated message or original if translation fails
 */
export async function handleTranslation(message: string): Promise<string> {
    try {
        if (preferred_lang.toLowerCase() === 'en' || preferred_lang.toLowerCase() === 'english') {
            return message;
        }

        const translation = await translate(message, { to: preferred_lang });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}

/**
 * Translates a message to English
 * @param message - Message to translate
 * @returns Translated message or original if translation fails
 */
export async function handleEnglishTranslation(message: string): Promise<string> {
    try {
        const translation = await translate(message, { to: 'english' });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}