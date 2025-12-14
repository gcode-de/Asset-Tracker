import { FormEvent, ChangeEvent, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssetType } from "@/components/Asset";

interface FormProps {
  onFormSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  resetForm?: () => void;
  formId?: string;
  hideActions?: boolean;
  initialValues?: Partial<AssetType> | null;
}

export default function Form({ onFormSubmit, resetForm, formId = "asset-form", hideActions = false, initialValues }: FormProps) {
  const [selectedType, setSelectedType] = useState(initialValues?.type || "");
  const [qty, setQty] = useState(initialValues?.quantity?.toString() || "");
  const [unitPrice, setUnitPrice] = useState(initialValues?.baseValue?.toString() || "");
  const [value, setValue] = useState(initialValues?.value?.toString() || "");

  useEffect(() => {
    setSelectedType(initialValues?.type || "");
    setQty(initialValues?.quantity?.toString() || "");
    setUnitPrice(initialValues?.baseValue?.toString() || "");
    setValue(initialValues?.value?.toString() || "");
  }, [initialValues]);

  useEffect(() => {
    const quantity = parseFloat(qty) || 0;
    const baseValue = parseFloat(unitPrice) || 0;
    setValue((quantity * baseValue).toFixed(2));
  }, [qty, unitPrice]);

  const handleQtyChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQty(e.target.value);
  };

  const handleUnitPriceChange = (e: ChangeEvent<HTMLInputElement>) => {
    setUnitPrice(e.target.value);
  };

  return (
    <div className="space-y-4">
      <form id={formId} onSubmit={onFormSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="assetTypeField">Type</Label>
          <Select onValueChange={setSelectedType} value={selectedType} required>
            <SelectTrigger id="assetTypeField" aria-label="Asset Type">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="metals">Precious Metal</SelectItem>
              <SelectItem value="stocks">Stock</SelectItem>
              <SelectItem value="real_estate">Real Estate</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="type" value={selectedType} required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetNameField">Name *</Label>
          <Input autoFocus required id="assetNameField" name="name" defaultValue={initialValues?.name || ""} placeholder="Bitcoin, Gold..." />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="abbField">Abbreviation</Label>
          <Input id="abbField" name="abb" defaultValue={initialValues?.abb || ""} placeholder="BTC, GOLD..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="qtyField">Units *</Label>
            <Input required id="qtyField" name="quantity" type="number" step="any" value={qty} onChange={handleQtyChange} placeholder="0.05" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="basePriceField">Unit Price *</Label>
            <Input
              required
              id="basePriceField"
              name="baseValue"
              type="number"
              step="any"
              value={unitPrice}
              onChange={handleUnitPriceChange}
              placeholder="50000"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetValueField">Current Value (calculated)</Label>
          <Input readOnly id="assetValueField" name="value" type="number" step="any" value={value} placeholder="2500" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notesField">Notes</Label>
          <Textarea id="notesField" name="notes" defaultValue={initialValues?.notes || ""} placeholder="Additional information..." rows={3} />
        </div>

        {!hideActions && (
          <div className="flex gap-2">
            <Button type="submit" variant="default">
              {initialValues ? "Update" : "Add"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
