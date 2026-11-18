import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/fields";
import { permissionCopy } from "@/lib/marketplace";

export function DialogFrame({
  open,
  labelledBy,
  onClose,
  children,
}: {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="s4n-dialog"
      aria-labelledby={labelledBy}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="ts-box is-raised">
        <div className="ts-content is-padded s4n-stack">{children}</div>
      </div>
    </dialog>
  );
}

export function PermissionDialog({
  open,
  mode,
  name,
  permissions,
  added,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode: "install" | "update";
  name: string;
  permissions: readonly string[];
  added: readonly string[];
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const [reviewed, setReviewed] = useState(false);
  const addedSet = new Set(added);

  useEffect(() => {
    if (open) setReviewed(false);
  }, [open]);

  return (
    <DialogFrame open={open} labelledBy={titleId} onClose={onClose}>
      <p className="s4n-kicker">{mode === "install" ? "安裝" : "更新"}</p>
      <h2 id={titleId} className="ts-header is-large">
        {mode === "install" ? `安裝「${name}」之前` : `「${name}」的權限有變動`}
      </h2>
      <p className="ts-text is-description">
        {mode === "install"
          ? "請看完這個外掛要求的權限。同意之後才會安裝，而且預設是停用。"
          : "這次更新新增了權限。沒有同意之前，會留在目前的版本。"}
      </p>
      <ul className="s4n-permission-list">
        {permissions.map((permission) => {
          const copy = permissionCopy[permission];
          const isNew = addedSet.has(permission);
          return (
            <li key={permission} className={isNew ? "s4n-permission is-new" : "s4n-permission"}>
              <div className="s4n-split">
                <strong>{copy?.label ?? permission}</strong>
                {isNew ? <span className="ts-badge is-accent">新增</span> : null}
              </div>
              <p className="ts-text is-description is-small">{copy?.detail ?? permission}</p>
            </li>
          );
        })}
      </ul>
      <label className="ts-checkbox">
        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
        我已看過這些權限
      </label>
      <div className="s4n-choices">
        <button type="button" className={buttonClass({ variant: "outlined" })} onClick={onClose} disabled={pending}>
          取消
        </button>
        <button
          type="button"
          className={buttonClass({ tone: "accent", loading: pending })}
          disabled={!reviewed || pending}
          onClick={onConfirm}
        >
          {mode === "install" ? "同意並安裝" : "同意並更新"}
        </button>
      </div>
    </DialogFrame>
  );
}

export function UninstallDialog({
  open,
  name,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (keepData: boolean) => void;
}) {
  const titleId = useId();
  const [keepData, setKeepData] = useState(true);

  useEffect(() => {
    if (open) setKeepData(true);
  }, [open]);

  return (
    <DialogFrame open={open} labelledBy={titleId} onClose={onClose}>
      <p className="s4n-kicker">移除</p>
      <h2 id={titleId} className="ts-header is-large">
        移除「{name}」
      </h2>
      <p className="ts-text is-description">外掛會停用。設定與密文可以留下，之後重新安裝還在。</p>
      <fieldset className="s4n-stack">
        <legend className="ts-text is-label">設定與密文</legend>
        <label className="ts-radio">
          <input
            type="radio"
            name="s4n-uninstall-data"
            checked={keepData}
            onChange={() => setKeepData(true)}
          />
          保留設定與密文
        </label>
        <label className="ts-radio">
          <input
            type="radio"
            name="s4n-uninstall-data"
            checked={!keepData}
            onChange={() => setKeepData(false)}
          />
          刪除設定與密文
        </label>
      </fieldset>
      {keepData ? null : (
        <p className="ts-text is-description">刪除之後，商店代號、HashKey、HashIV 與其他密文都不會留下。這個動作不能復原。</p>
      )}
      <div className="s4n-choices">
        <button type="button" className={buttonClass({ variant: "outlined" })} onClick={onClose} disabled={pending}>
          取消
        </button>
        <button
          type="button"
          className={buttonClass({ tone: "accent", loading: pending })}
          disabled={pending}
          onClick={() => onConfirm(keepData)}
        >
          {keepData ? "移除並保留資料" : "移除並刪除資料"}
        </button>
      </div>
    </DialogFrame>
  );
}
