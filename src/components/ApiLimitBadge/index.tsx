import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";

interface ApiLimitInfo {
  count: number;
  limit: number;
  remaining: number;
  date?: string;
}

const getApiLimitInfo = async (): Promise<ApiLimitInfo> => {
  try {
    const response = await fetch("/api/counter");
    const data = await response.json();
    return {
      count: data.count || 0,
      limit: data.limit || 25,
      remaining: data.limit - data.count || 25,
      date: data.date,
    };
  } catch (error) {
    console.error("Failed to fetch API counter:", error);
    return { count: 0, limit: 25, remaining: 25 };
  }
};

const getColorAndIcon = (remaining: number, limit: number) => {
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
  const [info, setInfo] = useState<ApiLimitInfo>({ count: 0, limit: 25, remaining: 25 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const loadCounter = async () => {
      const data = await getApiLimitInfo();
      setInfo(data);
      onRemainingChange?.(data.remaining);
    };

    loadCounter();

    // Refresh every 10 seconds
    const interval = setInterval(loadCounter, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  const { color, icon: IconComponent, status } = getColorAndIcon(info.remaining, info.limit);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const resetTime = tomorrow.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`border rounded-lg p-3 ${color} flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        <IconComponent className="h-5 w-5" />
        <div>
          <div className="font-semibold text-sm">{status}</div>
          <div className="text-xs opacity-75">
            {info.count}/{info.limit} calls today • Resets at {resetTime}
          </div>
        </div>
      </div>
      <div className="text-xl font-bold">{info.remaining}</div>
    </div>
  );
}

export { getApiLimitInfo };
