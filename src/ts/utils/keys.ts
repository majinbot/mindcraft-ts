import { readFileSync } from 'fs';

interface Keys {
    [key: string]: string;
}

let keys: Keys = {};

try {
    const data = readFileSync('./keys.json', 'utf8');
    keys = JSON.parse(data);
} catch (err) {
    console.warn('keys.json not found. Defaulting to environment variables.');
}

/**
 * Retrieves an API key from keys.json or environment variables
 * @param name - Name of the API key to retrieve
 * @throws Error if key is not found in either location
 */
export function getKey(name: string): string {
    const key = keys[name] || process.env[name];
    if (!key) {
        throw new Error(`API key "${name}" not found in keys.json or environment variables!`);
    }
    return key;
}

/**
 * Checks if an API key exists in keys.json or environment variables
 * @param name - Name of the API key to check
 */
export function hasKey(name: string): boolean {
    return Boolean(keys[name] || process.env[name]);
}