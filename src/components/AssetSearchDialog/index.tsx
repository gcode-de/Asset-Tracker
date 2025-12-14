import { useState, ChangeEvent, FormEvent, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertCircle, Lightbulb } from "lucide-react";
import axios from "axios";
import { FavoriteToggle, FavoritesList } from "@/components/Favorites";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region?: string;
  currency?: string;
  bestMatch?: boolean;
  assetClass?: "crypto" | "stocks" | "metals" | "cash" | "real_estate";
}

interface AssetSearchDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onAddAsset?: (symbol: string, name: string, assetClass?: string) => void;
}

export default function AssetSearchDialog({ open, onOpenChange, onAddAsset }: AssetSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`/api/assets/search`, {
        params: { query },
      });

      if (response.data.matches && response.data.matches.length > 0) {
        setResults(response.data.matches);
      } else {
        setError("No assets found. Try searching for stock symbols like 'AAPL', 'GOOGL' or crypto like 'BTC', 'ETH'.");
        setResults([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed. Please try again.";
      setError(message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (start search after 300ms of inactivity)
    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Clear debounce timer and perform immediate search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    await performSearch(searchQuery);
  };

  const handleAddAssetClick = (symbol: string, name: string, assetClass?: string) => {
    onAddAsset?.(symbol, name, assetClass);
    setSearchQuery("");
    setResults([]);
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Search Assets</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-none">
          {/* Favorites Section */}
          <FavoritesList onSelect={(fav) => handleAddAssetClick(fav.symbol, fav.name, undefined)} />

          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search by symbol (AAPL, BTC) or name (Apple, Bitcoin)..."
                value={searchQuery}
                onChange={handleSearchChange}
                autoFocus
              />
              <Button type="submit" disabled={isLoading || !searchQuery.trim()}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isLoading ? "..." : "Go"}
              </Button>
            </div>
          </form>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-red-900">Search Error</div>
                <div className="text-sm text-red-800">{error}</div>
                <div className="text-xs text-red-700 mt-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  Try searching by stock symbol (AAPL, GOOGL) or cryptocurrency (BTC, ETH)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results - Scrollable Section */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-2 border-t border-gray-200 pt-4 mt-4">
          {results.length > 0 ? (
            results.map((result) => (
              <div key={result.symbol} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm">{result.symbol}</div>
                    {result.assetClass === "crypto" && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Crypto</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{result.name}</div>
                  {result.region && (
                    <div className="text-xs text-muted-foreground">
                      {result.type} • {result.region}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteToggle symbol={result.symbol} name={result.name} size="sm" />
                  <Button size="sm" variant="outline" onClick={() => handleAddAssetClick(result.symbol, result.name, result.assetClass)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            ))
          ) : !isLoading && !error && searchQuery ? (
            <div className="text-sm text-muted-foreground text-center py-8">Searching...</div>
          ) : !isLoading && !error && !searchQuery ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Enter a symbol or name to search for assets
              <div className="text-xs mt-2">💡 Try: AAPL, BTC, GOOGL, ETH</div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
