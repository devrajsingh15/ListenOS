import "../globals.css";

export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="assistant-mode" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
        {/* Force-hide Next.js/Turbopack dev indicators in the assistant window */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const style = document.createElement('style');
            style.innerHTML = \`
              nextjs-portal, [data-nextjs-dialog], [data-nextjs-toast], [data-nextjs-toast-wrapper],
              #__next-build-watcher, #__next-prerender-indicator, #__next-route-announcer__,
              [data-turbopack], [class*="nextjs"], [class*="turbopack"], [id*="__next"], [id*="nextjs"],
              [aria-live="assertive"], [aria-live="polite"], [role="status"], [role="alert"],
              body > div:not(#__next):not(main):not([class]),
              html > div, body > span, body > aside {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                width: 0 !important;
                height: 0 !important;
                position: absolute !important;
                clip: rect(0, 0, 0, 0) !important;
              }
            \`;
            document.head.appendChild(style);
            
            const hideDevOverlay = () => {
              // Hide any element that looks like a dev indicator
              const selectors = [
                'nextjs-portal', '[data-nextjs-dialog]', '[data-nextjs-toast]',
                '[data-turbopack]', '#__next-build-watcher', '#__next-prerender-indicator',
                '#__next-route-announcer__', '[aria-live]', '[role="status"]', '[role="alert"]'
              ];
              selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                  el.remove();
                });
              });
              
              // Also remove any direct children of body that aren't our app
              document.querySelectorAll('body > *').forEach(el => {
                if (!el.matches('main, script, style, link, #__next')) {
                  el.remove();
                }
              });
            };
            
            hideDevOverlay();
            setInterval(hideDevOverlay, 50);
            
            // Also run on DOM changes
            new MutationObserver(hideDevOverlay).observe(document.body, { childList: true, subtree: true });
          })();
        `}} />
      </head>
      <body className="assistant-mode" suppressHydrationWarning>
        <main className="assistant-mode">
          {children}
        </main>
      </body>
    </html>
  );
}

