import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";

export default function Asset({ asset, handleEditAsset, handleDeleteAsset, handleUnDeleteAsset }) {
  const bgForType = (type) => {
    const key = (type ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "_");
    switch (key) {
      case "crypto":
        return "url('/images/crypto.jpg')";
      case "stocks":
        return "url('/images/stocks.jpg')";
      case "metals":
      case "metal":
      case "precious_metal":
        return "url('/images/metal.jpg')";
      case "cash":
        return "url('/images/cash.jpg')";
      case "real_estate":
      case "realestate":
        return "url('/images/real_estate.jpg')";
      default:
        return "url('/images/stocks.jpg')";
    }
  };

  return (
    <Card id={asset._id ?? asset.id} className="overflow-hidden h-full flex flex-col">
      <div className="relative h-24 w-full bg-cover bg-center" style={{ backgroundImage: bgForType(asset.type) }} aria-hidden>
        <div className="absolute inset-0 bg-black/20" />
      </div>
      <CardHeader className="pt-4">
        <CardTitle className="flex items-center justify-between">
          <span>{asset.name}</span>
          <Badge variant="secondary">{asset.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div>Units: {asset.quantity}</div>
        <div>
          Current Value: {asset.value?.toLocaleString("de-DE")}€ (Unit Price {asset.baseValue?.toLocaleString("de-DE")}€)
        </div>
        <div>Notes: {asset.notes}</div>
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2 px-3 py-2 mt-auto">
        {asset.isDeleted ? (
          <Button
            id={`${asset.id}-restore-button`}
            variant="secondary"
            size="sm"
            onClick={() => handleUnDeleteAsset && handleUnDeleteAsset(asset._id ?? asset.id)}
          >
            Restore
          </Button>
        ) : null}
        <Button id={`${asset.id}-edit-button`} variant="link" size="sm" onClick={() => handleEditAsset(asset._id ?? asset.id)}>
          edit
        </Button>
      </CardFooter>
    </Card>
  );
}
