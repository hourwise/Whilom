/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate after every migration with:
 *   pnpm db:types            (uses the local Supabase stack)
 *
 * This placeholder keeps the workspace type-checking before the first
 * `supabase gen types` run. Once generated, it is replaced by the full
 * `Database` type describing every table, view, function and enum.
 *
 * ── STATUS: DB_TYPES_REGENERATION_BLOCKED_BY_LOCAL_STORAGE_GATE ─────────────
 *
 * This is STILL the placeholder. It has never been generated, and it does not
 * describe migrations 0001–0017.
 *
 * `supabase gen types --local` requires a running local Supabase stack, which
 * requires Docker. On the machine this was last attempted, Docker was not
 * installed and the C: drive had ~6 GB free — starting the stack would have
 * meant a multi-gigabyte image download onto a nearly full disk. Whilom has no
 * hosted Supabase project, and generating against another project's database
 * would produce types for the wrong schema.
 *
 * Consequences to be aware of until this is generated:
 *   - `Database['public']['Tables']` is `Record<string, never>`, so
 *     `SupabaseClient<Database>` gives NO table-level type safety. Queries
 *     type-check whatever you write.
 *   - `apps/web/src/lib/types.ts` therefore still hand-writes the row shapes
 *     the web MVP renders. Those are the contract in practice, and they are
 *     not checked against the schema by anything.
 *
 * To resolve: `supabase start && supabase db reset && pnpm db:types`, then
 * delete this notice, add the `<Database>` generic to the web/mobile clients,
 * and retire the hand-written display types.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
