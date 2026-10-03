import { forwardRef, type ImgHTMLAttributes } from "react";
import { assetUrl } from "./asset-url";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string; width?: number; height?: number };
  fill?: boolean; priority?: boolean; unoptimized?: boolean; quality?: number;
  placeholder?: string; blurDataURL?: string; loader?: unknown;
  onLoadingComplete?: (image: HTMLImageElement) => void;
};

// Browser integration adapter only: keeps the official component's image and
// layout props. Next server-side optimization/blur generation are unavailable.
const Image = forwardRef<HTMLImageElement, ImageProps>(function Image({
  src, fill, priority, unoptimized: _unoptimized, quality: _quality,
  placeholder: _placeholder, blurDataURL: _blurDataURL, loader: _loader,
  onLoadingComplete, style, onLoad, ...props
}, ref) {
  const imageSource: string = typeof src === "string" ? src : src.src;
  return <img {...props} ref={ref} src={assetUrl(imageSource)}
    loading={priority ? "eager" : props.loading ?? "lazy"} decoding="async"
    style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
    onLoad={event => { onLoad?.(event); onLoadingComplete?.(event.currentTarget); }} />;
});
export default Image;
export type { ImageProps };
