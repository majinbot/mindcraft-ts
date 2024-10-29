/**
 * Interface for translation results from google-translate-api-x
 */
export interface TranslationResult {
    text: string;
    from: {
        language: {
            iso: string;
        };
    };
}

/**
 * Options for translation requests
 */
export interface TranslationOptions {
    to: string;
    from?: string;
}
