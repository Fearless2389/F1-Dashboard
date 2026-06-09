/**
 * F1 CDN headshot URLs ship with a `transform/{n}col/` segment that controls
 * the rendered size. The default `1col` is small (~200px wide) and blurs
 * when stretched across a hero bleed. We swap it to a much larger variant.
 *
 * Layout sizes documented by formula1.com:
 *    1col  ≈ 200px      (default, blurry as a hero)
 *    2col  ≈ 250px
 *    3col  ≈ 325px
 *    4col  ≈ 410px
 *    6col  ≈ 615px
 *    12col ≈ 1280px     (largest available, used for full-bleed)
 */
export function highResHeadshot(url: string | null | undefined, size: "4col" | "6col" | "12col" = "6col"): string | null {
  if (!url) return null;
  // Replace whatever transform variant is on the URL with our preferred size
  const swapped = url.replace(/\/transform\/\d+col\//i, `/transform/${size}/`);
  // If the URL didn't have a transform segment, return as-is
  return swapped;
}
