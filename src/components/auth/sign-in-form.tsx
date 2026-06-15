"use client";

import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SignInStep = "email" | "code";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  return { ok: response.ok, error: payload?.error };
}

export function SignInForm() {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await postJson("/api/auth/request-code", { email: email.trim() });

    setIsSubmitting(false);

    if (!result.ok) {
      const message = result.error ?? "The sign-in code could not be sent.";

      setErrorMessage(message);
      toast.error(message);
      return;
    }

    setStep("code");
    toast.success("Check your email for a one-time code.");
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await postJson("/api/auth/verify-code", {
      code: code.trim(),
      email: email.trim(),
    });

    if (!result.ok) {
      setIsSubmitting(false);
      const message = result.error ?? "That code is invalid or has expired.";

      setErrorMessage(message);
      toast.error(message);
      return;
    }

    toast.success("Signed in.");
    // Full navigation so the middleware sees the freshly set session cookies.
    window.location.assign("/");
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setErrorMessage(null);
  }

  return (
    <section aria-label="Operator sign-in" className="grid w-full max-w-sm gap-5">
      {step === "email" ? (
        <form noValidate onSubmit={submitEmail} className="grid gap-3">
          <label htmlFor={fieldId} className="text-muted-foreground text-sm">
            Operator email
          </label>
          <Input
            autoComplete="email"
            autoFocus
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={Boolean(errorMessage)}
            id={fieldId}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
            className="h-11 rounded-md px-3 md:text-base"
          />
          <Button
            className="h-11 rounded-md"
            disabled={isSubmitting || !email.trim()}
            type="submit">
            {isSubmitting ? "Sending code…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={submitCode} className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor={fieldId} className="text-muted-foreground text-sm">
              One-time code
            </label>
            <p className="text-muted-foreground/70 text-xs">
              Sent to {email}.{" "}
              <button
                className="text-accent underline-offset-4 hover:underline"
                onClick={changeEmail}
                type="button">
                Use a different email
              </button>
            </p>
          </div>
          <Input
            autoComplete="one-time-code"
            autoFocus
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={Boolean(errorMessage)}
            id={fieldId}
            inputMode="numeric"
            name="code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            required
            value={code}
            className="h-11 rounded-md px-3 tracking-[0.3em] md:text-base"
          />
          <Button className="h-11 rounded-md" disabled={isSubmitting || !code.trim()} type="submit">
            {isSubmitting ? "Verifying…" : "Verify and sign in"}
          </Button>
        </form>
      )}

      <div aria-live="polite" className="min-h-5">
        {errorMessage ? (
          <p id={errorId} role="alert" className="text-center text-destructive text-sm leading-5">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
