import { Separator } from "@/components/ui/separator";
import { ReactNode } from "react";

interface FooterProps {
  children?: ReactNode;
}

export default function Footer({ children }: FooterProps) {
  return (
    <footer className="mt-8 text-sm text-muted-foreground">
      <div className="flex items-baseline gap-2">
        <span id="total-value">{children}</span>
      </div>
      <Separator className="my-3" />
      <p>This app keeps track of your assets and gets real time price data from separate APIs.</p>
    </footer>
  );
}
