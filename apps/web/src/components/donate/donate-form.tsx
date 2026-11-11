import type { FormEvent } from "react";
import { buttonClass, choiceClass, Field, Note, TextArea, TextInput } from "@/components/fields";
import { providerLabel } from "@/lib/payment";

const presets = [50, 100, 300, 500, 1000];

export interface DonateMethod {
  id: string;
  name: string;
}

export function DonateForm({
  min,
  max,
  methods,
  amount,
  pluginId,
  donorName,
  message,
  pending,
  note,
  onAmount,
  onPlugin,
  onDonorName,
  onMessage,
  onSubmit,
}: {
  min: number;
  max: number;
  methods: DonateMethod[];
  amount: number;
  pluginId: string;
  donorName: string;
  message: string;
  pending: boolean;
  note: string | null;
  onAmount: (value: number) => void;
  onPlugin: (id: string) => void;
  onDonorName: (value: string) => void;
  onMessage: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const choices = presets.filter((value) => value >= min && value <= max);

  return (
    <form onSubmit={onSubmit} className="s4n-fields">
      <fieldset className="ts-fieldset s4n-fields">
        <legend>金額（新台幣）</legend>
        <p className="ts-text is-description">
          {min} 到 {max} 元
        </p>
        {choices.length > 0 ? (
          <div className="s4n-choices">
            {choices.map((value) => (
              <button
                key={value}
                type="button"
                className={choiceClass(value === amount)}
                aria-pressed={value === amount}
                onClick={() => onAmount(value)}
              >
                {value}
              </button>
            ))}
          </div>
        ) : null}
        <Field id="amount" label="自訂金額">
          <TextInput
            id="amount"
            name="amount"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            type="number"
            value={amount}
            onChange={(event) => onAmount(Number(event.target.value))}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="ts-fieldset s4n-fields" disabled={methods.length === 0}>
        <legend>付款方式</legend>
        {methods.length === 0 ? (
          <p className="ts-text is-description">這位創作者還沒有開放付款。</p>
        ) : (
          <div className="s4n-choices">
            {methods.map((method) => (
              <button
                key={method.id}
                type="button"
                className={choiceClass(method.id === pluginId)}
                aria-pressed={method.id === pluginId}
                onClick={() => onPlugin(method.id)}
              >
                {providerLabel[method.id] ?? method.name}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <Field id="donor-name" label="顯示名稱">
        <TextInput
          id="donor-name"
          name="donorName"
          maxLength={40}
          value={donorName}
          onChange={(event) => onDonorName(event.target.value)}
          autoComplete="nickname"
          required
        />
      </Field>
      <Field id="message" label="留言">
        <TextArea id="message" name="message" maxLength={200} value={message} onChange={(event) => onMessage(event.target.value)} />
      </Field>

      <button
        type="submit"
        className={buttonClass({ tone: "accent", size: "large", fluid: true, icon: "start", loading: pending })}
        disabled={pending || methods.length === 0}
      >
        <span className="ts-icon is-credit-card-icon" aria-hidden="true" />
        {pending ? "建立訂單中…" : "前往付款"}
      </button>
      {note ? <Note tone="danger">{note}</Note> : null}
    </form>
  );
}
