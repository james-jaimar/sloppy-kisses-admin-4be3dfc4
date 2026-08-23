// One-off (re-runnable) importer for the Sloppy Kisses shop stock batch.
// Loads categories, subcategories, brands, products and opening stock.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import data from "./data.json" with { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-key",
};

interface Row {
  source_row: string | null;
  xero_item_code: string | null;
  xero_item_name: string | null;
  pos_name: string | null;
  brand: string | null;
  species: string | null;
  category: string | null;
  subcategory: string | null;
  size_pack: string | null;
  variant_label: string | null;
  proposed_parent_group_id: string | null;
  barcode_ean: string | null;
  quantity: string | null;
  sales_unit_price: string | null;
  purchase_unit_price: string | null;
  sell_in_pos: string | null;
  image_url: string | null;
  review_notes: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId: string | undefined = body.tenant_id;
    const dryRun: boolean = body.dry_run === true;
    if (!tenantId) throw new Error("tenant_id is required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const rows = data as unknown as Row[];
    const report: Record<string, unknown> = { rows_in: rows.length, dry_run: dryRun };

    // ---- 1. categories -------------------------------------------------
    const tree = new Map<string, Set<string>>();
    for (const r of rows) {
      const cat = (r.category || "Uncategorised").trim();
      const sub = (r.subcategory || "").trim();
      if (!tree.has(cat)) tree.set(cat, new Set());
      if (sub) tree.get(cat)!.add(sub);
    }
    const brandNames = [...new Set(rows.map((r) => (r.brand || "").trim()).filter(Boolean))].sort();

    if (dryRun) {
      return new Response(
        JSON.stringify({ ...report, categories: tree.size, subcategories: [...tree.values()].reduce((a, s) => a + s.size, 0), brands: brandNames.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingCats, error: catErr } = await admin
      .from("product_categories").select("id,name,parent_id").eq("tenant_id", tenantId);
    if (catErr) throw catErr;

    const key = (name: string, parent: string | null) => `${parent ?? "-"}::${name.toLowerCase()}`;
    const catId = new Map<string, string>();
    for (const c of existingCats ?? []) catId.set(key(c.name, c.parent_id), c.id);

    const newParents = [...tree.keys()].filter((c) => !catId.has(key(c, null)))
      .map((c, i) => ({ tenant_id: tenantId, name: c, parent_id: null, sort_order: i * 10 }));
    if (newParents.length) {
      const { data: ins, error } = await admin.from("product_categories").insert(newParents).select("id,name,parent_id");
      if (error) throw error;
      for (const c of ins ?? []) catId.set(key(c.name, c.parent_id), c.id);
    }

    const newSubs: Record<string, unknown>[] = [];
    for (const [cat, subs] of tree) {
      const parentId = catId.get(key(cat, null))!;
      [...subs].sort().forEach((s, i) => {
        if (!catId.has(key(s, parentId))) {
          newSubs.push({ tenant_id: tenantId, name: s, parent_id: parentId, sort_order: i * 10 });
        }
      });
    }
    if (newSubs.length) {
      const { data: ins, error } = await admin.from("product_categories").insert(newSubs).select("id,name,parent_id");
      if (error) throw error;
      for (const c of ins ?? []) catId.set(key(c.name, c.parent_id), c.id);
    }
    report.categories_created = newParents.length;
    report.subcategories_created = newSubs.length;

    // ---- 2. brands -----------------------------------------------------
    const { data: existingBrands, error: bErr } = await admin
      .from("product_brands").select("id,name").eq("tenant_id", tenantId);
    if (bErr) throw bErr;
    const brandId = new Map<string, string>();
    for (const b of existingBrands ?? []) brandId.set(b.name.toLowerCase(), b.id);
    const newBrands = brandNames.filter((b) => !brandId.has(b.toLowerCase()))
      .map((b, i) => ({ tenant_id: tenantId, name: b, sort_order: i * 10 }));
    if (newBrands.length) {
      const { data: ins, error } = await admin.from("product_brands").insert(newBrands).select("id,name");
      if (error) throw error;
      for (const b of ins ?? []) brandId.set(b.name.toLowerCase(), b.id);
    }
    report.brands_created = newBrands.length;

    // ---- 3. products ---------------------------------------------------
    const skipped: string[] = [];
    const payload = rows.map((r, idx) => {
      const cat = (r.category || "Uncategorised").trim();
      const sub = (r.subcategory || "").trim();
      const parentCat = catId.get(key(cat, null)) ?? null;
      const subCat = sub && parentCat ? catId.get(key(sub, parentCat)) ?? null : null;
      const code = String(r.xero_item_code ?? "").trim();
      if (!code) skipped.push(`row ${r.source_row ?? idx}`);
      const species = r.species && r.species !== "Unknown" ? r.species : null;
      return {
        tenant_id: tenantId,
        external_code: code,
        xero_item_id: code,
        sku: code,
        name: (r.pos_name || r.xero_item_name || code).trim(),
        description: r.xero_item_name ?? null,
        barcode: r.barcode_ean ? String(r.barcode_ean).trim() : null,
        category: cat,
        category_id: subCat ?? parentCat,
        brand_id: r.brand ? brandId.get(r.brand.trim().toLowerCase()) ?? null : null,
        species,
        size_pack: r.size_pack ?? null,
        variant_label: r.variant_label ?? null,
        sell_price: num(r.sales_unit_price),
        cost_price: num(r.purchase_unit_price),
        vat_rate: 15,
        active: true,
        sell_in_pos: (r.sell_in_pos ?? "Yes").toLowerCase() !== "no",
        image_url: r.image_url ?? null,
        notes: r.review_notes ?? null,
        source_ref: r.source_row ? `xlsx:${r.source_row}` : null,
        sort_order: 0,
      };
    }).filter((p) => p.external_code);

    let upserted = 0;
    for (let i = 0; i < payload.length; i += 150) {
      const chunk = payload.slice(i, i + 150);
      const { error } = await admin.from("products")
        .upsert(chunk, { onConflict: "tenant_id,external_code" });
      if (error) throw new Error(`products chunk ${i}: ${error.message}`);
      upserted += chunk.length;
    }
    report.products_upserted = upserted;
    report.skipped = skipped;

    // ---- 4. variant families ------------------------------------------
    const { data: allProducts, error: pErr } = await admin
      .from("products").select("id,external_code").eq("tenant_id", tenantId);
    if (pErr) throw pErr;
    const pid = new Map<string, string>();
    for (const p of allProducts ?? []) if (p.external_code) pid.set(p.external_code, p.id);

    const groups = new Map<string, string[]>();
    for (const r of rows) {
      const g = r.proposed_parent_group_id;
      const code = String(r.xero_item_code ?? "").trim();
      if (!g || !code) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(code);
    }
    let linked = 0;
    for (const codes of groups.values()) {
      const head = pid.get(codes[0]);
      if (!head || codes.length < 2) continue;
      const childIds = codes.slice(1).map((c) => pid.get(c)).filter(Boolean) as string[];
      if (!childIds.length) continue;
      const { error } = await admin.from("products")
        .update({ parent_product_id: head }).in("id", childIds).eq("tenant_id", tenantId);
      if (error) throw error;
      linked += childIds.length;
    }
    report.variants_linked = linked;
    report.variant_families = groups.size;

    // ---- 5. opening stock ---------------------------------------------
    const { data: locs, error: lErr } = await admin
      .from("stock_locations").select("id,is_default,sort_order,active")
      .eq("tenant_id", tenantId).order("is_default", { ascending: false }).order("sort_order");
    if (lErr) throw lErr;
    let locationId = (locs ?? [])[0]?.id as string | undefined;
    if (!locationId) {
      const { data: nl, error } = await admin.from("stock_locations")
        .insert({ tenant_id: tenantId, name: "Shop", is_default: true, active: true, sort_order: 0 })
        .select("id").single();
      if (error) throw error;
      locationId = nl.id;
      report.location_created = true;
    }

    const { data: existingOpening, error: oErr } = await admin
      .from("stock_movements").select("product_id")
      .eq("tenant_id", tenantId).eq("ref_type", "opening_balance");
    if (oErr) throw oErr;
    const done = new Set((existingOpening ?? []).map((m) => m.product_id));

    const movements = rows.map((r) => {
      const code = String(r.xero_item_code ?? "").trim();
      const qty = num(r.quantity) ?? 0;
      const product_id = pid.get(code);
      if (!product_id || qty <= 0 || done.has(product_id)) return null;
      return {
        tenant_id: tenantId,
        product_id,
        location_id: locationId,
        qty_delta: qty,
        reason: "receive",
        ref_type: "opening_balance",
        notes: "Opening stock — Xero first batch",
      };
    }).filter(Boolean) as Record<string, unknown>[];

    let stockRows = 0;
    for (let i = 0; i < movements.length; i += 200) {
      const chunk = movements.slice(i, i + 200);
      const { error } = await admin.from("stock_movements").insert(chunk);
      if (error) throw new Error(`stock chunk ${i}: ${error.message}`);
      stockRows += chunk.length;
    }
    report.opening_stock_rows = stockRows;
    report.opening_stock_units = movements.reduce((a, m) => a + Number(m.qty_delta), 0);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-stock-batch failed", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
