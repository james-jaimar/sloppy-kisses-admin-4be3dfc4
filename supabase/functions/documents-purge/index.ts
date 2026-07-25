// Scheduled purge worker. Called by pg_cron nightly.
// - Expired vaccinations (expires_at < today) get archived.
// - Archived documents older than tenant grace period are hard-deleted
//   from S3 and from `documents`.
// - No caller auth required beyond the service role invocation header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { deleteObject } from "../_shared/s3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  // 1) Archive expired documents.
  const { data: expired } = await admin
    .from("documents")
    .select("id, tenant_id, expires_at")
    .lt("expires_at", today)
    .is("archived_at", null)
    .limit(500);
  let archivedCount = 0;
  for (const row of expired ?? []) {
    await admin
      .from("documents")
      .update({ archived_at: new Date().toISOString(), archive_reason: "expired" })
      .eq("id", row.id);
    archivedCount++;
  }

  // 2) Purge archived docs past their tenant's grace period.
  const { data: settingsRows } = await admin
    .from("document_settings")
    .select("tenant_id, archive_grace_days, auto_purge_enabled");
  const graceByTenant = new Map<string, number>();
  const purgeByTenant = new Map<string, boolean>();
  for (const s of settingsRows ?? []) {
    graceByTenant.set(s.tenant_id as string, Number(s.archive_grace_days ?? 90));
    purgeByTenant.set(s.tenant_id as string, Boolean(s.auto_purge_enabled ?? true));
  }

  const cutoffFor = (tenantId: string) => {
    const days = graceByTenant.get(tenantId) ?? 90;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  const { data: candidates } = await admin
    .from("documents")
    .select("id, tenant_id, s3_key, storage_provider, archived_at")
    .not("archived_at", "is", null)
    .limit(500);

  let purgedCount = 0;
  for (const doc of candidates ?? []) {
    const tenantId = doc.tenant_id as string;
    if (purgeByTenant.get(tenantId) === false) continue;
    if ((doc.archived_at as string) > cutoffFor(tenantId)) continue;
    if (doc.storage_provider === "s3" && doc.s3_key) {
      await deleteObject(doc.s3_key as string);
    }
    await admin.from("documents").delete().eq("id", doc.id);
    purgedCount++;
  }

  return json(200, { archived: archivedCount, purged: purgedCount });
});