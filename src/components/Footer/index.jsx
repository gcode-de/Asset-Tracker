export default function Footer({ children }) {
  return (
    <div id="footer">
      <p id="total-value" className="layoutElement">
        {children}
      </p>
      <br />
      <p className="layoutElement">This app keeps track of your assets and gets real time price data from separate APIs.</p>
    </div>
  );
}
