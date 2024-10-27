import { cosineSimilarity } from './math';
import { stringifyTurns } from './text';
import { Turn, EmbeddingModel } from '../types';

/**
 * Manages example conversations and their embeddings for context-aware responses
 */
export class Examples {
    private examples: Turn[][];
    private model: EmbeddingModel | null;
    private readonly select_num: number;
    private readonly embeddings: Record<string, number[]>;

    constructor(model: EmbeddingModel | null = null, select_num: number = 2) {
        this.examples = [];
        this.model = model;
        this.select_num = select_num;
        this.embeddings = {};
    }

    /**
     * Converts conversation turns into a single text string
     * @param turns - Array of conversation turns
     * @returns Concatenated text of non-assistant messages
     */
    private turnsToText(turns: Turn[]): string {
        const messages = turns
            .filter(turn => turn.role !== 'assistant')
            .map(turn => {
                const colonIndex = turn.content.indexOf(':');
                return colonIndex >= 0
                    ? turn.content.substring(colonIndex + 1).trim()
                    : turn.content.trim();
            })
            .join('\n');
        return messages.trim();
    }

    /**
     * Extracts words from text for similarity comparison
     * @param text - Input text to process
     * @returns Array of lowercase words with punctuation removed
     */
    private getWords(text: string): string[] {
        return text.replace(/[^a-zA-Z ]/g, '').toLowerCase().split(' ');
    }

    /**
     * Calculates word overlap similarity between two texts
     * @param text1 - First text for comparison
     * @param text2 - Second text for comparison
     * @returns Similarity score between 0 and 1
     */
    private wordOverlapScore(text1: string, text2: string): number {
        const words1 = this.getWords(text1);
        const words2 = this.getWords(text2);
        const intersection = words1.filter(word => words2.includes(word));
        return intersection.length / (words1.length + words2.length - intersection.length);
    }

    /**
     * Loads and processes examples, generating embeddings if model is available
     * @param examples - Array of conversation examples to load
     */
    async load(examples: Turn[][]): Promise<void> {
        this.examples = examples;
        try {
            // Store model reference to ensure it doesn't change during async operation
            const model = this.model;
            if (model !== null) {
                const embeddingPromises = this.examples.map(async (example) => {
                    const turn_text = this.turnsToText(example);
                    this.embeddings[turn_text] = await model.embed(turn_text);
                });
                await Promise.all(embeddingPromises);
            }
        } catch (err) {
            console.warn('Error with embedding model, using word overlap instead.');
            this.model = null;
        }
    }

    /**
     * Retrieves most relevant examples based on current conversation
     * @param turns - Current conversation turns
     * @returns Most relevant examples based on similarity
     */
    async getRelevant(turns: Turn[]): Promise<Turn[][]> {
        const turn_text = this.turnsToText(turns);

        if (this.model !== null) {
            const embedding = await this.model.embed(turn_text);
            this.examples.sort((a, b) =>
                cosineSimilarity(embedding, this.embeddings[this.turnsToText(b)]) -
                cosineSimilarity(embedding, this.embeddings[this.turnsToText(a)])
            );
        } else {
            this.examples.sort((a, b) =>
                this.wordOverlapScore(turn_text, this.turnsToText(b)) -
                this.wordOverlapScore(turn_text, this.turnsToText(a))
            );
        }

        return structuredClone(this.examples.slice(0, this.select_num));
    }

    /**
     * Creates a formatted message containing relevant examples
     * @param turns - Current conversation turns
     * @returns Formatted string containing relevant examples
     */
    async createExampleMessage(turns: Turn[]): Promise<string> {
        const selected_examples = await this.getRelevant(turns);

        console.log('selected examples:');
        selected_examples.forEach(example => {
            console.log(example[0].content);
        });

        return [
            'Examples of how to respond:',
            ...selected_examples.map((example, i) =>
                `Example ${i + 1}:\n${stringifyTurns(example)}`
            )
        ].join('\n\n');
    }
}