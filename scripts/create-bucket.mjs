import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "previews";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data: existing, error: listError } = await admin.storage.listBuckets();
if (listError) {
  console.error("Failed to list buckets:", listError.message);
  process.exit(1);
}

if (existing.some((b) => b.name === bucket)) {
  console.log(`Bucket "${bucket}" already exists.`);
  process.exit(0);
}

const { error } = await admin.storage.createBucket(bucket, { public: true });
if (error) {
  console.error("Failed to create bucket:", error.message);
  process.exit(1);
}

console.log(`Created public bucket "${bucket}".`);
