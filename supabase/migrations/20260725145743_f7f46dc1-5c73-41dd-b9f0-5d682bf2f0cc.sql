
-- ============ CATALOG ============
CREATE TABLE public.grooming_instruction_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi','text','number','bool')),
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  is_medical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_instruction_groups TO authenticated;
GRANT ALL ON public.grooming_instruction_groups TO service_role;
ALTER TABLE public.grooming_instruction_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gig_read_tenant" ON public.grooming_instruction_groups FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id)
      OR tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = auth.uid()));
CREATE POLICY "gig_manage_admin" ON public.grooming_instruction_groups FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

CREATE TABLE public.grooming_instruction_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.grooming_instruction_groups(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  is_alert boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_instruction_options TO authenticated;
GRANT ALL ON public.grooming_instruction_options TO service_role;
ALTER TABLE public.grooming_instruction_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gio_read_tenant" ON public.grooming_instruction_options FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id)
      OR tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = auth.uid()));
CREATE POLICY "gio_manage_admin" ON public.grooming_instruction_options FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

-- ============ PET DEFAULTS ============
CREATE TABLE public.pet_grooming_defaults (
  pet_id uuid PRIMARY KEY REFERENCES public.pets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_flags text[] NOT NULL DEFAULT '{}',
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_grooming_defaults TO authenticated;
GRANT ALL ON public.pet_grooming_defaults TO service_role;
ALTER TABLE public.pet_grooming_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgd_staff_all" ON public.pet_grooming_defaults FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE POLICY "pgd_customer_own" ON public.pet_grooming_defaults FOR ALL TO authenticated
  USING (pet_id IN (SELECT p.id FROM public.pets p JOIN public.customers c ON c.id = p.customer_id WHERE c.linked_profile_id = auth.uid()))
  WITH CHECK (pet_id IN (SELECT p.id FROM public.pets p JOIN public.customers c ON c.id = p.customer_id WHERE c.linked_profile_id = auth.uid()));

-- ============ BOOKING INSTRUCTIONS ============
CREATE TABLE public.grooming_booking_instructions (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_flags text[] NOT NULL DEFAULT '{}',
  notes text,
  told_office_to_call text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_booking_instructions TO authenticated;
GRANT ALL ON public.grooming_booking_instructions TO service_role;
ALTER TABLE public.grooming_booking_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbi_staff_all" ON public.grooming_booking_instructions FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE POLICY "gbi_customer_read" ON public.grooming_booking_instructions FOR SELECT TO authenticated
  USING (booking_id IN (SELECT b.id FROM public.bookings b JOIN public.customers c ON c.id = b.customer_id WHERE c.linked_profile_id = auth.uid()));

-- ============ WORKFLOW SETTINGS EXTENSION ============
ALTER TABLE public.grooming_workflow_settings
  ADD COLUMN IF NOT EXISTS matted_rate_per_15min_zar numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS overtime_threshold_minutes int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS after_grooming_stay_play_zar numeric NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS pickup_dropoff_fee_zar numeric NOT NULL DEFAULT 140,
  ADD COLUMN IF NOT EXISTS puppy_half_price_max_months int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS pensioner_discount_days int[] NOT NULL DEFAULT '{1,3}',
  ADD COLUMN IF NOT EXISTS cancellation_fee_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS sedation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sedation_default_fee_zar numeric NOT NULL DEFAULT 0;

-- ============ BOOKING DETAILS: SEDATION CONSENT ============
ALTER TABLE public.grooming_booking_details
  ADD COLUMN IF NOT EXISTS sedation_consent_state text NOT NULL DEFAULT 'not_needed'
    CHECK (sedation_consent_state IN ('not_needed','requested','consented','declined')),
  ADD COLUMN IF NOT EXISTS sedation_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sedation_consent_channel text,
  ADD COLUMN IF NOT EXISTS sedation_consent_note text,
  ADD COLUMN IF NOT EXISTS cancellation_fee_zar numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_waive_reason text,
  ADD COLUMN IF NOT EXISTS stay_and_play_after boolean NOT NULL DEFAULT false;

-- ============ SEED CATALOG PER TENANT ============
DO $$
DECLARE t record;
  g_shampoo uuid; g_head_face uuid; g_teeth uuid; g_eyes uuid; g_brows uuid;
  g_fringe uuid; g_mous uuid; g_beard uuid; g_ears uuid; g_topknot uuid;
  g_body uuid; g_aircon uuid; g_legs uuid; g_skirt uuid; g_hyg uuid;
  g_tail uuid; g_feet uuid; g_acc uuid; g_med uuid; g_blade uuid; g_anal uuid;
  g_special uuid; g_toldcall uuid;
BEGIN
FOR t IN SELECT id FROM public.tenants LOOP

  -- helper: insert group and returning id via CTE not available, use per-group inserts
  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'shampoo','Shampoo / Conditioner','multi',10) RETURNING id INTO g_shampoo;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_shampoo,'own','Own shampoo/conditioner',10),
    (t.id,g_shampoo,'regular','Regular',20),
    (t.id,g_shampoo,'tick_flea','Tick & Flea',30),
    (t.id,g_shampoo,'deshedding','De-shedding',40),
    (t.id,g_shampoo,'hypoallergenic','Hypoallergenic',50),
    (t.id,g_shampoo,'purple','Purple/Whitening',60);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'head_face','Face','single',20) RETURNING id INTO g_head_face;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_head_face,'rounded','Rounded',10),(t.id,g_head_face,'square','Square',20),
    (t.id,g_head_face,'puppy','Puppy',30),(t.id,g_head_face,'neaten','Neaten up',40),
    (t.id,g_head_face,'leave','Leave',50);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'teeth','Teeth','single',30) RETURNING id INTO g_teeth;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_teeth,'gel_only','Gel only (included)',10),
    (t.id,g_teeth,'toothbrush_purchased','Toothbrush purchased (+add-on)',20),
    (t.id,g_teeth,'toothbrush_provided','Toothbrush provided (+add-on)',30);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'eyes','Eyes','single',40) RETURNING id INTO g_eyes;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_eyes,'clean','Clean',10),(t.id,g_eyes,'cut','Cut',20),
    (t.id,g_eyes,'trim','Trim',30),(t.id,g_eyes,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'eyebrows','Eyebrows','single',50) RETURNING id INTO g_brows;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_brows,'trim','Trim',10),(t.id,g_brows,'cut','Cut',20),
    (t.id,g_brows,'short','Short',30),(t.id,g_brows,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'fringe','Fringe','single',60) RETURNING id INTO g_fringe;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_fringe,'trim','Trim',10),(t.id,g_fringe,'cut_short','Cut short',20),
    (t.id,g_fringe,'tie_up','Tie up',30),(t.id,g_fringe,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'moustache','Moustache','single',70) RETURNING id INTO g_mous;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_mous,'trim','Trim',10),(t.id,g_mous,'shave','Shave off',20),
    (t.id,g_mous,'half','Half off',30),(t.id,g_mous,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'beard','Beard','single',80) RETURNING id INTO g_beard;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_beard,'trim','Trim',10),(t.id,g_beard,'shave','Shave off',20),
    (t.id,g_beard,'half','Half off',30),(t.id,g_beard,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'ears','Ears','single',90) RETURNING id INTO g_ears;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_ears,'trim','Trim',10),(t.id,g_ears,'shave','Shave off',20),
    (t.id,g_ears,'half','Half off',30),(t.id,g_ears,'clean','Clean',40),
    (t.id,g_ears,'leave','Leave',50);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'top_knot','Top knot','single',100) RETURNING id INTO g_topknot;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_topknot,'trim','Trim',10),(t.id,g_topknot,'shave','Shave off',20),
    (t.id,g_topknot,'half','Half off',30),(t.id,g_topknot,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'body','Body','single',110) RETURNING id INTO g_body;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_body,'breed_specific','Breed specific',10),(t.id,g_body,'strip','Strip body',20),
    (t.id,g_body,'summer','Summer cut',30),(t.id,g_body,'winter','Winter cut',40),
    (t.id,g_body,'half','Half off',50),(t.id,g_body,'tidy','Tidy & trim',60),
    (t.id,g_body,'no_shaving','No shaving & no cutting',70),(t.id,g_body,'leave','Leave',80);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'blade','Blade','text',115);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'aircon_strip','Aircon strip','single',120) RETURNING id INTO g_aircon;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_aircon,'from_chest','From chest',10),(t.id,g_aircon,'from_tummy','From tummy',20),
    (t.id,g_aircon,'none','None',30);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'legs','Legs','single',130) RETURNING id INTO g_legs;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_legs,'trim','Trim',10),(t.id,g_legs,'half','Half off',20),
    (t.id,g_legs,'shave','Shave',30),(t.id,g_legs,'pom_poms','Pom poms',40),
    (t.id,g_legs,'leave','Leave',50);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'skirt','Skirt','single',140) RETURNING id INTO g_skirt;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_skirt,'trim','Trim',10),(t.id,g_skirt,'half','Half off',20),
    (t.id,g_skirt,'shave','Shave',30),(t.id,g_skirt,'leave','Leave',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'hygiene_cut','Hygiene cut','single',150) RETURNING id INTO g_hyg;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_hyg,'wide','Wide',10),(t.id,g_hyg,'narrow','Narrow',20),
    (t.id,g_hyg,'standard','Standard',30),(t.id,g_hyg,'bum_only','Bum area only',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'anal_glands','Anal glands','bool',155);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'tail','Tail','single',160) RETURNING id INTO g_tail;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_tail,'trim','Trim',10),(t.id,g_tail,'half','Half off',20),
    (t.id,g_tail,'shave','Shave',30),(t.id,g_tail,'short','Cut short',40),
    (t.id,g_tail,'leave','Leave',50);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'feet','Feet','multi',170) RETURNING id INTO g_feet;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_feet,'shave_tops','Shave tops',10),(t.id,g_feet,'nails_trim','Nails trim',20),
    (t.id,g_feet,'file','File',30),(t.id,g_feet,'paw_pad','Paw & pad',40);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'accessories','Accessories','multi',180) RETURNING id INTO g_acc;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order) VALUES
    (t.id,g_acc,'bow','Bow',10),(t.id,g_acc,'bandana','Bandana',20),
    (t.id,g_acc,'clips','Clips',30),(t.id,g_acc,'bands','Bands',40),
    (t.id,g_acc,'perfume','Perfume',50),(t.id,g_acc,'none','None',60);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order,is_medical) VALUES
    (t.id,'medical','Medical / alert flags','multi',190,true) RETURNING id INTO g_med;
  INSERT INTO public.grooming_instruction_options(tenant_id,group_id,code,label,sort_order,is_alert) VALUES
    (t.id,g_med,'warts','Warts',10,true),(t.id,g_med,'lumps','Lumps',20,true),
    (t.id,g_med,'sores','Sores',30,true),(t.id,g_med,'cuts','Cuts',40,true),
    (t.id,g_med,'faints','Faints',50,true),(t.id,g_med,'aggressive','Aggressive',60,true),
    (t.id,g_med,'ticks','Ticks',70,true),(t.id,g_med,'fleas','Fleas',80,true),
    (t.id,g_med,'worms','Worms',90,true),(t.id,g_med,'leg_injury','Leg injury',100,true),
    (t.id,g_med,'skin','Skin condition',110,true),(t.id,g_med,'biter','Biter',120,true),
    (t.id,g_med,'needs_muzzle','Needs muzzle',130,true),(t.id,g_med,'back_op','Back operation',140,true),
    (t.id,g_med,'heart','Heart condition',150,true);

  INSERT INTO public.grooming_instruction_groups(tenant_id,code,label,kind,sort_order) VALUES
    (t.id,'special_instructions','Special instructions','text',200),
    (t.id,'other_notes','Other','text',210),
    (t.id,'told_office_to_call','Told office to call','text',220);

  -- ============ SEED PACKAGES 2026 ============
  -- Dog Full package
  INSERT INTO public.grooming_packages(tenant_id,code,name,species,size_band,package_type,price_zar,expected_minutes,sort_order)
  VALUES
    (t.id,'dog_full_small','Dog Full Package — Small','dog','small','full',445,60,10),
    (t.id,'dog_full_medium','Dog Full Package — Medium','dog','medium','full',500,75,20),
    (t.id,'dog_full_large','Dog Full Package — Large','dog','large','full',545,90,30),
    (t.id,'dog_full_xl','Dog Full Package — X-Large','dog','xl','full',620,105,40),
    (t.id,'dog_full_xxl','Dog Full Package — XX-Large','dog','xxl','full',700,120,50),
    (t.id,'dog_express_small','Dog Express Wash & Dry — Small','dog','small','express',320,40,60),
    (t.id,'dog_express_medium','Dog Express Wash & Dry — Medium','dog','medium','express',370,50,70),
    (t.id,'dog_express_large','Dog Express Wash & Dry — Large','dog','large','express',385,60,80),
    (t.id,'dog_express_xl','Dog Express Wash & Dry — X-Large','dog','xl','express',450,70,90),
    (t.id,'dog_express_xxl','Dog Express Wash & Dry — XX-Large','dog','xxl','express',490,80,100),
    (t.id,'cat_full','Cat — Bath, Brush, Style & Shave','cat',NULL,'full',570,60,110)
  ON CONFLICT DO NOTHING;

  -- Add-ons 2026
  INSERT INTO public.grooming_addons(tenant_id,code,name,price_zar,kind,sort_order) VALUES
    (t.id,'teeth_toothpaste','Teeth clean + toothpaste (brush supplied)',185,'teeth',10),
    (t.id,'nails_trim','Nail trimming',130,'nails',20),
    (t.id,'ear_clean','Ear cleaning',130,'ears',30),
    (t.id,'hand_strip','Hand stripping',50,'fixed',40),
    (t.id,'anal_gland','Anal gland express',185,'anal',50),
    (t.id,'travel_mobile','Mobile grooming travel fee',110,'travel',60),
    (t.id,'pickup_fee','Pickup fee (per way)',140,'travel',70),
    (t.id,'dropoff_fee','Drop-off fee (per way)',140,'travel',80),
    (t.id,'stay_play_after','After-groom Stay & Play',250,'fixed',90)
  ON CONFLICT DO NOTHING;

END LOOP;
END $$;

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_gio_group ON public.grooming_instruction_options(group_id);
CREATE INDEX IF NOT EXISTS idx_gig_tenant ON public.grooming_instruction_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pgd_tenant ON public.pet_grooming_defaults(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gbi_tenant ON public.grooming_booking_instructions(tenant_id);

-- ============ updated_at triggers ============
CREATE TRIGGER trg_gig_updated_at BEFORE UPDATE ON public.grooming_instruction_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gio_updated_at BEFORE UPDATE ON public.grooming_instruction_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pgd_updated_at BEFORE UPDATE ON public.pet_grooming_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gbi_updated_at BEFORE UPDATE ON public.grooming_booking_instructions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
