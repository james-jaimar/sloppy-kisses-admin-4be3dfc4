import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useDeleteFlag, useFlags, useUpsertFlag } from "./queries";
import { Flag, Plus, Trash2 } from "lucide-react";

export default function FeatureFlagsPage() {
  const flags = useFlags();
  const upsert = useUpsertFlag();
  const del = useDeleteFlag();
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  return (
    <>
      <AppHeader title="Feature flags" subtitle="Gate work-in-progress features without a deploy. Only platform owners can read or edit these." />
      <div className="flex-1 p-6 space-y-4">
        <div className="sk-card p-4">
          <div className="mb-3 text-sm font-semibold">New flag</div>
          <div className="flex flex-wrap gap-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="feature.key.name"
              className="h-10 flex-1 min-w-[220px] rounded-lg border border-border bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What does it gate?"
              className="h-10 flex-[2] min-w-[260px] rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
            <button
              onClick={async () => {
                if (!newKey.trim()) return;
                await upsert.mutateAsync({ key: newKey.trim(), description: newDesc.trim() || null, enabled: false });
                setNewKey(""); setNewDesc("");
              }}
              disabled={!newKey.trim() || upsert.isPending}
              className="h-10 inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        <div className="sk-card overflow-hidden">
          {flags.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {flags.error && <div className="p-6 text-sm text-sk-coral-dark">{(flags.error as Error).message}</div>}
          {flags.data && (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Enabled</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flags.data.map((f) => (
                  <tr key={f.key} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                        {f.key}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.description ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(f.updated_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={f.enabled}
                          onChange={(e) => upsert.mutate({ key: f.key, description: f.description, enabled: e.target.checked, value: f.value })}
                        />
                        <span className="text-xs">{f.enabled ? "On" : "Off"}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm(`Delete flag "${f.key}"?`)) del.mutate(f.key); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!flags.data.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No flags yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}