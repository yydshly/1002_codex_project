import { lazy, Suspense, type ComponentType } from "react";
// Next dynamic's client-side loading contract, adapted to React.lazy.
export default function dynamic<P extends object>(loader: () => Promise<ComponentType<P> | {default: ComponentType<P>}>, options?: {loading?: ComponentType; ssr?: boolean}) {
  const Lazy = lazy(async () => { const module = await loader(); return typeof module === "function" ? {default: module} : module; });
  return function DynamicComponent(props: P) {
    const Loading = options?.loading;
    return <Suspense fallback={Loading ? <Loading /> : null}><Lazy {...props} /></Suspense>;
  };
}
