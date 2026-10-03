// Route actions are reported by the preview shell instead of navigating to
// missing Next application routes. Components and their callbacks stay intact.
const routeAction = (destination: string) => window.dispatchEvent(new CustomEvent("cult-preview-navigation", { detail: destination }));
export function useRouter() {
  return { push: routeAction, replace: routeAction, refresh: () => routeAction("刷新当前路由"), back: () => routeAction("返回上一页"), forward: () => routeAction("前往下一页"), prefetch: () => Promise.resolve() };
}
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useParams = () => ({});
