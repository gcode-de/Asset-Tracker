import { useState, useEffect } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FavoriteAsset {
  symbol: string;
  name: string;
}

const getFavorites = (): FavoriteAsset[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("favoritAssets");
  return stored ? JSON.parse(stored) : [];
};

const addFavorite = (asset: FavoriteAsset) => {
  if (typeof window === "undefined") return;
  const favorites = getFavorites();
  if (!favorites.find((f) => f.symbol === asset.symbol)) {
    favorites.push(asset);
    localStorage.setItem("favoritAssets", JSON.stringify(favorites));
  }
};

const removeFavorite = (symbol: string) => {
  if (typeof window === "undefined") return;
  const favorites = getFavorites().filter((f) => f.symbol !== symbol);
  localStorage.setItem("favoritAssets", JSON.stringify(favorites));
};

const isFavorite = (symbol: string): boolean => {
  if (typeof window === "undefined") return false;
  return getFavorites().some((f) => f.symbol === symbol);
};

interface FavoriteToggleProps {
  symbol: string;
  name: string;
  onToggle?: (isFav: boolean) => void;
  size?: "sm" | "md" | "lg";
}

export function FavoriteToggle({ symbol, name, onToggle, size = "md" }: FavoriteToggleProps) {
  const [isFav, setIsFav] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsFav(isFavorite(symbol));
  }, [symbol]);

  const handleToggle = () => {
    if (isFav) {
      removeFavorite(symbol);
      setIsFav(false);
    } else {
      addFavorite({ symbol, name });
      setIsFav(true);
    }
    onToggle?.(!isFav);
  };

  if (!mounted) return null;

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`${isFav ? "text-yellow-400 fill-yellow-400" : "text-gray-400"} transition-colors hover:text-yellow-300`}
      title={isFav ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={sizeClasses[size]} />
    </button>
  );
}

interface FavoritesListProps {
  onSelect?: (asset: FavoriteAsset) => void;
}

export function FavoritesList({ onSelect }: FavoritesListProps) {
  const [favorites, setFavorites] = useState<FavoriteAsset[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFavorites(getFavorites());
  }, []);

  const handleRemove = (symbol: string) => {
    removeFavorite(symbol);
    setFavorites(getFavorites());
  };

  if (!mounted || favorites.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">⭐ Favorites</div>
      <div className="grid gap-2">
        {favorites.map((fav) => (
          <div
            key={fav.symbol}
            className="flex items-center justify-between p-2 border rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors"
          >
            <button type="button" onClick={() => onSelect?.(fav)} className="flex-1 text-left text-sm hover:underline cursor-pointer">
              <div className="font-semibold">{fav.symbol}</div>
              <div className="text-xs text-muted-foreground">{fav.name}</div>
            </button>
            <button
              type="button"
              onClick={() => handleRemove(fav.symbol)}
              className="p-1 text-gray-500 hover:text-red-500 transition-colors"
              title="Remove favorite"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { getFavorites, addFavorite, removeFavorite, isFavorite };
