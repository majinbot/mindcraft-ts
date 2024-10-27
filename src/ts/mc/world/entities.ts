/**
 * Entity finding and interaction utilities
 * @module mc/world/entities
 */
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';

interface EntityWithDistance {
    entity: Entity;
    distance: number;
}

/**
 * Get a list of nearby entities sorted by distance
 */
export function getNearbyEntities(bot: Bot, maxDistance = 16): Entity[] {
    const entities: EntityWithDistance[] = Object.values(bot.entities)
        .map(entity => ({
            entity,
            distance: entity.position.distanceTo(bot.entity.position)
        }))
        .filter(e => e.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);

    return entities.map(e => e.entity);
}

/**
 * Get the nearest entity that matches a predicate
 */
export function getNearestEntityWhere(
    bot: Bot,
    predicate: (entity: Entity) => boolean,
    maxDistance = 16
): Entity | null {
    return bot.nearestEntity(entity =>
        predicate(entity) &&
        bot.entity.position.distanceTo(entity.position) < maxDistance
    );
}

/**
 * Get a list of nearby players sorted by distance
 */
export function getNearbyPlayers(bot: Bot, maxDistance = 16): Entity[] {
    return getNearbyEntities(bot, maxDistance)
        .filter(entity =>
            entity.type === 'player' &&
            entity.username !== bot.username
        );
}

/**
 * Get a list of all nearby entity types
 */
export function getNearbyEntityTypes(bot: Bot): string[] {
    return [...new Set(
        getNearbyEntities(bot)
            .map(entity => entity.name)
            .filter((name): name is string => name !== undefined)
    )];
}

/**
 * Get a list of all nearby player names
 */
export function getNearbyPlayerNames(bot: Bot): string[] {
    return [...new Set(
        getNearbyPlayers(bot)
            .map(player => player.username)
            .filter((name): name is string =>
                name !== undefined &&
                name !== bot.username
            )
    )];
}