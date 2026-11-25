/** A landscape photo filling a card (cover), for the darkened, grainy card backgrounds. */
export type CardPhotoSource = { basePath: string; width: number; height: number; position?: string };

export const cardPhotos = {
  seaOfClouds: { basePath: "/images/landscapes/sea-of-clouds", width: 3000, height: 3750, position: "50% 40%" },
  clouds: { basePath: "/images/use-cases/clouds", width: 8064, height: 4536, position: "50% 70%" },
  mawenzi: { basePath: "/images/hero/mawenzi", width: 3024, height: 3428, position: "50% 74%" },
  dolomites: { basePath: "/images/landscapes/dolomites", width: 3000, height: 2790, position: "50% 80%" },
  mistyPeak: { basePath: "/images/landscapes/misty-peak", width: 3000, height: 2790, position: "50% 72%" },
} satisfies Record<string, CardPhotoSource>;

export function CardPhoto({ photo, className, sizes = "(min-width: 768px) 600px, 100vw" }: { photo: CardPhotoSource; className: string; sizes?: string }) {
  const srcSet = (format: "avif" | "webp") => [828, 1280].map((w) => `${photo.basePath}-${w}.${format} ${w}w`).join(", ");
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <img src={`${photo.basePath}-828.webp`} srcSet={srcSet("webp")} sizes={sizes} width={photo.width} height={photo.height} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.position }} />
    </picture>
  );
}
