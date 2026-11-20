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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          action: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          organization_id: string
          request_note: string | null
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
          turnover_id: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id: string
          request_note?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["approval_status"]
          turnover_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id?: string
          request_note?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["approval_status"]
          turnover_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_turnover_id_fkey"
            columns: ["turnover_id"]
            isOneToOne: false
            referencedRelation: "turnovers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          actor_id: string | null
          created_at: string
          key: string
          organization_id: string
          result: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          key: string
          organization_id: string
          result?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          key?: string
          organization_id?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          checklist: Json
          completed_at: string | null
          created_at: string
          evidence_url: string | null
          id: string
          inspector_id: string | null
          kind: Database["public"]["Enums"]["inspection_kind"]
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["inspection_status"]
          turnover_id: string
          updated_at: string
        }
        Insert: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          inspector_id?: string | null
          kind: Database["public"]["Enums"]["inspection_kind"]
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["inspection_status"]
          turnover_id: string
          updated_at?: string
        }
        Update: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          inspector_id?: string | null
          kind?: Database["public"]["Enums"]["inspection_kind"]
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["inspection_status"]
          turnover_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_turnover_id_fkey"
            columns: ["turnover_id"]
            isOneToOne: false
            referencedRelation: "turnovers"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          organization_id: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          organization_id: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          id: string
          is_demo: boolean
          monthly_rent: number | null
          organization_id: string
          property_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_demo?: boolean
          monthly_rent?: number | null
          organization_id: string
          property_id: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          monthly_rent?: number | null
          organization_id?: string
          property_id?: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      turnover_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          evidence_note: string | null
          evidence_url: string | null
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          turnover_id: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          organization_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          turnover_id: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          turnover_id?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnover_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnover_tasks_turnover_id_fkey"
            columns: ["turnover_id"]
            isOneToOne: false
            referencedRelation: "turnovers"
            referencedColumns: ["id"]
          },
        ]
      }
      turnovers: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string
          hold_kind: Database["public"]["Enums"]["hold_kind"] | null
          hold_reason: string | null
          id: string
          move_in_date: string | null
          move_out_date: string
          notes: string | null
          organization_id: string
          room_id: string
          status: Database["public"]["Enums"]["turnover_status"]
          target_ready_date: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by: string
          hold_kind?: Database["public"]["Enums"]["hold_kind"] | null
          hold_reason?: string | null
          id?: string
          move_in_date?: string | null
          move_out_date: string
          notes?: string | null
          organization_id: string
          room_id: string
          status?: Database["public"]["Enums"]["turnover_status"]
          target_ready_date?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string
          hold_kind?: Database["public"]["Enums"]["hold_kind"] | null
          hold_reason?: string | null
          id?: string
          move_in_date?: string | null
          move_out_date?: string
          notes?: string | null
          organization_id?: string
          room_id?: string
          status?: Database["public"]["Enums"]["turnover_status"]
          target_ready_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnovers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnovers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _id: string
          _org: string
          _type: string
        }
        Returns: undefined
      }
      _require_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: undefined
      }
      _room_status_for: {
        Args: { _s: Database["public"]["Enums"]["turnover_status"] }
        Returns: Database["public"]["Enums"]["room_status"]
      }
      add_member_by_email: {
        Args: {
          _email: string
          _org: string
          _role: Database["public"]["Enums"]["org_role"]
        }
        Returns: string
      }
      create_organization: { Args: { _name: string }; Returns: string }
      decide_approval: {
        Args: { _approval: string; _approve: boolean; _note: string }
        Returns: undefined
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      open_turnover: {
        Args: {
          _idem: string
          _move_out: string
          _notes: string
          _room: string
          _target: string
        }
        Returns: string
      }
      record_inspection: {
        Args: {
          _checklist: Json
          _evidence_url: string
          _kind: Database["public"]["Enums"]["inspection_kind"]
          _notes: string
          _turnover: string
        }
        Returns: undefined
      }
      remove_member: {
        Args: { _org: string; _user: string }
        Returns: undefined
      }
      request_publish_approval: {
        Args: { _note: string; _turnover: string }
        Returns: string
      }
      seed_demo_data: { Args: { _org: string }; Returns: string }
      set_turnover_hold: {
        Args: {
          _kind: Database["public"]["Enums"]["hold_kind"]
          _reason: string
          _turnover: string
        }
        Returns: undefined
      }
      transition_turnover: {
        Args: {
          _from: Database["public"]["Enums"]["turnover_status"]
          _idem: string
          _move_in?: string
          _note: string
          _to: Database["public"]["Enums"]["turnover_status"]
          _turnover: string
        }
        Returns: Database["public"]["Enums"]["turnover_status"]
      }
      update_member_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["org_role"]
          _user: string
        }
        Returns: undefined
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      hold_kind: "blocked" | "paused"
      inspection_kind: "exit" | "review"
      inspection_status: "pending" | "completed"
      org_role: "owner" | "manager" | "staff" | "viewer"
      room_status:
        | "occupied"
        | "notice"
        | "turnover"
        | "available"
        | "reserved"
        | "out_of_service"
      task_status: "pending" | "in_progress" | "done" | "cancelled"
      task_type:
        | "cleaning"
        | "maintenance"
        | "painting"
        | "inventory"
        | "photos"
        | "other"
      turnover_status:
        | "exit_announced"
        | "exit_confirmed"
        | "inspection_pending"
        | "preparation_in_progress"
        | "ready_for_review"
        | "marketing_approval_pending"
        | "available_for_leasing"
        | "reserved"
        | "move_in_completed"
        | "closed"
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
    Enums: {
      approval_status: ["pending", "approved", "rejected"],
      hold_kind: ["blocked", "paused"],
      inspection_kind: ["exit", "review"],
      inspection_status: ["pending", "completed"],
      org_role: ["owner", "manager", "staff", "viewer"],
      room_status: [
        "occupied",
        "notice",
        "turnover",
        "available",
        "reserved",
        "out_of_service",
      ],
      task_status: ["pending", "in_progress", "done", "cancelled"],
      task_type: [
        "cleaning",
        "maintenance",
        "painting",
        "inventory",
        "photos",
        "other",
      ],
      turnover_status: [
        "exit_announced",
        "exit_confirmed",
        "inspection_pending",
        "preparation_in_progress",
        "ready_for_review",
        "marketing_approval_pending",
        "available_for_leasing",
        "reserved",
        "move_in_completed",
        "closed",
      ],
    },
  },
} as const
