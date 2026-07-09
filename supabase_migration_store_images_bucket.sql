-- Store images upload to the existing 'images' bucket under stores/ prefix.
-- Run this only if admins are not already permitted to upload to the images bucket.

-- Allow admins to upload store images (stores/ prefix)
CREATE POLICY IF NOT EXISTS "Admins can upload store images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND name LIKE 'stores/%'
  AND public.current_role() = 'admin'
);

-- Allow admins to update store images
CREATE POLICY IF NOT EXISTS "Admins can update store images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND name LIKE 'stores/%'
  AND public.current_role() = 'admin'
);

-- Allow admins to delete store images
CREATE POLICY IF NOT EXISTS "Admins can delete store images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND name LIKE 'stores/%'
  AND public.current_role() = 'admin'
);
