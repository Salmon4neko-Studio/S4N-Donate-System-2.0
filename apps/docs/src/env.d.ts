declare module "virtual:starlight/user-config" {
  interface StarlightSocialLink {
    label: string;
    href: string;
    icon: import("@astrojs/starlight/types").StarlightIcon;
  }

  const config: {
    social?: StarlightSocialLink[];
  };

  export default config;
}
