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
      alerts: {
        Row: {
          anomaly_id: string
          channel: string
          created_at: string
          dedupe_key: string
          delivery_status: string
          id: string
          sent_at: string | null
        }
        Insert: {
          anomaly_id: string
          channel: string
          created_at?: string
          dedupe_key: string
          delivery_status: string
          id?: string
          sent_at?: string | null
        }
        Update: {
          anomaly_id?: string
          channel?: string
          created_at?: string
          dedupe_key?: string
          delivery_status?: string
          id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_anomaly_id_fkey"
            columns: ["anomaly_id"]
            isOneToOne: false
            referencedRelation: "anomalies"
            referencedColumns: ["id"]
          },
        ]
      }
      anomalies: {
        Row: {
          confidence: string | null
          confirmed_at: string | null
          departure_date: string
          destination: string
          explanation_json: Json
          first_detected_at: string
          higher_cabin: string | null
          higher_cabin_price: number | null
          historical_mad: number | null
          historical_median: number | null
          historical_percentile: number | null
          id: string
          lower_cabin: string | null
          lower_cabin_price: number | null
          origin: string
          resolved_at: string | null
          return_date: string | null
          severity: string
          spread_amount: number | null
          spread_pct: number | null
          type: string
          watch_id: string
        }
        Insert: {
          confidence?: string | null
          confirmed_at?: string | null
          departure_date: string
          destination: string
          explanation_json?: Json
          first_detected_at?: string
          higher_cabin?: string | null
          higher_cabin_price?: number | null
          historical_mad?: number | null
          historical_median?: number | null
          historical_percentile?: number | null
          id?: string
          lower_cabin?: string | null
          lower_cabin_price?: number | null
          origin: string
          resolved_at?: string | null
          return_date?: string | null
          severity: string
          spread_amount?: number | null
          spread_pct?: number | null
          type: string
          watch_id: string
        }
        Update: {
          confidence?: string | null
          confirmed_at?: string | null
          departure_date?: string
          destination?: string
          explanation_json?: Json
          first_detected_at?: string
          higher_cabin?: string | null
          higher_cabin_price?: number | null
          historical_mad?: number | null
          historical_median?: number | null
          historical_percentile?: number | null
          id?: string
          lower_cabin?: string | null
          lower_cabin_price?: number | null
          origin?: string
          resolved_at?: string | null
          return_date?: string | null
          severity?: string
          spread_amount?: number | null
          spread_pct?: number | null
          type?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomalies_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_reconfirmations: {
        Row: {
          anomaly_id: string
          anomaly_snapshot: Json
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          generation: number
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          lifetime_attempts: number
          next_attempt_at: string
          state: string
          watch_snapshot: Json
        }
        Insert: {
          anomaly_id: string
          anomaly_snapshot: Json
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          generation?: number
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          lifetime_attempts?: number
          next_attempt_at?: string
          state?: string
          watch_snapshot: Json
        }
        Update: {
          anomaly_id?: string
          anomaly_snapshot?: Json
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          generation?: number
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          lifetime_attempts?: number
          next_attempt_at?: string
          state?: string
          watch_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_reconfirmations_anomaly_id_fkey"
            columns: ["anomaly_id"]
            isOneToOne: true
            referencedRelation: "anomalies"
            referencedColumns: ["id"]
          },
        ]
      }
      comparison_history_snapshots: {
        Row: {
          acquisition_batch_id: string
          currency: string
          departure_date: string
          destination: string
          higher_cabin: string
          higher_cabin_price: number
          higher_observation_id: string
          historical_context: Json
          id: string
          lower_cabin: string
          lower_cabin_price: number
          lower_observation_id: string
          origin: string
          outbound_stop_bucket: string
          passengers: number
          return_date: string | null
          return_stop_bucket: string
          spread_amount: number
          spread_pct: number
          updated_at: string
          watch_id: string
        }
        Insert: {
          acquisition_batch_id: string
          currency: string
          departure_date: string
          destination: string
          higher_cabin: string
          higher_cabin_price: number
          higher_observation_id: string
          historical_context: Json
          id: string
          lower_cabin: string
          lower_cabin_price: number
          lower_observation_id: string
          origin: string
          outbound_stop_bucket: string
          passengers: number
          return_date?: string | null
          return_stop_bucket: string
          spread_amount: number
          spread_pct: number
          updated_at?: string
          watch_id: string
        }
        Update: {
          acquisition_batch_id?: string
          currency?: string
          departure_date?: string
          destination?: string
          higher_cabin?: string
          higher_cabin_price?: number
          higher_observation_id?: string
          historical_context?: Json
          id?: string
          lower_cabin?: string
          lower_cabin_price?: number
          lower_observation_id?: string
          origin?: string
          outbound_stop_bucket?: string
          passengers?: number
          return_date?: string | null
          return_stop_bucket?: string
          spread_amount?: number
          spread_pct?: number
          updated_at?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparison_history_snapshots_higher_observation_id_fkey"
            columns: ["higher_observation_id"]
            isOneToOne: false
            referencedRelation: "fare_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparison_history_snapshots_lower_observation_id_fkey"
            columns: ["lower_observation_id"]
            isOneToOne: false
            referencedRelation: "fare_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparison_history_snapshots_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_observations: {
        Row: {
          airline: string | null
          booking_url: string | null
          cabin: string
          confirmed: boolean
          currency: string
          departure_date: string
          destination: string
          duration_outbound_minutes: number | null
          duration_return_minutes: number | null
          flight_numbers: string[]
          id: string
          observed_at: string
          origin: string
          provider: string
          quality_eligible: boolean
          raw_payload_json: Json
          return_date: string | null
          search_run_id: string
          stops_outbound: number | null
          stops_return: number | null
          total_price: number
          watch_id: string
        }
        Insert: {
          airline?: string | null
          booking_url?: string | null
          cabin: string
          confirmed?: boolean
          currency: string
          departure_date: string
          destination: string
          duration_outbound_minutes?: number | null
          duration_return_minutes?: number | null
          flight_numbers?: string[]
          id?: string
          observed_at: string
          origin: string
          provider: string
          quality_eligible?: boolean
          raw_payload_json?: Json
          return_date?: string | null
          search_run_id: string
          stops_outbound?: number | null
          stops_return?: number | null
          total_price: number
          watch_id: string
        }
        Update: {
          airline?: string | null
          booking_url?: string | null
          cabin?: string
          confirmed?: boolean
          currency?: string
          departure_date?: string
          destination?: string
          duration_outbound_minutes?: number | null
          duration_return_minutes?: number | null
          flight_numbers?: string[]
          id?: string
          observed_at?: string
          origin?: string
          provider?: string
          quality_eligible?: boolean
          raw_payload_json?: Json
          return_date?: string | null
          search_run_id?: string
          stops_outbound?: number | null
          stops_return?: number | null
          total_price?: number
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fare_observations_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fare_observations_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      search_candidates: {
        Row: {
          active: boolean
          cabin: string
          created_at: string
          departure_date: string
          destination: string
          id: string
          last_scanned_at: string | null
          lease_expires_at: string | null
          lease_token: string | null
          next_scan_at: string | null
          origin: string
          priority: number
          return_date: string | null
          scan_count: number
          watch_id: string
        }
        Insert: {
          active?: boolean
          cabin: string
          created_at?: string
          departure_date: string
          destination: string
          id?: string
          last_scanned_at?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_scan_at?: string | null
          origin: string
          priority?: number
          return_date?: string | null
          scan_count?: number
          watch_id: string
        }
        Update: {
          active?: boolean
          cabin?: string
          created_at?: string
          departure_date?: string
          destination?: string
          id?: string
          last_scanned_at?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_scan_at?: string | null
          origin?: string
          priority?: number
          return_date?: string | null
          scan_count?: number
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_candidates_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      search_runs: {
        Row: {
          acquisition_batch_id: string | null
          candidate_id: string
          completeness_score: number
          error_code: string | null
          error_message: string | null
          finished_at: string
          id: string
          latency_ms: number | null
          provider: string
          reconfirmation_anomaly_id: string | null
          reconfirmation_lease_token: string | null
          request_max_duration_minutes: number | null
          request_max_stops: number | null
          request_passengers: number | null
          result_count: number
          retry_count: number
          started_at: string
          status: string
          watch_id: string
        }
        Insert: {
          acquisition_batch_id?: string | null
          candidate_id: string
          completeness_score: number
          error_code?: string | null
          error_message?: string | null
          finished_at: string
          id?: string
          latency_ms?: number | null
          provider: string
          reconfirmation_anomaly_id?: string | null
          reconfirmation_lease_token?: string | null
          request_max_duration_minutes?: number | null
          request_max_stops?: number | null
          request_passengers?: number | null
          result_count?: number
          retry_count?: number
          started_at: string
          status: string
          watch_id: string
        }
        Update: {
          acquisition_batch_id?: string | null
          candidate_id?: string
          completeness_score?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string
          id?: string
          latency_ms?: number | null
          provider?: string
          reconfirmation_anomaly_id?: string | null
          reconfirmation_lease_token?: string | null
          request_max_duration_minutes?: number | null
          request_max_stops?: number | null
          request_passengers?: number | null
          result_count?: number
          retry_count?: number
          started_at?: string
          status?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_runs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "search_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_runs_reconfirmation_anomaly_id_fkey"
            columns: ["reconfirmation_anomaly_id"]
            isOneToOne: false
            referencedRelation: "anomalies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_runs_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_planning_state: {
        Row: {
          completed_cycles: number
          last_planned_at: string
          next_departure_date: string
          next_trip_nights: number
          updated_at: string
          watch_id: string
        }
        Insert: {
          completed_cycles?: number
          last_planned_at?: string
          next_departure_date: string
          next_trip_nights: number
          updated_at?: string
          watch_id: string
        }
        Update: {
          completed_cycles?: number
          last_planned_at?: string
          next_departure_date?: string
          next_trip_nights?: number
          updated_at?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_planning_state_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: true
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      watches: {
        Row: {
          active: boolean
          business_vs_pe_pct: number
          cabins: string[]
          created_at: string
          date_mode: string
          destination_airports: string[]
          exact_departure_date: string | null
          exact_return_date: string | null
          id: string
          max_duration_minutes: number | null
          max_stops: number | null
          max_trip_nights: number | null
          min_trip_nights: number | null
          name: string
          origin_airports: string[]
          passengers: number
          pe_near_inversion_pct: number
          rolling_horizon_days: number | null
          updated_at: string
          user_id: string
          window_departure_end: string | null
          window_departure_start: string | null
        }
        Insert: {
          active?: boolean
          business_vs_pe_pct?: number
          cabins: string[]
          created_at?: string
          date_mode: string
          destination_airports: string[]
          exact_departure_date?: string | null
          exact_return_date?: string | null
          id?: string
          max_duration_minutes?: number | null
          max_stops?: number | null
          max_trip_nights?: number | null
          min_trip_nights?: number | null
          name: string
          origin_airports: string[]
          passengers?: number
          pe_near_inversion_pct?: number
          rolling_horizon_days?: number | null
          updated_at?: string
          user_id: string
          window_departure_end?: string | null
          window_departure_start?: string | null
        }
        Update: {
          active?: boolean
          business_vs_pe_pct?: number
          cabins?: string[]
          created_at?: string
          date_mode?: string
          destination_airports?: string[]
          exact_departure_date?: string | null
          exact_return_date?: string | null
          id?: string
          max_duration_minutes?: number | null
          max_stops?: number | null
          max_trip_nights?: number | null
          min_trip_nights?: number | null
          name?: string
          origin_airports?: string[]
          passengers?: number
          pe_near_inversion_pct?: number
          rolling_horizon_days?: number | null
          updated_at?: string
          user_id?: string
          window_departure_end?: string | null
          window_departure_start?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_anomaly_reconfirmations: {
        Args: { p_lease_token: string; p_limit: number }
        Returns: {
          anomaly_id: string
          anomaly_snapshot: Json
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          generation: number
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          lifetime_attempts: number
          next_attempt_at: string
          state: string
          watch_snapshot: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "anomaly_reconfirmations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_search_candidates: {
        Args: {
          p_lease_seconds?: number
          p_lease_token: string
          p_limit: number
        }
        Returns: {
          active: boolean
          cabin: string
          created_at: string
          departure_date: string
          destination: string
          id: string
          last_scanned_at: string | null
          lease_expires_at: string | null
          lease_token: string | null
          next_scan_at: string | null
          origin: string
          priority: number
          return_date: string | null
          scan_count: number
          watch_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "search_candidates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_search_candidate: {
        Args: {
          p_candidate_id: string
          p_lease_token: string
          p_next_scan_at: string
        }
        Returns: boolean
      }
      deactivate_search_candidates_outside_window: {
        Args: {
          p_first_departure: string
          p_last_departure: string
          p_watch_id: string
        }
        Returns: number
      }
      fare_stop_bucket: { Args: { p_stops: number }; Returns: string }
      finish_anomaly_reconfirmation: {
        Args: {
          p_anomaly_id: string
          p_error_code?: string
          p_higher_run_id?: string
          p_lease_token: string
          p_lower_run_id?: string
        }
        Returns: string
      }
      get_historical_comparison_context: {
        Args: {
          p_higher_observation_id: string
          p_lower_observation_id: string
          p_watch_id: string
        }
        Returns: Json
      }
      historical_fare_samples: {
        Args: { p_watch_id: string }
        Returns: {
          acquisition_batch_id: string
          cabin: string
          candidate_id: string
          currency: string
          departure_date: string
          destination: string
          max_duration_minutes: number
          max_stops: number
          observation_id: string
          observed_at: string
          origin: string
          outbound_stop_bucket: string
          passengers: number
          return_date: string
          return_stop_bucket: string
          run_finished_at: string
          run_started_at: string
          search_run_id: string
          total_price: number
          watch_id: string
        }[]
      }
      historical_numeric_summary: {
        Args: { p_current: number; p_values: number[] }
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
