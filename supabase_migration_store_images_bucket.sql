-- Create public storage bucket for store images
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-images', 'store-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins (authenticated users with role = 'admin') to upload
CREATE POLICY IF NOT EXISTS "Admins can upload store images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND public.current_role() = 'admin'
);

-- Allow admins to update (replace) store images
CREATE POLICY IF NOT EXISTS "Admins can update store images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND public.current_role() = 'admin'
);

-- Allow admins to delete store images
CREATE POLICY IF NOT EXISTS "Admins can delete store images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND public.current_role() = 'admin'
);

-- Public read (bucket is public, but explicit policy for clarity)
CREATE POLICY IF NOT EXISTS "Public can view store images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'store-images');
