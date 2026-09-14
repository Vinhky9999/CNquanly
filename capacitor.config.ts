import type { CapacitorConfig } from "@capacitor/cli";

/**
 * CardNest is a server-rendered Next.js app (server actions + PostgreSQL) — it
 * cannot be bundled offline into a static APK. This config wraps a native
 * Android shell around the app's hosted URL (LAN address or a deployed domain).
 * See docs/APK_PACKAGING.md for the full step-by-step guide.
 */
const config: CapacitorConfig = {
  appId: "com.cardnest.quanly",
  appName: "CardNest-quanly",
  webDir: "www",
  server: {
    // Replace with where CardNest is actually reachable from the phone:
    //   - LAN, during dev/testing:  "http://192.168.1.50:3000"
    //   - Deployed with a domain:   "https://cardnest.yourdomain.com"
    url: "http://192.168.1.50:3000",
    // Only needed for plain http:// (LAN) URLs — remove once served over https.
    cleartext: true,
  },
};

export default config;
