import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  sortBy?: "value" | "name" | "date";
  onSortChange?: (value: "value" | "name" | "date") => void;
}

export default function Filters({ showDeleted, onToggleDeleted, selectedTypes = [], onToggleType, sortBy = "date", onSortChange }: FiltersProps) {
  return (
    <div id="assetFilters" className="flex items-center gap-1 flex-wrap">
      {typeOptions.map((opt) => {
        const active = selectedTypes.includes(opt.value);
        return (
          <Button key={opt.value} variant={active ? "default" : "outline"} size="sm" onClick={() => onToggleType?.(opt.value)}>
            {opt.label}
          </Button>
        );
      })}
      <div className="flex items-center gap-2 ml-4">
        <Label htmlFor="sort-by" className="text-sm text-muted-foreground">
          Sort:
        </Label>
        <Select value={sortBy} onValueChange={(value) => onSortChange?.(value as "value" | "name" | "date")}>
          <SelectTrigger id="sort-by" className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="value">highest</SelectItem>
            <SelectItem value="name">alphabetical</SelectItem>
            <SelectItem value="date">newest</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 md:ml-auto">
        <Switch id="show-deleted" checked={!!showDeleted} onCheckedChange={onToggleDeleted} />
        <Label htmlFor="show-deleted">Show deleted</Label>
      </div>
    </div>
  );
}
