import { useSession, signIn, signOut } from "next-auth/react";

export default function Login() {
  const { data: session } = useSession();
  if (session) {
    return (
      <div className="mb-4 text-sm text-gray-600">
        {session.user.email || session.user.name}
        <button className="mx-2" onClick={() => signOut()}>
          sign out
        </button>
      </div>
    );
  }
  return (
    <div className="mb-4 text-sm text-gray-600">
      <button className="mx-2" onClick={() => signIn()}>
        register/sign in
      </button>
    </div>
  );
}
