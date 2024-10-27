/**
 * Calculates the cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += Math.pow(a[i], 2);
        magnitudeB += Math.pow(b[i], 2);
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    return dotProduct / (magnitudeA * magnitudeB);
}