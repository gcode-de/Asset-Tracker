import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import ApiKeySettings from "@/components/ApiKeySettings";

export default function Login() {
  const { data: session } = useSession();
  if (session) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="max-w-48 truncate">{session.user?.email || session.user?.name}</span>
        <ApiKeySettings />
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="lg" onClick={() => signIn()}>
      Sign in
    </Button>
  );
}
