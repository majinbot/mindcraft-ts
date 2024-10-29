/**
 * @file Translation utility functions
 * @description Provides translation services using Google Translate API with error handling and type safety
 */

import translate from 'google-translate-api-x';
import config from '../config';
import {TranslationOptions, TranslationResult} from "../types/translation";

/**
 * Translates a message to the preferred language specified in settings
 *
 * @param message - The message to translate
 * @returns Promise<string> - The translated text or original message if translation fails
 *
 * @throws Will log error but return original message if translation fails
 *
 * @improvements
 * - Added type safety with interfaces
 * - Improved error handling with specific error types
 * - Added input validation
 * - Cached language check for performance
 */
export async function handleTranslation(message: string): Promise<string> {
    // Input validation
    if (!message) {
        console.error('Invalid message for translation:', message);
        return message;
    }

    // Cache the lowercase preferred language for performance
    const preferredLang = config.language.toLowerCase();

    try {
        // Skip translation if target language is English
        if (preferredLang === 'en' || preferredLang === 'english') {
            return message;
        }

        const options: TranslationOptions = { to: preferredLang };
        const translation = await translate(message, options) as TranslationResult;

        return translation.text || message;

    } catch (error) {
        // Enhanced error logging with error type information
        console.error('Translation error:', {
            message: message,
            targetLanguage: preferredLang,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        return message;
    }
}

/**
 * Translates any message to English
 *
 * @param message - The message to translate to English
 * @returns Promise<string> - The translated English text or original message if translation fails
 *
 * @throws Will log error but return original message if translation fails
 *
 * @improvements
 * - Added type safety
 * - Improved error handling
 * - Added input validation
 * - Consistent error logging format with handleTranslation
 */
export async function handleEnglishTranslation(message: string): Promise<string> {
    // Input validation
    if (!message) {
        console.error('Invalid message for English translation:', message);
        return message;
    }

    try {
        const options: TranslationOptions = { to: 'english' };
        const translation = await translate(message, options) as TranslationResult;

        return translation.text || message;

    } catch (error) {
        console.error('English translation error:', {
            message: message,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        return message;
    }
}