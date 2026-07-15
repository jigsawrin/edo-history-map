/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";

/**
 * 本番ビルド時のみ Content Security Policy の meta タグを挿入する。
 * 開発サーバーは HMR 用の WebSocket / インラインクライアントを使うため、
 * dev では挿入しない(本番の CSP を緩めないための分離)。
 * 許可する外部通信先は地理院タイル配信ドメインのみ。
 */
function injectCsp(): Plugin {
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://cyberjapandata.gsi.go.jp",
    "connect-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<!--CSP-->",
        `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    },
  };
}

export default defineConfig({
  base: "/edo-history-map/",
  plugins: [injectCsp()],
  build: {
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
