import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Trash2 } from "lucide-react";
import Form from "@/components/Form";

export default function AssetDialog({ open, onOpenChange, initialValues, onSubmit, onCancel, onDelete }) {
  const assetId = initialValues?._id ?? initialValues?.id;
  const hasAssetId = assetId !== undefined && assetId !== null && assetId !== "";

  const handleSubmit = (e) => {
    onSubmit?.(e, initialValues);
  };

  const handleDelete = async () => {
    if (!hasAssetId) return;
    await onDelete?.(assetId);
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const nameInput = document.getElementById("assetNameField");
          nameInput?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{hasAssetId ? "Edit Asset" : "Add Asset"}</DialogTitle>
        </DialogHeader>
        <Form onFormSubmit={handleSubmit} resetForm={onCancel} formId="asset-dialog-form" hideActions initialValues={initialValues} />
        <DialogFooter className="flex items-center justify-between">
          {hasAssetId ? (
            <Button variant="ghost" size="icon" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" form="asset-dialog-form">
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
