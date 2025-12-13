import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const typeOptions = [
  { label: "Crypto", value: "crypto" },
  { label: "Metals", value: "metals" },
  { label: "Stocks", value: "stocks" },
  { label: "Real Estate", value: "real_estate" },
  { label: "Cash", value: "cash" },
];

interface FiltersProps {
  showDeleted: boolean;
  onToggleDeleted: (checked: boolean) => void;
  selectedTypes?: string[];
  onToggleType?: (type: string) => void;
}

export default function Filters({ showDeleted, onToggleDeleted, selectedTypes = [], onToggleType }: FiltersProps) {
  return (
    <div id="assetFilters" className="flex items-center gap-2 flex-wrap">
      {typeOptions.map((opt) => {
        const active = selectedTypes.includes(opt.value);
        return (
          <Button key={opt.value} variant={active ? "default" : "outline"} size="sm" onClick={() => onToggleType?.(opt.value)}>
            {opt.label}
          </Button>
        );
      })}
      <div className="flex items-center gap-2 md:ml-auto">
        <Switch id="show-deleted" checked={!!showDeleted} onCheckedChange={onToggleDeleted} />
        <Label htmlFor="show-deleted">Show deleted</Label>
      </div>
    </div>
  );
}
