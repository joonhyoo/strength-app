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
      athlete_exercises: {
        Row: {
          athlete_workout_id: string
          complete: boolean
          exercise_id: string
          id: string
          note: string | null
          position: number
        }
        Insert: {
          athlete_workout_id: string
          complete?: boolean
          exercise_id: string
          id?: string
          note?: string | null
          position: number
        }
        Update: {
          athlete_workout_id?: string
          complete?: boolean
          exercise_id?: string
          id?: string
          note?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "athlete_exercises_athlete_workout_id_fkey"
            columns: ["athlete_workout_id"]
            isOneToOne: false
            referencedRelation: "athlete_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_sets: {
        Row: {
          athlete_exercise_id: string
          id: string
          reps: number | null
          set_number: number
          target_reps: number
          weight: string | null
        }
        Insert: {
          athlete_exercise_id: string
          id?: string
          reps?: number | null
          set_number: number
          target_reps: number
          weight?: string | null
        }
        Update: {
          athlete_exercise_id?: string
          id?: string
          reps?: number | null
          set_number?: number
          target_reps?: number
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_sets_athlete_exercise_id_fkey"
            columns: ["athlete_exercise_id"]
            isOneToOne: false
            referencedRelation: "athlete_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_workouts: {
        Row: {
          athlete_id: string
          id: string
          program_assignment_id: string | null
          scheduled_date: string
          session_id: string | null
        }
        Insert: {
          athlete_id: string
          id?: string
          program_assignment_id?: string | null
          scheduled_date: string
          session_id?: string | null
        }
        Update: {
          athlete_id?: string
          id?: string
          program_assignment_id?: string | null
          scheduled_date?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_workouts_program_assignment_id_fkey"
            columns: ["program_assignment_id"]
            isOneToOne: false
            referencedRelation: "program_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_workouts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_invites: {
        Row: {
          coach_id: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          color_key: string
          goal: string
          id: string
          name: string
          position: number
          program_id: string
        }
        Insert: {
          color_key?: string
          goal?: string
          id?: string
          name: string
          position: number
          program_id: string
        }
        Update: {
          color_key?: string
          goal?: string
          id?: string
          name?: string
          position?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string
          id: string
          name: string
          video_url: string | null
        }
        Insert: {
          category: string
          id?: string
          name: string
          video_url?: string | null
        }
        Update: {
          category?: string
          id?: string
          name?: string
          video_url?: string | null
        }
        Relationships: []
      }
      profile_private: {
        Row: {
          id: string
          username: string
        }
        Insert: {
          id: string
          username: string
        }
        Update: {
          id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          coach_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          role: string
          terms_accepted_at: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          email?: string | null
          id: string
          name: string
          notes?: string | null
          role: string
          terms_accepted_at?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          role?: string
          terms_accepted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_assignments: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          program_id: string
          start_date: string
          status: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          program_id: string
          start_date: string
          status?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          program_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          exercise_id: string
          id: string
          note: string
          position: number
          session_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          note?: string
          position: number
          session_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          note?: string
          position?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sets: {
        Row: {
          id: string
          program_exercise_id: string
          set_number: number
          target_reps: number
        }
        Insert: {
          id?: string
          program_exercise_id: string
          set_number: number
          target_reps: number
        }
        Update: {
          id?: string
          program_exercise_id?: string
          set_number?: number
          target_reps?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_sets_program_exercise_id_fkey"
            columns: ["program_exercise_id"]
            isOneToOne: false
            referencedRelation: "program_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          coach_id: string
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string
          id?: string
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          day_number: number
          id: string
          name: string
          week_id: string
        }
        Insert: {
          day_number: number
          id?: string
          name?: string
          week_id: string
        }
        Update: {
          day_number?: number
          id?: string
          name?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          cycle_id: string
          id: string
          week_number: number
        }
        Insert: {
          cycle_id: string
          id?: string
          week_number: number
        }
        Update: {
          cycle_id?: string
          id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weeks_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_terms: { Args: never; Returns: undefined }
      assign_program: {
        Args: {
          p_athlete_id: string
          p_program_id: string
          p_start_date: string
        }
        Returns: string
      }
      claim_invite: { Args: never; Returns: undefined }
      complete_profile: {
        Args: { p_name: string; p_username: string }
        Returns: undefined
      }
      invite_athlete: { Args: { p_email: string }; Returns: undefined }
      is_coach: { Args: never; Returns: boolean }
      is_cycle_owner: { Args: { p_cycle_id: string }; Returns: boolean }
      is_my_athlete: { Args: { p_athlete_id: string }; Returns: boolean }
      is_program_owner: { Args: { p_program_id: string }; Returns: boolean }
      is_session_owner: { Args: { p_session_id: string }; Returns: boolean }
      is_week_owner: { Args: { p_week_id: string }; Returns: boolean }
      remove_athlete: { Args: { p_athlete_id: string }; Returns: undefined }
      revoke_invite: { Args: { p_email: string }; Returns: undefined }
      shift_program_schedule: {
        Args: {
          p_assignment_id: string
          p_from_date: string
          p_shift_weeks: number
        }
        Returns: number
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
    Enums: {},
  },
} as const

