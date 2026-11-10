CREATE TABLE public.hotel_desk_prep (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  ribbon_made boolean NOT NULL DEFAULT false,
  checkin_card boolean NOT NULL DEFAULT false,
  gift boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hotel_desk_prep TO authenticated;
GRANT ALL ON public.hotel_desk_prep TO service_role;
ALTER TABLE public.hotel_desk_prep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel viewers read prep" ON public.hotel_desk_prep FOR SELECT TO authenticated USING (public.user_has_permission(tenant_id,'hotel.view'));
CREATE POLICY "hotel viewers add prep" ON public.hotel_desk_prep FOR INSERT TO authenticated WITH CHECK (public.user_has_permission(tenant_id,'hotel.view') AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.tenant_id=hotel_desk_prep.tenant_id));
CREATE POLICY "hotel viewers edit prep" ON public.hotel_desk_prep FOR UPDATE TO authenticated USING (public.user_has_permission(tenant_id,'hotel.view')) WITH CHECK (public.user_has_permission(tenant_id,'hotel.view') AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.tenant_id=hotel_desk_prep.tenant_id));