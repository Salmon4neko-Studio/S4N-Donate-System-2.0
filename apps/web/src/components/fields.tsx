import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function buttonClass({
  tone = "neutral",
  variant = "solid",
  size = "medium",
  fluid = false,
  loading = false,
  icon,
}: {
  tone?: "accent" | "neutral";
  variant?: "solid" | "outlined" | "ghost";
  size?: "small" | "medium" | "large";
  fluid?: boolean;
  loading?: boolean;
  icon?: "start";
} = {}): string {
  return [
    "ts-button",
    tone === "accent" ? "is-accent" : "",
    variant === "outlined" ? "is-outlined" : "",
    variant === "ghost" ? "is-ghost" : "",
    size === "small" ? "is-small" : "",
    size === "large" ? "is-large" : "",
    fluid ? "is-fluid" : "",
    loading ? "is-loading" : "",
    icon === "start" ? "is-start-icon" : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

export function choiceClass(selected: boolean, size: "small" | "medium" = "medium"): string {
  return buttonClass({
    tone: selected ? "accent" : "neutral",
    variant: selected ? "solid" : "outlined",
    size,
  });
}

export function Field({
  id,
  label,
  hint,
  extra,
  children,
}: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="s4n-field">
      <div className="ts-wrap is-middle-aligned s4n-field-label">
        {id !== undefined ? (
          <label className="ts-text is-label" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="ts-text is-label">{label}</span>
        )}
        {extra}
      </div>
      {children}
      {hint}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="ts-input">
      <input {...props} />
    </div>
  );
}

export function TextArea({ rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="ts-input is-resizable">
      <textarea rows={rows} {...props} />
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="ts-text is-description is-small">{children}</p>;
}

export function Note({ tone = "neutral", children }: { tone?: "neutral" | "danger"; children: ReactNode }) {
  if (tone === "danger") {
    return (
      <div className="ts-notice is-negative" role="status">
        {children}
      </div>
    );
  }
  return (
    <div className="ts-notice is-outlined" role="status">
      {children}
    </div>
  );
}
