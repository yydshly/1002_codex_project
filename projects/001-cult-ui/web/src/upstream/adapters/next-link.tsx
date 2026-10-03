import { forwardRef, type AnchorHTMLAttributes } from "react";
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean; replace?: boolean; scroll?: boolean; shallow?: boolean; locale?: unknown;
};
// Native link adapter; the study preview has no Next router or prefetch server.
export default forwardRef<HTMLAnchorElement, Props>(function Link({href, prefetch: _prefetch, replace: _replace, scroll: _scroll, shallow: _shallow, locale: _locale, ...props}, ref) {
  const url = typeof href === "string" ? href : `${href.pathname ?? ""}${href.query ? `?${new URLSearchParams(href.query)}` : ""}`;
  return <a {...props} ref={ref} href={url} onClick={event => {
    props.onClick?.(event);
    if (!event.defaultPrevented && url.startsWith("/") && !url.startsWith("//")) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("cult-preview-navigation", {detail: url}));
    }
  }} />;
});
