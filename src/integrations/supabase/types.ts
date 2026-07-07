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
          pet_id: string | null
          preferred_end_at: string | null
          preferred_start_at: string | null
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
          pet_id?: string | null
          preferred_end_at?: string | null
          preferred_start_at?: string | null
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
          pet_id?: string | null
          preferred_end_at?: string | null
          preferred_start_at?: string | null
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
        ]
      }
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          created_at: string
          created_by: string | null
          customer_number: string
          email: string | null
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
          occupation: string | null
          phone_alt: string | null
          portal_access_enabled: boolean
          postcode: string | null
          province: string | null
          status: Database["public"]["Enums"]["customer_status"]
          suburb: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          work_address: string | null
          xero_customer_id: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_number: string
          email?: string | null
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
          occupation?: string | null
          phone_alt?: string | null
          portal_access_enabled?: boolean
          postcode?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          suburb?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          work_address?: string | null
          xero_customer_id?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_number?: string
          email?: string | null
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
          occupation?: string | null
          phone_alt?: string | null
          portal_access_enabled?: boolean
          postcode?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          suburb?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
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
      documents: {
        Row: {
          booking_id: string | null
          booking_request_id: string | null
          created_at: string
          customer_id: string | null
          file_name: string
          file_path: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          notes: string | null
          pet_id: string | null
          status: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          type: string
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          pet_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          type: string
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          pet_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id?: string
          type?: string
          updated_at?: string
          uploaded_by?: string | null
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
            foreignKeyName: "documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          sedation_surcharge_zar: number | null
          service_package: string | null
          surcharge_amount: number
          tenant_id: string
          travel_fee: number
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_id: string
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
          sedation_surcharge_zar?: number | null
          service_package?: string | null
          surcharge_amount?: number
          tenant_id: string
          travel_fee?: number
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_id?: string
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
          sedation_surcharge_zar?: number | null
          service_package?: string | null
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
      invoice_items: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
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
          id?: string
          invoice_id: string
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
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sort_order?: number
          tenant_id?: string
          unit_price?: number
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
          created_at: string
          created_by: string | null
          customer_id: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string | null
          notes: string | null
          payment_reference: string | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["billing_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
          xero_invoice_id: string | null
          xero_invoice_number: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string | null
          notes?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string | null
          notes?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
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
      notification_events: {
        Row: {
          booking_id: string | null
          booking_request_id: string | null
          created_at: string
          customer_id: string | null
          error: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          tenant_id: string
        }
        Insert: {
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          error?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          tenant_id: string
        }
        Update: {
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          error?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          tenant_id?: string
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
            foreignKeyName: "notification_events_tenant_id_fkey"
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
          created_at: string
          customer_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          proof_document_id: string | null
          recorded_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          proof_document_id?: string | null
          recorded_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          proof_document_id?: string | null
          recorded_by?: string | null
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
      pets: {
        Row: {
          age_years: number | null
          aggression_flag: boolean
          barker: boolean
          behaviour_notes: string | null
          breed: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          date_of_birth: string | null
          id: string
          import_batch: string | null
          import_source: string | null
          imported_at: string | null
          insurance_number: string | null
          insurance_provider: string | null
          jumper: boolean
          legacy_customer_number: string | null
          marks_colour: string | null
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
          social: boolean | null
          special_handling_flag: boolean
          species: Database["public"]["Enums"]["pet_species"]
          status: Database["public"]["Enums"]["customer_status"]
          sterilised_status: Database["public"]["Enums"]["sterilised_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_years?: number | null
          aggression_flag?: boolean
          barker?: boolean
          behaviour_notes?: string | null
          breed?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          date_of_birth?: string | null
          id?: string
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          insurance_number?: string | null
          insurance_provider?: string | null
          jumper?: boolean
          legacy_customer_number?: string | null
          marks_colour?: string | null
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
          social?: boolean | null
          special_handling_flag?: boolean
          species: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["customer_status"]
          sterilised_status?: Database["public"]["Enums"]["sterilised_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_years?: number | null
          aggression_flag?: boolean
          barker?: boolean
          behaviour_notes?: string | null
          breed?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date_of_birth?: string | null
          id?: string
          import_batch?: string | null
          import_source?: string | null
          imported_at?: string | null
          insurance_number?: string | null
          insurance_provider?: string | null
          jumper?: boolean
          legacy_customer_number?: string | null
          marks_colour?: string | null
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
          social?: boolean | null
          special_handling_flag?: boolean
          species?: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["customer_status"]
          sterilised_status?: Database["public"]["Enums"]["sterilised_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
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
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          external_code: string | null
          id: string
          name: string
          sell_price: number | null
          sku: string | null
          tenant_id: string
          updated_at: string
          xero_item_id: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          external_code?: string | null
          id?: string
          name: string
          sell_price?: number | null
          sku?: string | null
          tenant_id: string
          updated_at?: string
          xero_item_id?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          external_code?: string | null
          id?: string
          name?: string
          sell_price?: number | null
          sku?: string | null
          tenant_id?: string
          updated_at?: string
          xero_item_id?: string | null
        }
        Relationships: [
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
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
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
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
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
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
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
      vaccinations: {
        Row: {
          administered_date: string | null
          created_at: string
          document_id: string | null
          expiry_date: string | null
          id: string
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
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
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
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
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
      [_ in never]: never
    }
    Functions: {
      _customer_notify_status: {
        Args: { target_customer_id: string }
        Returns: Database["public"]["Enums"]["notification_status"]
      }
      current_customer_id: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      is_platform_owner: { Args: never; Returns: boolean }
      next_booking_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_customer_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      next_pet_number: { Args: { target_tenant_id: string }; Returns: string }
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
      customer_status: "active" | "inactive" | "archived"
      document_status: "pending" | "verified" | "rejected" | "expired"
      email_status: "queued" | "sent" | "failed"
      notification_event_type:
        | "booking_created"
        | "booking_rescheduled"
        | "booking_cancelled"
        | "booking_status_changed"
        | "booking_request_created"
        | "booking_request_status_changed"
      notification_status: "pending" | "sent" | "failed" | "skipped"
      payment_method: "eft" | "cash" | "card" | "yoko" | "payfast" | "other"
      pet_sex: "male" | "female" | "unknown"
      pet_size: "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge"
      pet_species: "dog" | "cat" | "other"
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
      customer_status: ["active", "inactive", "archived"],
      document_status: ["pending", "verified", "rejected", "expired"],
      email_status: ["queued", "sent", "failed"],
      notification_event_type: [
        "booking_created",
        "booking_rescheduled",
        "booking_cancelled",
        "booking_status_changed",
        "booking_request_created",
        "booking_request_status_changed",
      ],
      notification_status: ["pending", "sent", "failed", "skipped"],
      payment_method: ["eft", "cash", "card", "yoko", "payfast", "other"],
      pet_sex: ["male", "female", "unknown"],
      pet_size: ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"],
      pet_species: ["dog", "cat", "other"],
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
      tenant_status: ["active", "suspended", "archived"],
      user_type: ["platform", "staff", "customer"],
    },
  },
} as const
