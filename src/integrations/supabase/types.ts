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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          institution_id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          institution_id: string
          is_active?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          id: string
          institution_id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          id: string
          institution_id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          campus_id: string
          capacity: number | null
          created_at: string
          deleted_at: string | null
          floor: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          floor?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          floor?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          institution_id: string
          is_active: boolean
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      location_pings: {
        Row: {
          accuracy: number | null
          created_at: string
          heading: number | null
          id: string
          institution_id: string
          lat: number
          lng: number
          recorded_at: string
          speed: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          institution_id: string
          lat: number
          lng: number
          recorded_at?: string
          speed?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          institution_id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          speed?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "transport_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      route_stops: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          institution_id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          order_index: number
          planned_time: string | null
          planned_to_home: string | null
          planned_to_school: string | null
          route_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          order_index?: number
          planned_time?: string | null
          planned_to_home?: string | null
          planned_to_school?: string | null
          route_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          order_index?: number
          planned_time?: string | null
          planned_to_home?: string | null
          planned_to_school?: string | null
          route_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
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
          attendant_staff_id: string | null
          campus_id: string | null
          code: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id: string | null
          id: string
          institution_id: string
          is_active: boolean
          is_demo: boolean
          name: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          attendant_staff_id?: string | null
          campus_id?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          attendant_staff_id?: string | null
          campus_id?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_attendant_staff_id_fkey"
            columns: ["attendant_staff_id"]
            isOneToOne: false
            referencedRelation: "transport_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_driver_staff_id_fkey"
            columns: ["driver_staff_id"]
            isOneToOne: false
            referencedRelation: "transport_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          capacity: number | null
          created_at: string
          deleted_at: string | null
          grade_level_id: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          grade_level_id: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          grade_level_id?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_grade_level_id_fkey"
            columns: ["grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_track: boolean
          created_at: string
          deleted_at: string | null
          id: string
          institution_id: string
          is_active: boolean
          relation: string | null
          student_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_track?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          relation?: string | null
          student_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_track?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          relation?: string | null
          student_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_transport_assignments: {
        Row: {
          created_at: string
          deleted_at: string | null
          direction: Database["public"]["Enums"]["transport_direction"]
          id: string
          institution_id: string
          is_active: boolean
          is_demo: boolean
          route_id: string
          stop_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          id?: string
          institution_id: string
          is_active?: boolean
          is_demo?: boolean
          route_id: string
          stop_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          id?: string
          institution_id?: string
          is_active?: boolean
          is_demo?: boolean
          route_id?: string
          stop_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_transport_assignments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_assignments_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          deleted_at: string | null
          first_name: string
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          institution_id: string
          is_active: boolean
          is_demo: boolean
          last_name: string
          national_id: string | null
          section_id: string | null
          student_no: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          first_name: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          is_demo?: boolean
          last_name: string
          national_id?: string | null
          section_id?: string | null
          student_no?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          first_name?: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          is_demo?: boolean
          last_name?: string
          national_id?: string | null
          section_id?: string | null
          student_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_absences: {
        Row: {
          absence_date: string
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["transport_direction"]
          id: string
          institution_id: string
          reason: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          id?: string
          institution_id: string
          reason?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          id?: string
          institution_id?: string
          reason?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_absences_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_absences_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["transport_event_type"]
          id: string
          institution_id: string
          lat: number | null
          lng: number | null
          note: string | null
          occurred_at: string
          stop_id: string | null
          student_id: string | null
          trip_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["transport_event_type"]
          id?: string
          institution_id: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          occurred_at?: string
          stop_id?: string | null
          student_id?: string | null
          trip_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["transport_event_type"]
          id?: string
          institution_id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          occurred_at?: string
          stop_id?: string | null
          student_id?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_events_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "transport_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_notifications: {
        Row: {
          body: string | null
          created_at: string
          guardian_user_id: string
          id: string
          idempotency_key: string
          institution_id: string
          read_at: string | null
          student_id: string
          title: string
          transport_event_id: string | null
          trip_id: string | null
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          guardian_user_id: string
          id?: string
          idempotency_key: string
          institution_id: string
          read_at?: string | null
          student_id: string
          title: string
          transport_event_id?: string | null
          trip_id?: string | null
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          guardian_user_id?: string
          id?: string
          idempotency_key?: string
          institution_id?: string
          read_at?: string | null
          student_id?: string
          title?: string
          transport_event_id?: string | null
          trip_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_notifications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_notifications_transport_event_id_fkey"
            columns: ["transport_event_id"]
            isOneToOne: false
            referencedRelation: "transport_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "transport_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_settings: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          location_retention_days: number
          ping_interval_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          location_retention_days?: number
          ping_interval_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          location_retention_days?: number
          ping_interval_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_settings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_staff: {
        Row: {
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          institution_id: string
          is_active: boolean
          is_demo: boolean
          license_no: string | null
          notes: string | null
          phone: string | null
          staff_role: Database["public"]["Enums"]["transport_staff_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          institution_id: string
          is_active?: boolean
          is_demo?: boolean
          license_no?: string | null
          notes?: string | null
          phone?: string | null
          staff_role?: Database["public"]["Enums"]["transport_staff_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          is_demo?: boolean
          license_no?: string | null
          notes?: string | null
          phone?: string | null
          staff_role?: Database["public"]["Enums"]["transport_staff_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_staff_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_trips: {
        Row: {
          attendant_staff_id: string | null
          created_at: string
          deleted_at: string | null
          direction: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          institution_id: string
          is_demo: boolean
          last_accuracy: number | null
          last_heading: number | null
          last_lat: number | null
          last_lng: number | null
          last_location_at: string | null
          last_speed: number | null
          route_id: string
          started_at: string
          started_by: string | null
          status: Database["public"]["Enums"]["transport_trip_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          attendant_staff_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          institution_id: string
          is_demo?: boolean
          last_accuracy?: number | null
          last_heading?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_at?: string | null
          last_speed?: number | null
          route_id: string
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["transport_trip_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          attendant_staff_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["transport_direction"]
          driver_staff_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          institution_id?: string
          is_demo?: boolean
          last_accuracy?: number | null
          last_heading?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_at?: string | null
          last_speed?: number | null
          route_id?: string
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["transport_trip_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_trips_attendant_staff_id_fkey"
            columns: ["attendant_staff_id"]
            isOneToOne: false
            referencedRelation: "transport_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_trips_driver_staff_id_fkey"
            columns: ["driver_staff_id"]
            isOneToOne: false
            referencedRelation: "transport_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_trips_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_institutions: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_institutions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
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
      vehicles: {
        Row: {
          brand: string | null
          capacity: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          institution_id: string
          is_active: boolean
          is_demo: boolean
          model: string | null
          model_year: number | null
          plate: string
          service_no: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          is_demo?: boolean
          model?: string | null
          model_year?: number | null
          plate: string
          service_no: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          is_demo?: boolean
          model?: string | null
          model_year?: number | null
          plate?: string
          service_no?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_institution: {
        Args: { _institution_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_guardian_of_route: {
        Args: { _route_id: string; _user_id: string }
        Returns: boolean
      }
      is_guardian_of_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_guardian_of_trip: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      is_transport_staff_of_route: {
        Args: { _route_id: string; _user_id: string }
        Returns: boolean
      }
      is_transport_staff_of_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_transport_staff_of_trip: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      my_transport_staff_id: { Args: { _user_id: string }; Returns: string }
      notify_transport_approaching: {
        Args: { _student_id: string; _trip_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "kurum_yoneticisi"
        | "okul_yoneticisi"
        | "mudur_yardimcisi"
        | "ogretmen"
        | "rehberlik"
        | "koc_ogretmen"
        | "veli"
        | "ogrenci"
        | "personel"
      transport_direction: "to_school" | "to_home" | "both"
      transport_event_type:
        | "START_TRIP"
        | "LOCATION"
        | "BOARDING"
        | "NO_SHOW"
        | "DISEMBARK"
        | "END_TRIP"
        | "VEHICLE_CHECK"
      transport_staff_role: "driver" | "attendant"
      transport_trip_status: "planned" | "active" | "completed" | "cancelled"
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
      app_role: [
        "super_admin",
        "kurum_yoneticisi",
        "okul_yoneticisi",
        "mudur_yardimcisi",
        "ogretmen",
        "rehberlik",
        "koc_ogretmen",
        "veli",
        "ogrenci",
        "personel",
      ],
      transport_direction: ["to_school", "to_home", "both"],
      transport_event_type: [
        "START_TRIP",
        "LOCATION",
        "BOARDING",
        "NO_SHOW",
        "DISEMBARK",
        "END_TRIP",
        "VEHICLE_CHECK",
      ],
      transport_staff_role: ["driver", "attendant"],
      transport_trip_status: ["planned", "active", "completed", "cancelled"],
    },
  },
} as const
