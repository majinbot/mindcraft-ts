/**
 * @file API key management utilities
 * @description Handles loading and retrieval of API keys from files and environment variables
 */

import { readFileSync } from 'fs';

/**
 * Interface for the structure of the keys.json file
 */
interface KeyStore {
    [key: string]: string;
}

/**
 * Loads API keys from keys.json or defaults to environment variables
 *
 * @improvements
 * - Added type safety
 * - Added better error handling
 * - Added key validation
 * - Added caching
 */
class KeyManager {
    private keys: KeyStore = {};
    private initialized: boolean = false;

    /**
     * Initializes the key manager and loads keys from file
     */
    private initialize(): void {
        if (this.initialized) return;

        try {
            const data = readFileSync('./keys.json', 'utf8');
            this.keys = JSON.parse(data);
        } catch (err) {
            console.warn('keys.json not found. Defaulting to environment variables.');
        }

        this.initialized = true;
    }

    /**
     * Gets an API key by name
     *
     * @param name - Name of the API key to retrieve
     * @returns The API key string
     * @throws Error if key is not found
     */
    public getKey(name: string): string {
        this.initialize();

        const key = this.keys[name] || process.env[name];

        if (!key) {
            throw new Error(
                `API key "${name}" not found in keys.json or environment variables!`
            );
        }

        // Basic key validation
        if (key.trim().length === 0) {
            throw new Error(`Invalid API key format for "${name}"`);
        }

        return key;
    }

    /**
     * Checks if an API key exists
     *
     * @param name - Name of the API key to check
     * @returns boolean indicating if key exists
     */
    public hasKey(name: string): boolean {
        this.initialize();
        return Boolean(this.keys[name] || process.env[name]);
    }
}

// Export singleton instance
const keyManager = new KeyManager();
export const getKey = keyManager.getKey.bind(keyManager);
export const hasKey = keyManager.hasKey.bind(keyManager);