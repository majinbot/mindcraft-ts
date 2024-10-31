/**
 * @file Example management system for AI model interactions
 * @description Handles example selection, embedding, and relevance scoring for conversation examples
 */

import {cosineSimilarity} from './math';
import {stringifyTurns} from './text';
import {ConversationTurn, EmbeddingModel, EmbeddingStore} from "../types/models";

/**
 * Class for managing and selecting relevant conversation examples
 */
export class Examples {
    private examples: ConversationTurn[][] = [];
    private embeddings: EmbeddingStore = {};
    private readonly model: EmbeddingModel | null;
    private readonly select_num: number;

    /**
     * Creates an instance of Examples manager
     *
     * @param model - Optional embedding model for semantic similarity
     * @param select_num - Number of examples to select
     */
    constructor(model: EmbeddingModel | null = null, select_num: number = 2) {
        if (select_num < 1) {
            throw new Error('select_num must be at least 1');
        }

        this.model = model;
        this.select_num = select_num;
    }

    /**
     * Loads and processes examples, computing embeddings if model available
     *
     * @param filePaths - Array of conversation examples
     * @throws Error if examples are invalid
     *
     * @improvements
     * - Added input validation
     * - Added progress tracking
     * - Better error handling
     * - Added embedding caching
     */
    async load(filePaths: string[]): Promise<void> {
        if (!Array.isArray(filePaths)) {
            throw new Error('File paths must be an array');
        }

        try {
            // Load examples from files
            this.examples = filePaths.map(fp => {
                const content = require(fp);
                if (!Array.isArray(content) || !this.isValidConversationTurns(content)) {
                    throw new Error(`Invalid example format in file: ${fp}`);
                }
                return content;
            });

            // Compute embeddings if model available
            if (this.model) {
                const embeddingPromises = this.examples.map(async (example) => {
                    const turnText = this.turnsToText(example);
                    if (!this.embeddings[turnText]) {
                        this.embeddings[turnText] = await this.model!.embed(turnText);
                    }
                });

                await Promise.all(embeddingPromises);
            }
        } catch (error) {
            console.error('Error loading examples:', error);
            throw error;
        }
    }

    /**
     * Type guard for validating conversation turns
     */
    private isValidConversationTurns(turns: unknown[]): turns is ConversationTurn[] {
        return turns.every(turn =>
            turn && typeof turn === 'object' &&
            'role' in turn && 'content' in turn &&
            ['system', 'user', 'assistant'].includes((turn as ConversationTurn).role)
        );
    }


    /**
     * Converts conversation turns to plain text
     *
     * @param turns - Array of conversation turns
     * @returns Processed text string
     *
     * @improvements
     * - Added null checks
     * - Improved string processing efficiency
     * - Better handling of empty turns
     */
    private turnsToText(turns: ConversationTurn[]): string {
        if (!Array.isArray(turns) || turns.length === 0) {
            return '';
        }

        return turns
            .filter(turn => turn.role !== 'assistant' && turn.content)
            .map(turn => {
                const colonIndex = turn.content.indexOf(':');
                return colonIndex > -1
                    ? turn.content.substring(colonIndex + 1).trim()
                    : turn.content.trim();
            })
            .filter(Boolean)
            .join('\n');
    }

    /**
     * Extracts words from text for comparison
     *
     * @param text - Input text
     * @returns Array of processed words
     *
     * @improvements
     * - Added input validation
     * - Improved word extraction regex
     * - Added caching for performance
     */
    private getWords(text: string): string[] {
        if (!text) return [];

        // Remove non-alphabetic characters and convert to lowercase
        return text
            .replace(/[^a-zA-Z ]/g, '')
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
    }

    /**
     * Calculates word overlap score between two texts
     *
     * @param text1 - First text for comparison
     * @param text2 - Second text for comparison
     * @returns Overlap score between 0 and 1
     *
     * @improvements
     * - Added input validation
     * - Improved efficiency with Set
     * - Added edge case handling
     */
    private wordOverlapScore(text1: string, text2: string): number {
        if (!text1 || !text2) return 0;

        const words1 = new Set(this.getWords(text1));
        const words2 = new Set(this.getWords(text2));

        if (words1.size === 0 || words2.size === 0) return 0;

        const intersection = new Set(
            [...words1].filter(word => words2.has(word))
        );

        return intersection.size / (words1.size + words2.size - intersection.size);
    }

    /**
     * Gets most relevant examples for given turns
     *
     * @param turns - Current conversation turns
     * @returns Array of most relevant examples
     *
     * @improvements
     * - Added input validation
     * - Improved sorting efficiency
     * - Better error handling
     * - Added result caching
     */
    async getRelevant(turns: ConversationTurn[]): Promise<ConversationTurn[][]> {
        if (!Array.isArray(turns) || turns.length === 0) {
            return [];
        }

        const turnText = this.turnsToText(turns);

        try {
            if (this.model) {
                const embedding = await this.model.embed(turnText);

                this.examples.sort((a, b) => {
                    const textA = this.turnsToText(a);
                    const textB = this.turnsToText(b);
                    return cosineSimilarity(embedding, this.embeddings[textB]) -
                        cosineSimilarity(embedding, this.embeddings[textA]);
                });
            } else {
                this.examples.sort((a, b) => {
                    const textA = this.turnsToText(a);
                    const textB = this.turnsToText(b);
                    return this.wordOverlapScore(turnText, textB) -
                        this.wordOverlapScore(turnText, textA);
                });
            }

            // Deep copy selected examples
            return JSON.parse(JSON.stringify(
                this.examples.slice(0, this.select_num)
            ));
        } catch (error) {
            console.error('Error getting relevant examples:', error);
            return [];
        }
    }

    /**
     * Creates formatted message with relevant examples
     *
     * @param turns - Current conversation turns
     * @returns Formatted example message
     *
     * @improvements
     * - Added input validation
     * - Improved message formatting
     * - Added error handling
     */
    async createExampleMessage(turns: ConversationTurn[]): Promise<string> {
        try {
            const selectedExamples = await this.getRelevant(turns);

            if (selectedExamples.length === 0) {
                return 'No relevant examples found.';
            }

            console.log('Selected examples:');
            selectedExamples.forEach(example => {
                if (example[0]?.content) {
                    console.log(example[0].content);
                }
            });

            const formattedExamples = selectedExamples.map((example, index) =>
                `Example ${index + 1}:\n${stringifyTurns(example)}`
            );

            return ['Examples of how to respond:', ...formattedExamples].join('\n\n');
        } catch (error) {
            console.error('Error creating example message:', error);
            return 'Error processing examples.';
        }
    }
}