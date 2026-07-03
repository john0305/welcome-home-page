export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_audit_log: {
        Row: {
          achievement_id: string | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
          user_id: string | null
        }
        Insert: {
          achievement_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          user_id?: string | null
        }
        Update: {
          achievement_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "achievement_audit_log_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string
          flavor_text: string | null
          icon: string
          id: string
          is_active: boolean | null
          is_retroactive: boolean | null
          name: string
          points: number
          trigger_condition: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          flavor_text?: string | null
          icon: string
          id?: string
          is_active?: boolean | null
          is_retroactive?: boolean | null
          name: string
          points?: number
          trigger_condition: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          flavor_text?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_retroactive?: boolean | null
          name?: string
          points?: number
          trigger_condition?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      action_effectiveness: {
        Row: {
          action_type: string
          avg_delta_30d: number | null
          avg_delta_7d: number | null
          cohort_date: string
          id: string
          pct_declined: number | null
          pct_improved: number | null
          pct_reverted: number | null
          sample_size: number | null
        }
        Insert: {
          action_type: string
          avg_delta_30d?: number | null
          avg_delta_7d?: number | null
          cohort_date: string
          id?: string
          pct_declined?: number | null
          pct_improved?: number | null
          pct_reverted?: number | null
          sample_size?: number | null
        }
        Update: {
          action_type?: string
          avg_delta_30d?: number | null
          avg_delta_7d?: number | null
          cohort_date?: string
          id?: string
          pct_declined?: number | null
          pct_improved?: number | null
          pct_reverted?: number | null
          sample_size?: number | null
        }
        Relationships: []
      }
      ai_model_config: {
        Row: {
          batch_enabled: boolean
          model: string
          notes: string | null
          provider: string
          task_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_enabled?: boolean
          model: string
          notes?: string | null
          provider: string
          task_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_enabled?: boolean
          model?: string
          notes?: string | null
          provider?: string
          task_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          task_key: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          provider: string
          task_key: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          task_key?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      algorithm_weight_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          confidence_after: number | null
          confidence_before: number | null
          created_at: string | null
          id: string
          version: string
          weights: Json
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          confidence_after?: number | null
          confidence_before?: number | null
          created_at?: string | null
          id?: string
          version: string
          weights: Json
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          confidence_after?: number | null
          confidence_before?: number | null
          created_at?: string | null
          id?: string
          version?: string
          weights?: Json
        }
        Relationships: []
      }
      algorithm_weights: {
        Row: {
          confidence: number | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_validated_at: string | null
          notes: string | null
          sample_size: number | null
          validation_correlation: number | null
          version: string
          weights: Json
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_validated_at?: string | null
          notes?: string | null
          sample_size?: number | null
          validation_correlation?: number | null
          version: string
          weights: Json
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_validated_at?: string | null
          notes?: string | null
          sample_size?: number | null
          validation_correlation?: number | null
          version?: string
          weights?: Json
        }
        Relationships: []
      }
      api_quota_log: {
        Row: {
          call_type: string | null
          called_at: string | null
          endpoint: string | null
          id: string
          priority: number | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          call_type?: string | null
          called_at?: string | null
          endpoint?: string | null
          id?: string
          priority?: number | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          call_type?: string | null
          called_at?: string | null
          endpoint?: string | null
          id?: string
          priority?: number | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_apply_preferences: {
        Row: {
          allowed_factors: string[]
          created_at: string
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_factors?: string[]
          created_at?: string
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_factors?: string[]
          created_at?: string
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_signups: {
        Row: {
          archived_at: string | null
          contacted_at: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          plan_interest: string | null
          preferred_theme: string | null
          shop_info: string | null
        }
        Insert: {
          archived_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          plan_interest?: string | null
          preferred_theme?: string | null
          shop_info?: string | null
        }
        Update: {
          archived_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          plan_interest?: string | null
          preferred_theme?: string | null
          shop_info?: string | null
        }
        Relationships: []
      }
      category_benchmarks: {
        Row: {
          avg_by_dimension: Json
          avg_overall: number | null
          category: string
          created_at: string
          id: string
          p25_overall: number | null
          p50_overall: number | null
          p75_overall: number | null
          p90_overall: number | null
          sample_size: number
          snapshot_date: string
          subcategory: string | null
          top_keywords: Json
        }
        Insert: {
          avg_by_dimension?: Json
          avg_overall?: number | null
          category: string
          created_at?: string
          id?: string
          p25_overall?: number | null
          p50_overall?: number | null
          p75_overall?: number | null
          p90_overall?: number | null
          sample_size?: number
          snapshot_date: string
          subcategory?: string | null
          top_keywords?: Json
        }
        Update: {
          avg_by_dimension?: Json
          avg_overall?: number | null
          category?: string
          created_at?: string
          id?: string
          p25_overall?: number | null
          p50_overall?: number | null
          p75_overall?: number | null
          p90_overall?: number | null
          sample_size?: number
          snapshot_date?: string
          subcategory?: string | null
          top_keywords?: Json
        }
        Relationships: []
      }
      chat_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string
          rating: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          rating: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          rating?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          listing_id: string | null
          page_label: string | null
          role: string
          session_id: string
          user_id: string
          was_answered: boolean
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          listing_id?: string | null
          page_label?: string | null
          role: string
          session_id: string
          user_id: string
          was_answered?: boolean
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          listing_id?: string | null
          page_label?: string | null
          role?: string
          session_id?: string
          user_id?: string
          was_answered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          page_label: string | null
          shop_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_label?: string | null
          shop_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_label?: string | null
          shop_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_alerts: {
        Row: {
          after_value: Json | null
          before_value: Json | null
          change_type: string
          competitor_listing_id: string
          competitor_title: string | null
          created_at: string
          detected_at: string
          dismissed_at: string | null
          dismissed_by_user: boolean
          id: string
          rank_after: number | null
          rank_before: number | null
          search_term: string
          severity: string
          surfaced_at: string | null
          surfaced_to_user: boolean
          user_id: string
        }
        Insert: {
          after_value?: Json | null
          before_value?: Json | null
          change_type: string
          competitor_listing_id: string
          competitor_title?: string | null
          created_at?: string
          detected_at?: string
          dismissed_at?: string | null
          dismissed_by_user?: boolean
          id?: string
          rank_after?: number | null
          rank_before?: number | null
          search_term: string
          severity?: string
          surfaced_at?: string | null
          surfaced_to_user?: boolean
          user_id: string
        }
        Update: {
          after_value?: Json | null
          before_value?: Json | null
          change_type?: string
          competitor_listing_id?: string
          competitor_title?: string | null
          created_at?: string
          detected_at?: string
          dismissed_at?: string | null
          dismissed_by_user?: boolean
          id?: string
          rank_after?: number | null
          rank_before?: number | null
          search_term?: string
          severity?: string
          surfaced_at?: string | null
          surfaced_to_user?: boolean
          user_id?: string
        }
        Relationships: []
      }
      competitor_snapshots: {
        Row: {
          captured_at: string | null
          description_length: number | null
          etsy_listing_id: string
          id: string
          image_urls: string[] | null
          keyword_cluster: string
          num_favorers: number | null
          photo_count: number | null
          price: number | null
          quantity: number | null
          rank_position: number | null
          shop_id: string | null
          shop_name: string | null
          source: string | null
          tags: string[] | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          captured_at?: string | null
          description_length?: number | null
          etsy_listing_id: string
          id?: string
          image_urls?: string[] | null
          keyword_cluster: string
          num_favorers?: number | null
          photo_count?: number | null
          price?: number | null
          quantity?: number | null
          rank_position?: number | null
          shop_id?: string | null
          shop_name?: string | null
          source?: string | null
          tags?: string[] | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          captured_at?: string | null
          description_length?: number | null
          etsy_listing_id?: string
          id?: string
          image_urls?: string[] | null
          keyword_cluster?: string
          num_favorers?: number | null
          photo_count?: number | null
          price?: number | null
          quantity?: number | null
          rank_position?: number | null
          shop_id?: string | null
          shop_name?: string | null
          source?: string | null
          tags?: string[] | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      daily_action_summaries: {
        Row: {
          actions_generated: number
          auto_applied: number
          awaiting_approval: number
          created_at: string
          details: Json | null
          failures: number
          guided: number
          id: string
          inform: number
          resolved_externally: number
          scan_completed_at: string | null
          scan_date: string
          scan_started_at: string | null
          scanned_listings: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_generated?: number
          auto_applied?: number
          awaiting_approval?: number
          created_at?: string
          details?: Json | null
          failures?: number
          guided?: number
          id?: string
          inform?: number
          resolved_externally?: number
          scan_completed_at?: string | null
          scan_date: string
          scan_started_at?: string | null
          scanned_listings?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_generated?: number
          auto_applied?: number
          awaiting_approval?: number
          created_at?: string
          details?: Json | null
          failures?: number
          guided?: number
          id?: string
          inform?: number
          resolved_externally?: number
          scan_completed_at?: string | null
          scan_date?: string
          scan_started_at?: string | null
          scanned_listings?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dismissed_alerts: {
        Row: {
          alert_key: string
          alert_type: string
          created_at: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          alert_key: string
          alert_type: string
          created_at?: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alert_key?: string
          alert_type?: string
          created_at?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      etsy_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          shop_id: string
          shop_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          shop_id: string
          shop_name?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          shop_id?: string
          shop_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          enabled: boolean | null
          flag_key: string
          id: string
          label: string
          last_changed_at: string | null
          last_changed_by: string | null
          notes: string | null
          pause_reason: string | null
          paused: boolean | null
          tier_restriction: string | null
        }
        Insert: {
          enabled?: boolean | null
          flag_key: string
          id?: string
          label: string
          last_changed_at?: string | null
          last_changed_by?: string | null
          notes?: string | null
          pause_reason?: string | null
          paused?: boolean | null
          tier_restriction?: string | null
        }
        Update: {
          enabled?: boolean | null
          flag_key?: string
          id?: string
          label?: string
          last_changed_at?: string | null
          last_changed_by?: string | null
          notes?: string | null
          pause_reason?: string | null
          paused?: boolean | null
          tier_restriction?: string | null
        }
        Relationships: []
      }
      feature_waitlist: {
        Row: {
          created_at: string
          email: string | null
          feature_key: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          feature_key: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          feature_key?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fix_actions: {
        Row: {
          applied_at: string | null
          applied_value: Json | null
          created_at: string
          current_value: Json | null
          dimension: string
          dismissal_reason: string | null
          estimated_effort: string
          etsy_response: Json | null
          etsy_shop_id: string | null
          evidence: Json | null
          factor_key: string
          failure_reason: string | null
          guided_payload: Json | null
          id: string
          listing_id: string | null
          mode: string
          proposed_value: Json | null
          rationale: string | null
          resolution_note: string | null
          resolved_at: string | null
          score_at_application: number | null
          score_delta: number | null
          severity: string
          source: string
          status: string
          superseded_reason: string | null
          tracking_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_value?: Json | null
          created_at?: string
          current_value?: Json | null
          dimension: string
          dismissal_reason?: string | null
          estimated_effort?: string
          etsy_response?: Json | null
          etsy_shop_id?: string | null
          evidence?: Json | null
          factor_key: string
          failure_reason?: string | null
          guided_payload?: Json | null
          id?: string
          listing_id?: string | null
          mode: string
          proposed_value?: Json | null
          rationale?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          score_at_application?: number | null
          score_delta?: number | null
          severity?: string
          source?: string
          status?: string
          superseded_reason?: string | null
          tracking_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_value?: Json | null
          created_at?: string
          current_value?: Json | null
          dimension?: string
          dismissal_reason?: string | null
          estimated_effort?: string
          etsy_response?: Json | null
          etsy_shop_id?: string | null
          evidence?: Json | null
          factor_key?: string
          failure_reason?: string | null
          guided_payload?: Json | null
          id?: string
          listing_id?: string | null
          mode?: string
          proposed_value?: Json | null
          rationale?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          score_at_application?: number | null
          score_delta?: number | null
          severity?: string
          source?: string
          status?: string
          superseded_reason?: string | null
          tracking_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_actions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_lifecycle: {
        Row: {
          after_value: string | null
          applied_at: string | null
          before_value: string | null
          created_at: string
          dismissed: boolean
          field: string
          id: string
          issue_description: string | null
          last_monitored_at: string | null
          listing_id: string
          opened_at: string
          reopened_count: number
          shop_id: string
          source: string | null
          status: string
          suggested_fix: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          after_value?: string | null
          applied_at?: string | null
          before_value?: string | null
          created_at?: string
          dismissed?: boolean
          field: string
          id?: string
          issue_description?: string | null
          last_monitored_at?: string | null
          listing_id: string
          opened_at?: string
          reopened_count?: number
          shop_id: string
          source?: string | null
          status?: string
          suggested_fix?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          after_value?: string | null
          applied_at?: string | null
          before_value?: string | null
          created_at?: string
          dismissed?: boolean
          field?: string
          id?: string
          issue_description?: string | null
          last_monitored_at?: string | null
          listing_id?: string
          opened_at?: string
          reopened_count?: number
          shop_id?: string
          source?: string | null
          status?: string
          suggested_fix?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grade_dimension_scores: {
        Row: {
          created_at: string
          dimension: string
          flags: Json
          grade_run_id: string
          id: string
          score: number
          suggestions_shown: Json
        }
        Insert: {
          created_at?: string
          dimension: string
          flags?: Json
          grade_run_id: string
          id?: string
          score: number
          suggestions_shown?: Json
        }
        Update: {
          created_at?: string
          dimension?: string
          flags?: Json
          grade_run_id?: string
          id?: string
          score?: number
          suggestions_shown?: Json
        }
        Relationships: [
          {
            foreignKeyName: "grade_dimension_scores_grade_run_id_fkey"
            columns: ["grade_run_id"]
            isOneToOne: false
            referencedRelation: "grade_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_feedback: {
        Row: {
          action: string
          applied_text: string | null
          created_at: string
          dimension: string
          grade_run_id: string
          id: string
          suggestion_text: string
        }
        Insert: {
          action: string
          applied_text?: string | null
          created_at?: string
          dimension: string
          grade_run_id: string
          id?: string
          suggestion_text: string
        }
        Update: {
          action?: string
          applied_text?: string | null
          created_at?: string
          dimension?: string
          grade_run_id?: string
          id?: string
          suggestion_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_feedback_grade_run_id_fkey"
            columns: ["grade_run_id"]
            isOneToOne: false
            referencedRelation: "grade_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_runs: {
        Row: {
          archived_at: string | null
          category: string | null
          created_at: string
          data_source: string | null
          etsy_listing_id: string | null
          id: string
          input_description: string | null
          input_tags: string[] | null
          input_title: string | null
          is_digital: boolean | null
          is_own_listing: boolean
          listing_favorites: number | null
          listing_id: string | null
          listing_price_cents: number | null
          listing_price_string: string | null
          listing_url: string | null
          listing_views: number | null
          model_version: string
          overall_score: number | null
          plan_tier: string
          raw_listing_data: Json | null
          result: Json | null
          subcategory: string | null
          usage_type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          data_source?: string | null
          etsy_listing_id?: string | null
          id?: string
          input_description?: string | null
          input_tags?: string[] | null
          input_title?: string | null
          is_digital?: boolean | null
          is_own_listing?: boolean
          listing_favorites?: number | null
          listing_id?: string | null
          listing_price_cents?: number | null
          listing_price_string?: string | null
          listing_url?: string | null
          listing_views?: number | null
          model_version: string
          overall_score?: number | null
          plan_tier: string
          raw_listing_data?: Json | null
          result?: Json | null
          subcategory?: string | null
          usage_type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          data_source?: string | null
          etsy_listing_id?: string | null
          id?: string
          input_description?: string | null
          input_tags?: string[] | null
          input_title?: string | null
          is_digital?: boolean | null
          is_own_listing?: boolean
          listing_favorites?: number | null
          listing_id?: string | null
          listing_price_cents?: number | null
          listing_price_string?: string | null
          listing_url?: string | null
          listing_views?: number | null
          model_version?: string
          overall_score?: number | null
          plan_tier?: string
          raw_listing_data?: Json | null
          result?: Json | null
          subcategory?: string | null
          usage_type?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_embeddings: {
        Row: {
          content_hash: string
          created_at: string
          embedding: string
          listing_id: string
          model: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          embedding: string
          listing_id: string
          model?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          embedding?: string
          listing_id?: string
          model?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_market_scores: {
        Row: {
          description_score: number | null
          favorites_count: number | null
          favorites_score: number | null
          id: string
          image_urls: string[] | null
          keyword_cluster: string
          listing_id: string
          market_rank_estimate: number | null
          market_score: number | null
          missing_tag_count: number | null
          missing_tags: string[] | null
          missing_tags_detail: Json | null
          niche_avg_price: number | null
          photo_count: number | null
          photo_score: number | null
          price_score: number | null
          primary_image_url: string | null
          quality_score: number | null
          scored_at: string | null
          tag_score: number | null
          title_score: number | null
          user_id: string
        }
        Insert: {
          description_score?: number | null
          favorites_count?: number | null
          favorites_score?: number | null
          id?: string
          image_urls?: string[] | null
          keyword_cluster: string
          listing_id: string
          market_rank_estimate?: number | null
          market_score?: number | null
          missing_tag_count?: number | null
          missing_tags?: string[] | null
          missing_tags_detail?: Json | null
          niche_avg_price?: number | null
          photo_count?: number | null
          photo_score?: number | null
          price_score?: number | null
          primary_image_url?: string | null
          quality_score?: number | null
          scored_at?: string | null
          tag_score?: number | null
          title_score?: number | null
          user_id: string
        }
        Update: {
          description_score?: number | null
          favorites_count?: number | null
          favorites_score?: number | null
          id?: string
          image_urls?: string[] | null
          keyword_cluster?: string
          listing_id?: string
          market_rank_estimate?: number | null
          market_score?: number | null
          missing_tag_count?: number | null
          missing_tags?: string[] | null
          missing_tags_detail?: Json | null
          niche_avg_price?: number | null
          photo_count?: number | null
          photo_score?: number | null
          price_score?: number | null
          primary_image_url?: string | null
          quality_score?: number | null
          scored_at?: string | null
          tag_score?: number | null
          title_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      listing_renewal_events: {
        Row: {
          created_at: string
          days_extended: number | null
          detected_at: string
          etsy_listing_id: string
          etsy_shop_id: string
          id: string
          is_unique_item: boolean | null
          new_ending_timestamp: number
          notes: string | null
          previous_ending_timestamp: number
          price_at_renewal: number
          quantity_at_renewal: number
          renewal_fee_usd: number
          renewal_type: string
          shop_on_vacation_at_renewal: boolean
          state_at_renewal: string
        }
        Insert: {
          created_at?: string
          days_extended?: number | null
          detected_at: string
          etsy_listing_id: string
          etsy_shop_id: string
          id?: string
          is_unique_item?: boolean | null
          new_ending_timestamp: number
          notes?: string | null
          previous_ending_timestamp: number
          price_at_renewal?: number
          quantity_at_renewal?: number
          renewal_fee_usd?: number
          renewal_type: string
          shop_on_vacation_at_renewal?: boolean
          state_at_renewal: string
        }
        Update: {
          created_at?: string
          days_extended?: number | null
          detected_at?: string
          etsy_listing_id?: string
          etsy_shop_id?: string
          id?: string
          is_unique_item?: boolean | null
          new_ending_timestamp?: number
          notes?: string | null
          previous_ending_timestamp?: number
          price_at_renewal?: number
          quantity_at_renewal?: number
          renewal_fee_usd?: number
          renewal_type?: string
          shop_on_vacation_at_renewal?: boolean
          state_at_renewal?: string
        }
        Relationships: []
      }
      listing_renewal_snapshots: {
        Row: {
          created_at: string
          ending_timestamp: number
          etsy_listing_id: string
          etsy_shop_id: string
          id: string
          is_digital: boolean
          last_modified_timestamp: number
          price: number
          quantity: number
          shop_on_vacation: boolean
          snapshot_date: string
          state: string
        }
        Insert: {
          created_at?: string
          ending_timestamp?: number
          etsy_listing_id: string
          etsy_shop_id: string
          id?: string
          is_digital?: boolean
          last_modified_timestamp?: number
          price?: number
          quantity?: number
          shop_on_vacation?: boolean
          snapshot_date: string
          state: string
        }
        Update: {
          created_at?: string
          ending_timestamp?: number
          etsy_listing_id?: string
          etsy_shop_id?: string
          id?: string
          is_digital?: boolean
          last_modified_timestamp?: number
          price?: number
          quantity?: number
          shop_on_vacation?: boolean
          snapshot_date?: string
          state?: string
        }
        Relationships: []
      }
      listing_renewal_summary: {
        Row: {
          auto_renewals: number
          current_price: number | null
          current_quantity: number | null
          current_state: string | null
          data_confidence: string
          days_since_creation: number | null
          estimated_stale_score: number
          etsy_listing_id: string
          etsy_shop_id: string
          first_seen_date: string | null
          is_unique_item: boolean
          last_renewal_date: string | null
          last_updated: string
          manual_renewals: number
          relist_renewals: number
          total_renewal_cost_usd: number
          total_renewals: number
          vacation_adjusted_days: number | null
        }
        Insert: {
          auto_renewals?: number
          current_price?: number | null
          current_quantity?: number | null
          current_state?: string | null
          data_confidence?: string
          days_since_creation?: number | null
          estimated_stale_score?: number
          etsy_listing_id: string
          etsy_shop_id: string
          first_seen_date?: string | null
          is_unique_item?: boolean
          last_renewal_date?: string | null
          last_updated?: string
          manual_renewals?: number
          relist_renewals?: number
          total_renewal_cost_usd?: number
          total_renewals?: number
          vacation_adjusted_days?: number | null
        }
        Update: {
          auto_renewals?: number
          current_price?: number | null
          current_quantity?: number | null
          current_state?: string | null
          data_confidence?: string
          days_since_creation?: number | null
          estimated_stale_score?: number
          etsy_listing_id?: string
          etsy_shop_id?: string
          first_seen_date?: string | null
          is_unique_item?: boolean
          last_renewal_date?: string | null
          last_updated?: string
          manual_renewals?: number
          relist_renewals?: number
          total_renewal_cost_usd?: number
          total_renewals?: number
          vacation_adjusted_days?: number | null
        }
        Relationships: []
      }
      listing_renewals: {
        Row: {
          detected_at: string
          etsy_listing_id: string
          id: string
          listing_id: string
          new_ending_at: string
          previous_ending_at: string | null
          renewal_cost: number
          user_id: string
        }
        Insert: {
          detected_at?: string
          etsy_listing_id: string
          id?: string
          listing_id: string
          new_ending_at: string
          previous_ending_at?: string | null
          renewal_cost?: number
          user_id: string
        }
        Update: {
          detected_at?: string
          etsy_listing_id?: string
          id?: string
          listing_id?: string
          new_ending_at?: string
          previous_ending_at?: string | null
          renewal_cost?: number
          user_id?: string
        }
        Relationships: []
      }
      listing_sales_events: {
        Row: {
          created_at: string
          days_to_first_sale: number | null
          etsy_receipt_id: string | null
          etsy_transaction_id: string | null
          id: string
          listing_id: string
          listing_type: string
          sold_on: string
          source: string
          units: number
          user_id: string
          was_first_sale: boolean
        }
        Insert: {
          created_at?: string
          days_to_first_sale?: number | null
          etsy_receipt_id?: string | null
          etsy_transaction_id?: string | null
          id?: string
          listing_id: string
          listing_type: string
          sold_on: string
          source?: string
          units?: number
          user_id: string
          was_first_sale?: boolean
        }
        Update: {
          created_at?: string
          days_to_first_sale?: number | null
          etsy_receipt_id?: string | null
          etsy_transaction_id?: string | null
          id?: string
          listing_id?: string
          listing_type?: string
          sold_on?: string
          source?: string
          units?: number
          user_id?: string
          was_first_sale?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "listing_sales_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_sanity_flags: {
        Row: {
          detail: string
          detected_at: string
          dismissed_at: string | null
          field: string
          flag_type: string
          flagged_text: string
          id: string
          internal_listing_id: string
          match_key: string | null
          match_value: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          detail?: string
          detected_at?: string
          dismissed_at?: string | null
          field: string
          flag_type: string
          flagged_text: string
          id?: string
          internal_listing_id: string
          match_key?: string | null
          match_value: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          detail?: string
          detected_at?: string
          dismissed_at?: string | null
          field?: string
          flag_type?: string
          flagged_text?: string
          id?: string
          internal_listing_id?: string
          match_key?: string | null
          match_value?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_sanity_flags_internal_listing_id_fkey"
            columns: ["internal_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_snapshots: {
        Row: {
          changed_fields: string[] | null
          created_at: string
          description_length: number | null
          favorites: number
          first_tag: string | null
          first_title_keyword: string | null
          has_free_shipping: boolean | null
          is_first_snapshot: boolean | null
          last_modified_tsz: string | null
          listing_id: string
          original_creation_tsz: string | null
          photo_count: number | null
          price: number | null
          processing_time_max: number | null
          processing_time_min: number | null
          quantity: number
          recorded_on: string
          shipping_price: number | null
          shop_id: string | null
          state: string | null
          tag_count: number | null
          tags: string[] | null
          title: string | null
          title_char_count: number | null
          user_id: string
          views: number
        }
        Insert: {
          changed_fields?: string[] | null
          created_at?: string
          description_length?: number | null
          favorites?: number
          first_tag?: string | null
          first_title_keyword?: string | null
          has_free_shipping?: boolean | null
          is_first_snapshot?: boolean | null
          last_modified_tsz?: string | null
          listing_id: string
          original_creation_tsz?: string | null
          photo_count?: number | null
          price?: number | null
          processing_time_max?: number | null
          processing_time_min?: number | null
          quantity?: number
          recorded_on?: string
          shipping_price?: number | null
          shop_id?: string | null
          state?: string | null
          tag_count?: number | null
          tags?: string[] | null
          title?: string | null
          title_char_count?: number | null
          user_id: string
          views?: number
        }
        Update: {
          changed_fields?: string[] | null
          created_at?: string
          description_length?: number | null
          favorites?: number
          first_tag?: string | null
          first_title_keyword?: string | null
          has_free_shipping?: boolean | null
          is_first_snapshot?: boolean | null
          last_modified_tsz?: string | null
          listing_id?: string
          original_creation_tsz?: string | null
          photo_count?: number | null
          price?: number | null
          processing_time_max?: number | null
          processing_time_min?: number | null
          quantity?: number
          recorded_on?: string
          shipping_price?: number | null
          shop_id?: string | null
          state?: string | null
          tag_count?: number | null
          tags?: string[] | null
          title?: string | null
          title_char_count?: number | null
          user_id?: string
          views?: number
        }
        Relationships: []
      }
      listing_traction_events: {
        Row: {
          delta: number | null
          event_type: string
          id: string
          internal_listing_id: string | null
          listing_id: string
          new_value: string | null
          previous_value: string | null
          recorded_at: string
          shop_id: string | null
          user_id: string
        }
        Insert: {
          delta?: number | null
          event_type: string
          id?: string
          internal_listing_id?: string | null
          listing_id: string
          new_value?: string | null
          previous_value?: string | null
          recorded_at?: string
          shop_id?: string | null
          user_id: string
        }
        Update: {
          delta?: number | null
          event_type?: string
          id?: string
          internal_listing_id?: string | null
          listing_id?: string
          new_value?: string | null
          previous_value?: string | null
          recorded_at?: string
          shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_traction_events_internal_listing_id_fkey"
            columns: ["internal_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_user_flags: {
        Row: {
          applied_at: string
          created_at: string
          expires_at: string | null
          flag_type: string
          id: string
          listing_id: string
          measurement_window_end: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          created_at?: string
          expires_at?: string | null
          flag_type: string
          id?: string
          listing_id: string
          measurement_window_end?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          created_at?: string
          expires_at?: string | null
          flag_type?: string
          id?: string
          listing_id?: string
          measurement_window_end?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_user_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_versions: {
        Row: {
          action_source: string | null
          attribution_window_ends: string | null
          created_at: string
          description: string | null
          id: string
          listing_id: string
          materials: string[]
          price: number | null
          reason: string | null
          restored_at: string | null
          revert_reason: string | null
          reverted_at: string | null
          source: string
          tags: string[]
          title: string | null
          user_id: string
        }
        Insert: {
          action_source?: string | null
          attribution_window_ends?: string | null
          created_at?: string
          description?: string | null
          id?: string
          listing_id: string
          materials?: string[]
          price?: number | null
          reason?: string | null
          restored_at?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          source?: string
          tags?: string[]
          title?: string | null
          user_id: string
        }
        Update: {
          action_source?: string | null
          attribution_window_ends?: string | null
          created_at?: string
          description?: string | null
          id?: string
          listing_id?: string
          materials?: string[]
          price?: number | null
          reason?: string | null
          restored_at?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          source?: string
          tags?: string[]
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          clarifying_answers: Json | null
          clarifying_history: Json
          clarifying_questions: Json | null
          component_mapping: Json | null
          component_mapping_updated_at: string | null
          content_updated_at: string
          created_at: string
          decay_points: number
          decay_started_at: string | null
          description: string | null
          ending_at: string | null
          etsy_created_at: string | null
          etsy_listing_id: string
          favorites: number
          grade: string | null
          id: string
          image_urls: string[]
          last_graded: string | null
          last_sanity_scanned_at: string | null
          last_synced: string | null
          materials: string[]
          needs_attention: boolean
          niche: string | null
          niche_confidence: number | null
          niche_detected_at: string | null
          niche_source: string | null
          niche_status: string
          niche_tag_fingerprint: string | null
          optimization_count: number
          photo_count: number
          price: number | null
          quantity: number
          score: number | null
          score_breakdown: Json | null
          shipping_price_usd: number | null
          state: string | null
          store_id: string | null
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
          video_count: number
          views: number
        }
        Insert: {
          clarifying_answers?: Json | null
          clarifying_history?: Json
          clarifying_questions?: Json | null
          component_mapping?: Json | null
          component_mapping_updated_at?: string | null
          content_updated_at?: string
          created_at?: string
          decay_points?: number
          decay_started_at?: string | null
          description?: string | null
          ending_at?: string | null
          etsy_created_at?: string | null
          etsy_listing_id: string
          favorites?: number
          grade?: string | null
          id?: string
          image_urls?: string[]
          last_graded?: string | null
          last_sanity_scanned_at?: string | null
          last_synced?: string | null
          materials?: string[]
          needs_attention?: boolean
          niche?: string | null
          niche_confidence?: number | null
          niche_detected_at?: string | null
          niche_source?: string | null
          niche_status?: string
          niche_tag_fingerprint?: string | null
          optimization_count?: number
          photo_count?: number
          price?: number | null
          quantity?: number
          score?: number | null
          score_breakdown?: Json | null
          shipping_price_usd?: number | null
          state?: string | null
          store_id?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
          video_count?: number
          views?: number
        }
        Update: {
          clarifying_answers?: Json | null
          clarifying_history?: Json
          clarifying_questions?: Json | null
          component_mapping?: Json | null
          component_mapping_updated_at?: string | null
          content_updated_at?: string
          created_at?: string
          decay_points?: number
          decay_started_at?: string | null
          description?: string | null
          ending_at?: string | null
          etsy_created_at?: string | null
          etsy_listing_id?: string
          favorites?: number
          grade?: string | null
          id?: string
          image_urls?: string[]
          last_graded?: string | null
          last_sanity_scanned_at?: string | null
          last_synced?: string | null
          materials?: string[]
          needs_attention?: boolean
          niche?: string | null
          niche_confidence?: number | null
          niche_detected_at?: string | null
          niche_source?: string | null
          niche_status?: string
          niche_tag_fingerprint?: string | null
          optimization_count?: number
          photo_count?: number
          price?: number | null
          quantity?: number
          score?: number | null
          score_breakdown?: Json | null
          shipping_price_usd?: number | null
          state?: string | null
          store_id?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          video_count?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      market_insight_cache: {
        Row: {
          competitor_listings: Json | null
          created_at: string | null
          expires_at: string
          insights: Json
          keyword_cluster: string
          source: string | null
        }
        Insert: {
          competitor_listings?: Json | null
          created_at?: string | null
          expires_at: string
          insights: Json
          keyword_cluster: string
          source?: string | null
        }
        Update: {
          competitor_listings?: Json | null
          created_at?: string | null
          expires_at?: string
          insights?: Json
          keyword_cluster?: string
          source?: string | null
        }
        Relationships: []
      }
      market_snapshots: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          listings: Json
          result_count: number
          scan_source: string
          search_term: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          listings?: Json
          result_count?: number
          scan_source?: string
          search_term: string
          user_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          listings?: Json
          result_count?: number
          scan_source?: string
          search_term?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_usage: {
        Row: {
          chat_messages_used: number
          created_at: string
          grades_used: number
          id: string
          month: string
          optimizations_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_messages_used?: number
          created_at?: string
          grades_used?: number
          id?: string
          month: string
          optimizations_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_messages_used?: number
          created_at?: string
          grades_used?: number
          id?: string
          month?: string
          optimizations_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      niche_cache: {
        Row: {
          confidence: number | null
          created_at: string
          hit_count: number
          last_hit_at: string
          niche: string
          sample_tags: string[]
          source: string
          tag_fingerprint: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          hit_count?: number
          last_hit_at?: string
          niche: string
          sample_tags?: string[]
          source?: string
          tag_fingerprint: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          hit_count?: number
          last_hit_at?: string
          niche?: string
          sample_tags?: string[]
          source?: string
          tag_fingerprint?: string
          updated_at?: string
        }
        Relationships: []
      }
      niche_health: {
        Row: {
          active_listing_count: number | null
          avg_competition_score: number | null
          avg_competitor_favorers: number | null
          date: string
          id: string
          keyword_cluster: string
          saturation_level: string | null
          trend: string | null
        }
        Insert: {
          active_listing_count?: number | null
          avg_competition_score?: number | null
          avg_competitor_favorers?: number | null
          date: string
          id?: string
          keyword_cluster: string
          saturation_level?: string | null
          trend?: string | null
        }
        Update: {
          active_listing_count?: number | null
          avg_competition_score?: number | null
          avg_competitor_favorers?: number | null
          date?: string
          id?: string
          keyword_cluster?: string
          saturation_level?: string | null
          trend?: string | null
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          provider: string
          return_url: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          provider?: string
          return_url?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          provider?: string
          return_url?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      optimization_feedback: {
        Row: {
          action: string
          created_at: string
          diff_summary: Json | null
          id: string
          listing_id: string
          optimization_run_id: string | null
          reason_category: string | null
          reason_text: string | null
          shop_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          diff_summary?: Json | null
          id?: string
          listing_id: string
          optimization_run_id?: string | null
          reason_category?: string | null
          reason_text?: string | null
          shop_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          diff_summary?: Json | null
          id?: string
          listing_id?: string
          optimization_run_id?: string | null
          reason_category?: string | null
          reason_text?: string | null
          shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_feedback_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_feedback_optimization_run_id_fkey"
            columns: ["optimization_run_id"]
            isOneToOne: false
            referencedRelation: "optimizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      optimizations: {
        Row: {
          anthropic_batch_id: string | null
          anthropic_batch_status: string | null
          created_at: string
          grade_improvement: number | null
          id: string
          latest_grade: number | null
          latest_grade_at: string | null
          listing_id: string
          model_used: string | null
          new_grade: number | null
          optimized_description: string | null
          optimized_materials: string[] | null
          optimized_tags: string[] | null
          optimized_title: string | null
          original_description: string | null
          original_grade: number | null
          original_materials: string[] | null
          original_tags: string[] | null
          original_text: string | null
          original_title: string | null
          pushed_at: string | null
          reject_reason: string | null
          rejected_at: string | null
          status: string
          suggested_text: string | null
          type: string | null
          updated_at: string
          user_id: string
          validation_warnings: Json | null
          version_id: string | null
        }
        Insert: {
          anthropic_batch_id?: string | null
          anthropic_batch_status?: string | null
          created_at?: string
          grade_improvement?: number | null
          id?: string
          latest_grade?: number | null
          latest_grade_at?: string | null
          listing_id: string
          model_used?: string | null
          new_grade?: number | null
          optimized_description?: string | null
          optimized_materials?: string[] | null
          optimized_tags?: string[] | null
          optimized_title?: string | null
          original_description?: string | null
          original_grade?: number | null
          original_materials?: string[] | null
          original_tags?: string[] | null
          original_text?: string | null
          original_title?: string | null
          pushed_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          status?: string
          suggested_text?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          validation_warnings?: Json | null
          version_id?: string | null
        }
        Update: {
          anthropic_batch_id?: string | null
          anthropic_batch_status?: string | null
          created_at?: string
          grade_improvement?: number | null
          id?: string
          latest_grade?: number | null
          latest_grade_at?: string | null
          listing_id?: string
          model_used?: string | null
          new_grade?: number | null
          optimized_description?: string | null
          optimized_materials?: string[] | null
          optimized_tags?: string[] | null
          optimized_title?: string | null
          original_description?: string | null
          original_grade?: number | null
          original_materials?: string[] | null
          original_tags?: string[] | null
          original_text?: string | null
          original_title?: string | null
          pushed_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          status?: string
          suggested_text?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          validation_warnings?: Json | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "optimizations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimizations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_items: {
        Row: {
          created_at: string
          currency_code: string | null
          etsy_listing_id: string | null
          etsy_receipt_id: string
          etsy_shop_id: string | null
          etsy_transaction_id: string
          id: string
          listing_id: string | null
          raw: Json
          sold_on: string
          store_id: string | null
          thumbnail_url: string | null
          title: string | null
          unit_price: number | null
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          etsy_listing_id?: string | null
          etsy_receipt_id: string
          etsy_shop_id?: string | null
          etsy_transaction_id: string
          id?: string
          listing_id?: string | null
          raw?: Json
          sold_on: string
          store_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          unit_price?: number | null
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          etsy_listing_id?: string | null
          etsy_receipt_id?: string
          etsy_shop_id?: string | null
          etsy_transaction_id?: string
          id?: string
          listing_id?: string | null
          raw?: Json
          sold_on?: string
          store_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          unit_price?: number | null
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_line_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_rec_applications: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          optimization_run_id: string | null
          peer_rec_category: string | null
          peer_rec_impact: string | null
          peer_rec_summary: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          optimization_run_id?: string | null
          peer_rec_category?: string | null
          peer_rec_impact?: string | null
          peer_rec_summary: string
          reason?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          optimization_run_id?: string | null
          peer_rec_category?: string | null
          peer_rec_impact?: string | null
          peer_rec_summary?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_rec_applications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_rec_applications_optimization_run_id_fkey"
            columns: ["optimization_run_id"]
            isOneToOne: false
            referencedRelation: "optimizations"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_rec_cache: {
        Row: {
          created_at: string
          expires_at: string
          generated_at: string
          id: string
          listing_id: string
          material_gaps: Json
          peer_count: number
          recommendations: Json
          tag_gaps: Json
          top_peer_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          listing_id: string
          material_gaps?: Json
          peer_count?: number
          recommendations?: Json
          tag_gaps?: Json
          top_peer_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          listing_id?: string
          material_gaps?: Json
          peer_count?: number
          recommendations?: Json
          tag_gaps?: Json
          top_peer_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_rec_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_attribution: {
        Row: {
          admin_review_status: string
          anomaly_reason: string | null
          created_at: string
          favorites_delta: number | null
          favorites_pct: number | null
          id: string
          is_anomaly: boolean
          is_sufficient_data: boolean
          listing_id: string
          optimization_id: string
          optimized_at: string
          post_favorites: number | null
          post_revenue: number | null
          post_sales: number | null
          post_score: number | null
          post_snapshot_date: string | null
          post_views: number | null
          pre_favorites: number | null
          pre_revenue: number | null
          pre_sales: number | null
          pre_score: number | null
          pre_snapshot_date: string | null
          pre_views: number | null
          revenue_delta: number | null
          revenue_pct: number | null
          sales_delta: number | null
          sales_pct: number | null
          score_delta: number | null
          updated_at: string
          user_id: string
          views_delta: number | null
          views_pct: number | null
          window_days: number
        }
        Insert: {
          admin_review_status?: string
          anomaly_reason?: string | null
          created_at?: string
          favorites_delta?: number | null
          favorites_pct?: number | null
          id?: string
          is_anomaly?: boolean
          is_sufficient_data?: boolean
          listing_id: string
          optimization_id: string
          optimized_at: string
          post_favorites?: number | null
          post_revenue?: number | null
          post_sales?: number | null
          post_score?: number | null
          post_snapshot_date?: string | null
          post_views?: number | null
          pre_favorites?: number | null
          pre_revenue?: number | null
          pre_sales?: number | null
          pre_score?: number | null
          pre_snapshot_date?: string | null
          pre_views?: number | null
          revenue_delta?: number | null
          revenue_pct?: number | null
          sales_delta?: number | null
          sales_pct?: number | null
          score_delta?: number | null
          updated_at?: string
          user_id: string
          views_delta?: number | null
          views_pct?: number | null
          window_days: number
        }
        Update: {
          admin_review_status?: string
          anomaly_reason?: string | null
          created_at?: string
          favorites_delta?: number | null
          favorites_pct?: number | null
          id?: string
          is_anomaly?: boolean
          is_sufficient_data?: boolean
          listing_id?: string
          optimization_id?: string
          optimized_at?: string
          post_favorites?: number | null
          post_revenue?: number | null
          post_sales?: number | null
          post_score?: number | null
          post_snapshot_date?: string | null
          post_views?: number | null
          pre_favorites?: number | null
          pre_revenue?: number | null
          pre_sales?: number | null
          pre_score?: number | null
          pre_snapshot_date?: string | null
          pre_views?: number | null
          revenue_delta?: number | null
          revenue_pct?: number | null
          sales_delta?: number | null
          sales_pct?: number | null
          score_delta?: number | null
          updated_at?: string
          user_id?: string
          views_delta?: number | null
          views_pct?: number | null
          window_days?: number
        }
        Relationships: []
      }
      personal_daily_quotas: {
        Row: {
          created_at: string
          date: string
          personal_grades_used: number
          personal_optimizations_used: number
          personal_tryons_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          personal_grades_used?: number
          personal_optimizations_used?: number
          personal_tryons_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          personal_grades_used?: number
          personal_optimizations_used?: number
          personal_tryons_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_optimization_runs: {
        Row: {
          action: string | null
          archived_at: string | null
          category: string | null
          created_at: string
          final_text: string | null
          grade_run_id: string | null
          id: string
          input_text: string
          model_version: string
          optimization_type: string
          output_text: string | null
          updated_at: string
          usage_type: string
          user_id: string
        }
        Insert: {
          action?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          final_text?: string | null
          grade_run_id?: string | null
          id?: string
          input_text: string
          model_version: string
          optimization_type: string
          output_text?: string | null
          updated_at?: string
          usage_type?: string
          user_id: string
        }
        Update: {
          action?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          final_text?: string | null
          grade_run_id?: string | null
          id?: string
          input_text?: string
          model_version?: string
          optimization_type?: string
          output_text?: string | null
          updated_at?: string
          usage_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_optimization_runs_grade_run_id_fkey"
            columns: ["grade_run_id"]
            isOneToOne: false
            referencedRelation: "grade_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_analyses: {
        Row: {
          analysis_json: Json
          created_at: string
          id: string
          listing_id: string
          overall_score: number | null
          user_id: string
        }
        Insert: {
          analysis_json: Json
          created_at?: string
          id?: string
          listing_id: string
          overall_score?: number | null
          user_id: string
        }
        Update: {
          analysis_json?: Json
          created_at?: string
          id?: string
          listing_id?: string
          overall_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_analyses_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_posts: {
        Row: {
          board_id: string | null
          id: string
          listing_id: number | null
          pin_id: string | null
          posted_at: string | null
          removed_at: string | null
          shop_id: number | null
          user_id: string
        }
        Insert: {
          board_id?: string | null
          id?: string
          listing_id?: number | null
          pin_id?: string | null
          posted_at?: string | null
          removed_at?: string | null
          shop_id?: number | null
          user_id: string
        }
        Update: {
          board_id?: string | null
          id?: string
          listing_id?: number | null
          pin_id?: string | null
          posted_at?: string | null
          removed_at?: string | null
          shop_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      pipeline_run_log: {
        Row: {
          api_calls_made: number | null
          cache_hits: number | null
          completed_at: string | null
          errors: Json | null
          id: string
          listings_processed: number | null
          run_type: string
          started_at: string | null
          status: string | null
          trigger_reason: string | null
          user_id: string | null
        }
        Insert: {
          api_calls_made?: number | null
          cache_hits?: number | null
          completed_at?: string | null
          errors?: Json | null
          id?: string
          listings_processed?: number | null
          run_type: string
          started_at?: string | null
          status?: string | null
          trigger_reason?: string | null
          user_id?: string | null
        }
        Update: {
          api_calls_made?: number | null
          cache_hits?: number | null
          completed_at?: string | null
          errors?: Json | null
          id?: string
          listings_processed?: number | null
          run_type?: string
          started_at?: string | null
          status?: string | null
          trigger_reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      platform_daily_metrics: {
        Row: {
          actions_reverted: number | null
          actions_taken: number | null
          active_users: number | null
          api_calls_made: number | null
          api_quota_remaining: number | null
          avg_market_score: number | null
          avg_quality_score: number | null
          cache_hit_rate: number | null
          date: string
          free_users: number | null
          high_score_no_traction_count: number | null
          id: string
          job_success_rate: number | null
          listings_scored: number | null
          pro_users: number | null
          starter_users: number | null
        }
        Insert: {
          actions_reverted?: number | null
          actions_taken?: number | null
          active_users?: number | null
          api_calls_made?: number | null
          api_quota_remaining?: number | null
          avg_market_score?: number | null
          avg_quality_score?: number | null
          cache_hit_rate?: number | null
          date: string
          free_users?: number | null
          high_score_no_traction_count?: number | null
          id?: string
          job_success_rate?: number | null
          listings_scored?: number | null
          pro_users?: number | null
          starter_users?: number | null
        }
        Update: {
          actions_reverted?: number | null
          actions_taken?: number | null
          active_users?: number | null
          api_calls_made?: number | null
          api_quota_remaining?: number | null
          avg_market_score?: number | null
          avg_quality_score?: number | null
          cache_hit_rate?: number | null
          date?: string
          free_users?: number | null
          high_score_no_traction_count?: number | null
          id?: string
          job_success_rate?: number | null
          listings_scored?: number | null
          pro_users?: number | null
          starter_users?: number | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          label: string | null
          last_changed_at: string | null
          last_changed_by: string | null
          value: Json
        }
        Insert: {
          key: string
          label?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          label?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_stats_cache: {
        Row: {
          computed_at: string
          id: number
          median_sales_lift_30d: number | null
          median_score_improvement: number | null
          median_views_lift_30d: number | null
          pct_positive_delta: number | null
          total_optimizations: number
        }
        Insert: {
          computed_at?: string
          id?: number
          median_sales_lift_30d?: number | null
          median_score_improvement?: number | null
          median_views_lift_30d?: number | null
          pct_positive_delta?: number | null
          total_optimizations?: number
        }
        Update: {
          computed_at?: string
          id?: number
          median_sales_lift_30d?: number | null
          median_score_improvement?: number | null
          median_views_lift_30d?: number | null
          pct_positive_delta?: number | null
          total_optimizations?: number
        }
        Relationships: []
      }
      seed_niches: {
        Row: {
          active: boolean | null
          admin_assigned_count: number | null
          ai_generated_queries: string[] | null
          competitor_listing_count: number | null
          created_at: string | null
          custom_queries: string[] | null
          id: string
          last_refreshed: string | null
          niche_key: string
          niche_label: string
          real_user_count: number | null
        }
        Insert: {
          active?: boolean | null
          admin_assigned_count?: number | null
          ai_generated_queries?: string[] | null
          competitor_listing_count?: number | null
          created_at?: string | null
          custom_queries?: string[] | null
          id?: string
          last_refreshed?: string | null
          niche_key: string
          niche_label: string
          real_user_count?: number | null
        }
        Update: {
          active?: boolean | null
          admin_assigned_count?: number | null
          ai_generated_queries?: string[] | null
          competitor_listing_count?: number | null
          created_at?: string | null
          custom_queries?: string[] | null
          id?: string
          last_refreshed?: string | null
          niche_key?: string
          niche_label?: string
          real_user_count?: number | null
        }
        Relationships: []
      }
      shop_intelligence: {
        Row: {
          active_competitor_alerts: number | null
          active_strategy: string | null
          analyzed_listings: number | null
          applied_fix_count: number | null
          avg_listing_score: number | null
          best_performing_listings: Json | null
          competitor_summary: Json | null
          created_at: string
          critical_competitor_alerts: number | null
          id: string
          last_competitor_scan_at: string | null
          last_fix_applied_at: string | null
          last_fix_category: string | null
          last_graded_at: string | null
          listings_analyzed_this_month: number | null
          listings_needing_attention: number | null
          next_scheduled_scan: string | null
          open_fix_count: number | null
          overall_market_score: number | null
          rebuilt_at: string
          resolved_fix_count: number | null
          score_delta_30d: number | null
          score_delta_7d: number | null
          score_trend: string | null
          superseded_fix_count: number | null
          top_opportunities: Json | null
          total_listings: number | null
          total_points_available: number | null
          total_points_gained: number | null
          tracked_fix_count: number | null
          updated_at: string
          user_id: string
          worst_performing_listings: Json | null
        }
        Insert: {
          active_competitor_alerts?: number | null
          active_strategy?: string | null
          analyzed_listings?: number | null
          applied_fix_count?: number | null
          avg_listing_score?: number | null
          best_performing_listings?: Json | null
          competitor_summary?: Json | null
          created_at?: string
          critical_competitor_alerts?: number | null
          id?: string
          last_competitor_scan_at?: string | null
          last_fix_applied_at?: string | null
          last_fix_category?: string | null
          last_graded_at?: string | null
          listings_analyzed_this_month?: number | null
          listings_needing_attention?: number | null
          next_scheduled_scan?: string | null
          open_fix_count?: number | null
          overall_market_score?: number | null
          rebuilt_at?: string
          resolved_fix_count?: number | null
          score_delta_30d?: number | null
          score_delta_7d?: number | null
          score_trend?: string | null
          superseded_fix_count?: number | null
          top_opportunities?: Json | null
          total_listings?: number | null
          total_points_available?: number | null
          total_points_gained?: number | null
          tracked_fix_count?: number | null
          updated_at?: string
          user_id: string
          worst_performing_listings?: Json | null
        }
        Update: {
          active_competitor_alerts?: number | null
          active_strategy?: string | null
          analyzed_listings?: number | null
          applied_fix_count?: number | null
          avg_listing_score?: number | null
          best_performing_listings?: Json | null
          competitor_summary?: Json | null
          created_at?: string
          critical_competitor_alerts?: number | null
          id?: string
          last_competitor_scan_at?: string | null
          last_fix_applied_at?: string | null
          last_fix_category?: string | null
          last_graded_at?: string | null
          listings_analyzed_this_month?: number | null
          listings_needing_attention?: number | null
          next_scheduled_scan?: string | null
          open_fix_count?: number | null
          overall_market_score?: number | null
          rebuilt_at?: string
          resolved_fix_count?: number | null
          score_delta_30d?: number | null
          score_delta_7d?: number | null
          score_trend?: string | null
          superseded_fix_count?: number | null
          top_opportunities?: Json | null
          total_listings?: number | null
          total_points_available?: number | null
          total_points_gained?: number | null
          tracked_fix_count?: number | null
          updated_at?: string
          user_id?: string
          worst_performing_listings?: Json | null
        }
        Relationships: []
      }
      shop_preferences: {
        Row: {
          last_synthesized_at: string | null
          learned_preferences: Json | null
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_synthesized_at?: string | null
          learned_preferences?: Json | null
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_synthesized_at?: string | null
          learned_preferences?: Json | null
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_preferences_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reviews: {
        Row: {
          buyer_country: string | null
          created_at: string
          etsy_created_at: string | null
          etsy_review_id: string | null
          id: string
          listing_id: string | null
          rating: number
          review_text: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          buyer_country?: string | null
          created_at?: string
          etsy_created_at?: string | null
          etsy_review_id?: string | null
          id?: string
          listing_id?: string | null
          rating: number
          review_text?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          buyer_country?: string | null
          created_at?: string
          etsy_created_at?: string | null
          etsy_review_id?: string | null
          id?: string
          listing_id?: string | null
          rating?: number
          review_text?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_snapshots: {
        Row: {
          active_count: number
          avg_rating: number | null
          created_at: string
          expiring_soon_count: number
          orders_30d: number
          recorded_on: string
          revenue_30d: number
          review_count: number
          shop_followers: number
          sold_out_count: number
          store_id: string
          total_favorites: number
          total_sales: number
          total_views: number
          user_id: string
        }
        Insert: {
          active_count?: number
          avg_rating?: number | null
          created_at?: string
          expiring_soon_count?: number
          orders_30d?: number
          recorded_on?: string
          revenue_30d?: number
          review_count?: number
          shop_followers?: number
          sold_out_count?: number
          store_id: string
          total_favorites?: number
          total_sales?: number
          total_views?: number
          user_id: string
        }
        Update: {
          active_count?: number
          avg_rating?: number | null
          created_at?: string
          expiring_soon_count?: number
          orders_30d?: number
          recorded_on?: string
          revenue_30d?: number
          review_count?: number
          shop_followers?: number
          sold_out_count?: number
          store_id?: string
          total_favorites?: number
          total_sales?: number
          total_views?: number
          user_id?: string
        }
        Relationships: []
      }
      shop_vacation_periods: {
        Row: {
          created_at: string
          ended_on: string | null
          etsy_shop_id: string
          id: string
          started_on: string
        }
        Insert: {
          created_at?: string
          ended_on?: string | null
          etsy_shop_id: string
          id?: string
          started_on: string
        }
        Update: {
          created_at?: string
          ended_on?: string | null
          etsy_shop_id?: string
          id?: string
          started_on?: string
        }
        Relationships: []
      }
      snapshot_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          listings_snapshotted: number | null
          status: string
          triggered_by: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          listings_snapshotted?: number | null
          status: string
          triggered_by?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          listings_snapshotted?: number | null
          status?: string
          triggered_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      store_health_history: {
        Row: {
          created_at: string
          id: string
          recorded_at: string
          score_exact: number
          score_overall: number
          shop_id: string | null
          sub_scores: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recorded_at?: string
          score_exact: number
          score_overall: number
          shop_id?: string | null
          sub_scores?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recorded_at?: string
          score_exact?: number
          score_overall?: number
          shop_id?: string | null
          sub_scores?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_health_history_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_personalization: {
        Row: {
          ai_followups: Json
          answers: Json
          category: string | null
          completion_percentage: number
          created_at: string
          custom_prompt_override: string | null
          etsy_shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_followups?: Json
          answers?: Json
          category?: string | null
          completion_percentage?: number
          created_at?: string
          custom_prompt_override?: string | null
          etsy_shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_followups?: Json
          answers?: Json
          category?: string | null
          completion_percentage?: number
          created_at?: string
          custom_prompt_override?: string | null
          etsy_shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_velocity_stats: {
        Row: {
          active_count: number
          avg_days_not_optimized: number | null
          avg_days_optimized: number | null
          avg_days_to_sell: number | null
          computed_at: string | null
          created_at: string
          fast_seller_traits: Json
          infinite_count: number
          infinite_sales_per_month: number | null
          monthly_trend: Json
          p20_days_to_sell: number | null
          sample_size: number
          sell_through_90d: number | null
          sell_through_prior_90d: number | null
          sold_last_90d: number
          sold_prior_90d: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_count?: number
          avg_days_not_optimized?: number | null
          avg_days_optimized?: number | null
          avg_days_to_sell?: number | null
          computed_at?: string | null
          created_at?: string
          fast_seller_traits?: Json
          infinite_count?: number
          infinite_sales_per_month?: number | null
          monthly_trend?: Json
          p20_days_to_sell?: number | null
          sample_size?: number
          sell_through_90d?: number | null
          sell_through_prior_90d?: number | null
          sold_last_90d?: number
          sold_prior_90d?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_count?: number
          avg_days_not_optimized?: number | null
          avg_days_optimized?: number | null
          avg_days_to_sell?: number | null
          computed_at?: string | null
          created_at?: string
          fast_seller_traits?: Json
          infinite_count?: number
          infinite_sales_per_month?: number | null
          monthly_trend?: Json
          p20_days_to_sell?: number | null
          sample_size?: number
          sell_through_90d?: number | null
          sell_through_prior_90d?: number | null
          sold_last_90d?: number
          sold_prior_90d?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          competitor_avg_health: number | null
          connected_at: string
          created_at: string
          currency_code: string | null
          etsy_shop_id: string
          has_banner: boolean
          has_shop_icon: boolean
          id: string
          is_vacation: boolean
          last_synced: string | null
          listing_count: number
          market_context_score: number | null
          return_policy: string | null
          review_avg: number | null
          review_count: number | null
          shipping_policy: string | null
          shop_name: string | null
          status_synced_at: string | null
          store_health_score: number | null
          suppression_reasons: string[] | null
          suppression_risk: string | null
          updated_at: string
          user_id: string
          vacation_autoreply: string | null
          vacation_message: string | null
        }
        Insert: {
          competitor_avg_health?: number | null
          connected_at?: string
          created_at?: string
          currency_code?: string | null
          etsy_shop_id: string
          has_banner?: boolean
          has_shop_icon?: boolean
          id?: string
          is_vacation?: boolean
          last_synced?: string | null
          listing_count?: number
          market_context_score?: number | null
          return_policy?: string | null
          review_avg?: number | null
          review_count?: number | null
          shipping_policy?: string | null
          shop_name?: string | null
          status_synced_at?: string | null
          store_health_score?: number | null
          suppression_reasons?: string[] | null
          suppression_risk?: string | null
          updated_at?: string
          user_id: string
          vacation_autoreply?: string | null
          vacation_message?: string | null
        }
        Update: {
          competitor_avg_health?: number | null
          connected_at?: string
          created_at?: string
          currency_code?: string | null
          etsy_shop_id?: string
          has_banner?: boolean
          has_shop_icon?: boolean
          id?: string
          is_vacation?: boolean
          last_synced?: string | null
          listing_count?: number
          market_context_score?: number | null
          return_policy?: string | null
          review_avg?: number | null
          review_count?: number | null
          shipping_policy?: string | null
          shop_name?: string | null
          status_synced_at?: string | null
          store_health_score?: number | null
          suppression_reasons?: string[] | null
          suppression_risk?: string | null
          updated_at?: string
          user_id?: string
          vacation_autoreply?: string | null
          vacation_message?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          pending_change_at: string | null
          pending_price_id: string | null
          pending_tier: string | null
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          pending_change_at?: string | null
          pending_price_id?: string | null
          pending_tier?: string | null
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          pending_change_at?: string | null
          pending_price_id?: string | null
          pending_tier?: string | null
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_rate_limits: {
        Row: {
          created_at: string
          etsy_updated_max: string | null
          id: string
          outcome: string
          source: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          etsy_updated_max?: string | null
          id?: string
          outcome?: string
          source?: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          etsy_updated_max?: string | null
          id?: string
          outcome?: string
          source?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      unanswered_questions: {
        Row: {
          first_asked: string
          frequency: number
          id: string
          last_asked: string
          listing_id: string | null
          page_label: string | null
          question_text: string
          reason: string | null
          status: string
        }
        Insert: {
          first_asked?: string
          frequency?: number
          id?: string
          last_asked?: string
          listing_id?: string | null
          page_label?: string | null
          question_text: string
          reason?: string | null
          status?: string
        }
        Update: {
          first_asked?: string
          frequency?: number
          id?: string
          last_asked?: string
          listing_id?: string | null
          page_label?: string | null
          question_text?: string
          reason?: string | null
          status?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          admin_reason: string | null
          award_method: string
          awarded_at: string | null
          awarded_by_admin: string | null
          hidden_from_user: boolean
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          is_valid: boolean | null
          toast_delivered: boolean | null
          trigger_snapshot: Json
          user_id: string
        }
        Insert: {
          achievement_id: string
          admin_reason?: string | null
          award_method: string
          awarded_at?: string | null
          awarded_by_admin?: string | null
          hidden_from_user?: boolean
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          is_valid?: boolean | null
          toast_delivered?: boolean | null
          trigger_snapshot?: Json
          user_id: string
        }
        Update: {
          achievement_id?: string
          admin_reason?: string | null
          award_method?: string
          awarded_at?: string | null
          awarded_by_admin?: string | null
          hidden_from_user?: boolean
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          is_valid?: boolean | null
          toast_delivered?: boolean | null
          trigger_snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_days: {
        Row: {
          day: string
          user_id: string
        }
        Insert: {
          day: string
          user_id: string
        }
        Update: {
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      user_event_counters: {
        Row: {
          metric: string
          updated_at: string | null
          user_id: string
          value: number
        }
        Insert: {
          metric: string
          updated_at?: string | null
          user_id: string
          value?: number
        }
        Update: {
          metric?: string
          updated_at?: string | null
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      user_listing_actions: {
        Row: {
          action_source: string | null
          action_type: string
          after_value: Json | null
          attribution_window_ends: string | null
          before_value: Json | null
          id: string
          listing_id: string
          performed_at: string | null
          revert_reason: string | null
          reverted_at: string | null
          user_id: string
        }
        Insert: {
          action_source?: string | null
          action_type: string
          after_value?: Json | null
          attribution_window_ends?: string | null
          before_value?: Json | null
          id?: string
          listing_id: string
          performed_at?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          user_id: string
        }
        Update: {
          action_source?: string | null
          action_type?: string
          after_value?: Json | null
          attribution_window_ends?: string | null
          before_value?: Json | null
          id?: string
          listing_id?: string
          performed_at?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_niche_profiles: {
        Row: {
          detected_at: string | null
          id: string
          keyword_clusters: string[] | null
          last_updated: string | null
          niche_confidence: number | null
          niche_source: string | null
          niches_conflict: boolean | null
          personalization_category: string | null
          price_range: string | null
          primary_niche: string | null
          secondary_niches: string[] | null
          seller_goals: string[] | null
          tag_inference_niche: string | null
          target_customer: string | null
          user_id: string
        }
        Insert: {
          detected_at?: string | null
          id?: string
          keyword_clusters?: string[] | null
          last_updated?: string | null
          niche_confidence?: number | null
          niche_source?: string | null
          niches_conflict?: boolean | null
          personalization_category?: string | null
          price_range?: string | null
          primary_niche?: string | null
          secondary_niches?: string[] | null
          seller_goals?: string[] | null
          tag_inference_niche?: string | null
          target_customer?: string | null
          user_id: string
        }
        Update: {
          detected_at?: string | null
          id?: string
          keyword_clusters?: string[] | null
          last_updated?: string | null
          niche_confidence?: number | null
          niche_source?: string | null
          niches_conflict?: boolean | null
          personalization_category?: string | null
          price_range?: string | null
          primary_niche?: string | null
          secondary_niches?: string[] | null
          seller_goals?: string[] | null
          tag_inference_niche?: string | null
          target_customer?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          achievement_emails: boolean | null
          achievement_sounds: boolean | null
          avatar_url: string | null
          created_at: string
          data_contributes_to_platform: boolean | null
          email: string | null
          full_name: string | null
          id: string
          invite_code: string | null
          invite_code_redeemed_at: string | null
          is_affiliate: boolean
          last_pipeline_run: string | null
          last_seen_at: string | null
          market_intelligence_initialized: boolean | null
          niche_detected: boolean | null
          preferred_theme: string | null
          sanity_check_disabled_types: string[]
          settings: Json | null
          tier: string
          unlimited_quota: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          achievement_emails?: boolean | null
          achievement_sounds?: boolean | null
          avatar_url?: string | null
          created_at?: string
          data_contributes_to_platform?: boolean | null
          email?: string | null
          full_name?: string | null
          id: string
          invite_code?: string | null
          invite_code_redeemed_at?: string | null
          is_affiliate?: boolean
          last_pipeline_run?: string | null
          last_seen_at?: string | null
          market_intelligence_initialized?: boolean | null
          niche_detected?: boolean | null
          preferred_theme?: string | null
          sanity_check_disabled_types?: string[]
          settings?: Json | null
          tier?: string
          unlimited_quota?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          achievement_emails?: boolean | null
          achievement_sounds?: boolean | null
          avatar_url?: string | null
          created_at?: string
          data_contributes_to_platform?: boolean | null
          email?: string | null
          full_name?: string | null
          id?: string
          invite_code?: string | null
          invite_code_redeemed_at?: string | null
          is_affiliate?: boolean
          last_pipeline_run?: string | null
          last_seen_at?: string | null
          market_intelligence_initialized?: boolean | null
          niche_detected?: boolean | null
          preferred_theme?: string | null
          sanity_check_disabled_types?: string[]
          settings?: Json | null
          tier?: string
          unlimited_quota?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wins_feed: {
        Row: {
          attribution_id: string | null
          created_at: string
          headline: string
          id: string
          kind: string
          listing_id: string
          metric_value: number | null
          seen_at: string | null
          user_id: string
          window_days: number | null
        }
        Insert: {
          attribution_id?: string | null
          created_at?: string
          headline: string
          id?: string
          kind: string
          listing_id: string
          metric_value?: number | null
          seen_at?: string | null
          user_id: string
          window_days?: number | null
        }
        Update: {
          attribution_id?: string | null
          created_at?: string
          headline?: string
          id?: string
          kind?: string
          listing_id?: string
          metric_value?: number | null
          seen_at?: string | null
          user_id?: string
          window_days?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      etsy_connection_status: {
        Row: {
          created_at: string | null
          expires_at: string | null
          shop_id: string | null
          shop_name: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          shop_id?: string | null
          shop_name?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          shop_id?: string | null
          shop_name?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_optimization_performance: {
        Row: {
          avg_favorites_lift_pct: number | null
          avg_sales_lift_pct: number | null
          avg_score_delta: number | null
          avg_views_lift_pct: number | null
          positive_sales_count: number | null
          positive_views_count: number | null
          sample_size: number | null
          user_id: string | null
          window_days: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      consume_chat_message: {
        Args: {
          _free_limit?: number
          _starter_limit?: number
          _user_id: string
        }
        Returns: Json
      }
      consume_grade: {
        Args: { _free_limit?: number; _user_id: string }
        Returns: Json
      }
      consume_optimization: {
        Args: { _free_limit?: number; _user_id: string }
        Returns: Json
      }
      consume_personal_quota: {
        Args: { _kind: string; _user_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_waitlist_stats: { Args: never; Returns: Json }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_event_counter: {
        Args: { p_by?: number; p_metric: string; p_user_id: string }
        Returns: undefined
      }
      is_achievements_enabled: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      match_similar_listings: {
        Args: { _listing_id: string; _match_count?: number }
        Returns: {
          listing_id: string
          similarity: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_store_velocity: { Args: { _user_id: string }; Returns: undefined }
      refund_grade: { Args: { _user_id: string }; Returns: undefined }
      set_event_counter_max: {
        Args: { p_metric: string; p_user_id: string; p_value: number }
        Returns: undefined
      }
      user_profile_privileged_unchanged: {
        Args: {
          _id: string
          _invite_code: string
          _invite_code_redeemed_at: string
          _is_affiliate: boolean
          _tier: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
