import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Drive Player",
    short_name: "Drive Player",
    description: "Your music, stored in your Google Drive folder.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f5",
    theme_color: "#151719",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
