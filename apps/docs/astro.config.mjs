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
      customCss: ["@s4n/design-tokens/fonts.css", "./src/styles/custom.css"],
      sidebar: [
        {
          label: "開始",
          items: [
            { label: "簡介", slug: "index" },
            { label: "本機開發", slug: "guides/local-dev" },
            { label: "登入、外掛與疊層", slug: "guides/operator" },
            { label: "外掛市集", slug: "guides/marketplace" },
            { label: "事件紀錄", slug: "guides/events" },
            { label: "綠界與歐付寶", slug: "guides/payments" },
            { label: "Docker Compose", slug: "guides/compose" },
            { label: "安全性", slug: "guides/security" },
            { label: "外掛開發", slug: "guides/plugin-dev" },
          ],
        },
        {
          label: "規格",
          items: [
            { label: "外掛規格 0.1", slug: "reference/plugin-spec" },
            { label: "外掛 SDK", slug: "reference/plugin-sdk" },
            { label: "範例外掛", slug: "reference/example" },
          ],
        },
      ],
    }),
  ],
});
