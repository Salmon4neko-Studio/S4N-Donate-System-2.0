import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm text-ink">金額（新台幣）</legend>
        <p className="text-sm text-ink-soft">
          {min} 到 {max} 元
        </p>
        {choices.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {choices.map((value) => (
              <Button
                key={value}
                type="button"
                className="h-10 px-4"
                variant={value === amount ? "default" : "outline"}
                aria-pressed={value === amount}
                onClick={() => onAmount(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        ) : null}
        <Label htmlFor="amount">自訂金額</Label>
        <Input
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
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={methods.length === 0}>
        <legend className="text-sm text-ink">付款方式</legend>
        {methods.length === 0 ? (
          <p className="text-sm leading-6 text-ink-soft">這位創作者還沒有開放付款。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {methods.map((method) => (
              <Button
                key={method.id}
                type="button"
                className="h-10 px-4"
                variant={method.id === pluginId ? "default" : "outline"}
                aria-pressed={method.id === pluginId}
                onClick={() => onPlugin(method.id)}
              >
                {providerLabel[method.id] ?? method.name}
              </Button>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="donor-name">顯示名稱</Label>
        <Input
          id="donor-name"
          name="donorName"
          maxLength={40}
          value={donorName}
          onChange={(event) => onDonorName(event.target.value)}
          autoComplete="nickname"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="message">留言</Label>
        <Textarea
          id="message"
          name="message"
          maxLength={200}
          value={message}
          onChange={(event) => onMessage(event.target.value)}
        />
      </div>

      <Button type="submit" className="h-11 px-5" disabled={pending || methods.length === 0}>
        {pending ? "建立訂單中…" : "前往付款"}
      </Button>
      {note ? (
        <p className="text-sm leading-6 text-cinnabar" role="status">
          {note}
        </p>
      ) : null}
    </form>
  );
}
