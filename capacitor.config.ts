import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.team226.rentalflow",
  appName: "Rental Flow",
  webDir: "dist",
  plugins: {
    // WebView 출처(https://localhost)에서는 CORS 로 막히므로 인증 요청을 네이티브로 보낸다.
    CapacitorHttp: { enabled: true },
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
    },
  },
};

export default config;
