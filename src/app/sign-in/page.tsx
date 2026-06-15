import Image from "next/image";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth";
import { getOperatorSession } from "@/services/auth/operator-session";

export const dynamic = "force-dynamic";

const LOGO_SRC = "/assets/logo/logo.png";

export default async function SignInPage() {
  const operator = await getOperatorSession();

  if (operator) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-10 text-foreground">
      <header className="grid justify-items-center gap-4 text-center">
        <Image
          src={LOGO_SRC}
          alt="Auto-news logo"
          width={72}
          height={72}
          priority
          className="size-16 rounded-2xl shadow-lg shadow-black/30 sm:size-[72px]"
        />
        <div className="grid gap-2">
          <h1 className="title-serif text-4xl text-foreground sm:text-5xl">Auto-news</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Sign in with your operator email and a one-time code.
          </p>
        </div>
      </header>

      <SignInForm />
    </main>
  );
}
