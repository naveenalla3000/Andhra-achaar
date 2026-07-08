--
-- PostgreSQL database dump
--

\restrict 5vmvaPuD5lkPwgz3sXt1Qy2ff55Wqx6wcjIC51mS5PS8oydKdy9Sidfhvhm7xOX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'primary_seller',
    'sub_seller',
    'customer'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'placed',
    'accepted',
    'ready_date_set',
    'ready_for_takeaway',
    'completed',
    'cancelled'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    store_id uuid NOT NULL,
    status public.order_status DEFAULT 'placed'::public.order_status NOT NULL,
    total_inr numeric(10,2) DEFAULT 0 NOT NULL,
    ready_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_name text,
    store_address text
);


--
-- Name: checkout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checkout() RETURNS SETOF public.orders
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_customer uuid := public.current_profile_id();
  v_store    uuid;
  v_order    public.orders;
begin
  if v_customer is null then
    raise exception 'No profile for current user';
  end if;

  if not exists (
    select 1 from public.cart_items where customer_id = v_customer
  ) then
    raise exception 'Cart is empty';
  end if;

  for v_store in
    select distinct p.store_id
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    where c.customer_id = v_customer
  loop
    insert into public.orders (customer_id, store_id, store_name, store_address, status, total_inr)
    select
      v_customer, v_store, s.name, s.address, 'placed',
      sum((vp.selling_price_inr + vp.packaging_cost) * c.quantity)
    from public.cart_items c
    join public.pickles            p  on p.id  = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.stores             s  on s.id  = p.store_id
    where c.customer_id = v_customer and p.store_id = v_store
    returning * into v_order;

    insert into public.order_items (
      order_id, pickle_id, pickle_name,
      variant_id, variant_label,
      packaging_type_name,
      selling_price_inr, packaging_cost, mrp_inr, discount_pct,
      unit_price_inr, quantity, line_total_inr
    )
    select
      v_order.id, p.id, p.name,
      pv.id, pv.label,
      pt.name,
      vp.selling_price_inr, vp.packaging_cost, vp.mrp_inr, vp.discount_pct,
      (vp.selling_price_inr + vp.packaging_cost), c.quantity,
      (vp.selling_price_inr + vp.packaging_cost) * c.quantity
    from public.cart_items c
    join public.pickles            p  on p.id  = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.pickle_variants    pv on pv.id = vp.variant_id
    join public.packaging_types    pt on pt.id = vp.packaging_type_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;


--
-- Name: current_profile_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_profile_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select id from public.user_profiles where supabase_id = auth.uid() limit 1;
$$;


--
-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."current_role"() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select role from public.user_profiles where supabase_id = auth.uid() limit 1;
$$;


--
-- Name: current_store_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_store_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select store_id from public.user_profiles where supabase_id = auth.uid() limit 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.user_profiles (supabase_id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'customer'::public.app_role
  )
  on conflict (supabase_id) do nothing;
  return new;
exception when others then
  raise log 'handle_new_user error for %: %', new.id, sqlerrm;
  return new;
end;
$$;


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    pickle_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_packaging_id uuid,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_section_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_section_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section_id uuid NOT NULL,
    pickle_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: home_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    layout_type text DEFAULT 'card'::text NOT NULL,
    banner_top_url text,
    banner_bottom_url text,
    CONSTRAINT home_sections_layout_type_check CHECK ((layout_type = ANY (ARRAY['card'::text, 'grid'::text, 'list'::text])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    pickle_id uuid,
    pickle_name text NOT NULL,
    unit_price_inr numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    line_total_inr numeric(10,2) NOT NULL,
    variant_id uuid,
    variant_label text,
    packaging_type_name text,
    selling_price_inr numeric(10,2),
    packaging_cost numeric(10,2),
    mrp_inr numeric(10,2),
    discount_pct numeric(5,2)
);


--
-- Name: packaging_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packaging_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text
);


--
-- Name: pickle_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickle_categories (
    pickle_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: pickle_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickle_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pickle_id uuid NOT NULL,
    image_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pickle_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickle_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pickle_id uuid NOT NULL,
    label text NOT NULL,
    mrp_inr numeric(10,2) DEFAULT 0 NOT NULL,
    selling_price_inr numeric(10,2) DEFAULT 0 NOT NULL,
    discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    CONSTRAINT pickle_variants_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct < (100)::numeric))),
    CONSTRAINT pickle_variants_mrp_inr_check CHECK ((mrp_inr >= (0)::numeric)),
    CONSTRAINT pickle_variants_selling_price_inr_check CHECK ((selling_price_inr >= (0)::numeric))
);


--
-- Name: pickles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    ingredients text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    price_inr numeric(10,2) DEFAULT 0 NOT NULL,
    is_veg boolean DEFAULT true NOT NULL
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    opens_at time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    closes_at time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
    primary_seller_id uuid,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    supabase_id uuid NOT NULL,
    full_name text,
    phone text,
    role public.app_role DEFAULT 'customer'::public.app_role NOT NULL,
    store_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: variant_packagings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_packagings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid NOT NULL,
    packaging_type_id uuid NOT NULL,
    packaging_cost numeric(10,2) DEFAULT 0 NOT NULL,
    mrp_inr numeric(10,2) NOT NULL,
    selling_price_inr numeric(10,2) NOT NULL,
    discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_customer_id_pickle_id_variant_packaging_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_customer_id_pickle_id_variant_packaging_id_key UNIQUE (customer_id, pickle_id, variant_packaging_id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: home_section_items home_section_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_section_items
    ADD CONSTRAINT home_section_items_pkey PRIMARY KEY (id);


--
-- Name: home_section_items home_section_items_section_id_pickle_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_section_items
    ADD CONSTRAINT home_section_items_section_id_pickle_id_key UNIQUE (section_id, pickle_id);


--
-- Name: home_sections home_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_sections
    ADD CONSTRAINT home_sections_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: packaging_types packaging_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packaging_types
    ADD CONSTRAINT packaging_types_name_key UNIQUE (name);


--
-- Name: packaging_types packaging_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packaging_types
    ADD CONSTRAINT packaging_types_pkey PRIMARY KEY (id);


--
-- Name: pickle_categories pickle_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_categories
    ADD CONSTRAINT pickle_categories_pkey PRIMARY KEY (pickle_id, category_id);


--
-- Name: pickle_images pickle_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_images
    ADD CONSTRAINT pickle_images_pkey PRIMARY KEY (id);


--
-- Name: pickle_variants pickle_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_variants
    ADD CONSTRAINT pickle_variants_pkey PRIMARY KEY (id);


--
-- Name: pickles pickles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickles
    ADD CONSTRAINT pickles_pkey PRIMARY KEY (id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_supabase_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_supabase_id_key UNIQUE (supabase_id);


--
-- Name: variant_packagings variant_packagings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_packagings
    ADD CONSTRAINT variant_packagings_pkey PRIMARY KEY (id);


--
-- Name: variant_packagings variant_packagings_variant_id_packaging_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_packagings
    ADD CONSTRAINT variant_packagings_variant_id_packaging_type_id_key UNIQUE (variant_id, packaging_type_id);


--
-- Name: idx_cart_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_customer ON public.cart_items USING btree (customer_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_store ON public.orders USING btree (store_id);


--
-- Name: idx_pickle_images_pickle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pickle_images_pickle ON public.pickle_images USING btree (pickle_id);


--
-- Name: idx_pickles_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pickles_store ON public.pickles USING btree (store_id);


--
-- Name: idx_stores_primary_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stores_primary_seller ON public.stores USING btree (primary_seller_id);


--
-- Name: idx_user_profiles_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_store_id ON public.user_profiles USING btree (store_id);


--
-- Name: idx_user_profiles_supabase_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_supabase_id ON public.user_profiles USING btree (supabase_id);


--
-- Name: idx_variants_pickle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_pickle ON public.pickle_variants USING btree (pickle_id);


--
-- Name: cart_items cart_items_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_pickle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pickle_id_fkey FOREIGN KEY (pickle_id) REFERENCES public.pickles(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_variant_packaging_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_packaging_id_fkey FOREIGN KEY (variant_packaging_id) REFERENCES public.variant_packagings(id) ON DELETE CASCADE;


--
-- Name: home_section_items home_section_items_pickle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_section_items
    ADD CONSTRAINT home_section_items_pickle_id_fkey FOREIGN KEY (pickle_id) REFERENCES public.pickles(id) ON DELETE CASCADE;


--
-- Name: home_section_items home_section_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_section_items
    ADD CONSTRAINT home_section_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.home_sections(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: pickle_categories pickle_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_categories
    ADD CONSTRAINT pickle_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: pickle_categories pickle_categories_pickle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_categories
    ADD CONSTRAINT pickle_categories_pickle_id_fkey FOREIGN KEY (pickle_id) REFERENCES public.pickles(id) ON DELETE CASCADE;


--
-- Name: pickle_images pickle_images_pickle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_images
    ADD CONSTRAINT pickle_images_pickle_id_fkey FOREIGN KEY (pickle_id) REFERENCES public.pickles(id) ON DELETE CASCADE;


--
-- Name: pickle_variants pickle_variants_pickle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickle_variants
    ADD CONSTRAINT pickle_variants_pickle_id_fkey FOREIGN KEY (pickle_id) REFERENCES public.pickles(id) ON DELETE CASCADE;


--
-- Name: pickles pickles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickles
    ADD CONSTRAINT pickles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: stores stores_primary_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_primary_seller_id_fkey FOREIGN KEY (primary_seller_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_supabase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_supabase_id_fkey FOREIGN KEY (supabase_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: variant_packagings variant_packagings_packaging_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_packagings
    ADD CONSTRAINT variant_packagings_packaging_type_id_fkey FOREIGN KEY (packaging_type_id) REFERENCES public.packaging_types(id);


--
-- Name: variant_packagings variant_packagings_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_packagings
    ADD CONSTRAINT variant_packagings_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.pickle_variants(id) ON DELETE CASCADE;


--
-- Name: pickle_images admin manage pickle images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manage pickle images" ON public.pickle_images TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: user_profiles admin manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manage profiles" ON public.user_profiles TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: stores admin manage stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manage stores" ON public.stores TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: pickle_variants admin manage variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manage variants" ON public.pickle_variants TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: packaging_types admin manages packaging_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manages packaging_types" ON public.packaging_types TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: home_section_items admin section items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin section items" ON public.home_section_items TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: home_sections admin sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin sections" ON public.home_sections TO authenticated USING ((public."current_role"() = 'admin'::public.app_role)) WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

--
-- Name: banners banners_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_delete ON public.banners FOR DELETE USING ((( SELECT user_profiles.role
   FROM public.user_profiles
  WHERE (user_profiles.supabase_id = auth.uid())) = 'admin'::public.app_role));


--
-- Name: banners banners_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_insert ON public.banners FOR INSERT WITH CHECK ((( SELECT user_profiles.role
   FROM public.user_profiles
  WHERE (user_profiles.supabase_id = auth.uid())) = 'admin'::public.app_role));


--
-- Name: banners banners_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_select ON public.banners FOR SELECT USING (((is_active = true) OR (( SELECT user_profiles.role
   FROM public.user_profiles
  WHERE (user_profiles.supabase_id = auth.uid())) = 'admin'::public.app_role)));


--
-- Name: banners banners_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_update ON public.banners FOR UPDATE USING ((( SELECT user_profiles.role
   FROM public.user_profiles
  WHERE (user_profiles.supabase_id = auth.uid())) = 'admin'::public.app_role));


--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_admin_delete ON public.categories FOR DELETE USING ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: categories categories_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_admin_insert ON public.categories FOR INSERT WITH CHECK ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: categories categories_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_admin_update ON public.categories FOR UPDATE USING ((public."current_role"() = 'admin'::public.app_role));


--
-- Name: categories categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_read ON public.categories FOR SELECT USING (true);


--
-- Name: home_section_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.home_section_items ENABLE ROW LEVEL SECURITY;

--
-- Name: home_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: orders order insert customer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order insert customer" ON public.orders FOR INSERT TO authenticated WITH CHECK ((customer_id = public.current_profile_id()));


--
-- Name: order_items order items insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order items insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.customer_id = public.current_profile_id())))));


--
-- Name: order_items order items read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order items read" ON public.order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.customer_id = public.current_profile_id()) OR (o.store_id = public.current_store_id()) OR (public."current_role"() = 'admin'::public.app_role))))));


--
-- Name: orders order read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order read" ON public.orders FOR SELECT TO authenticated USING (((customer_id = public.current_profile_id()) OR (store_id = public.current_store_id()) OR (public."current_role"() = 'admin'::public.app_role)));


--
-- Name: orders order update seller; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order update seller" ON public.orders FOR UPDATE TO authenticated USING (((store_id = public.current_store_id()) OR (public."current_role"() = 'admin'::public.app_role))) WITH CHECK (((store_id = public.current_store_id()) OR (public."current_role"() = 'admin'::public.app_role)));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_items own cart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own cart" ON public.cart_items TO authenticated USING ((customer_id = public.current_profile_id())) WITH CHECK ((customer_id = public.current_profile_id()));


--
-- Name: user_profiles own profile read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile read" ON public.user_profiles FOR SELECT TO authenticated USING (((supabase_id = auth.uid()) OR (public."current_role"() = 'admin'::public.app_role)));


--
-- Name: user_profiles own profile update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile update" ON public.user_profiles FOR UPDATE TO authenticated USING ((supabase_id = auth.uid())) WITH CHECK ((supabase_id = auth.uid()));


--
-- Name: packaging_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;

--
-- Name: pickle_images pickle images public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pickle images public read" ON public.pickle_images FOR SELECT TO authenticated, anon USING (true);


--
-- Name: pickle_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pickle_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: pickle_categories pickle_categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pickle_categories_delete ON public.pickle_categories FOR DELETE USING (((public."current_role"() = 'admin'::public.app_role) OR ((public."current_role"() = ANY (ARRAY['primary_seller'::public.app_role, 'sub_seller'::public.app_role])) AND (EXISTS ( SELECT 1
   FROM public.pickles
  WHERE ((pickles.id = pickle_categories.pickle_id) AND (pickles.store_id = public.current_store_id())))))));


--
-- Name: pickle_categories pickle_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pickle_categories_insert ON public.pickle_categories FOR INSERT WITH CHECK (((public."current_role"() = 'admin'::public.app_role) OR ((public."current_role"() = ANY (ARRAY['primary_seller'::public.app_role, 'sub_seller'::public.app_role])) AND (EXISTS ( SELECT 1
   FROM public.pickles
  WHERE ((pickles.id = pickle_categories.pickle_id) AND (pickles.store_id = public.current_store_id())))))));


--
-- Name: pickle_categories pickle_categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pickle_categories_read ON public.pickle_categories FOR SELECT USING (true);


--
-- Name: pickle_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pickle_images ENABLE ROW LEVEL SECURITY;

--
-- Name: pickle_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pickle_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: pickles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pickles ENABLE ROW LEVEL SECURITY;

--
-- Name: pickles pickles public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pickles public read" ON public.pickles FOR SELECT TO authenticated, anon USING (true);


--
-- Name: packaging_types read packaging_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read packaging_types" ON public.packaging_types FOR SELECT TO authenticated USING (true);


--
-- Name: variant_packagings read variant_packagings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read variant_packagings" ON public.variant_packagings FOR SELECT TO authenticated USING (true);


--
-- Name: home_section_items section items public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "section items public read" ON public.home_section_items FOR SELECT TO authenticated, anon USING (true);


--
-- Name: home_sections sections public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sections public read" ON public.home_sections FOR SELECT TO authenticated, anon USING (true);


--
-- Name: stores seller update own store; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "seller update own store" ON public.stores FOR UPDATE TO authenticated USING ((id = public.current_store_id())) WITH CHECK ((id = public.current_store_id()));


--
-- Name: pickle_images sellers manage pickle images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sellers manage pickle images" ON public.pickle_images TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pickles p
  WHERE ((p.id = pickle_images.pickle_id) AND (p.store_id = public.current_store_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pickles p
  WHERE ((p.id = pickle_images.pickle_id) AND (p.store_id = public.current_store_id())))));


--
-- Name: pickles sellers manage pickles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sellers manage pickles" ON public.pickles TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::public.app_role, 'primary_seller'::public.app_role, 'sub_seller'::public.app_role])) AND ((public."current_role"() = 'admin'::public.app_role) OR (store_id = public.current_store_id())))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::public.app_role, 'primary_seller'::public.app_role, 'sub_seller'::public.app_role])) AND ((public."current_role"() = 'admin'::public.app_role) OR (store_id = public.current_store_id()))));


--
-- Name: variant_packagings sellers manage variant_packagings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sellers manage variant_packagings" ON public.variant_packagings TO authenticated USING (((public."current_role"() = 'admin'::public.app_role) OR ((public."current_role"() = 'primary_seller'::public.app_role) AND (EXISTS ( SELECT 1
   FROM (public.pickle_variants pv
     JOIN public.pickles p ON ((p.id = pv.pickle_id)))
  WHERE ((pv.id = variant_packagings.variant_id) AND (p.store_id = public.current_store_id()))))))) WITH CHECK (((public."current_role"() = 'admin'::public.app_role) OR ((public."current_role"() = 'primary_seller'::public.app_role) AND (EXISTS ( SELECT 1
   FROM (public.pickle_variants pv
     JOIN public.pickles p ON ((p.id = pv.pickle_id)))
  WHERE ((pv.id = variant_packagings.variant_id) AND (p.store_id = public.current_store_id())))))));


--
-- Name: pickle_variants sellers manage variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sellers manage variants" ON public.pickle_variants TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pickles p
  WHERE ((p.id = pickle_variants.pickle_id) AND (p.store_id = public.current_store_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pickles p
  WHERE ((p.id = pickle_variants.pickle_id) AND (p.store_id = public.current_store_id())))));


--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

--
-- Name: stores stores public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stores public read" ON public.stores FOR SELECT TO authenticated, anon USING (true);


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: variant_packagings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variant_packagings ENABLE ROW LEVEL SECURITY;

--
-- Name: pickle_variants variants public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "variants public read" ON public.pickle_variants FOR SELECT TO authenticated, anon USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 5vmvaPuD5lkPwgz3sXt1Qy2ff55Wqx6wcjIC51mS5PS8oydKdy9Sidfhvhm7xOX

