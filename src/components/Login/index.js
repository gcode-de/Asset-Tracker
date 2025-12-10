import { useSession, signIn, signOut } from "next-auth/react";

export default function Login() {
  const { data: session } = useSession();
  if (session) {
    return (
      <>
        Angemeldet als {session.user.email || session.user.name} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    );
  }
  return (
    <>
      Gast - bitte einloggen! <br />
      <button onClick={() => signIn()}>Sign in</button>
    </>
  );
}
