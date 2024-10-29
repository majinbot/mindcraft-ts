/**
 * @file Mathematical utility functions
 * @description Provides mathematical operations for vector calculations
 */

/**
 * Calculates the cosine similarity between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity value between -1 and 1
 *
 * @throws Error if vectors are empty or of different lengths
 *
 * @improvements
 * - Added type safety
 * - Added input validation
 * - Added performance optimizations
 * - Added error handling
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    // Input validation
    if (!Array.isArray(a) || !Array.isArray(b)) {
        throw new Error('Inputs must be arrays');
    }

    if (a.length === 0 || b.length === 0) {
        throw new Error('Vectors cannot be empty');
    }

    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    // Pre-allocate accumulators for performance
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    // Single loop for better performance
    for (let i = 0; i < a.length; i++) {
        // Type check for vector elements
        if (typeof a[i] !== 'number' || typeof b[i] !== 'number') {
            throw new Error('Vector elements must be numbers');
        }

        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }

    // Calculate final magnitudes
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    // Check for zero magnitudes to avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
        throw new Error('Zero magnitude vector detected');
    }

    // Calculate and return cosine similarity
    const similarity = dotProduct / (magnitudeA * magnitudeB);

    // Ensure result is within valid range due to potential floating-point errors
    return Math.min(1, Math.max(-1, similarity));
}