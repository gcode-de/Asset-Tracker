import PropTypes from "prop-types";
import { Button } from "@/components/ui/button.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.jsx";
import { Plus, RefreshCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.jsx";

import { useState } from "react";

export default function AssetControls({ handleUpdateValues, onAdd }) {
  const [updating, setUpdating] = useState(false);

  const onReload = async () => {
    try {
      setUpdating(true);
      await handleUpdateValues?.();
    } finally {
      setUpdating(false);
    }
  };
  return (
    <div className="flex gap-2 justify-end w-full">
      <TooltipProvider>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button id="updateValuesButton" variant="secondary" size="icon" aria-label="Reload values" onClick={onReload} disabled={updating}>
              <RefreshCcw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reload values</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

AssetControls.propTypes = {
  handleUpdateValues: PropTypes.func.isRequired,
  onAdd: PropTypes.func,
};
