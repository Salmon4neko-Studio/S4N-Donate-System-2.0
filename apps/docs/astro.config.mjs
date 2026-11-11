import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  server: { port: 4321, host: true },
  integrations: [
    starlight({
      title: "S4N DONATE SYSTEM 2.0",
      description: "模組化贊助平台的文件。",
      defaultLocale: "root",
      locales: {
        root: { label: "繁體中文", lang: "zh-TW" },
      },
      lastUpdated: false,
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600&family=Noto+Serif+TC:wght@500;600&display=swap",
          },
        },
      ],
      sidebar: [
        {
          label: "開始",
          items: [
            { label: "簡介", slug: "index" },
            { label: "本機開發", slug: "guides/local-dev" },
            { label: "登入、外掛與疊層", slug: "guides/operator" },
            { label: "Docker Compose", slug: "guides/compose" },
            { label: "安全性", slug: "guides/security" },
          ],
        },
        {
          label: "規格",
          items: [
            { label: "外掛規格 0.1", slug: "reference/plugin-spec" },
            { label: "範例外掛", slug: "reference/example" },
          ],
        },
      ],
    }),
  ],
});
