/**
 * @file Code safety checking utilities
 * @description Provides functions to check for potentially dangerous code patterns
 */

/**
 * Pattern type with additional metadata for better error reporting
 */
interface DangerPattern {
    pattern: RegExp;
    description: string;
    severity: 'high' | 'medium' | 'low';
}

/**
 * Defines patterns that could indicate potentially dangerous code
 *
 * @improvements
 * - Added pattern descriptions
 * - Added severity levels
 * - Organized by category
 * - Added more comprehensive patterns
 */
const DANGEROUS_PATTERNS: DangerPattern[] = [
    // Module System Access
    {
        pattern: /\bimport\s*\(/,
        description: 'Dynamic imports are not allowed',
        severity: 'high'
    },
    {
        pattern: /\brequire\s*\(/,
        description: 'CommonJS require is not allowed',
        severity: 'high'
    },
    {
        pattern: /\bmodule\b|\bexports\b/,
        description: 'Direct module manipulation is not allowed',
        severity: 'high'
    },

    // System Access
    {
        pattern: /\bprocess\b|\bglobal\b/,
        description: 'Access to process or global objects is not allowed',
        severity: 'high'
    },
    {
        pattern: /\b__dirname\b|\b__filename\b/,
        description: 'Access to file system paths is not allowed',
        severity: 'high'
    },

    // Code Execution
    {
        pattern: /\bFunction\s*\(|\beval\s*\(/,
        description: 'Dynamic code execution is not allowed',
        severity: 'high'
    },

    // Network Access
    {
        pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/,
        description: 'Network access is not allowed',
        severity: 'medium'
    }
];

/**
 * Result of a safety check
 */
interface SafetyCheckResult {
    safe: boolean;
    violations: Array<{
        pattern: string;
        description: string;
        severity: string;
    }>;
}

/**
 * Checks if code contains potentially dangerous patterns
 *
 * @param code - Code string to check
 * @returns Object containing safety status and any violations found
 *
 * @improvements
 * - Added detailed violation reporting
 * - Added severity levels
 * - Added type safety
 * - Added better pattern organization
 * - Added additional checks
 */
export function checkSafe(code: string): SafetyCheckResult {
    const violations = DANGEROUS_PATTERNS
        .filter(({ pattern }) => pattern.test(code))
        .map(({ pattern, description, severity }) => ({
            pattern: pattern.toString(),
            description,
            severity
        }));

    return {
        safe: violations.length === 0,
        violations
    };
}

// Additional helper function to get detailed report
export function getSafetyReport(code: string): string {
    const result = checkSafe(code);

    if (result.safe) {
        return 'Code appears safe - no dangerous patterns detected.';
    }

    const report = ['Code safety violations found:'];

    result.violations.forEach(({ description, severity }) => {
        report.push(`- [${severity.toUpperCase()}] ${description}`);
    });

    return report.join('\n');
}