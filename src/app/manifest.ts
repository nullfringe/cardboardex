import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cardboardex",
    short_name: "Cardboardex",
    description: "A visual trading card collection manager.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1012",
    theme_color: "#0d1012",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
