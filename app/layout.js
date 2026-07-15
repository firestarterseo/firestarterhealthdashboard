import "./globals.css";

export const metadata = {
  title: "Firestarter SEO — Account Health Dashboard",
  description: "Internal account health dashboard for Firestarter SEO.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
