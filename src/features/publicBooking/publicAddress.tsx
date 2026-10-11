import { useState } from "react";
import AddressField, { AddressValue } from "@/components/address/AddressField";
import { addressOneLine } from "@/lib/address/format";

export const emptyAddress = (): AddressValue => ({
  formatted_address: "", google_place_id: "", address_line_1: "", address_line_2: "",
  suburb: "", city: "", province: "", postcode: "", country_code: "ZA",
  latitude: null, longitude: null, access_notes: "",
});

export function usePublicAddress() {
  const [value, setValue] = useState<AddressValue>(emptyAddress);
  const onChange = (p: Partial<AddressValue>) => setValue((v) => ({ ...v, ...p }));
  const verified = Boolean(value.google_place_id);
  const text = verified ? addressOneLine(value) : (value.formatted_address || "").trim();
  return { value, onChange, verified, text, ready: text.length > 5 };
}

/** Payload fields the public booking functions accept. */
export const addressPayload = (a: ReturnType<typeof usePublicAddress>) => ({
  address_text: a.text,
  address: a.value,
});

export function PublicAddressField({ a, label }: { a: ReturnType<typeof usePublicAddress>; label: string }) {
  return (
    <div className="space-y-1">
      <AddressField value={a.value} onChange={a.onChange} allowManual={false} label={label} />
      {!a.verified && a.text.length > 5 && (
        <p className="text-[11px] text-muted-foreground">
          Pick your address from the suggestions so our van can find you. If it isn't listed, we'll confirm it with you.
        </p>
      )}
    </div>
  );
}
