import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep relative image URLs like "images/foo.png" working: anything
  // dropped in public/ is served from the site root verbatim.
});
