import type { Metadata } from 'next';
import '../public/style.css';

export const metadata: Metadata = {
  title: 'BroCutPro — Modern Rod & Rail Inventory & Smart Cut Optimizer',
  description: 'Professional rod & rail stock management system with exact diameter matching, optimal length calculation, and real-time inventory tracking.',
  manifest: '/manifest.json',
  icons: {
    icon: '/brocutpro-logo.png',
    apple: '/brocutpro-logo.png',
  },
};

export const viewport = {
  themeColor: '#f5f7fb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof Node !== 'undefined' && Node.prototype) {
                const origRemove = Node.prototype.removeChild;
                Node.prototype.removeChild = function(child) {
                  if (child && child.parentNode !== this) {
                    return child;
                  }
                  return origRemove.apply(this, arguments);
                };
                const origInsert = Node.prototype.insertBefore;
                Node.prototype.insertBefore = function(newNode, refNode) {
                  if (refNode && refNode.parentNode !== this) {
                    return newNode;
                  }
                  return origInsert.apply(this, arguments);
                };
              }
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="BroCutPro" />
        <script src="/xlsx.full.min.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
