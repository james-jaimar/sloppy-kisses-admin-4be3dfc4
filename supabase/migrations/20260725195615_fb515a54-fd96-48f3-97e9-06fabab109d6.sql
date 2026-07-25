-- 1. Table
CREATE TABLE public.dog_breeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  size_band text NOT NULL CHECK (size_band IN ('small','medium','large','xlarge','xxlarge')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Grants
GRANT SELECT ON public.dog_breeds TO anon, authenticated;
GRANT ALL ON public.dog_breeds TO service_role;

-- 3. RLS
ALTER TABLE public.dog_breeds ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "dog_breeds_read_all" ON public.dog_breeds
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dog_breeds_admin_write" ON public.dog_breeds
  FOR ALL TO authenticated
  USING (
    public.is_platform_owner() OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.status = 'active'
        AND tu.profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        AND public.user_has_permission(tu.tenant_id, 'settings.grooming.manage')
    )
  )
  WITH CHECK (
    public.is_platform_owner() OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.status = 'active'
        AND tu.profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        AND public.user_has_permission(tu.tenant_id, 'settings.grooming.manage')
    )
  );

-- updated_at trigger
CREATE TRIGGER dog_breeds_set_updated_at
  BEFORE UPDATE ON public.dog_breeds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed
INSERT INTO public.dog_breeds (name, size_band) VALUES
  -- Small
  ('Biewer Terrier','small'),('Boston Terrier','small'),('Chihuahua','small'),
  ('Daschund','small'),('Doberman Pincher','small'),('Fox Terrier','small'),
  ('French Bulldog','small'),('Jack Russel','small'),('Lhasa Apso','small'),
  ('Maltese','small'),('Morkie','small'),('Pekingese','small'),
  ('Pug','small'),('Shih-Tzu','small'),('Yorkie','small'),
  ('Teacup Yorkie','small'),('Toy Pom','small'),
  -- Medium
  ('American Hairless','medium'),('Basenji','medium'),('Beagle','medium'),
  ('Bichon Frise','medium'),('Bull Terrier','medium'),('Cairn Terrier','medium'),
  ('Cavalier King Charles Spaniel','medium'),('Chinese Crested','medium'),
  ('Cocker Spaniel','medium'),('Cockerpoo','medium'),('Corgi','medium'),
  ('English Bulldog','medium'),('German Spitz','medium'),('Greyhound','medium'),
  ('Havanese','medium'),('Papillon','medium'),('Pomsky','medium'),
  ('Schnauzer','medium'),('Scottish Terrier','medium'),('Shar-Pei','medium'),
  ('Staffie','medium'),('Toy Poodle','medium'),
  ('West Highland Terrier','medium'),('Wire Haired Terrier','medium'),
  -- Large (Dutch Shepherd / Great Pyrenees / Irish Wolfhound bumped to XXL)
  ('Afghan Hound','large'),('Amstaff','large'),('Airedale','large'),
  ('American Bulldog','large'),('Australian Shepherd','large'),('Basset Hound','large'),
  ('Bloodhound','large'),('Border Collie','large'),('Bouvier Des Flandres','large'),
  ('Boxer','large'),('Dalmatian','large'),('Doberman','large'),
  ('Labrador','large'),('Malinois','large'),('Pitbull Terrier','large'),
  ('Pointer','large'),('Ridgeback','large'),('Rottweiler','large'),
  ('Shetland Sheepdog','large'),('Shepsky','large'),('Springer Spaniel','large'),
  ('Weimaraner','large'),
  -- X-Large
  ('American Pitbull','xlarge'),('Bearded Collie','xlarge'),('Boerboel','xlarge'),
  ('Bullmastiff','xlarge'),('Chow Chow','xlarge'),('Giant Schnauzer','xlarge'),
  ('German Shepherd','xlarge'),('Golden Retriever','xlarge'),('Golden Doodle','xlarge'),
  ('Great Dane','xlarge'),('Labradoodle','xlarge'),('Mastiff','xlarge'),
  ('Siberian Husky','xlarge'),('Swiss Shepherd','xlarge'),
  -- XX-Large
  ('Alaskan Malamute','xxlarge'),('Bernese Mountain Dog','xxlarge'),
  ('Black Russian Terrier','xxlarge'),('Dutch Shepherd','xxlarge'),
  ('Great Pyrenees','xxlarge'),('Irish Wolfhound','xxlarge'),
  ('Newfoundland','xxlarge'),('Russian Ovcharka','xxlarge'),
  ('Saint Bernard','xxlarge'),('Standard Poodle','xxlarge');
