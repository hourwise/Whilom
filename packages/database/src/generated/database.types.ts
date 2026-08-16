/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate after every migration with:
 *   pnpm db:types            (uses the local Supabase stack)
 *
 * This placeholder keeps the workspace type-checking before the first
 * `supabase gen types` run. Once generated, it is replaced by the full
 * `Database` type describing every table, view, function and enum.
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
