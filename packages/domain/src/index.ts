/**
 * @whilom/domain
 *
 * Framework-agnostic, zero-dependency domain model for the heritage graph.
 * Consumed by the database contracts, ingestion pipeline, web app and mobile app.
 *
 * This package owns *meaning* (entity kinds, predicates, controlled vocabularies).
 * Persisted row shapes live in `@whilom/database`; validation lives in
 * `@whilom/validation`.
 */
export * from './enums';
export * from './relationships';
export * from './geo';
