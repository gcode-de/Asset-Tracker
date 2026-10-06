import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Decorative shapes only: never publish invented holdings, totals or progress.
export default function PortfolioLoading() {
  return (
    <>
      <div role="status" className="mb-6 space-y-3">
        <p className="block text-sm text-muted-foreground">Loading your portfolio…</p>
        <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="portfolio-loading-bar h-full w-1/3 rounded-full bg-primary/60" />
        </div>
      </div>
      <section aria-label="Loading portfolio" aria-busy="true" className="portfolio-skeleton">
        <div aria-hidden="true" className="grid gap-4 md:grid-cols-[1fr_1.5fr] mb-8">
          <Card className="bg-slate-950 border-slate-950">
            <CardHeader><Skeleton className="h-4 w-28 bg-white/15" /></CardHeader>
            <CardContent className="space-y-3"><Skeleton className="h-9 w-44 bg-white/15" /><Skeleton className="h-4 w-52 max-w-full bg-white/15" /></CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-4 w-full" />)}</div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <h2 className="text-2xl font-bold">Assets</h2>
          <div className="flex gap-2"><Button variant="outline" disabled>Refresh prices</Button><Button disabled>Add asset</Button></div>
        </div>
        <div aria-hidden="true" className="mb-6 flex flex-wrap gap-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-9 w-20 rounded-full" />)}</div>
        <div aria-hidden="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[0, 1, 2].map((item) => (
            <Card key={item}>
              <CardHeader className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /></CardHeader>
              <CardContent className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-full" /></CardContent>
            </Card>
          ))}
        </div>
        <Card aria-hidden="true">
          <CardHeader><Skeleton className="h-6 w-24" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            {[0, 1, 2].map((item) => <div key={item} className="grid grid-cols-3 gap-4 border-t pt-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2 justify-self-end" /></div>)}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
