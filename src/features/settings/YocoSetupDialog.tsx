import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
import { useUpsertPaymentProvider, type PaymentProviderRow } from "@/features/refunds/queries";

export default function YocoSetupDialog({ tenantId, existing, onClose }: { tenantId: string; existing?: PaymentProviderRow; onClose: () => void }) {
  const save = useUpsertPaymentProvider(tenantId);
  const [model, setModel] = useState(String(existing?.settings?.terminal_model ?? ""));
  const [device, setDevice] = useState(String(existing?.settings?.webpos_device_id ?? ""));
  const [till, setTill] = useState(String(existing?.settings?.terminal_label ?? "Front desk"));
  async function submit() {
    try {
      await save.mutateAsync({ provider: "yoco", enabled: false, mode: existing?.mode ?? "test",
        settings: { ...existing?.settings, terminal_model: model.trim(), webpos_device_id: device.trim(), terminal_label: till.trim() } });
      toast.success("Yoco setup saved; terminal payments remain disabled"); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save Yoco setup"); }
  }
  return <ModalShell title="Yoco terminal setup" onClose={onClose} className="rounded-lg" footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={submit}>Save setup</Button></div>}>
    <div className="space-y-4 p-5">
      <div className="text-sm font-semibold text-muted-foreground">Awaiting terminal model and Yoco Web POS authorisation</div>
      <label className="block text-sm">Counter name<input className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" maxLength={100} value={till} onChange={e => setTill(e.target.value)} /></label>
      <label className="block text-sm">Terminal model<input className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" maxLength={100} value={model} onChange={e => setModel(e.target.value)} placeholder="Awaiting Charlotte" /></label>
      <label className="block text-sm">Web POS device ID<input className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" maxLength={200} value={device} onChange={e => setDevice(e.target.value)} placeholder="Awaiting Yoco" /></label>
      <a className="block text-sm text-primary underline" href="/admin/settings/xero">Yoco payment account in Xero settings</a>
    </div>
  </ModalShell>;
}