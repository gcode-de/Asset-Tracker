import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";

export default function TotalValue({ value }) {
  const formatCurrency = (val) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(val);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Worth</CardTitle>
      </CardHeader>
      <CardContent className="text-xl font-semibold">{formatCurrency(value)}</CardContent>
    </Card>
  );
}
