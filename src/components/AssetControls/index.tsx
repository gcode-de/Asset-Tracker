import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, RefreshCcw, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import AssetSearchDialog from "@/components/AssetSearchDialog";

interface AssetControlsProps {
  handleUpdateValues: () => void | Promise<void>;
  onAdd?: (type: string) => void;
  onSearch?: (symbol: string, name: string, assetClass?: string) => void;
  apiRemaining?: number;
}

export default function AssetControls({ handleUpdateValues, onAdd, onSearch, apiRemaining = 25 }: AssetControlsProps) {
  const [updating, setUpdating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const onReload = async () => {
    try {
      setUpdating(true);
      await handleUpdateValues?.();
    } finally {
      setUpdating(false);
    }
  };

  const handleSearchSelect = (symbol: string, name: string, assetClass?: string) => {
    onSearch?.(symbol, name, assetClass);
  };
  return (
    <div className="flex gap-2 justify-end w-full">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button id="searchAssetButton" variant="outline" size="icon" aria-label="Search asset" onClick={() => setSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Search assets</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button id="addAssetButton" size="icon" aria-label="Add asset">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onAdd?.("crypto")}>Crypto</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAdd?.("metals")}>Precious Metal</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAdd?.("stocks")}>Stock</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAdd?.("real_estate")}>Real Estate</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAdd?.("cash")}>Cash</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add asset</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AssetSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onAddAsset={handleSearchSelect} />
    </div>
  );
}
