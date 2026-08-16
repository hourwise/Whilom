/**
 * @whilom/database
 *
 * The single source of database contracts. Both apps and the ingestion
 * pipeline are *clients* of this package — no app owns the schema (spec §3).
 */
export * from './client';
export type { Database, Json } from './generated/database.types';
