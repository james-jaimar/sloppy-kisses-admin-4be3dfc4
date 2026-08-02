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
      activity_log: {
        Row: {
          activity_type: string
          actor_profile_id: string | null
          booking_id: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          id: string
          metadata: Json
          pet_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          activity_type: string
          actor_profile_id?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          pet_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          activity_type?: string
          actor_profile_id?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          pet_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_runs: {
        Row: {
          created_at: string
          id: string
          invoices_created: number
          invoices_updated: number
          issued_count: number
          notes: string | null
          period_end: string
          period_start: string
          run_by: string | null
          service: string
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoices_created?: number
          invoices_updated?: number
          issued_count?: number
          notes?: string | null
          period_end: string
          period_start: string
          run_by?: string | null
          service?: string
          tenant_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoices_created?: number
          invoices_updated?: number
          issued_count?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          run_by?: string | null
          service?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pets: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          pet_id: string
          tenant_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          pet_id: string
          tenant_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          pet_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          admin_notes: string | null
          alternative_start_at_1: string | null
          alternative_start_at_2: string | null
          converted_booking_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_notes: string | null
          id: string
          kind: Database["public"]["Enums"]["booking_request_kind"]
          pet_id: string | null
          preferred_end_at: string | null
          preferred_start_at: string | null
          related_booking_id: string | null
          request_payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_request_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          alternative_start_at_1?: string | null
          alternative_start_at_2?: string | null
          converted_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_notes?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_request_kind"]
          pet_id?: string | null
          preferred_end_at?: string | null
          preferred_start_at?: string | null
          related_booking_id?: string | null
          request_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          source: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_request_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          alternative_start_at_1?: string | null
          alternative_start_at_2?: string | null
          converted_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_notes?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_request_kind"]
          pet_id?: string | null
          preferred_end_at?: string | null
          preferred_start_at?: string | null
          related_booking_id?: string | null
          request_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_request_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_converted_booking_id_fkey"
            columns: ["converted_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_events: {
        Row: {
          actor_user_id: string | null
          booking_id: string
          created_at: string
          event_kind: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: string
          note: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          event_kind?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          note?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          event_kind?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          note?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_staff_id: string | null
          booking_number: string
          booking_request_id: string | null
          cancellation_reason: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          end_at: string | null
          end_date: string | null
          estimate_id: string | null
          id: string
          invoice_id: string | null
          notes_customer: string | null
          notes_internal: string | null
          recurring_rule_id: string | null
          requires_grooming: boolean
          requires_transport: boolean
          resource_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          source: Database["public"]["Enums"]["booking_source"] | null
          start_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vax_override_at: string | null
          vax_override_by: string | null
          vax_override_reason: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_number: string
          booking_request_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          end_at?: string | null
          end_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          recurring_rule_id?: string | null
          requires_grooming?: boolean
          requires_transport?: boolean
          resource_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          source?: Database["public"]["Enums"]["booking_source"] | null
          start_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vax_override_at?: string | null
          vax_override_by?: string | null
          vax_override_reason?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          booking_number?: string
          booking_request_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          end_at?: string | null
          end_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          recurring_rule_id?: string | null
          requires_grooming?: boolean
          requires_transport?: boolean
          resource_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          source?: Database["public"]["Enums"]["booking_source"] | null
          start_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vax_override_at?: string | null
          vax_override_by?: string | null
          vax_override_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "tenant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vax_override_by_fkey"
            columns: ["vax_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_settings: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          quiet_end: string
          quiet_start: string
          reply_to: string | null
          sms_from: string | null
          tenant_id: string
          test_recipient: string | null
          timezone: string
          updated_at: string
          whatsapp_from: string | null
        }
        Insert: {
          created_at?: string
          from_email?: string
          from_name?: string
          quiet_end?: string
          quiet_start?: string
          reply_to?: string | null
          sms_from?: string | null
          tenant_id: string
          test_recipient?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_from?: string | null
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          quiet_end?: string
          quiet_start?: string
          reply_to?: string | null
          sms_from?: string | null
          tenant_id?: string
          test_recipient?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comms_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_applications: {
        Row: {
          amount: number
          applied_at: string
          applied_by: string | null
          created_at: string
          credit_note_id: string
          id: string
          invoice_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          credit_note_id: string
          id?: string
          invoice_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          credit_note_id?: string
          id?: string
          invoice_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_applications_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_items: {
        Row: {
          created_at: string
          credit_note_id: string
          description: string
          id: string
          line_total: number
          quantity: number
          sort_order: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          credit_note_id: string
          description: string
          id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          tenant_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          credit_note_id?: string
          description?: string
          id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount_applied: number
          balance: number
          created_at: string
          created_by: string | null
          credit_note_number: string
          customer_id: string
          id: string
          invoice_id: string | null
          issue_date: string | null
          notes: string | null
          reason: string | null
          status: Database["public"]["Enums"]["credit_note_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
          xero_credit_note_id: string | null
          xero_credit_note_number: string | null
        }
        Insert: {
          amount_applied?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          credit_note_number: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          issue_date?: string | null
          notes?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          xero_credit_note_id?: string | null
          xero_credit_note_number?: string | null
        }
        Update: {
          amount_applied?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          credit_note_number?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          issue_date?: string | null
          notes?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          xero_credit_note_id?: string | null
          xero_credit_note_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          accepted_at: string
          created_at: string
          customer_id: string
          id: string
          ip_address: unknown
          kind: string
          signature_name: string
          tenant_id: string
          user_agent: string | null
          version_id: string
          version_label: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          customer_id: string
          id?: string
          ip_address?: unknown
          kind: string
          signature_name: string
          tenant_id: string
          user_agent?: string | null
          version_id: string
          version_label: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          customer_id?: string
          id?: string
          ip_address?: unknown
          kind?: string
          signature_name?: string
          tenant_id?: string
          user_agent?: string | null
          version_id?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "tenant_terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          entry_date: string
          entry_type: Database["public"]["Enums"]["customer_credit_entry_type"]
          id: string
          notes: string | null
          source_credit_note_id: string | null
          source_invoice_id: string | null
          source_payment_id: string | null
          source_refund_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          entry_date?: string
          entry_type: Database["public"]["Enums"]["customer_credit_entry_type"]
          id?: string
          notes?: string | null
          source_credit_note_id?: string | null
          source_invoice_id?: string | null
          source_payment_id?: string | null
          source_refund_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["customer_credit_entry_type"]
          id?: string
          notes?: string | null
          source_credit_note_id?: string | null
          source_invoice_id?: string | null
          source_payment_id?: string | null
          source_refund_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_source_credit_note_id_fkey"
            columns: ["source_credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_source_refund_id_fkey"
            columns: ["source_refund_id"]
            isOneToOne: false
            referencedRelation: "payment_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          alert: boolean
          author_profile_id: string | null
          body: string
          created_at: string
          customer_id: string
          id: string
          pinned: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert?: boolean
          author_profile_id?: string | null
          body: string
          created_at?: string
          customer_id: string
          id?: string
          pinned?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert?: boolean
          author_profile_id?: string | null
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          pinned?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          consent_prompted_at: string | null
          created_at: string
          created_by: string | null
          customer_number: string
          email: string | null
          emergency_contact_mobile: string | null
          emergency_contact_name: string | null
          emergency_contact_relationship: string | null
          employer: string | null
          first_name: string | null
          full_name: string
          home_address: string | null
          id: string
          id_number: string | null
          import_batch: string | null
          import_source: string | null
          imported_at: string | null
          last_name: string | null
          legacy_customer_pet_count: number | null
          linked_profile_id: string | null
          mobile: string | null
          notes_internal: string | null
          notify_email: boolean
          notify_sms: boolean
          notify_whatsapp: boolean
          occupation: string | null
          phone_alt: string | null
          portal_access_enabled: boolean
          postcode: string | null
          province: string | null
          signup_status: string
          status: Database["public"]["Enums"]["customer_status"]
          suburb: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vet_clinic_address: string | null
          vet_clinic_contact: string | null
          vet_clinic_name: string | null
          work_address: string | null
          xero_customer_id: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          consent_prompted_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_number: string
          email?: string | null
          emergency_contact_mobile?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employer?: string | null
          first_name?: string | null
          full_name: string
          home_address?: string | null
          id?: string
          id_number?: string | null
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          last_name?: string | null
          legacy_customer_pet_count?: number | null
          linked_profile_id?: string | null
          mobile?: string | null
          notes_internal?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          occupation?: string | null
          phone_alt?: string | null
          portal_access_enabled?: boolean
          postcode?: string | null
          province?: string | null
          signup_status?: string
          status?: Database["public"]["Enums"]["customer_status"]
          suburb?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vet_clinic_address?: string | null
          vet_clinic_contact?: string | null
          vet_clinic_name?: string | null
          work_address?: string | null
          xero_customer_id?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          consent_prompted_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_number?: string
          email?: string | null
          emergency_contact_mobile?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employer?: string | null
          first_name?: string | null
          full_name?: string
          home_address?: string | null
          id?: string
          id_number?: string | null
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          last_name?: string | null
          legacy_customer_pet_count?: number | null
          linked_profile_id?: string | null
          mobile?: string | null
          notes_internal?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          occupation?: string | null
          phone_alt?: string | null
          portal_access_enabled?: boolean
          postcode?: string | null
          province?: string | null
          signup_status?: string
          status?: Database["public"]["Enums"]["customer_status"]
          suburb?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vet_clinic_address?: string | null
          vet_clinic_contact?: string | null
          vet_clinic_name?: string | null
          work_address?: string | null
          xero_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_attendance: {
        Row: {
          attendance_date: string
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string
          customer_id: string
          expected: boolean
          id: string
          notes: string | null
          pet_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          customer_id: string
          expected?: boolean
          id?: string
          notes?: string | null
          pet_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          customer_id?: string
          expected?: boolean
          id?: string
          notes?: string | null
          pet_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_attendance_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_attendance_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_attendance_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_day_swaps: {
        Row: {
          created_at: string
          created_by: string | null
          daycare_enrolment_id: string
          id: string
          new_date: string
          original_date: string
          pet_id: string
          reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daycare_enrolment_id: string
          id?: string
          new_date: string
          original_date: string
          pet_id: string
          reason?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daycare_enrolment_id?: string
          id?: string
          new_date?: string
          original_date?: string
          pet_id?: string
          reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_day_swaps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_day_swaps_daycare_enrolment_id_fkey"
            columns: ["daycare_enrolment_id"]
            isOneToOne: false
            referencedRelation: "daycare_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_day_swaps_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_day_swaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_enrolments: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string
          daycare_plan_id: string | null
          end_date: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          pet_id: string
          selected_days: string[]
          start_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id: string
          daycare_plan_id?: string | null
          end_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          pet_id: string
          selected_days?: string[]
          start_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string
          daycare_plan_id?: string | null
          end_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          pet_id?: string
          selected_days?: string[]
          start_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_enrolments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_enrolments_daycare_plan_id_fkey"
            columns: ["daycare_plan_id"]
            isOneToOne: false
            referencedRelation: "daycare_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_enrolments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_enrolments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_enrolments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_import_rows: {
        Row: {
          batch_id: string
          breed: string | null
          candidates: Json
          commit_result: Json | null
          created_at: string
          days_per_week: number | null
          dog_full_name: string
          id: string
          match_confidence: number | null
          match_status: string
          matched_customer_id: string | null
          matched_pet_id: string | null
          notes: string | null
          owner_surname: string
          pet_first: string
          selected_days: string[]
          sex: string | null
          size: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          breed?: string | null
          candidates?: Json
          commit_result?: Json | null
          created_at?: string
          days_per_week?: number | null
          dog_full_name: string
          id?: string
          match_confidence?: number | null
          match_status?: string
          matched_customer_id?: string | null
          matched_pet_id?: string | null
          notes?: string | null
          owner_surname: string
          pet_first: string
          selected_days?: string[]
          sex?: string | null
          size?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          breed?: string | null
          candidates?: Json
          commit_result?: Json | null
          created_at?: string
          days_per_week?: number | null
          dog_full_name?: string
          id?: string
          match_confidence?: number | null
          match_status?: string
          matched_customer_id?: string | null
          matched_pet_id?: string | null
          notes?: string | null
          owner_surname?: string
          pet_first?: string
          selected_days?: string[]
          sex?: string | null
          size?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_import_rows_matched_customer_id_fkey"
            columns: ["matched_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_import_rows_matched_pet_id_fkey"
            columns: ["matched_pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_import_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_plans: {
        Row: {
          active: boolean
          billing_period: string
          created_at: string
          days_per_week: number | null
          id: string
          name: string
          price: number | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_period?: string
          created_at?: string
          days_per_week?: number | null
          id?: string
          name: string
          price?: number | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_period?: string
          created_at?: string
          days_per_week?: number | null
          id?: string
          name?: string
          price?: number | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_workflow_settings: {
        Row: {
          arrival_window_end: string
          arrival_window_start: string
          auto_checkout_time: string
          block_unvaccinated: boolean
          created_at: string
          id: string
          late_arrival_cutoff: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          arrival_window_end?: string
          arrival_window_start?: string
          auto_checkout_time?: string
          block_unvaccinated?: boolean
          created_at?: string
          id?: string
          late_arrival_cutoff?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          arrival_window_end?: string
          arrival_window_start?: string
          auto_checkout_time?: string
          block_unvaccinated?: boolean
          created_at?: string
          id?: string
          late_arrival_cutoff?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daycare_workflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_settings: {
        Row: {
          archive_grace_days: number
          auto_purge_enabled: boolean
          created_at: string
          default_retention_days: number
          max_upload_mb: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archive_grace_days?: number
          auto_purge_enabled?: boolean
          created_at?: string
          default_retention_days?: number
          max_upload_mb?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archive_grace_days?: number
          auto_purge_enabled?: boolean
          created_at?: string
          default_retention_days?: number
          max_upload_mb?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          booking_id: string | null
          booking_request_id: string | null
          checksum: string | null
          content_type: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          expires_at: string | null
          file_name: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          invoice_id: string | null
          mime_type: string | null
          notes: string | null
          pet_id: string | null
          s3_bucket: string | null
          s3_key: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["document_status"]
          storage_provider: string
          tenant_id: string
          type: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_profile_id: string | null
          uploaded_via: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          booking_id?: string | null
          booking_request_id?: string | null
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          file_name: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          pet_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_provider?: string
          tenant_id: string
          type: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_profile_id?: string | null
          uploaded_via?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          booking_id?: string | null
          booking_request_id?: string | null
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          pet_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_provider?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_profile_id?: string | null
          uploaded_via?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_breeds: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          size_band: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          size_band: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          size_band?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          booking_id: string | null
          booking_request_id: string | null
          cc_email: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          error_message: string | null
          estimate_id: string | null
          id: string
          invoice_id: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          template_code: string | null
          tenant_id: string
          to_email: string
        }
        Insert: {
          booking_id?: string | null
          booking_request_id?: string | null
          cc_email?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          template_code?: string | null
          tenant_id: string
          to_email: string
        }
        Update: {
          booking_id?: string | null
          booking_request_id?: string | null
          cc_email?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          template_code?: string | null
          tenant_id?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          html_template: string
          id: string
          name: string
          subject_template: string
          tenant_id: string | null
          text_template: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          html_template: string
          id?: string
          name: string
          subject_template: string
          tenant_id?: string | null
          text_template?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          html_template?: string
          id?: string
          name?: string
          subject_template?: string
          tenant_id?: string | null
          text_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_transport_settings: {
        Row: {
          created_at: string
          from_email: string | null
          from_name: string | null
          last_test_at: string | null
          last_test_error: string | null
          last_test_ok: boolean | null
          provider: string
          reply_to: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_secure: string
          smtp_username: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string
          reply_to?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_username?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string
          reply_to?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_username?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_transport_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          full_name: string
          id: string
          mobile: string | null
          relationship: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          full_name: string
          id?: string
          mobile?: string | null
          relationship?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          relationship?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_items: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string
          estimate_id: string
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          sort_order: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description: string
          estimate_id: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sort_order?: number
          tenant_id: string
          unit_price?: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sort_order?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          accepted_at: string | null
          converted_invoice_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          estimate_number: string
          expiry_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["billing_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          estimate_number: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          estimate_number?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          booking_request_id: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          form_type: string
          id: string
          payload: Json
          pet_id: string | null
          processed_at: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status: string
          tenant_id: string
        }
        Insert: {
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          form_type: string
          id?: string
          payload: Json
          pet_id?: string | null
          processed_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: string
          tenant_id: string
        }
        Update: {
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          form_type?: string
          id?: string
          payload?: Json
          pet_id?: string | null
          processed_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_addons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: string
          name: string
          price_zar: number
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind: string
          name: string
          price_zar: number
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          price_zar?: number
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_booking_addons: {
        Row: {
          addon_code: string
          addon_id: string | null
          addon_name: string
          booking_id: string
          created_at: string
          id: string
          note: string | null
          price_zar_snapshot: number
          qty: number
          tenant_id: string
        }
        Insert: {
          addon_code: string
          addon_id?: string | null
          addon_name: string
          booking_id: string
          created_at?: string
          id?: string
          note?: string | null
          price_zar_snapshot: number
          qty?: number
          tenant_id: string
        }
        Update: {
          addon_code?: string
          addon_id?: string | null
          addon_name?: string
          booking_id?: string
          created_at?: string
          id?: string
          note?: string | null
          price_zar_snapshot?: number
          qty?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "grooming_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_booking_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_booking_details: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          booking_id: string
          cancellation_fee_waived: boolean
          cancellation_fee_zar: number
          cancellation_waive_reason: string | null
          created_at: string
          duration_minutes: number | null
          groomer_name: string | null
          grooming_mode: string
          grooming_notes: string | null
          id: string
          loyalty_free_groom: boolean
          matted_surcharge_zar: number | null
          overtime_minutes: number
          package_id: string | null
          pensioner_discount: boolean
          pensioner_discount_applied: boolean
          recurring: boolean
          sedation_consent_at: string | null
          sedation_consent_channel: string | null
          sedation_consent_note: string | null
          sedation_consent_state: string
          sedation_surcharge_zar: number | null
          service_package: string | null
          stay_and_play_after: boolean
          surcharge_amount: number
          tenant_id: string
          travel_fee: number
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_id: string
          cancellation_fee_waived?: boolean
          cancellation_fee_zar?: number
          cancellation_waive_reason?: string | null
          created_at?: string
          duration_minutes?: number | null
          groomer_name?: string | null
          grooming_mode: string
          grooming_notes?: string | null
          id?: string
          loyalty_free_groom?: boolean
          matted_surcharge_zar?: number | null
          overtime_minutes?: number
          package_id?: string | null
          pensioner_discount?: boolean
          pensioner_discount_applied?: boolean
          recurring?: boolean
          sedation_consent_at?: string | null
          sedation_consent_channel?: string | null
          sedation_consent_note?: string | null
          sedation_consent_state?: string
          sedation_surcharge_zar?: number | null
          service_package?: string | null
          stay_and_play_after?: boolean
          surcharge_amount?: number
          tenant_id: string
          travel_fee?: number
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_id?: string
          cancellation_fee_waived?: boolean
          cancellation_fee_zar?: number
          cancellation_waive_reason?: string | null
          created_at?: string
          duration_minutes?: number | null
          groomer_name?: string | null
          grooming_mode?: string
          grooming_notes?: string | null
          id?: string
          loyalty_free_groom?: boolean
          matted_surcharge_zar?: number | null
          overtime_minutes?: number
          package_id?: string | null
          pensioner_discount?: boolean
          pensioner_discount_applied?: boolean
          recurring?: boolean
          sedation_consent_at?: string | null
          sedation_consent_channel?: string | null
          sedation_consent_note?: string | null
          sedation_consent_state?: string
          sedation_surcharge_zar?: number | null
          service_package?: string | null
          stay_and_play_after?: boolean
          surcharge_amount?: number
          tenant_id?: string
          travel_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_booking_details_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_booking_details_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "grooming_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_booking_details_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_booking_instructions: {
        Row: {
          booking_id: string
          created_at: string
          medical_flags: string[]
          notes: string | null
          selections: Json
          tenant_id: string
          told_office_to_call: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          medical_flags?: string[]
          notes?: string | null
          selections?: Json
          tenant_id: string
          told_office_to_call?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          medical_flags?: string[]
          notes?: string | null
          selections?: Json
          tenant_id?: string
          told_office_to_call?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_booking_instructions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_booking_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_instruction_groups: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_medical: boolean
          kind: string
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_medical?: boolean
          kind?: string
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_medical?: boolean
          kind?: string
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_instruction_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_instruction_options: {
        Row: {
          active: boolean
          addon_code: string | null
          code: string
          created_at: string
          group_id: string
          id: string
          is_alert: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          addon_code?: string | null
          code: string
          created_at?: string
          group_id: string
          id?: string
          is_alert?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          addon_code?: string | null
          code?: string
          created_at?: string
          group_id?: string
          id?: string
          is_alert?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_instruction_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "grooming_instruction_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_instruction_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_packages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expected_minutes: number
          id: string
          name: string
          package_type: string
          price_zar: number
          size_band: string | null
          sort_order: number
          species: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expected_minutes?: number
          id?: string
          name: string
          package_type: string
          price_zar: number
          size_band?: string | null
          sort_order?: number
          species: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expected_minutes?: number
          id?: string
          name?: string
          package_type?: string
          price_zar?: number
          size_band?: string | null
          sort_order?: number
          species?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_workflow_settings: {
        Row: {
          after_grooming_stay_play_zar: number
          cancellation_fee_pct: number
          cancellation_notice_hours: number
          created_at: string
          default_mobile_travel_fee_zar: number
          id: string
          matted_rate_per_15min_zar: number
          min_lead_hours: number
          overtime_threshold_minutes: number
          pensioner_discount_days: number[]
          pensioner_discount_pct: number
          pickup_dropoff_fee_zar: number
          puppy_half_price_max_months: number
          require_prepayment_short_notice: boolean
          sedation_default_fee_zar: number
          sedation_enabled: boolean
          tenant_id: string
          updated_at: string
          vax_gate_mode: string
        }
        Insert: {
          after_grooming_stay_play_zar?: number
          cancellation_fee_pct?: number
          cancellation_notice_hours?: number
          created_at?: string
          default_mobile_travel_fee_zar?: number
          id?: string
          matted_rate_per_15min_zar?: number
          min_lead_hours?: number
          overtime_threshold_minutes?: number
          pensioner_discount_days?: number[]
          pensioner_discount_pct?: number
          pickup_dropoff_fee_zar?: number
          puppy_half_price_max_months?: number
          require_prepayment_short_notice?: boolean
          sedation_default_fee_zar?: number
          sedation_enabled?: boolean
          tenant_id: string
          updated_at?: string
          vax_gate_mode?: string
        }
        Update: {
          after_grooming_stay_play_zar?: number
          cancellation_fee_pct?: number
          cancellation_notice_hours?: number
          created_at?: string
          default_mobile_travel_fee_zar?: number
          id?: string
          matted_rate_per_15min_zar?: number
          min_lead_hours?: number
          overtime_threshold_minutes?: number
          pensioner_discount_days?: number[]
          pensioner_discount_pct?: number
          pickup_dropoff_fee_zar?: number
          puppy_half_price_max_months?: number
          require_prepayment_short_notice?: boolean
          sedation_default_fee_zar?: number
          sedation_enabled?: boolean
          tenant_id?: string
          updated_at?: string
          vax_gate_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_workflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_booking_details: {
        Row: {
          accommodation_type: string | null
          additional_notes: string | null
          belongings_notes: string | null
          booking_id: string
          check_in_window: string | null
          check_out_window: string | null
          created_at: string
          dropoff_required: boolean
          emergency_notes: string | null
          feeding_instructions: string | null
          grooming_instructions: string | null
          grooming_required: boolean
          id: string
          medication_instructions: string | null
          pickup_required: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accommodation_type?: string | null
          additional_notes?: string | null
          belongings_notes?: string | null
          booking_id: string
          check_in_window?: string | null
          check_out_window?: string | null
          created_at?: string
          dropoff_required?: boolean
          emergency_notes?: string | null
          feeding_instructions?: string | null
          grooming_instructions?: string | null
          grooming_required?: boolean
          id?: string
          medication_instructions?: string | null
          pickup_required?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accommodation_type?: string | null
          additional_notes?: string | null
          belongings_notes?: string | null
          booking_id?: string
          check_in_window?: string | null
          check_out_window?: string | null
          created_at?: string
          dropoff_required?: boolean
          emergency_notes?: string | null
          feeding_instructions?: string | null
          grooming_instructions?: string | null
          grooming_required?: boolean
          id?: string
          medication_instructions?: string | null
          pickup_required?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_booking_details_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_booking_details_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_booking_surcharges: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          price_override_zar: number | null
          quantity: number
          surcharge_id: string
          tenant_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          price_override_zar?: number | null
          quantity?: number
          surcharge_id: string
          tenant_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          price_override_zar?: number | null
          quantity?: number
          surcharge_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_booking_surcharges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_booking_surcharges_surcharge_id_fkey"
            columns: ["surcharge_id"]
            isOneToOne: false
            referencedRelation: "hotel_surcharges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_booking_surcharges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rate_cards: {
        Row: {
          accommodation_type: string
          active: boolean
          created_at: string
          display_name: string
          extra_pet_rate_zar: number
          id: string
          max_size_band: Database["public"]["Enums"]["pet_size"] | null
          min_size_band: Database["public"]["Enums"]["pet_size"] | null
          nightly_rate_zar: number
          peak_uplift_pct: number
          sort_order: number
          species: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accommodation_type: string
          active?: boolean
          created_at?: string
          display_name: string
          extra_pet_rate_zar?: number
          id?: string
          max_size_band?: Database["public"]["Enums"]["pet_size"] | null
          min_size_band?: Database["public"]["Enums"]["pet_size"] | null
          nightly_rate_zar?: number
          peak_uplift_pct?: number
          sort_order?: number
          species: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accommodation_type?: string
          active?: boolean
          created_at?: string
          display_name?: string
          extra_pet_rate_zar?: number
          id?: string
          max_size_band?: Database["public"]["Enums"]["pet_size"] | null
          min_size_band?: Database["public"]["Enums"]["pet_size"] | null
          nightly_rate_zar?: number
          peak_uplift_pct?: number
          sort_order?: number
          species?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_surcharges: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          per_night: boolean
          price_zar: number
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          per_night?: boolean
          price_zar?: number
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          per_night?: boolean
          price_zar?: number
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_surcharges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_workflow_settings: {
        Row: {
          check_in_close_time: string
          check_in_open_time: string
          check_out_by_time: string
          created_at: string
          id: string
          late_checkout_fee_zar: number
          min_lead_hours: number
          peak_end_month_day: string | null
          peak_start_month_day: string | null
          require_prepayment_short_notice: boolean
          tenant_id: string
          updated_at: string
          vax_gate_mode: string
        }
        Insert: {
          check_in_close_time?: string
          check_in_open_time?: string
          check_out_by_time?: string
          created_at?: string
          id?: string
          late_checkout_fee_zar?: number
          min_lead_hours?: number
          peak_end_month_day?: string | null
          peak_start_month_day?: string | null
          require_prepayment_short_notice?: boolean
          tenant_id: string
          updated_at?: string
          vax_gate_mode?: string
        }
        Update: {
          check_in_close_time?: string
          check_in_open_time?: string
          check_out_by_time?: string
          created_at?: string
          id?: string
          late_checkout_fee_zar?: number
          min_lead_hours?: number
          peak_end_month_day?: string | null
          peak_start_month_day?: string | null
          require_prepayment_short_notice?: boolean
          tenant_id?: string
          updated_at?: string
          vax_gate_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_workflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_customers_raw: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          customer_category: string | null
          customer_id: string | null
          customer_pet_number: string | null
          customer_suburb: string | null
          customer_type: string | null
          email: string | null
          first_name: string | null
          id: number
          import_batch: string
          imported_at: string
          last_name: string | null
          last_seen_date: string | null
          mobile: string | null
          phone_alt: string | null
          postcode: string | null
          raw_row_number: number | null
          suburb_extra: string | null
          xero_customer_id: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          customer_category?: string | null
          customer_id?: string | null
          customer_pet_number?: string | null
          customer_suburb?: string | null
          customer_type?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          import_batch: string
          imported_at?: string
          last_name?: string | null
          last_seen_date?: string | null
          mobile?: string | null
          phone_alt?: string | null
          postcode?: string | null
          raw_row_number?: number | null
          suburb_extra?: string | null
          xero_customer_id?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          customer_category?: string | null
          customer_id?: string | null
          customer_pet_number?: string | null
          customer_suburb?: string | null
          customer_type?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          import_batch?: string
          imported_at?: string
          last_name?: string | null
          last_seen_date?: string | null
          mobile?: string | null
          phone_alt?: string | null
          postcode?: string | null
          raw_row_number?: number | null
          suburb_extra?: string | null
          xero_customer_id?: string | null
        }
        Relationships: []
      }
      import_pets_raw: {
        Row: {
          age: string | null
          breed: string | null
          customer_id: string | null
          gender: string | null
          id: number
          import_batch: string
          imported_at: string
          notes: string | null
          pet_id: string | null
          pet_name: string | null
          photo_file: string | null
          raw_row_number: number | null
          size: string | null
          temperament: string | null
          vaccinated: string | null
        }
        Insert: {
          age?: string | null
          breed?: string | null
          customer_id?: string | null
          gender?: string | null
          id?: number
          import_batch: string
          imported_at?: string
          notes?: string | null
          pet_id?: string | null
          pet_name?: string | null
          photo_file?: string | null
          raw_row_number?: number | null
          size?: string | null
          temperament?: string | null
          vaccinated?: string | null
        }
        Update: {
          age?: string | null
          breed?: string | null
          customer_id?: string | null
          gender?: string | null
          id?: number
          import_batch?: string
          imported_at?: string
          notes?: string | null
          pet_id?: string | null
          pet_name?: string | null
          photo_file?: string | null
          raw_row_number?: number | null
          size?: string | null
          temperament?: string | null
          vaccinated?: string | null
        }
        Relationships: []
      }
      invoice_events: {
        Row: {
          actor_label: string | null
          actor_profile_id: string | null
          created_at: string
          event_type: string
          id: string
          invoice_id: string
          notes: string | null
          payload: Json
          tenant_id: string
        }
        Insert: {
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          invoice_id: string
          notes?: string | null
          payload?: Json
          tenant_id: string
        }
        Update: {
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string
          discount_amount: number
          discount_pct: number
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          quantity: number
          sort_order: number
          source_id: string | null
          source_type: string | null
          stock_movement_id: string | null
          tenant_id: string
          unit_price: number
          vat_amount: number
          vat_inclusive: boolean
          vat_rate: number | null
          xero_account_code: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description: string
          discount_amount?: number
          discount_pct?: number
          id?: string
          invoice_id: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          stock_movement_id?: string | null
          tenant_id: string
          unit_price?: number
          vat_amount?: number
          vat_inclusive?: boolean
          vat_rate?: number | null
          xero_account_code?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string
          discount_amount?: number
          discount_pct?: number
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          stock_movement_id?: string | null
          tenant_id?: string
          unit_price?: number
          vat_amount?: number
          vat_inclusive?: boolean
          vat_rate?: number | null
          xero_account_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          discount_total: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string | null
          last_reminder_at: string | null
          last_reminder_offset: number | null
          last_sent_at: string | null
          notes: string | null
          payment_reference: string | null
          pdf_path: string | null
          public_view_token: string
          reminders_paused: boolean
          send_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["billing_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          xero_invoice_id: string | null
          xero_invoice_number: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string | null
          last_reminder_at?: string | null
          last_reminder_offset?: number | null
          last_sent_at?: string | null
          notes?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          public_view_token?: string
          reminders_paused?: boolean
          send_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string | null
          last_reminder_at?: string | null
          last_reminder_offset?: number | null
          last_sent_at?: string | null
          notes?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          public_view_token?: string
          reminders_paused?: boolean
          send_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoicing_settings: {
        Row: {
          address: string | null
          auto_invoice_daycare: boolean
          auto_invoice_grooming: boolean
          auto_invoice_hotel: boolean
          auto_invoice_transport: boolean
          banking_details: string | null
          billing_cycle: string
          billing_due_day: number
          billing_run_day: number
          company_name: string | null
          created_at: string
          credit_note_prefix: string
          default_vat_rate: number
          footer_notes: string | null
          id: string
          invoice_prefix: string
          next_credit_note_number: number
          next_number: number
          payment_terms_days: number
          prices_include_vat: boolean
          reminder_days: number[]
          tenant_id: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          auto_invoice_daycare?: boolean
          auto_invoice_grooming?: boolean
          auto_invoice_hotel?: boolean
          auto_invoice_transport?: boolean
          banking_details?: string | null
          billing_cycle?: string
          billing_due_day?: number
          billing_run_day?: number
          company_name?: string | null
          created_at?: string
          credit_note_prefix?: string
          default_vat_rate?: number
          footer_notes?: string | null
          id?: string
          invoice_prefix?: string
          next_credit_note_number?: number
          next_number?: number
          payment_terms_days?: number
          prices_include_vat?: boolean
          reminder_days?: number[]
          tenant_id: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          auto_invoice_daycare?: boolean
          auto_invoice_grooming?: boolean
          auto_invoice_hotel?: boolean
          auto_invoice_transport?: boolean
          banking_details?: string | null
          billing_cycle?: string
          billing_due_day?: number
          billing_run_day?: number
          company_name?: string | null
          created_at?: string
          credit_note_prefix?: string
          default_vat_rate?: number
          footer_notes?: string | null
          id?: string
          invoice_prefix?: string
          next_credit_note_number?: number
          next_number?: number
          payment_terms_days?: number
          prices_include_vat?: boolean
          reminder_days?: number[]
          tenant_id?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoicing_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          auto_send: boolean
          body: string
          channel: Database["public"]["Enums"]["comms_channel"]
          created_at: string
          event_code: string
          id: string
          is_active: boolean
          name: string
          send_to: string
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          body: string
          channel?: Database["public"]["Enums"]["comms_channel"]
          created_at?: string
          event_code: string
          id?: string
          is_active?: boolean
          name: string
          send_to?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          body?: string
          channel?: Database["public"]["Enums"]["comms_channel"]
          created_at?: string
          event_code?: string
          id?: string
          is_active?: boolean
          name?: string
          send_to?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          attempts: number
          body_rendered: string | null
          booking_id: string | null
          booking_request_id: string | null
          channel: Database["public"]["Enums"]["comms_channel"]
          created_at: string
          customer_id: string | null
          error: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          invoice_id: string | null
          payload: Json
          pet_id: string | null
          provider_message_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string | null
          template_key: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body_rendered?: string | null
          booking_id?: string | null
          booking_request_id?: string | null
          channel?: Database["public"]["Enums"]["comms_channel"]
          created_at?: string
          customer_id?: string | null
          error?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          invoice_id?: string | null
          payload?: Json
          pet_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
          template_key?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body_rendered?: string | null
          booking_id?: string | null
          booking_request_id?: string | null
          channel?: Database["public"]["Enums"]["comms_channel"]
          created_at?: string
          customer_id?: string | null
          error?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          invoice_id?: string | null
          payload?: Json
          pet_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
          template_key?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          mode: Database["public"]["Enums"]["payment_provider_mode"]
          provider: string
          settings: Json
          tenant_id: string
          updated_at: string
          webhook_secret_ref: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["payment_provider_mode"]
          provider: string
          settings?: Json
          tenant_id: string
          updated_at?: string
          webhook_secret_ref?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["payment_provider_mode"]
          provider?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
          webhook_secret_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          currency: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          payment_id: string | null
          provider: string
          provider_error: string | null
          provider_payload: Json | null
          provider_refund_id: string | null
          provider_status: string | null
          reference: string | null
          refund_date: string
          status: Database["public"]["Enums"]["refund_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_id?: string | null
          provider?: string
          provider_error?: string | null
          provider_payload?: Json | null
          provider_refund_id?: string | null
          provider_status?: string | null
          reference?: string | null
          refund_date?: string
          status?: Database["public"]["Enums"]["refund_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_id?: string | null
          provider?: string
          provider_error?: string | null
          provider_payload?: Json | null
          provider_refund_id?: string | null
          provider_status?: string | null
          reference?: string | null
          refund_date?: string
          status?: Database["public"]["Enums"]["refund_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_refunded: number
          created_at: string
          customer_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          pf_payment_id: string | null
          proof_document_id: string | null
          provider: string
          provider_mode: string | null
          provider_payload: Json | null
          recorded_by: string | null
          refund_status: Database["public"]["Enums"]["payment_refund_state"]
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_refunded?: number
          created_at?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          pf_payment_id?: string | null
          proof_document_id?: string | null
          provider?: string
          provider_mode?: string | null
          provider_payload?: Json | null
          recorded_by?: string | null
          refund_status?: Database["public"]["Enums"]["payment_refund_state"]
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_refunded?: number
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          pf_payment_id?: string | null
          proof_document_id?: string | null
          provider?: string
          provider_mode?: string | null
          provider_payload?: Json | null
          recorded_by?: string | null
          refund_status?: Database["public"]["Enums"]["payment_refund_state"]
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proof_document_id_fkey"
            columns: ["proof_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      pet_grooming_defaults: {
        Row: {
          created_at: string
          medical_flags: string[]
          notes: string | null
          pet_id: string
          selections: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          medical_flags?: string[]
          notes?: string | null
          pet_id: string
          selections?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          medical_flags?: string[]
          notes?: string | null
          pet_id?: string
          selections?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_grooming_defaults_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: true
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_grooming_defaults_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_parasite_treatments: {
        Row: {
          administered_on: string
          created_at: string
          id: string
          kind: string
          next_due_date: string | null
          notes: string | null
          pet_id: string
          product_name: string | null
          recorded_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          administered_on: string
          created_at?: string
          id?: string
          kind: string
          next_due_date?: string | null
          notes?: string | null
          pet_id: string
          product_name?: string | null
          recorded_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          administered_on?: string
          created_at?: string
          id?: string
          kind?: string
          next_due_date?: string | null
          notes?: string | null
          pet_id?: string
          product_name?: string | null
          recorded_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_parasite_treatments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_parasite_treatments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          age_years: number | null
          aggression_flag: boolean
          barker: boolean
          behaviour_aggressive_history: boolean
          behaviour_barker: boolean
          behaviour_jumps: boolean
          behaviour_nervous: boolean
          behaviour_notes: string | null
          behaviour_social: boolean
          breed: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          date_of_birth: string | null
          deceased_at: string | null
          id: string
          import_batch: string | null
          import_source: string | null
          imported_at: string | null
          insurance_number: string | null
          insurance_provider: string | null
          is_power_breed: boolean
          is_spayed_neutered: boolean | null
          jumper: boolean
          legacy_customer_number: string | null
          marks_colour: string | null
          medical_aid_number: string | null
          medical_aid_provider: string | null
          medical_notes: string | null
          microchip_number: string | null
          microchipped: boolean
          name: string
          nervous: boolean
          pet_number: string | null
          photo_url: string | null
          raw_gender_label: string | null
          raw_size_label: string | null
          raw_temperament_label: string | null
          raw_vaccinated_label: string | null
          sex: Database["public"]["Enums"]["pet_sex"]
          size: Database["public"]["Enums"]["pet_size"] | null
          size_override: Database["public"]["Enums"]["pet_size"] | null
          size_override_at: string | null
          size_override_by: string | null
          size_override_reason: string | null
          social: boolean | null
          special_handling_flag: boolean
          species: Database["public"]["Enums"]["pet_species"]
          status: Database["public"]["Enums"]["customer_status"]
          sterilised_status: Database["public"]["Enums"]["sterilised_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vax_waived_until: string | null
          vax_waiver_at: string | null
          vax_waiver_by: string | null
          vax_waiver_reason: string | null
        }
        Insert: {
          age_years?: number | null
          aggression_flag?: boolean
          barker?: boolean
          behaviour_aggressive_history?: boolean
          behaviour_barker?: boolean
          behaviour_jumps?: boolean
          behaviour_nervous?: boolean
          behaviour_notes?: string | null
          behaviour_social?: boolean
          breed?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          date_of_birth?: string | null
          deceased_at?: string | null
          id?: string
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          insurance_number?: string | null
          insurance_provider?: string | null
          is_power_breed?: boolean
          is_spayed_neutered?: boolean | null
          jumper?: boolean
          legacy_customer_number?: string | null
          marks_colour?: string | null
          medical_aid_number?: string | null
          medical_aid_provider?: string | null
          medical_notes?: string | null
          microchip_number?: string | null
          microchipped?: boolean
          name: string
          nervous?: boolean
          pet_number?: string | null
          photo_url?: string | null
          raw_gender_label?: string | null
          raw_size_label?: string | null
          raw_temperament_label?: string | null
          raw_vaccinated_label?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"]
          size?: Database["public"]["Enums"]["pet_size"] | null
          size_override?: Database["public"]["Enums"]["pet_size"] | null
          size_override_at?: string | null
          size_override_by?: string | null
          size_override_reason?: string | null
          social?: boolean | null
          special_handling_flag?: boolean
          species: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["customer_status"]
          sterilised_status?: Database["public"]["Enums"]["sterilised_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vax_waived_until?: string | null
          vax_waiver_at?: string | null
          vax_waiver_by?: string | null
          vax_waiver_reason?: string | null
        }
        Update: {
          age_years?: number | null
          aggression_flag?: boolean
          barker?: boolean
          behaviour_aggressive_history?: boolean
          behaviour_barker?: boolean
          behaviour_jumps?: boolean
          behaviour_nervous?: boolean
          behaviour_notes?: string | null
          behaviour_social?: boolean
          breed?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date_of_birth?: string | null
          deceased_at?: string | null
          id?: string
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          insurance_number?: string | null
          insurance_provider?: string | null
          is_power_breed?: boolean
          is_spayed_neutered?: boolean | null
          jumper?: boolean
          legacy_customer_number?: string | null
          marks_colour?: string | null
          medical_aid_number?: string | null
          medical_aid_provider?: string | null
          medical_notes?: string | null
          microchip_number?: string | null
          microchipped?: boolean
          name?: string
          nervous?: boolean
          pet_number?: string | null
          photo_url?: string | null
          raw_gender_label?: string | null
          raw_size_label?: string | null
          raw_temperament_label?: string | null
          raw_vaccinated_label?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"]
          size?: Database["public"]["Enums"]["pet_size"] | null
          size_override?: Database["public"]["Enums"]["pet_size"] | null
          size_override_at?: string | null
          size_override_by?: string | null
          size_override_reason?: string | null
          social?: boolean | null
          special_handling_flag?: boolean
          species?: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["customer_status"]
          sterilised_status?: Database["public"]["Enums"]["sterilised_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vax_waived_until?: string | null
          vax_waiver_at?: string | null
          vax_waiver_by?: string | null
          vax_waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_size_override_by_fkey"
            columns: ["size_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_vax_waiver_by_fkey"
            columns: ["vax_waiver_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          id: string
          payload: Json | null
          target: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          target?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          target?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_settings: {
        Row: {
          consent_grace_days: number
          created_at: string
          daycare_catchup_window_days: number
          daycare_notice_months: number
          grooming_cancellation_hours: number
          hotel_amendment_fee: number
          hotel_balance_due_days_before: number
          hotel_cancellation_cutoff_days: number
          hotel_deposit_percent: number
          hotel_free_amendments: number
          overdue_interest_percent_per_month: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consent_grace_days?: number
          created_at?: string
          daycare_catchup_window_days?: number
          daycare_notice_months?: number
          grooming_cancellation_hours?: number
          hotel_amendment_fee?: number
          hotel_balance_due_days_before?: number
          hotel_cancellation_cutoff_days?: number
          hotel_deposit_percent?: number
          hotel_free_amendments?: number
          overdue_interest_percent_per_month?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consent_grace_days?: number
          created_at?: string
          daycare_catchup_window_days?: number
          daycare_notice_months?: number
          grooming_cancellation_hours?: number
          hotel_amendment_fee?: number
          hotel_balance_due_days_before?: number
          hotel_cancellation_cutoff_days?: number
          hotel_deposit_percent?: number
          hotel_free_amendments?: number
          overdue_interest_percent_per_month?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          category: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          external_code: string | null
          id: string
          name: string
          reorder_level: number | null
          sell_price: number | null
          sku: string | null
          sort_order: number
          tenant_id: string
          unit: string | null
          updated_at: string
          vat_rate: number
          xero_account_code: string | null
          xero_item_id: string | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          external_code?: string | null
          id?: string
          name: string
          reorder_level?: number | null
          sell_price?: number | null
          sku?: string | null
          sort_order?: number
          tenant_id: string
          unit?: string | null
          updated_at?: string
          vat_rate?: number
          xero_account_code?: string | null
          xero_item_id?: string | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          external_code?: string | null
          id?: string
          name?: string
          reorder_level?: number | null
          sell_price?: number | null
          sku?: string | null
          sort_order?: number
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          vat_rate?: number
          xero_account_code?: string | null
          xero_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: string[] | null
          end_date: string | null
          frequency: string
          id: string
          interval: number
          next_occurrence: string | null
          notes: string | null
          start_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week?: string[] | null
          end_date?: string | null
          frequency: string
          id?: string
          interval?: number
          next_occurrence?: string | null
          notes?: string | null
          start_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: string[] | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval?: number
          next_occurrence?: string | null
          notes?: string | null
          start_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          description: string | null
          home_suburb: string | null
          id: string
          name: string
          sort_order: number
          tenant_id: string
          type: Database["public"]["Enums"]["resource_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          home_suburb?: string | null
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          type: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          home_suburb?: string | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          type?: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_settings: {
        Row: {
          allow_negative_stock: boolean
          created_at: string
          default_vat_rate: number
          low_stock_notify_emails: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          created_at?: string
          default_vat_rate?: number
          low_stock_notify_emails?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          created_at?: string
          default_vat_rate?: number
          low_stock_notify_emails?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retail_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          label: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          label: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          label?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          product_id: string
          qty_delta: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          ref_id: string | null
          ref_type: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          product_id: string
          qty_delta: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          ref_id?: string | null
          ref_type?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          product_id?: string
          qty_delta?: number
          reason?: Database["public"]["Enums"]["stock_movement_reason"]
          ref_id?: string | null
          ref_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_terms_versions: {
        Row: {
          body_markdown: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_current: boolean
          kind: string
          pdf_document_id: string | null
          tenant_id: string
          title: string | null
          updated_at: string
          version: string
        }
        Insert: {
          body_markdown?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_current?: boolean
          kind: string
          pdf_document_id?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          body_markdown?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_current?: boolean
          kind?: string
          pdf_document_id?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_terms_versions_pdf_document_id_fkey"
            columns: ["pdf_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_terms_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          is_primary_contact: boolean
          profile_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          profile_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          profile_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_colour: string | null
          app_url: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          favicon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          primary_colour: string | null
          secondary_colour: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          subdomain: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          accent_colour?: string | null
          app_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          primary_colour?: string | null
          secondary_colour?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          accent_colour?: string | null
          app_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          primary_colour?: string | null
          secondary_colour?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      transport_details: {
        Row: {
          booking_id: string
          completed_at: string | null
          created_at: string
          direction: string
          driver_notes: string | null
          dropoff_address: string | null
          gate_code: string | null
          id: string
          pickup_address: string | null
          planned_window_end: string | null
          planned_window_start: string | null
          suburb: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          completed_at?: string | null
          created_at?: string
          direction: string
          driver_notes?: string | null
          dropoff_address?: string | null
          gate_code?: string | null
          id?: string
          pickup_address?: string | null
          planned_window_end?: string | null
          planned_window_start?: string | null
          suburb?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          direction?: string
          driver_notes?: string | null
          dropoff_address?: string | null
          gate_code?: string | null
          id?: string
          pickup_address?: string | null
          planned_window_end?: string | null
          planned_window_start?: string | null
          suburb?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_details_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_details_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_workflow_settings: {
        Row: {
          created_at: string
          day_end_time: string
          day_start_time: string
          default_dropoff_trail_minutes: number
          default_fee_zar: number
          default_pickup_lead_minutes: number
          id: string
          max_leg_gap_minutes: number
          min_lead_hours: number
          min_leg_gap_minutes: number
          require_prepayment_short_notice: boolean
          round_trip_multiplier: number
          suburb_fees: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          default_dropoff_trail_minutes?: number
          default_fee_zar?: number
          default_pickup_lead_minutes?: number
          id?: string
          max_leg_gap_minutes?: number
          min_lead_hours?: number
          min_leg_gap_minutes?: number
          require_prepayment_short_notice?: boolean
          round_trip_multiplier?: number
          suburb_fees?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          default_dropoff_trail_minutes?: number
          default_fee_zar?: number
          default_pickup_lead_minutes?: number
          id?: string
          max_leg_gap_minutes?: number
          min_lead_hours?: number
          min_leg_gap_minutes?: number
          require_prepayment_short_notice?: boolean
          round_trip_multiplier?: number
          suburb_fees?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_workflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          tenant_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          tenant_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          tenant_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_user_id_fkey"
            columns: ["tenant_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccination_rules: {
        Row: {
          created_at: string
          grace_days: number
          id: string
          required: boolean
          service_type: Database["public"]["Enums"]["service_type"]
          species: string
          tenant_id: string
          updated_at: string
          vaccine_type: string
        }
        Insert: {
          created_at?: string
          grace_days?: number
          id?: string
          required?: boolean
          service_type: Database["public"]["Enums"]["service_type"]
          species?: string
          tenant_id: string
          updated_at?: string
          vaccine_type: string
        }
        Update: {
          created_at?: string
          grace_days?: number
          id?: string
          required?: boolean
          service_type?: Database["public"]["Enums"]["service_type"]
          species?: string
          tenant_id?: string
          updated_at?: string
          vaccine_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccination_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccinations: {
        Row: {
          administered_date: string | null
          card_document_id: string | null
          created_at: string
          document_id: string | null
          expiry_date: string | null
          id: string
          next_due_date: string | null
          notes: string | null
          pet_id: string
          product_name: string | null
          tenant_id: string
          updated_at: string
          vaccination_type: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          administered_date?: string | null
          card_document_id?: string | null
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          next_due_date?: string | null
          notes?: string | null
          pet_id: string
          product_name?: string | null
          tenant_id: string
          updated_at?: string
          vaccination_type: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          administered_date?: string | null
          card_document_id?: string | null
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          next_due_date?: string | null
          notes?: string | null
          pet_id?: string
          product_name?: string | null
          tenant_id?: string
          updated_at?: string
          vaccination_type?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_card_document_id_fkey"
            columns: ["card_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccine_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_validity_months: number
          help_text: string | null
          id: string
          name: string
          sort_order: number
          species: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_validity_months?: number
          help_text?: string | null
          id?: string
          name: string
          sort_order?: number
          species?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_validity_months?: number
          help_text?: string | null
          id?: string
          name?: string
          sort_order?: number
          species?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccine_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      van_workflow_settings: {
        Row: {
          created_at: string
          day_end_time: string
          day_start_time: string
          id: string
          max_travel_gap_minutes: number
          min_travel_gap_minutes: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          id?: string
          max_travel_gap_minutes?: number
          min_travel_gap_minutes?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          id?: string
          max_travel_gap_minutes?: number
          min_travel_gap_minutes?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_workflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vets: {
        Row: {
          clinic_address: string | null
          contact_number: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          practice_name: string | null
          tenant_id: string
          updated_at: string
          vet_name: string | null
        }
        Insert: {
          clinic_address?: string | null
          contact_number?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          practice_name?: string | null
          tenant_id: string
          updated_at?: string
          vet_name?: string | null
        }
        Update: {
          clinic_address?: string | null
          contact_number?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          practice_name?: string | null
          tenant_id?: string
          updated_at?: string
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_aging: {
        Row: {
          credit_balance: number | null
          current_bucket: number | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_number: string | null
          days_1_30: number | null
          days_31_60: number | null
          days_61_90: number | null
          days_over_90: number | null
          net_due: number | null
          tenant_id: string | null
          total_due: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_balances: {
        Row: {
          balance: number | null
          customer_id: string | null
          last_entry_date: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_transport_settings_safe: {
        Row: {
          created_at: string | null
          from_email: string | null
          from_name: string | null
          has_password: boolean | null
          last_test_at: string | null
          last_test_error: string | null
          last_test_ok: boolean | null
          provider: string | null
          reply_to: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_secure: string | null
          smtp_username: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          has_password?: never
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string | null
          reply_to?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: string | null
          smtp_username?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          has_password?: never
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string | null
          reply_to?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: string | null
          smtp_username?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_transport_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_on_hand: {
        Row: {
          last_movement_at: string | null
          location_id: string | null
          product_id: string | null
          qty_on_hand: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _auto_invoice_enabled: {
        Args: { p_service: string; p_tenant_id: string }
        Returns: boolean
      }
      _customer_notify_status: {
        Args: { target_customer_id: string }
        Returns: Database["public"]["Enums"]["notification_status"]
      }
      _period_bounds: {
        Args: { p_anchor: string }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      _strip_auto_invoice_lines: {
        Args: { p_source_id: string; p_source_type: string }
        Returns: undefined
      }
      adjust_customer_credit: {
        Args: { p_amount: number; p_customer_id: string; p_notes: string }
        Returns: string
      }
      allocate_customer_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_notes?: string
        }
        Returns: string
      }
      allocate_payment: {
        Args: { p_allocations: Json; p_payment_id: string }
        Returns: Json
      }
      apply_credit_note: {
        Args: {
          p_amount: number
          p_credit_note_id: string
          p_invoice_id: string
        }
        Returns: string
      }
      current_customer_id: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      delete_booking: { Args: { p_booking_id: string }; Returns: undefined }
      delete_customer: { Args: { p_customer_id: string }; Returns: undefined }
      delete_daycare_enrolment: {
        Args: { p_enrolment_id: string }
        Returns: undefined
      }
      delete_pet: { Args: { p_pet_id: string }; Returns: undefined }
      document_hard_delete: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      ensure_draft_invoice: {
        Args: {
          p_customer_id: string
          p_notes_label?: string
          p_period_end?: string
          p_period_start?: string
          p_tenant_id: string
        }
        Returns: string
      }
      find_customer_email_duplicates: {
        Args: { target_customer_id: string }
        Returns: {
          customer_number: string
          email: string
          full_name: string
          id: string
          status: string
        }[]
      }
      generate_monthly_daycare_invoices: {
        Args: { p_period_start: string; p_tenant_id: string }
        Returns: Json
      }
      get_public_invoice: { Args: { p_token: string }; Returns: Json }
      grooming_can_confirm_booking: {
        Args: { p_booking_id: string }
        Returns: {
          expiry_date: string
          pet_id: string
          pet_name: string
          status: string
          vaccine_type: string
        }[]
      }
      grooming_day_availability: {
        Args: { p_day: string; p_tenant_id: string }
        Returns: Json
      }
      grooming_sync_instruction_addons: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      hotel_can_confirm_booking: {
        Args: { p_booking_id: string }
        Returns: {
          expiry_date: string
          pet_id: string
          pet_name: string
          status: string
          vaccine_type: string
        }[]
      }
      is_platform_owner: { Args: never; Returns: boolean }
      issue_booking_invoice: { Args: { p_booking_id: string }; Returns: string }
      log_invoice_event: {
        Args: {
          p_event_type: string
          p_invoice_id: string
          p_notes?: string
          p_payload?: Json
          p_tenant_id: string
        }
        Returns: undefined
      }
      mark_invoice_sent: {
        Args: { p_invoice_id: string; p_kind?: string; p_recipient: string }
        Returns: undefined
      }
      next_booking_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_credit_note_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_customer_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_invoice_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_pet_number: { Args: { target_tenant_id: string }; Returns: string }
      park_customer_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_entry_date?: string
          p_notes?: string
          p_source_payment_id?: string
        }
        Returns: string
      }
      portal_cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      portal_reschedule_booking: {
        Args: { p_booking_id: string; p_end_at?: string; p_start_at: string }
        Returns: undefined
      }
      record_manual_refund: {
        Args: {
          p_amount: number
          p_credit_note_id?: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_payment_id: string
          p_reference?: string
          p_refund_date?: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tenant_gateway_enabled: {
        Args: { target_provider: string; target_tenant_id: string }
        Returns: boolean
      }
      transport_can_assign_leg: {
        Args: { _booking_id: string; _resource_id: string }
        Returns: Json
      }
      user_can_access_customer: {
        Args: { target_customer_id: string; target_tenant_id: string }
        Returns: boolean
      }
      user_can_access_pet: {
        Args: { target_pet_id: string; target_tenant_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { permission_code: string; target_tenant_id: string }
        Returns: boolean
      }
      user_has_tenant_access: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      van_can_assign_stop: {
        Args: { _booking_id: string; _resource_id: string }
        Returns: Json
      }
      void_refund: { Args: { p_refund_id: string }; Returns: undefined }
    }
    Enums: {
      attendance_status:
        | "expected"
        | "checked_in"
        | "checked_out"
        | "not_arrived"
        | "walk_in"
        | "cancelled"
      billing_status:
        | "draft"
        | "sent"
        | "accepted"
        | "issued"
        | "part_paid"
        | "paid"
        | "overdue"
        | "cancelled"
        | "expired"
      booking_request_kind: "new" | "change" | "cancel"
      booking_request_status:
        | "pending_review"
        | "needs_info"
        | "approved"
        | "declined"
        | "converted"
      booking_source:
        | "website_form"
        | "customer_portal"
        | "staff_capture"
        | "email"
        | "phone"
        | "whatsapp"
      booking_status:
        | "draft"
        | "requested"
        | "needs_info"
        | "approved"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "ready"
        | "checked_out"
        | "completed"
        | "cancelled"
        | "no_show"
        | "grooming"
      comms_channel: "email" | "whatsapp" | "sms"
      credit_note_status: "draft" | "issued" | "applied" | "cancelled"
      customer_credit_entry_type:
        | "overpayment"
        | "manual_adjustment"
        | "credit_note_unapplied"
        | "allocation"
        | "refund_out"
      customer_status: "active" | "inactive" | "archived"
      document_status:
        | "pending"
        | "uploaded"
        | "verified"
        | "rejected"
        | "expired"
      email_status: "queued" | "sent" | "failed"
      notification_event_type:
        | "booking_created"
        | "booking_rescheduled"
        | "booking_cancelled"
        | "booking_status_changed"
        | "booking_request_created"
        | "booking_request_status_changed"
        | "invoice_issued"
        | "invoice_reminder"
        | "invoice_paid"
        | "vax_expiring_30d"
        | "vax_expiring_7d"
        | "vax_expired"
        | "manual_message"
        | "customer_signup_pending"
        | "portal_invited"
        | "password_reset_requested"
        | "booking_cancellation_requested"
        | "booking_reminder_24h"
        | "payment_proof_uploaded"
      notification_status: "pending" | "sent" | "failed" | "skipped"
      payment_method: "eft" | "cash" | "card" | "yoko" | "payfast" | "other"
      payment_provider_mode: "test" | "live"
      payment_refund_state: "none" | "partial" | "full"
      pet_sex: "male" | "female" | "unknown"
      pet_size: "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge"
      pet_species: "dog" | "cat" | "other"
      refund_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
      resource_type:
        | "inhouse_grooming"
        | "mobile_van"
        | "transport_vehicle"
        | "daycare_area"
        | "hotel_area"
        | "cattery_area"
      service_type:
        | "daycare"
        | "daycare_assessment"
        | "hotel_dog"
        | "hotel_cat"
        | "grooming_inhouse"
        | "grooming_mobile"
        | "pickup_dropoff"
      sterilised_status: "yes" | "no" | "unknown" | "not_applicable"
      stock_movement_reason:
        | "receive"
        | "sale"
        | "adjustment"
        | "wastage"
        | "return"
      tenant_status: "active" | "suspended" | "archived"
      user_type: "platform" | "staff" | "customer"
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
      attendance_status: [
        "expected",
        "checked_in",
        "checked_out",
        "not_arrived",
        "walk_in",
        "cancelled",
      ],
      billing_status: [
        "draft",
        "sent",
        "accepted",
        "issued",
        "part_paid",
        "paid",
        "overdue",
        "cancelled",
        "expired",
      ],
      booking_request_kind: ["new", "change", "cancel"],
      booking_request_status: [
        "pending_review",
        "needs_info",
        "approved",
        "declined",
        "converted",
      ],
      booking_source: [
        "website_form",
        "customer_portal",
        "staff_capture",
        "email",
        "phone",
        "whatsapp",
      ],
      booking_status: [
        "draft",
        "requested",
        "needs_info",
        "approved",
        "confirmed",
        "checked_in",
        "in_progress",
        "ready",
        "checked_out",
        "completed",
        "cancelled",
        "no_show",
        "grooming",
      ],
      comms_channel: ["email", "whatsapp", "sms"],
      credit_note_status: ["draft", "issued", "applied", "cancelled"],
      customer_credit_entry_type: [
        "overpayment",
        "manual_adjustment",
        "credit_note_unapplied",
        "allocation",
        "refund_out",
      ],
      customer_status: ["active", "inactive", "archived"],
      document_status: [
        "pending",
        "uploaded",
        "verified",
        "rejected",
        "expired",
      ],
      email_status: ["queued", "sent", "failed"],
      notification_event_type: [
        "booking_created",
        "booking_rescheduled",
        "booking_cancelled",
        "booking_status_changed",
        "booking_request_created",
        "booking_request_status_changed",
        "invoice_issued",
        "invoice_reminder",
        "invoice_paid",
        "vax_expiring_30d",
        "vax_expiring_7d",
        "vax_expired",
        "manual_message",
        "customer_signup_pending",
        "portal_invited",
        "password_reset_requested",
        "booking_cancellation_requested",
        "booking_reminder_24h",
        "payment_proof_uploaded",
      ],
      notification_status: ["pending", "sent", "failed", "skipped"],
      payment_method: ["eft", "cash", "card", "yoko", "payfast", "other"],
      payment_provider_mode: ["test", "live"],
      payment_refund_state: ["none", "partial", "full"],
      pet_sex: ["male", "female", "unknown"],
      pet_size: ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"],
      pet_species: ["dog", "cat", "other"],
      refund_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      resource_type: [
        "inhouse_grooming",
        "mobile_van",
        "transport_vehicle",
        "daycare_area",
        "hotel_area",
        "cattery_area",
      ],
      service_type: [
        "daycare",
        "daycare_assessment",
        "hotel_dog",
        "hotel_cat",
        "grooming_inhouse",
        "grooming_mobile",
        "pickup_dropoff",
      ],
      sterilised_status: ["yes", "no", "unknown", "not_applicable"],
      stock_movement_reason: [
        "receive",
        "sale",
        "adjustment",
        "wastage",
        "return",
      ],
      tenant_status: ["active", "suspended", "archived"],
      user_type: ["platform", "staff", "customer"],
    },
  },
} as const
