import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.donate-system.salmon4neko.com",
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
      favicon: "/favicon.png",
      editLink: {
        baseUrl: "https://github.com/Salmon4neko-Studio/S4N-Donate-System-2.0/edit/main/apps/docs/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Salmon4neko-Studio/S4N-Donate-System-2.0",
        },
        {
          icon: "external",
          label: "專案官網",
          href: "https://donate-system.salmon4neko.com/",
        },
      ],
      components: {
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      customCss: ["s4n-donate-system-2.0-design-tokens/fonts.css", "./src/styles/custom.css"],
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
            { label: "正式環境", slug: "guides/production" },
            { label: "Coolify", slug: "guides/coolify" },
            { label: "CI 與映像", slug: "guides/ci" },
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
