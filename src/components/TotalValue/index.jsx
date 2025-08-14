export default function TotalValue({ value }) {
  const formatCurrency = (val) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(val);
  };

  return <>Total Worth: {formatCurrency(value)}</>;
}
