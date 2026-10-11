import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import Form from "@/components/Form";
import { AssetType } from "@/components/Asset";
import { FormEvent, useState, useRef } from "react";

interface AssetDialogProps {
  open: boolean;
  restoreFocus?: () => void;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<AssetType> | null;
  onSubmit?: (e: FormEvent<HTMLFormElement>, initialValues?: Partial<AssetType> | null) => void;
  onCancel?: () => void;
  onDelete?: (id: string | number) => void | boolean | Promise<boolean | void>;
  isSaving?: boolean;
}

export default function AssetDialog({ open, restoreFocus, onOpenChange, initialValues, onSubmit, onCancel, onDelete, isSaving = false }: AssetDialogProps) {
  const baseline = useRef<string | null>(null);
  const snapshot = () => {
    const form = document.getElementById("asset-dialog-form") as HTMLFormElement | null;
    return form ? JSON.stringify([...new FormData(form)].filter(([key]) => key !== "value")) : null;
  };
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const busy = isSaving || deleting;
  function close() { baseline.current = null; setDiscard(false); setDeleteError(""); onCancel?.(); onOpenChange?.(false); }
  function requestClose(next: boolean) { if (busy) return; if (!next && baseline.current !== null && snapshot() !== baseline.current) { setDiscard(true); return; } if (!next) close(); else onOpenChange?.(true); }
  const assetId = initialValues?._id ?? initialValues?.id;
  const hasAssetId = assetId !== undefined && assetId !== null && assetId !== "";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    onSubmit?.(e, initialValues);
  };

  const handleDelete = async () => {
    if (!hasAssetId) return;
    setDeleting(true); setDeleteError("");
    try { const success = await onDelete?.(assetId); if (success === false) setDeleteError("Asset could not be deleted. Your edits are preserved; try again."); else close(); }
    catch { setDeleteError("Asset could not be deleted. Your edits are preserved; try again."); }
    finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent onCloseAutoFocus={restoreFocus ? (event) => { event.preventDefault(); restoreFocus(); } : undefined} aria-labelledby="asset-dialog-heading" className="asset-dialog overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          baseline.current = snapshot();
          const nameInput = document.getElementById("assetNameField");
          if (!window.matchMedia?.("(pointer: coarse)").matches) nameInput?.focus();
          else document.getElementById("asset-dialog-heading")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle id="asset-dialog-heading" tabIndex={-1} className="text-xl font-semibold pr-8">{hasAssetId ? "Edit Asset" : "Add Asset"}</DialogTitle>
          <DialogDescription>
            {hasAssetId ? "Update the holding details. The current value is calculated automatically." : "Add a holding to your portfolio. Required fields are marked with an asterisk."}
          </DialogDescription>
        </DialogHeader>
        <div data-testid="asset-dialog-body" className="overflow-y-auto min-h-0 pr-1"><Form onFormSubmit={handleSubmit} resetForm={onCancel} formId="asset-dialog-form" hideActions initialValues={initialValues} /></div>
        <DialogFooter className="flex items-center justify-between flex-wrap">
          {deleteError && <p role="alert" className="block text-sm text-destructive w-full">{deleteError}</p>}
          {discard && <div role="alert" className="w-full text-sm"><p className="block">Discard unsaved changes?</p><Button autoFocus variant="secondary" onClick={() => { setDiscard(false); document.getElementById("assetNameField")?.focus(); }}>Keep editing</Button><Button variant="destructive" onClick={close}>Discard changes</Button></div>}
          {hasAssetId ? (
            <Button variant="ghost" size="icon" onClick={handleDelete} aria-label={`Delete ${initialValues?.name || "asset"}`} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={() => requestClose(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="asset-dialog-form" disabled={busy} aria-busy={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
