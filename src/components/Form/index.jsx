import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";
import { useToast } from "@/hooks/use-toast.js";

export default function Form({ onFormSubmit, resetForm, formId = "form", hideActions = false, initialValues }) {
  const [selectedType, setSelectedType] = useState(initialValues?.type || "");
  const [qty, setQty] = useState(initialValues?.quantity !== undefined && initialValues?.quantity !== null ? String(initialValues.quantity) : "");
  const [unitPrice, setUnitPrice] = useState(
    initialValues?.baseValue !== undefined && initialValues?.baseValue !== null ? String(initialValues.baseValue) : ""
  );
  const { toast } = useToast();

  useEffect(() => {
    setSelectedType(initialValues?.type || "");
    setQty(initialValues?.quantity !== undefined && initialValues?.quantity !== null ? String(initialValues.quantity) : "");
    setUnitPrice(initialValues?.baseValue !== undefined && initialValues?.baseValue !== null ? String(initialValues.baseValue) : "");
  }, [initialValues]);

  const computedValue = (parseFloat(qty) || 0) * (parseFloat(unitPrice) || 0);

  return (
    <div className="space-y-4">
      <form id={formId} onSubmit={onFormSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="assetTypeField">Type</Label>
          <Select onValueChange={setSelectedType} value={selectedType}>
            <SelectTrigger id="assetTypeField" aria-label="Asset Type" name="type" required>
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
          <input type="hidden" name="type" value={selectedType} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetNameField">Asset</Label>
          <Input id="assetNameField" name="name" autoComplete="off" required defaultValue={initialValues?.name} autoFocus />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetQuantityField">Units</Label>
          <Input
            id="assetQuantityField"
            name="quantity"
            autoComplete="off"
            type="text"
            pattern="-?[0-9]*(\\.[0-9]+)?"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetBaseValueField">Unit Price (EUR)</Label>
          <Input
            id="assetBaseValueField"
            name="baseValue"
            autoComplete="off"
            type="text"
            pattern="-?[0-9]*(\\.[0-9]+)?"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetValueField">Current Value (EUR)</Label>
          <Input id="assetValueField" autoComplete="off" readOnly value={Number.isFinite(computedValue) ? computedValue : ""} />
          <input type="hidden" name="value" value={Number.isFinite(computedValue) ? computedValue : 0} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetNotesField">Notes</Label>
          <Textarea
            id="assetNotesField"
            name="notes"
            autoComplete="off"
            defaultValue={initialValues?.notes}
            className="h-14 focus:h-32 transition-[height] duration-200 ease-out"
          />
        </div>

        <input type="text" id="assetIdField" name="id" hidden defaultValue={initialValues?._id || initialValues?.id} />

        {hideActions ? null : (
          <div className="flex gap-2">
            <Button id="saveButton" type="submit" onClick={() => toast({ title: "Saving..." })}>
              Save
            </Button>
            <Button id="cancelButton" type="button" variant="secondary" onClick={() => resetForm()}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
