import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: { __RENTALFLOW_BUILD_ID__: JSON.stringify(Date.now().toString()) },
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4174 },
});
