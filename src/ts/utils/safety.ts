/**
 * Patterns that indicate potentially unsafe code
 */
const DANGEROUS_PATTERNS = [
    /\bimport\s*\(/,        // Dynamic imports
    /\bprocess\b/,          // Process access
    /\bglobal\b/,           // Global object access
    /\bmodule\b/,           // Module manipulation
    /\bexports\b/,          // Exports manipulation
    /\brequire\s*\(/,       // Require usage
    /\bFunction\s*\(/,      // Function constructors
    /\beval\s*\(/,          // Eval usage
    /\b__dirname\b/,        // Directory access
    /\b__filename\b/,       // File access
    /\bfetch\s*\(/,         // Network requests
    /\bXMLHttpRequest\b/,   // XHR requests
    /\bWebSocket\b/,        // WebSocket usage
] as const;

/**
 * Checks if code contains potentially unsafe patterns
 * @param code - Code string to check
 * @returns true if code appears safe, false otherwise
 */
export function checkSafe(code: string): boolean {
    return !DANGEROUS_PATTERNS.some(pattern => pattern.test(code));
}
