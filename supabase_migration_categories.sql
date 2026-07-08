-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  image_url   text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_read"         ON categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_insert" ON categories FOR INSERT WITH CHECK (public.current_role() = 'admin');
CREATE POLICY "categories_admin_update" ON categories FOR UPDATE USING  (public.current_role() = 'admin');
CREATE POLICY "categories_admin_delete" ON categories FOR DELETE USING  (public.current_role() = 'admin');

-- Junction table: pickles ↔ categories (many-to-many)
CREATE TABLE IF NOT EXISTS pickle_categories (
  pickle_id   uuid NOT NULL REFERENCES pickles(id)     ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id)  ON DELETE CASCADE,
  PRIMARY KEY (pickle_id, category_id)
);

ALTER TABLE pickle_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for product detail page)
CREATE POLICY "pickle_categories_read" ON pickle_categories FOR SELECT USING (true);

-- Sellers manage categories for their own products; admin can do anything
CREATE POLICY "pickle_categories_insert" ON pickle_categories FOR INSERT WITH CHECK (
  public.current_role() = 'admin' OR (
    public.current_role() IN ('primary_seller', 'sub_seller') AND
    EXISTS (SELECT 1 FROM pickles WHERE id = pickle_id AND store_id = public.current_store_id())
  )
);

CREATE POLICY "pickle_categories_delete" ON pickle_categories FOR DELETE USING (
  public.current_role() = 'admin' OR (
    public.current_role() IN ('primary_seller', 'sub_seller') AND
    EXISTS (SELECT 1 FROM pickles WHERE id = pickle_id AND store_id = public.current_store_id())
  )
);
