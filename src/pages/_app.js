import "@/styles/globals.css";
import axios from "axios";
import { SWRConfig } from "swr";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster.jsx";

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function App({ Component, pageProps: { session, ...pageProps } }) {
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
