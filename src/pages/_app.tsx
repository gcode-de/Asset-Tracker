import "@/styles/globals.css";
import axios from "axios";
import { SWRConfig } from "swr";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster";
import type { AppProps } from "next/app";
import type { Session } from "next-auth";

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

interface MyAppProps extends AppProps {
  pageProps: {
    session?: Session;
    [key: string]: any;
  };
}

export default function App({ Component, pageProps: { session, ...pageProps } }: MyAppProps) {
  return (
    <>
      <SWRConfig value={{ fetcher }}>
        <SessionProvider session={session}>
          <Component {...pageProps} />
          <Toaster />
        </SessionProvider>
      </SWRConfig>
    </>
  );
}
