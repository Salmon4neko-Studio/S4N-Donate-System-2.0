export function PluginMark({ icon, name }: { icon: string; name: string }) {
  return (
    <span className="s4n-mark" aria-hidden="true">
      <span className={`ts-icon is-${icon}-icon`} />
      <span className="s4n-visually-hidden">{name}</span>
    </span>
  );
}

export function PluginFrame({
  frame,
  caption,
  alt,
}: {
  frame: "checkout" | "overlay" | "chat" | "tool";
  caption: string;
  alt: string;
}) {
  return (
    <figure className={`s4n-frame is-${frame}`}>
      <div className="s4n-frame-art" role="img" aria-label={alt}>
        {frame === "checkout" ? <CheckoutArt /> : null}
        {frame === "overlay" ? <OverlayArt /> : null}
        {frame === "chat" ? <ChatArt /> : null}
        {frame === "tool" ? <ToolArt /> : null}
      </div>
      <figcaption className="ts-text is-small is-description">{caption}</figcaption>
    </figure>
  );
}

function CheckoutArt() {
  return (
    <div className="s4n-art-card">
      <span className="s4n-art-kicker">贊助</span>
      <strong>NT$ 300</strong>
      <span className="s4n-art-line" />
      <span className="s4n-art-button">前往結帳</span>
    </div>
  );
}

function OverlayArt() {
  return (
    <div className="s4n-art-alert">
      <span>夜雨</span>
      <strong>300 元</strong>
      <em>這首歌我很喜歡</em>
    </div>
  );
}

function ChatArt() {
  return (
    <div className="s4n-art-chat">
      <span>夜雨　晚安</span>
      <span>小光　Kappa</span>
      <span className="is-accent">S4N　贊助 300 元</span>
    </div>
  );
}

function ToolArt() {
  return (
    <div className="s4n-art-tool">
      <span />
      <span />
      <span />
    </div>
  );
}
