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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          ai_score: number | null
          ai_skills: Json | null
          ai_summary: string | null
          aptitude_completed: boolean | null
          aptitude_score: number | null
          candidate_id: string
          created_at: string
          id: string
          job_id: string
          notes: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          ai_score?: number | null
          ai_skills?: Json | null
          ai_summary?: string | null
          aptitude_completed?: boolean | null
          aptitude_score?: number | null
          candidate_id: string
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          ai_score?: number | null
          ai_skills?: Json | null
          ai_summary?: string | null
          aptitude_completed?: boolean | null
          aptitude_score?: number | null
          candidate_id?: string
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      aptitude_answers: {
        Row: {
          application_id: string
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option?: string
        }
        Relationships: [
          {
            foreignKeyName: "aptitude_answers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aptitude_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "aptitude_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      aptitude_questions: {
        Row: {
          category: string
          correct_option: string
          created_at: string
          difficulty: string
          id: string
          is_active: boolean
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          updated_at: string
        }
        Insert: {
          category?: string
          correct_option: string
          created_at?: string
          difficulty?: string
          id?: string
          is_active?: boolean
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          updated_at?: string
        }
        Update: {
          category?: string
          correct_option?: string
          created_at?: string
          difficulty?: string
          id?: string
          is_active?: boolean
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          access_token: string | null
          created_at: string
          email: string
          full_name: string
          github_url: string | null
          id: string
          linkedin_url: string | null
          parsed_resume: Json | null
          phone: string | null
          portfolio_analysis: Json | null
          portfolio_url: string | null
          resume_text: string | null
          resume_url: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email: string
          full_name: string
          github_url?: string | null
          id?: string
          linkedin_url?: string | null
          parsed_resume?: Json | null
          phone?: string | null
          portfolio_analysis?: Json | null
          portfolio_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email?: string
          full_name?: string
          github_url?: string | null
          id?: string
          linkedin_url?: string | null
          parsed_resume?: Json | null
          phone?: string | null
          portfolio_analysis?: Json | null
          portfolio_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          candidate_id: string | null
          email_type: string
          id: string
          recipient_email: string
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          candidate_id?: string | null
          email_type: string
          id?: string
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
        }
        Update: {
          candidate_id?: string | null
          email_type?: string
          id?: string
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          email_type: string
          id: string
          is_default: boolean
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          email_type: string
          id?: string
          is_default?: boolean
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          email_type?: string
          id?: string
          is_default?: boolean
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_google_tokens: {
        Row: {
          access_token: string
          created_at: string
          id: string
          refresh_token: string
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          refresh_token: string
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          refresh_token?: string
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          interview_type: string
          meeting_id: string | null
          meeting_url: string | null
          notes: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          interview_type?: string
          meeting_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          interview_type?: string
          meeting_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_hr_id: string | null
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          id: string
          is_active: boolean
          job_type: string
          location: string
          requirements: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_hr_id?: string | null
          created_at?: string
          created_by?: string | null
          department: string
          description?: string | null
          id?: string
          is_active?: boolean
          job_type?: string
          location: string
          requirements?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_hr_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          is_active?: boolean
          job_type?: string
          location?: string
          requirements?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_letters: {
        Row: {
          additional_notes: string | null
          application_id: string
          benefits_package: string | null
          bonus_structure: string | null
          created_at: string
          created_by: string | null
          department: string
          employment_type: string
          equity_details: string | null
          id: string
          notice_period_days: number | null
          offer_expiry_date: string | null
          position_title: string
          probation_period_months: number | null
          proposed_start_date: string
          remote_policy: string | null
          reporting_manager: string | null
          salary_amount: number
          salary_currency: string
          salary_frequency: string
          sent_at: string | null
          sick_leave_days: number | null
          status: string
          updated_at: string
          vacation_days: number | null
          work_location: string
        }
        Insert: {
          additional_notes?: string | null
          application_id: string
          benefits_package?: string | null
          bonus_structure?: string | null
          created_at?: string
          created_by?: string | null
          department: string
          employment_type?: string
          equity_details?: string | null
          id?: string
          notice_period_days?: number | null
          offer_expiry_date?: string | null
          position_title: string
          probation_period_months?: number | null
          proposed_start_date: string
          remote_policy?: string | null
          reporting_manager?: string | null
          salary_amount: number
          salary_currency?: string
          salary_frequency?: string
          sent_at?: string | null
          sick_leave_days?: number | null
          status?: string
          updated_at?: string
          vacation_days?: number | null
          work_location: string
        }
        Update: {
          additional_notes?: string | null
          application_id?: string
          benefits_package?: string | null
          bonus_structure?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          employment_type?: string
          equity_details?: string | null
          id?: string
          notice_period_days?: number | null
          offer_expiry_date?: string | null
          position_title?: string
          probation_period_months?: number | null
          proposed_start_date?: string
          remote_policy?: string | null
          reporting_manager?: string | null
          salary_amount?: number
          salary_currency?: string
          salary_frequency?: string
          sent_at?: string | null
          sick_leave_days?: number | null
          status?: string
          updated_at?: string
          vacation_days?: number | null
          work_location?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_letters_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hr_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "recruiter" | "hr_manager"
      application_status:
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
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
      app_role: ["admin", "recruiter", "hr_manager"],
      application_status: [
        "applied",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
      ],
    },
  },
} as const
