export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      badges: {
        Row: {
          category: Database["public"]["Enums"]["badge_category"]
          created_at: string
          criteria: Json
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          category: Database["public"]["Enums"]["badge_category"]
          created_at?: string
          criteria: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          category?: Database["public"]["Enums"]["badge_category"]
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      collection_entities: {
        Row: {
          collection_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          note: string | null
          position: number
        }
        Insert: {
          collection_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          note?: string | null
          position?: number
        }
        Update: {
          collection_id?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          note?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_entities_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          hero_image_id: string | null
          id: string
          is_published: boolean
          kind: string
          name: string
          period: Database["public"]["Enums"]["historical_period"] | null
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["moderation_state"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          hero_image_id?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          name: string
          period?: Database["public"]["Enums"]["historical_period"] | null
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["moderation_state"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          hero_image_id?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          name?: string
          period?: Database["public"]["Enums"]["historical_period"] | null
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["moderation_state"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_hero_image_id_fkey"
            columns: ["hero_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          moderation_status: Database["public"]["Enums"]["moderation_state"]
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          contribution_type: Database["public"]["Enums"]["contribution_type"]
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          id: string
          payload: Json
          status: Database["public"]["Enums"]["moderation_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          contribution_type: Database["public"]["Enums"]["contribution_type"]
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["moderation_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          contribution_type?: Database["public"]["Enums"]["contribution_type"]
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["moderation_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          created_at: string
          current_value: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          field: string | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["moderation_state"]
          suggested_value: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          field?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          suggested_value?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          field?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          suggested_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          date_end: string | null
          date_start: string | null
          id: string
          import_run_id: string | null
          note: string | null
          object_id: string
          object_type: Database["public"]["Enums"]["entity_type"]
          predicate: string
          source_id: string | null
          source_record_id: string | null
          status: Database["public"]["Enums"]["moderation_state"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["entity_type"]
          verified: boolean
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start?: string | null
          id?: string
          import_run_id?: string | null
          note?: string | null
          object_id: string
          object_type: Database["public"]["Enums"]["entity_type"]
          predicate: string
          source_id?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["entity_type"]
          verified?: boolean
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start?: string | null
          id?: string
          import_run_id?: string | null
          note?: string | null
          object_id?: string
          object_type?: Database["public"]["Enums"]["entity_type"]
          predicate?: string
          source_id?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["entity_type"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          date_end: string | null
          date_note: string | null
          date_start: string | null
          description: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          location: unknown
          name: string
          period: Database["public"]["Enums"]["historical_period"] | null
          primary_place_id: string | null
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["moderation_state"]
          trust_level: Database["public"]["Enums"]["trust_level"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_end?: string | null
          date_note?: string | null
          date_start?: string | null
          description?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          location?: unknown
          name: string
          period?: Database["public"]["Enums"]["historical_period"] | null
          primary_place_id?: string | null
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["moderation_state"]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_end?: string | null
          date_note?: string | null
          date_start?: string | null
          description?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          location?: unknown
          name?: string
          period?: Database["public"]["Enums"]["historical_period"] | null
          primary_place_id?: string | null
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["moderation_state"]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_primary_place_id_fkey"
            columns: ["primary_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_primary_place_id_fkey"
            columns: ["primary_place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_predicates: {
        Row: {
          cardinality: string
          created_at: string
          description: string | null
          label: string
          predicate: string
          value_kind: string
        }
        Insert: {
          cardinality?: string
          created_at?: string
          description?: string | null
          label: string
          predicate: string
          value_kind: string
        }
        Update: {
          cardinality?: string
          created_at?: string
          description?: string | null
          label?: string
          predicate?: string
          value_kind?: string
        }
        Relationships: []
      }
      facts: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          is_preferred: boolean
          note: string | null
          predicate: string
          source_id: string | null
          source_record_id: string | null
          source_value: string | null
          status: Database["public"]["Enums"]["moderation_state"]
          valid_from: string | null
          valid_to: string | null
          value: Json
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_preferred?: boolean
          note?: string | null
          predicate: string
          source_id?: string | null
          source_record_id?: string | null
          source_value?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          valid_from?: string | null
          valid_to?: string | null
          value: Json
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_preferred?: boolean
          note?: string | null
          predicate?: string
          source_id?: string | null
          source_record_id?: string | null
          source_value?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          valid_from?: string | null
          valid_to?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_periods: {
        Row: {
          display_name: string
          display_order: number
          end_year: number
          id: string
          note: string | null
          parent_id: string | null
          start_year: number
        }
        Insert: {
          display_name: string
          display_order: number
          end_year: number
          id: string
          note?: string | null
          parent_id?: string | null
          start_year: number
        }
        Update: {
          display_name?: string
          display_order?: number
          end_year?: number
          id?: string
          note?: string | null
          parent_id?: string | null
          start_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_periods_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "historical_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      image_rights: {
        Row: {
          attribution: string | null
          created_at: string
          creator: string | null
          creator_raw: string | null
          image_id: string
          licence: string | null
          licence_normalised:
            | Database["public"]["Enums"]["media_licence"]
            | null
          licence_raw: string | null
          licence_url: string | null
          ownership_declared: boolean
          raw: Json | null
          retrieved_at: string | null
          source: string | null
          source_file_id: string | null
          source_url: string | null
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          creator?: string | null
          creator_raw?: string | null
          image_id: string
          licence?: string | null
          licence_normalised?:
            | Database["public"]["Enums"]["media_licence"]
            | null
          licence_raw?: string | null
          licence_url?: string | null
          ownership_declared?: boolean
          raw?: Json | null
          retrieved_at?: string | null
          source?: string | null
          source_file_id?: string | null
          source_url?: string | null
        }
        Update: {
          attribution?: string | null
          created_at?: string
          creator?: string | null
          creator_raw?: string | null
          image_id?: string
          licence?: string | null
          licence_normalised?:
            | Database["public"]["Enums"]["media_licence"]
            | null
          licence_raw?: string | null
          licence_url?: string | null
          ownership_declared?: boolean
          raw?: Json | null
          retrieved_at?: string | null
          source?: string | null
          source_file_id?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_rights_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: true
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          height: number | null
          id: string
          is_community: boolean
          mime_type: string | null
          moderation_status: Database["public"]["Enums"]["moderation_state"]
          source_id: string | null
          source_record_id: string | null
          storage_path: string
          thumbnail_url: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          height?: number | null
          id?: string
          is_community?: boolean
          mime_type?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          source_id?: string | null
          source_record_id?: string | null
          storage_path: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          height?: number | null
          id?: string
          is_community?: boolean
          mime_type?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          source_id?: string | null
          source_record_id?: string | null
          storage_path?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_candidates: {
        Row: {
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          import_raw_id: string | null
          import_run_id: string
          match_confidence: number | null
          matched_entity_id: string | null
          normalised: Json
          published_at: string | null
          published_by: string | null
          published_entity_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_record_id: string | null
          status: Database["public"]["Enums"]["moderation_state"]
        }
        Insert: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          import_raw_id?: string | null
          import_run_id: string
          match_confidence?: number | null
          matched_entity_id?: string | null
          normalised: Json
          published_at?: string | null
          published_by?: string | null
          published_entity_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Update: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          import_raw_id?: string | null
          import_run_id?: string
          match_confidence?: number | null
          matched_entity_id?: string | null
          normalised?: Json
          published_at?: string | null
          published_by?: string | null
          published_entity_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Relationships: [
          {
            foreignKeyName: "import_candidates_import_raw_id_fkey"
            columns: ["import_raw_id"]
            isOneToOne: false
            referencedRelation: "import_raw"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      import_conflicts: {
        Row: {
          confidence: number | null
          conflict_reason: string | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          existing_value: Json | null
          field: string
          id: string
          import_candidate_id: string
          incoming_value: Json | null
          predicate: string | null
          resolution: string | null
          resolution_note: string | null
          resolution_outcome:
            | Database["public"]["Enums"]["conflict_resolution"]
            | null
          resolved_at: string | null
          resolved_by: string | null
          source_record_id: string | null
          status: Database["public"]["Enums"]["moderation_state"]
        }
        Insert: {
          confidence?: number | null
          conflict_reason?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          existing_value?: Json | null
          field: string
          id?: string
          import_candidate_id: string
          incoming_value?: Json | null
          predicate?: string | null
          resolution?: string | null
          resolution_note?: string | null
          resolution_outcome?:
            | Database["public"]["Enums"]["conflict_resolution"]
            | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Update: {
          confidence?: number | null
          conflict_reason?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          existing_value?: Json | null
          field?: string
          id?: string
          import_candidate_id?: string
          incoming_value?: Json | null
          predicate?: string | null
          resolution?: string | null
          resolution_note?: string | null
          resolution_outcome?:
            | Database["public"]["Enums"]["conflict_resolution"]
            | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_record_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Relationships: [
          {
            foreignKeyName: "import_conflicts_import_candidate_id_fkey"
            columns: ["import_candidate_id"]
            isOneToOne: false
            referencedRelation: "import_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_conflicts_import_candidate_id_fkey"
            columns: ["import_candidate_id"]
            isOneToOne: false
            referencedRelation: "import_review_queue"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "import_conflicts_predicate_fkey"
            columns: ["predicate"]
            isOneToOne: false
            referencedRelation: "fact_predicates"
            referencedColumns: ["predicate"]
          },
          {
            foreignKeyName: "import_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_conflicts_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      import_media_candidates: {
        Row: {
          association_confidence: number | null
          association_evidence: Json
          association_outcome: Database["public"]["Enums"]["media_association_outcome"]
          attribution_text: string | null
          caption: string | null
          created_at: string
          creator: string | null
          creator_raw: string | null
          depicted_entity_ids: string[]
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          height: number | null
          id: string
          import_run_id: string | null
          import_source_id: string
          importer_version: string | null
          licence: Database["public"]["Enums"]["media_licence"]
          licence_raw: string | null
          licence_url: string | null
          media_url: string | null
          mime_type: string | null
          missing_rights_fields: string[]
          published_at: string | null
          published_by: string | null
          published_image_id: string | null
          raw: Json
          retrieved_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rights_state: Database["public"]["Enums"]["media_rights_state"]
          source_file_id: string
          source_page_url: string
          source_title: string | null
          source_updated_at: string | null
          status: Database["public"]["Enums"]["moderation_state"]
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          association_confidence?: number | null
          association_evidence?: Json
          association_outcome?: Database["public"]["Enums"]["media_association_outcome"]
          attribution_text?: string | null
          caption?: string | null
          created_at?: string
          creator?: string | null
          creator_raw?: string | null
          depicted_entity_ids?: string[]
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          height?: number | null
          id?: string
          import_run_id?: string | null
          import_source_id: string
          importer_version?: string | null
          licence?: Database["public"]["Enums"]["media_licence"]
          licence_raw?: string | null
          licence_url?: string | null
          media_url?: string | null
          mime_type?: string | null
          missing_rights_fields?: string[]
          published_at?: string | null
          published_by?: string | null
          published_image_id?: string | null
          raw?: Json
          retrieved_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_state?: Database["public"]["Enums"]["media_rights_state"]
          source_file_id: string
          source_page_url: string
          source_title?: string | null
          source_updated_at?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          association_confidence?: number | null
          association_evidence?: Json
          association_outcome?: Database["public"]["Enums"]["media_association_outcome"]
          attribution_text?: string | null
          caption?: string | null
          created_at?: string
          creator?: string | null
          creator_raw?: string | null
          depicted_entity_ids?: string[]
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          height?: number | null
          id?: string
          import_run_id?: string | null
          import_source_id?: string
          importer_version?: string | null
          licence?: Database["public"]["Enums"]["media_licence"]
          licence_raw?: string | null
          licence_url?: string | null
          media_url?: string | null
          mime_type?: string | null
          missing_rights_fields?: string[]
          published_at?: string | null
          published_by?: string | null
          published_image_id?: string | null
          raw?: Json
          retrieved_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_state?: Database["public"]["Enums"]["media_rights_state"]
          source_file_id?: string
          source_page_url?: string
          source_title?: string | null
          source_updated_at?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_media_candidates_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_media_candidates_import_source_id_fkey"
            columns: ["import_source_id"]
            isOneToOne: false
            referencedRelation: "import_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_media_candidates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_media_candidates_published_image_id_fkey"
            columns: ["published_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_media_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_raw: {
        Row: {
          external_id: string | null
          id: string
          import_run_id: string
          import_source_id: string
          payload: Json
          retrieved_at: string
        }
        Insert: {
          external_id?: string | null
          id?: string
          import_run_id: string
          import_source_id: string
          payload: Json
          retrieved_at?: string
        }
        Update: {
          external_id?: string | null
          id?: string
          import_run_id?: string
          import_source_id?: string
          payload?: Json
          retrieved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_raw_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_raw_import_source_id_fkey"
            columns: ["import_source_id"]
            isOneToOne: false
            referencedRelation: "import_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          import_source_id: string
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          import_source_id: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          import_source_id?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_import_source_id_fkey"
            columns: ["import_source_id"]
            isOneToOne: false
            referencedRelation: "import_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sources: {
        Row: {
          adapter: string
          base_url: string | null
          config: Json
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          key: string
          licence: string | null
          source_id: string | null
        }
        Insert: {
          adapter: string
          base_url?: string | null
          config?: Json
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          key: string
          licence?: string | null
          source_id?: string | null
        }
        Update: {
          adapter?: string
          base_url?: string | null
          config?: Json
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          key?: string
          licence?: string | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      media_licence_terms: {
        Row: {
          display_name: string
          is_reusable: boolean
          licence: Database["public"]["Enums"]["media_licence"]
          licence_url: string | null
          requires_attribution: boolean
          requires_share_alike: boolean
        }
        Insert: {
          display_name: string
          is_reusable: boolean
          licence: Database["public"]["Enums"]["media_licence"]
          licence_url?: string | null
          requires_attribution: boolean
          requires_share_alike?: boolean
        }
        Update: {
          display_name?: string
          is_reusable?: boolean
          licence?: Database["public"]["Enums"]["media_licence"]
          licence_url?: string | null
          requires_attribution?: boolean
          requires_share_alike?: boolean
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          moderation_item_id: string
          moderator_id: string | null
          note: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          moderation_item_id: string
          moderator_id?: string | null
          note?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          moderation_item_id?: string
          moderator_id?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_moderation_item_id_fkey"
            columns: ["moderation_item_id"]
            isOneToOne: false
            referencedRelation: "moderation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          state: Database["public"]["Enums"]["moderation_state"]
          target_id: string
          target_kind: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          state?: Database["public"]["Enums"]["moderation_state"]
          target_id: string
          target_kind: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          state?: Database["public"]["Enums"]["moderation_state"]
          target_id?: string
          target_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objects: {
        Row: {
          created_at: string
          creator_note: string | null
          current_museum_place_id: string | null
          date_note: string | null
          description: string | null
          external_record_url: string | null
          id: string
          image_id: string | null
          image_reuse_permitted: boolean
          name: string
          object_type: Database["public"]["Enums"]["object_type"]
          origin_place_id: string | null
          period: Database["public"]["Enums"]["historical_period"] | null
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["moderation_state"]
          trust_level: Database["public"]["Enums"]["trust_level"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_note?: string | null
          current_museum_place_id?: string | null
          date_note?: string | null
          description?: string | null
          external_record_url?: string | null
          id?: string
          image_id?: string | null
          image_reuse_permitted?: boolean
          name: string
          object_type: Database["public"]["Enums"]["object_type"]
          origin_place_id?: string | null
          period?: Database["public"]["Enums"]["historical_period"] | null
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["moderation_state"]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_note?: string | null
          current_museum_place_id?: string | null
          date_note?: string | null
          description?: string | null
          external_record_url?: string | null
          id?: string
          image_id?: string | null
          image_reuse_permitted?: boolean
          name?: string
          object_type?: Database["public"]["Enums"]["object_type"]
          origin_place_id?: string | null
          period?: Database["public"]["Enums"]["historical_period"] | null
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["moderation_state"]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objects_current_museum_place_id_fkey"
            columns: ["current_museum_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_current_museum_place_id_fkey"
            columns: ["current_museum_place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_image_fk"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_origin_place_id_fkey"
            columns: ["origin_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_origin_place_id_fkey"
            columns: ["origin_place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          biography: string | null
          birth_year: number | null
          created_at: string
          date_note: string | null
          death_year: number | null
          family_name: string | null
          given_name: string | null
          id: string
          name: string
          portrait_image_id: string | null
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["moderation_state"]
          titles: string[]
          trust_level: Database["public"]["Enums"]["trust_level"]
          updated_at: string
        }
        Insert: {
          biography?: string | null
          birth_year?: number | null
          created_at?: string
          date_note?: string | null
          death_year?: number | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          name: string
          portrait_image_id?: string | null
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["moderation_state"]
          titles?: string[]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Update: {
          biography?: string | null
          birth_year?: number | null
          created_at?: string
          date_note?: string | null
          death_year?: number | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          name?: string
          portrait_image_id?: string | null
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["moderation_state"]
          titles?: string[]
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_portrait_fk"
            columns: ["portrait_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      place_access: {
        Row: {
          access_cost: Database["public"]["Enums"]["access_cost"] | null
          admission_notes: string | null
          booking_required: boolean
          expected_visit_minutes: number | null
          guided_tours: boolean
          is_visitable: boolean
          official_url: string | null
          opening_notes: string | null
          place_id: string
          public_access: boolean
          seasonal: boolean
          updated_at: string
        }
        Insert: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          admission_notes?: string | null
          booking_required?: boolean
          expected_visit_minutes?: number | null
          guided_tours?: boolean
          is_visitable?: boolean
          official_url?: string | null
          opening_notes?: string | null
          place_id: string
          public_access?: boolean
          seasonal?: boolean
          updated_at?: string
        }
        Update: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          admission_notes?: string | null
          booking_required?: boolean
          expected_visit_minutes?: number | null
          guided_tours?: boolean
          is_visitable?: boolean
          official_url?: string | null
          opening_notes?: string | null
          place_id?: string
          public_access?: boolean
          seasonal?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_access_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_access_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      place_accessibility: {
        Row: {
          feature: Database["public"]["Enums"]["accessibility_feature"]
          note: string | null
          place_id: string
        }
        Insert: {
          feature: Database["public"]["Enums"]["accessibility_feature"]
          note?: string | null
          place_id: string
        }
        Update: {
          feature?: Database["public"]["Enums"]["accessibility_feature"]
          note?: string | null
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_accessibility_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_accessibility_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      place_categories: {
        Row: {
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "place_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      place_category_links: {
        Row: {
          category_id: string
          place_id: string
        }
        Insert: {
          category_id: string
          place_id: string
        }
        Update: {
          category_id?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_category_links_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "place_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_category_links_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_category_links_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      place_designations: {
        Row: {
          created_at: string
          designation: Database["public"]["Enums"]["designation_type"]
          first_designated: string | null
          grade: Database["public"]["Enums"]["designation_grade"] | null
          id: string
          place_id: string
          reference: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          designation: Database["public"]["Enums"]["designation_type"]
          first_designated?: string | null
          grade?: Database["public"]["Enums"]["designation_grade"] | null
          id?: string
          place_id: string
          reference?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          designation?: Database["public"]["Enums"]["designation_type"]
          first_designated?: string | null
          grade?: Database["public"]["Enums"]["designation_grade"] | null
          id?: string
          place_id?: string
          reference?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_designations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_designations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      place_facilities: {
        Row: {
          facility: Database["public"]["Enums"]["facility_type"]
          note: string | null
          place_id: string
        }
        Insert: {
          facility: Database["public"]["Enums"]["facility_type"]
          note?: string | null
          place_id: string
        }
        Update: {
          facility?: Database["public"]["Enums"]["facility_type"]
          note?: string | null
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_facilities_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_facilities_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      place_tag_links: {
        Row: {
          place_id: string
          tag_id: string
        }
        Insert: {
          place_id: string
          tag_id: string
        }
        Update: {
          place_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_tag_links_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_tag_links_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "place_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      place_tags: {
        Row: {
          id: string
          name: string
          slug: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          access_cost: Database["public"]["Enums"]["access_cost"] | null
          address_line: string | null
          content_level: number
          country: string
          county: string | null
          created_at: string
          description: string | null
          id: string
          is_visitable: boolean
          location: unknown
          location_accuracy_m: number | null
          location_method: Database["public"]["Enums"]["location_method"] | null
          name: string
          place_type: Database["public"]["Enums"]["place_type"]
          postcode: string | null
          primary_period:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["moderation_state"]
          summary: string | null
          survival_status: Database["public"]["Enums"]["survival_status"] | null
          town: string | null
          trust_level: Database["public"]["Enums"]["trust_level"]
          updated_at: string
        }
        Insert: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          address_line?: string | null
          content_level?: number
          country?: string
          county?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visitable?: boolean
          location: unknown
          location_accuracy_m?: number | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          name: string
          place_type: Database["public"]["Enums"]["place_type"]
          postcode?: string | null
          primary_period?:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["moderation_state"]
          summary?: string | null
          survival_status?:
            | Database["public"]["Enums"]["survival_status"]
            | null
          town?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Update: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          address_line?: string | null
          content_level?: number
          country?: string
          county?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visitable?: boolean
          location?: unknown
          location_accuracy_m?: number | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          name?: string
          place_type?: Database["public"]["Enums"]["place_type"]
          postcode?: string | null
          primary_period?:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["moderation_state"]
          summary?: string | null
          survival_status?:
            | Database["public"]["Enums"]["survival_status"]
            | null
          town?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_private: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_private?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_private?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string | null
          status: Database["public"]["Enums"]["moderation_state"]
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["moderation_state"]
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["moderation_state"]
          place_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          place_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          place_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_geometry: {
        Row: {
          geom: unknown
          gpx: string | null
          route_id: string
          updated_at: string
        }
        Insert: {
          geom: unknown
          gpx?: string | null
          route_id: string
          updated_at?: string
        }
        Update: {
          geom?: unknown
          gpx?: string | null
          route_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_geometry_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: true
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_optional: boolean
          location: unknown
          name: string | null
          place_id: string | null
          position: number
          route_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_optional?: boolean
          location?: unknown
          name?: string | null
          place_id?: string | null
          position: number
          route_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_optional?: boolean
          location?: unknown
          name?: string | null
          place_id?: string | null
          position?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          accessibility_notes: string | null
          ascent_m: number | null
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: Database["public"]["Enums"]["route_difficulty"] | null
          distance_m: number | null
          duration_minutes: number | null
          end_point: unknown
          id: string
          is_premium: boolean
          name: string
          parking_notes: string | null
          period: Database["public"]["Enums"]["historical_period"] | null
          route_type: Database["public"]["Enums"]["route_type"]
          safety_notes: string | null
          search_vector: unknown
          slug: string
          start_point: unknown
          status: Database["public"]["Enums"]["moderation_state"]
          theme: string | null
          transport_notes: string | null
          trust_level: Database["public"]["Enums"]["trust_level"]
          updated_at: string
        }
        Insert: {
          accessibility_notes?: string | null
          ascent_m?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["route_difficulty"] | null
          distance_m?: number | null
          duration_minutes?: number | null
          end_point?: unknown
          id?: string
          is_premium?: boolean
          name: string
          parking_notes?: string | null
          period?: Database["public"]["Enums"]["historical_period"] | null
          route_type: Database["public"]["Enums"]["route_type"]
          safety_notes?: string | null
          search_vector?: unknown
          slug: string
          start_point?: unknown
          status?: Database["public"]["Enums"]["moderation_state"]
          theme?: string | null
          transport_notes?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Update: {
          accessibility_notes?: string | null
          ascent_m?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["route_difficulty"] | null
          distance_m?: number | null
          duration_minutes?: number | null
          end_point?: unknown
          id?: string
          is_premium?: boolean
          name?: string
          parking_notes?: string | null
          period?: Database["public"]["Enums"]["historical_period"] | null
          route_type?: Database["public"]["Enums"]["route_type"]
          safety_notes?: string | null
          search_vector?: unknown
          slug?: string
          start_point?: unknown
          status?: Database["public"]["Enums"]["moderation_state"]
          theme?: string | null
          transport_notes?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_records: {
        Row: {
          attribution: string | null
          coordinate_conversion: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_id: string | null
          id: string
          importer_version: string | null
          licence: string | null
          location_accuracy_m: number | null
          location_method: Database["public"]["Enums"]["location_method"] | null
          match_confidence: number | null
          raw: Json | null
          retrieved_at: string
          review_status: Database["public"]["Enums"]["moderation_state"]
          source_coordinates: Json | null
          source_crs: string | null
          source_id: string
          source_lat: number | null
          source_lng: number | null
          source_precision_m: number | null
          source_updated_at: string | null
          url: string | null
        }
        Insert: {
          attribution?: string | null
          coordinate_conversion?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_id?: string | null
          id?: string
          importer_version?: string | null
          licence?: string | null
          location_accuracy_m?: number | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          match_confidence?: number | null
          raw?: Json | null
          retrieved_at?: string
          review_status?: Database["public"]["Enums"]["moderation_state"]
          source_coordinates?: Json | null
          source_crs?: string | null
          source_id: string
          source_lat?: number | null
          source_lng?: number | null
          source_precision_m?: number | null
          source_updated_at?: string | null
          url?: string | null
        }
        Update: {
          attribution?: string | null
          coordinate_conversion?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          external_id?: string | null
          id?: string
          importer_version?: string | null
          licence?: string | null
          location_accuracy_m?: number | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          match_confidence?: number | null
          raw?: Json | null
          retrieved_at?: string
          review_status?: Database["public"]["Enums"]["moderation_state"]
          source_coordinates?: Json | null
          source_crs?: string | null
          source_id?: string
          source_lat?: number | null
          source_lng?: number | null
          source_precision_m?: number | null
          source_updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          attribution: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          licence: string | null
          licence_url: string | null
          name: string
          publisher: string | null
          trust_level: Database["public"]["Enums"]["trust_level"]
          url: string | null
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          licence?: string | null
          licence_url?: string | null
          name: string
          publisher?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          url?: string | null
        }
        Update: {
          attribution?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          licence?: string | null
          licence_url?: string | null
          name?: string
          publisher?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"]
          url?: string | null
        }
        Relationships: []
      }
      temporal_associations: {
        Row: {
          association_type: Database["public"]["Enums"]["temporal_association_type"]
          confidence: number | null
          created_at: string
          derivation: string | null
          end_year: number | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          original_text: string | null
          period_id: string | null
          precision: Database["public"]["Enums"]["temporal_precision"]
          source_id: string | null
          source_record_id: string | null
          start_year: number | null
          status: Database["public"]["Enums"]["moderation_state"]
        }
        Insert: {
          association_type: Database["public"]["Enums"]["temporal_association_type"]
          confidence?: number | null
          created_at?: string
          derivation?: string | null
          end_year?: number | null
          entity_id: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          original_text?: string | null
          period_id?: string | null
          precision?: Database["public"]["Enums"]["temporal_precision"]
          source_id?: string | null
          source_record_id?: string | null
          start_year?: number | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Update: {
          association_type?: Database["public"]["Enums"]["temporal_association_type"]
          confidence?: number | null
          created_at?: string
          derivation?: string | null
          end_year?: number | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          original_text?: string | null
          period_id?: string | null
          precision?: Database["public"]["Enums"]["temporal_precision"]
          source_id?: string | null
          source_record_id?: string | null
          start_year?: number | null
          status?: Database["public"]["Enums"]["moderation_state"]
        }
        Relationships: [
          {
            foreignKeyName: "temporal_associations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "historical_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temporal_associations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temporal_associations_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          body: string
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["moderation_state"]
          place_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          place_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_state"]
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_days: {
        Row: {
          date: string | null
          day_index: number
          id: string
          notes: string | null
          trip_id: string
        }
        Insert: {
          date?: string | null
          day_index: number
          id?: string
          notes?: string | null
          trip_id: string
        }
        Update: {
          date?: string | null
          day_index?: number
          id?: string
          notes?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          place_id: string
          planned_minutes: number | null
          position: number
          status: string
          trip_day_id: string | null
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          place_id: string
          planned_minutes?: number | null
          position?: number
          status?: string
          trip_day_id?: string | null
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          place_id?: string
          planned_minutes?: number | null
          position?: number
          status?: string
          trip_day_id?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_day_id_fkey"
            columns: ["trip_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_public: boolean
          max_radius_m: number | null
          name: string
          notes: string | null
          start_date: string | null
          transport: Database["public"]["Enums"]["transport_mode"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_public?: boolean
          max_radius_m?: number | null
          name?: string
          notes?: string | null
          start_date?: string | null
          transport?: Database["public"]["Enums"]["transport_mode"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_public?: boolean
          max_radius_m?: number | null
          name?: string
          notes?: string | null
          start_date?: string | null
          transport?: Database["public"]["Enums"]["transport_mode"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_photos: {
        Row: {
          created_at: string
          image_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_photos_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          companions: string | null
          created_at: string
          id: string
          is_public: boolean
          minutes_spent: number | null
          place_id: string
          private_note: string | null
          public_note: string | null
          rating: number | null
          updated_at: string
          user_id: string
          visited_on: string | null
        }
        Insert: {
          companions?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          minutes_spent?: number | null
          place_id: string
          private_note?: string | null
          public_note?: string | null
          rating?: number | null
          updated_at?: string
          user_id: string
          visited_on?: string | null
        }
        Update: {
          companions?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          minutes_spent?: number | null
          place_id?: string
          private_note?: string | null
          public_note?: string | null
          rating?: number | null
          updated_at?: string
          user_id?: string
          visited_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          added_at: string
          note: string | null
          place_id: string
          wishlist_id: string
        }
        Insert: {
          added_at?: string
          note?: string | null
          place_id: string
          wishlist_id: string
        }
        Update: {
          added_at?: string
          note?: string | null
          place_id?: string
          wishlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_wishlist_id_fkey"
            columns: ["wishlist_id"]
            isOneToOne: false
            referencedRelation: "wishlists"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          kind: Database["public"]["Enums"]["wishlist_kind"]
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          kind?: Database["public"]["Enums"]["wishlist_kind"]
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          kind?: Database["public"]["Enums"]["wishlist_kind"]
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      import_decision_history: {
        Row: {
          action: string | null
          action_id: string | null
          candidate_id: string | null
          created_at: string | null
          moderator_id: string | null
          moderator_name: string | null
          note: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_review_queue: {
        Row: {
          candidate_id: string | null
          candidate_location_accuracy_m: number | null
          candidate_name: string | null
          candidate_place_type: string | null
          conflict_count: number | null
          distance_to_match_m: number | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          external_ids: Json | null
          import_run_id: string | null
          match_confidence: number | null
          matched_entity_id: string | null
          matched_location_accuracy_m: number | null
          matched_place_name: string | null
          matched_place_type: Database["public"]["Enums"]["place_type"] | null
          published_at: string | null
          published_entity_id: string | null
          review_status: Database["public"]["Enums"]["moderation_state"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_key: string | null
          source_record_external_id: string | null
          source_url: string | null
          unresolved_conflict_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_candidates_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_review_queue: {
        Row: {
          association_confidence: number | null
          association_outcome:
            | Database["public"]["Enums"]["media_association_outcome"]
            | null
          attribution_text: string | null
          candidate_id: string | null
          creator: string | null
          entity_id: string | null
          entity_name: string | null
          is_reusable: boolean | null
          licence: Database["public"]["Enums"]["media_licence"] | null
          licence_name: string | null
          licence_url: string | null
          media_url: string | null
          missing_rights_fields: string[] | null
          published_image_id: string | null
          requires_attribution: boolean | null
          retrieved_at: string | null
          review_status: Database["public"]["Enums"]["moderation_state"] | null
          rights_state: Database["public"]["Enums"]["media_rights_state"] | null
          source_file_id: string | null
          source_key: string | null
          source_page_url: string | null
          source_title: string | null
          thumbnail_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_media_candidates_published_image_id_fkey"
            columns: ["published_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      places_geo: {
        Row: {
          access_cost: Database["public"]["Enums"]["access_cost"] | null
          address_line: string | null
          content_level: number | null
          country: string | null
          county: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_visitable: boolean | null
          lat: number | null
          lng: number | null
          location: unknown
          name: string | null
          place_type: Database["public"]["Enums"]["place_type"] | null
          postcode: string | null
          primary_period:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector: unknown
          slug: string | null
          status: Database["public"]["Enums"]["moderation_state"] | null
          summary: string | null
          town: string | null
          trust_level: Database["public"]["Enums"]["trust_level"] | null
          updated_at: string | null
        }
        Insert: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          address_line?: string | null
          content_level?: number | null
          country?: string | null
          county?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_visitable?: boolean | null
          lat?: never
          lng?: never
          location?: unknown
          name?: string | null
          place_type?: Database["public"]["Enums"]["place_type"] | null
          postcode?: string | null
          primary_period?:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector?: unknown
          slug?: string | null
          status?: Database["public"]["Enums"]["moderation_state"] | null
          summary?: string | null
          town?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"] | null
          updated_at?: string | null
        }
        Update: {
          access_cost?: Database["public"]["Enums"]["access_cost"] | null
          address_line?: string | null
          content_level?: number | null
          country?: string | null
          county?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_visitable?: boolean | null
          lat?: never
          lng?: never
          location?: unknown
          name?: string | null
          place_type?: Database["public"]["Enums"]["place_type"] | null
          postcode?: string | null
          primary_period?:
            | Database["public"]["Enums"]["historical_period"]
            | null
          search_vector?: unknown
          slug?: string | null
          status?: Database["public"]["Enums"]["moderation_state"] | null
          summary?: string | null
          town?: string | null
          trust_level?: Database["public"]["Enums"]["trust_level"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_candidate_preferences: {
        Args: { p_candidate_id: string }
        Returns: undefined
      }
      apply_conflict_preference: {
        Args: { p_conflict_id: string }
        Returns: undefined
      }
      assess_media_rights: {
        Args: { p_candidate_id: string }
        Returns: Database["public"]["Enums"]["media_rights_state"]
      }
      build_media_attribution: {
        Args: {
          p_creator: string
          p_licence: Database["public"]["Enums"]["media_licence"]
          p_source_name: string
          p_title?: string
        }
        Returns: string
      }
      collection_is_public: {
        Args: { p_collection_id: string }
        Returns: boolean
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      entity_exists: {
        Args: {
          ent_id: string
          kind: Database["public"]["Enums"]["entity_type"]
        }
        Returns: boolean
      }
      image_is_visible: { Args: { p_image_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_editor: { Args: never; Returns: boolean }
      is_moderator: { Args: never; Returns: boolean }
      map_clusters: {
        Args: {
          bbox_ne_lat: number
          bbox_ne_lng: number
          bbox_sw_lat: number
          bbox_sw_lng: number
          cell_degrees?: number
          designations?: string[]
          from_year?: number
          max_cells?: number
          period_id?: string
          place_types?: string[]
          q?: string
          require_image?: boolean
          to_year?: number
        }
        Returns: {
          cell_key: string
          lat: number
          lng: number
          place_count: number
          sample_name: string
          sample_place_id: string
        }[]
      }
      map_places: {
        Args: {
          bbox_ne_lat: number
          bbox_ne_lng: number
          bbox_sw_lat: number
          bbox_sw_lng: number
          designations?: string[]
          from_year?: number
          max_rows?: number
          period_id?: string
          place_types?: string[]
          q?: string
          require_image?: boolean
          to_year?: number
        }
        Returns: {
          id: string
          lat: number
          lng: number
          location_accuracy_m: number
          name: string
          period_summary: string
          place_type: string
          primary_designation: string
          slug: string
          survival_status: string
          thumbnail_url: string
        }[]
      }
      map_thumbnail_for: { Args: { p_place_id: string }; Returns: string }
      place_is_public: { Args: { p_place_id: string }; Returns: boolean }
      place_matches_period: {
        Args: { p_period_id: string; p_place_id: string }
        Returns: boolean
      }
      preview_import_candidate: {
        Args: { p_candidate_id: string }
        Returns: Json
      }
      publish_import_candidate: {
        Args: { p_candidate_id: string; p_note?: string }
        Returns: string
      }
      publish_media_candidate: {
        Args: { p_candidate_id: string; p_note?: string }
        Returns: string
      }
      resolve_import_conflict: {
        Args: {
          p_conflict_id: string
          p_note?: string
          p_outcome: Database["public"]["Enums"]["conflict_resolution"]
        }
        Returns: undefined
      }
      resolve_person_from_source: {
        Args: { p_external_id: string; p_label: string; p_source_id: string }
        Returns: string
      }
      review_import_candidate: {
        Args: {
          p_candidate_id: string
          p_decision: Database["public"]["Enums"]["moderation_state"]
          p_note?: string
        }
        Returns: undefined
      }
      review_media_candidate: {
        Args: {
          p_candidate_id: string
          p_decision: Database["public"]["Enums"]["moderation_state"]
          p_entity_id?: string
          p_note?: string
        }
        Returns: undefined
      }
      route_is_public: { Args: { p_route_id: string }; Returns: boolean }
      search_places: {
        Args: {
          bbox_ne_lat?: number
          bbox_ne_lng?: number
          bbox_sw_lat?: number
          bbox_sw_lng?: number
          center_lat?: number
          center_lng?: number
          cost?: string
          max_rows?: number
          periods?: string[]
          place_types?: string[]
          q?: string
          radius_m?: number
          row_offset?: number
          visitable_only?: boolean
        }
        Returns: {
          content_level: number
          cost: string
          distance_m: number
          id: string
          is_visitable: boolean
          lat: number
          lng: number
          name: string
          period: string
          place_type: string
          slug: string
          summary: string
        }[]
      }
      slugify_unique: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      access_cost: "free" | "paid" | "donation" | "exterior_only"
      accessibility_feature:
        | "wheelchair_access"
        | "limited_mobility_suitable"
        | "accessible_parking"
        | "step_free_areas"
        | "pushchair_suitable"
      app_role: "user" | "contributor" | "editor" | "moderator" | "admin"
      badge_category:
        | "milestone"
        | "place_type"
        | "period"
        | "region"
        | "trail"
        | "community"
      conflict_resolution:
        | "keep_canonical"
        | "accept_source_value"
        | "keep_both_as_distinct_facts"
        | "mark_not_a_conflict"
        | "defer"
        | "reject_source_claim"
      contribution_type:
        | "review"
        | "comment"
        | "tip"
        | "photograph"
        | "correction"
        | "historical_claim"
        | "new_place_suggestion"
        | "relationship_suggestion"
      designation_grade: "I" | "II*" | "II" | "A" | "B" | "C"
      designation_type:
        | "listed_building"
        | "scheduled_monument"
        | "world_heritage_site"
        | "conservation_area"
        | "registered_park_garden"
        | "registered_battlefield"
        | "protected_wreck"
        | "undesignated"
      entity_type:
        | "place"
        | "person"
        | "event"
        | "object"
        | "route"
        | "collection"
        | "source"
      event_type:
        | "battle"
        | "siege"
        | "construction"
        | "demolition"
        | "fire"
        | "royal_visit"
        | "political_event"
        | "archaeological_discovery"
        | "industrial_event"
        | "wartime_event"
      facility_type:
        | "parking"
        | "toilets"
        | "cafe"
        | "restaurant"
        | "shop"
        | "picnic_area"
        | "baby_changing"
        | "accessible_toilets"
        | "ev_charging"
        | "picnic_allowed"
        | "dog_friendly"
        | "indoor"
        | "outdoor"
      historical_period:
        | "prehistoric"
        | "roman"
        | "early_medieval"
        | "medieval"
        | "tudor"
        | "stuart"
        | "georgian"
        | "victorian"
        | "edwardian"
        | "wwi"
        | "interwar"
        | "wwii"
        | "cold_war"
        | "modern"
      location_method:
        | "surveyed"
        | "source_coordinate"
        | "feature_centroid"
        | "geometry_centroid"
        | "address_geocoded"
        | "postcode_centroid"
        | "manual"
        | "approximate"
        | "unknown"
      media_association_outcome:
        | "media_match_confident"
        | "media_match_review"
        | "media_no_match"
      media_licence:
        | "CC0-1.0"
        | "PUBLIC-DOMAIN"
        | "CC-BY-2.0"
        | "CC-BY-2.5"
        | "CC-BY-3.0"
        | "CC-BY-4.0"
        | "CC-BY-SA-2.0"
        | "CC-BY-SA-2.5"
        | "CC-BY-SA-3.0"
        | "CC-BY-SA-4.0"
        | "OTHER-REUSABLE"
        | "UNSUPPORTED"
        | "UNKNOWN"
      media_rights_state:
        | "media_ready"
        | "media_rights_incomplete"
        | "media_licence_unsupported"
        | "media_creator_unknown"
        | "media_association_review"
        | "media_invalid"
      moderation_state:
        | "submitted"
        | "automatically_screened"
        | "needs_review"
        | "approved"
        | "rejected"
        | "superseded"
      object_type:
        | "archaeological_artefact"
        | "weapon"
        | "manuscript"
        | "painting"
        | "photograph"
        | "architectural_fragment"
        | "furniture"
        | "personal_possession"
      place_type:
        | "castle"
        | "country_house"
        | "palace"
        | "abbey"
        | "priory"
        | "cathedral"
        | "church"
        | "ruin"
        | "fort"
        | "battlefield"
        | "hillfort"
        | "roman_villa"
        | "settlement"
        | "industrial_site"
        | "railway_site"
        | "canal_structure"
        | "military_installation"
        | "airfield"
        | "bunker"
        | "pillbox"
        | "archaeological_site"
        | "museum"
        | "monument"
        | "garden"
        | "historic_landscape"
        | "historic_village"
        | "lost_structure"
        | "building"
        | "structure"
        | "unknown"
      report_reason:
        | "incorrect_information"
        | "incorrect_access"
        | "blocked_path"
        | "facility_correction"
        | "inappropriate"
        | "spam"
        | "copyright_concern"
        | "other"
      route_difficulty: "easy" | "moderate" | "hard" | "severe"
      route_type:
        | "walking"
        | "hiking"
        | "urban_walking_tour"
        | "driving"
        | "cycling"
        | "multi_day_trail"
      source_kind:
        | "official"
        | "open_data"
        | "publication"
        | "website"
        | "museum"
        | "archive"
        | "editorial"
      survival_status:
        | "surviving"
        | "partial"
        | "ruined"
        | "demolished"
        | "lost"
        | "archaeological"
        | "unknown"
      temporal_association_type:
        | "built"
        | "existed"
        | "altered"
        | "used_as"
        | "event"
        | "lost"
        | "associated"
      temporal_precision:
        | "exact_year"
        | "circa"
        | "decade"
        | "century"
        | "period"
        | "range"
        | "before"
        | "after"
        | "unknown"
      transport_mode: "walking" | "cycling" | "driving" | "public_transport"
      trust_level:
        | "official_source"
        | "open_data_source"
        | "editorially_verified"
        | "community_submitted"
        | "community_review"
        | "unverified_suggestion"
      wishlist_kind: "wishlist" | "favourites" | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_cost: ["free", "paid", "donation", "exterior_only"],
      accessibility_feature: [
        "wheelchair_access",
        "limited_mobility_suitable",
        "accessible_parking",
        "step_free_areas",
        "pushchair_suitable",
      ],
      app_role: ["user", "contributor", "editor", "moderator", "admin"],
      badge_category: [
        "milestone",
        "place_type",
        "period",
        "region",
        "trail",
        "community",
      ],
      conflict_resolution: [
        "keep_canonical",
        "accept_source_value",
        "keep_both_as_distinct_facts",
        "mark_not_a_conflict",
        "defer",
        "reject_source_claim",
      ],
      contribution_type: [
        "review",
        "comment",
        "tip",
        "photograph",
        "correction",
        "historical_claim",
        "new_place_suggestion",
        "relationship_suggestion",
      ],
      designation_grade: ["I", "II*", "II", "A", "B", "C"],
      designation_type: [
        "listed_building",
        "scheduled_monument",
        "world_heritage_site",
        "conservation_area",
        "registered_park_garden",
        "registered_battlefield",
        "protected_wreck",
        "undesignated",
      ],
      entity_type: [
        "place",
        "person",
        "event",
        "object",
        "route",
        "collection",
        "source",
      ],
      event_type: [
        "battle",
        "siege",
        "construction",
        "demolition",
        "fire",
        "royal_visit",
        "political_event",
        "archaeological_discovery",
        "industrial_event",
        "wartime_event",
      ],
      facility_type: [
        "parking",
        "toilets",
        "cafe",
        "restaurant",
        "shop",
        "picnic_area",
        "baby_changing",
        "accessible_toilets",
        "ev_charging",
        "picnic_allowed",
        "dog_friendly",
        "indoor",
        "outdoor",
      ],
      historical_period: [
        "prehistoric",
        "roman",
        "early_medieval",
        "medieval",
        "tudor",
        "stuart",
        "georgian",
        "victorian",
        "edwardian",
        "wwi",
        "interwar",
        "wwii",
        "cold_war",
        "modern",
      ],
      location_method: [
        "surveyed",
        "source_coordinate",
        "feature_centroid",
        "geometry_centroid",
        "address_geocoded",
        "postcode_centroid",
        "manual",
        "approximate",
        "unknown",
      ],
      media_association_outcome: [
        "media_match_confident",
        "media_match_review",
        "media_no_match",
      ],
      media_licence: [
        "CC0-1.0",
        "PUBLIC-DOMAIN",
        "CC-BY-2.0",
        "CC-BY-2.5",
        "CC-BY-3.0",
        "CC-BY-4.0",
        "CC-BY-SA-2.0",
        "CC-BY-SA-2.5",
        "CC-BY-SA-3.0",
        "CC-BY-SA-4.0",
        "OTHER-REUSABLE",
        "UNSUPPORTED",
        "UNKNOWN",
      ],
      media_rights_state: [
        "media_ready",
        "media_rights_incomplete",
        "media_licence_unsupported",
        "media_creator_unknown",
        "media_association_review",
        "media_invalid",
      ],
      moderation_state: [
        "submitted",
        "automatically_screened",
        "needs_review",
        "approved",
        "rejected",
        "superseded",
      ],
      object_type: [
        "archaeological_artefact",
        "weapon",
        "manuscript",
        "painting",
        "photograph",
        "architectural_fragment",
        "furniture",
        "personal_possession",
      ],
      place_type: [
        "castle",
        "country_house",
        "palace",
        "abbey",
        "priory",
        "cathedral",
        "church",
        "ruin",
        "fort",
        "battlefield",
        "hillfort",
        "roman_villa",
        "settlement",
        "industrial_site",
        "railway_site",
        "canal_structure",
        "military_installation",
        "airfield",
        "bunker",
        "pillbox",
        "archaeological_site",
        "museum",
        "monument",
        "garden",
        "historic_landscape",
        "historic_village",
        "lost_structure",
        "building",
        "structure",
        "unknown",
      ],
      report_reason: [
        "incorrect_information",
        "incorrect_access",
        "blocked_path",
        "facility_correction",
        "inappropriate",
        "spam",
        "copyright_concern",
        "other",
      ],
      route_difficulty: ["easy", "moderate", "hard", "severe"],
      route_type: [
        "walking",
        "hiking",
        "urban_walking_tour",
        "driving",
        "cycling",
        "multi_day_trail",
      ],
      source_kind: [
        "official",
        "open_data",
        "publication",
        "website",
        "museum",
        "archive",
        "editorial",
      ],
      survival_status: [
        "surviving",
        "partial",
        "ruined",
        "demolished",
        "lost",
        "archaeological",
        "unknown",
      ],
      temporal_association_type: [
        "built",
        "existed",
        "altered",
        "used_as",
        "event",
        "lost",
        "associated",
      ],
      temporal_precision: [
        "exact_year",
        "circa",
        "decade",
        "century",
        "period",
        "range",
        "before",
        "after",
        "unknown",
      ],
      transport_mode: ["walking", "cycling", "driving", "public_transport"],
      trust_level: [
        "official_source",
        "open_data_source",
        "editorially_verified",
        "community_submitted",
        "community_review",
        "unverified_suggestion",
      ],
      wishlist_kind: ["wishlist", "favourites", "custom"],
    },
  },
} as const

