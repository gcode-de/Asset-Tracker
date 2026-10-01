import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { readJsonResponse } from "@/lib/refresh-http";

interface ApiLimitInfo {
  count: number;
  limit: number;
  remaining: number;
  date?: string;
}

const getApiLimitInfo = async (): Promise<ApiLimitInfo> => {
  const response = await fetch("/api/counter", { credentials: "same-origin", cache: "no-store" });
  const data = await readJsonResponse(response, "App-tracked allowance");
  if (![data.count, data.limit, data.remaining].every((value) => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0)) throw new Error("Unexpected allowance response");
  return { count: data.count, limit: data.limit, remaining: data.remaining, date: data.date };
};

const getColorAndIcon = (remaining: number) => {
  if (remaining < 0 || remaining === 0) {
    return {
      color: "bg-red-100 border-red-300 text-red-700",
      icon: AlertCircle,
      status: "Limit reached",
    };
  }
  if (remaining <= 1) {
    return {
      color: "bg-red-100 border-red-300 text-red-700",
      icon: AlertCircle,
      status: `Critical: ${remaining} left`,
    };
  }
  if (remaining <= 10) {
    return {
      color: "bg-yellow-100 border-yellow-300 text-yellow-700",
      icon: AlertTriangle,
      status: `Low: ${remaining} left`,
    };
  }
  return {
    color: "bg-green-100 border-green-300 text-green-700",
    icon: CheckCircle,
    status: `${remaining} calls remaining`,
  };
};

interface ApiLimitBadgeProps {
  onRemainingChange?: (remaining: number) => void;
}

export default function ApiLimitBadge({ onRemainingChange }: ApiLimitBadgeProps) {
  const { data: session, status: sessionStatus } = useSession();
  const email = session?.user?.email;
  if (sessionStatus !== "authenticated" || !email) return null;
  // Remount identity-owned state and request generations before rendering another account.
  return <IdentityApiLimitBadge key={email} onRemainingChange={onRemainingChange} />;
}

function IdentityApiLimitBadge({ onRemainingChange }: ApiLimitBadgeProps) {
  const [info, setInfo] = useState<ApiLimitInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const loadCounter = async () => {
      const current = ++generation;
      try {
        const data = await getApiLimitInfo();
        if (!active || current !== generation) return;
        setInfo(data);
        setUnavailable(false);
        onRemainingChange?.(data.remaining);
      } catch {
        if (active && current === generation) setUnavailable(true);
      }
    };
    loadCounter();
    window.addEventListener("api-counter-changed", loadCounter);
    const interval = setInterval(loadCounter, 10000);
    return () => { active = false; clearInterval(interval); window.removeEventListener("api-counter-changed", loadCounter); };
  }, [onRemainingChange]);

  if (!info) return <div className="text-sm text-muted-foreground" role="status">{unavailable ? "App-tracked allowance unavailable" : "Loading app-tracked allowance…"}</div>;

  const { color, icon: IconComponent, status } = getColorAndIcon(info.remaining);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const resetTime = tomorrow.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`border rounded-lg p-3 ${color} flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        <IconComponent className="h-5 w-5" />
        <div>
          <div className="font-semibold text-sm">{status}</div>
          <div className="text-xs opacity-75">
            {info.count}/{info.limit} app-tracked calls today • Resets at {resetTime}
            <div>Per-key app allowance, not provider-account quota. Provider terms and limits still apply.</div>
            {unavailable && <div role="status">Allowance update unavailable; showing last known totals.</div>}
          </div>
        </div>
      </div>
      <div className="text-xl font-bold">{info.remaining}</div>
    </div>
  );
}

export { getApiLimitInfo };
