import { buttonVariants } from "../components/ui/button";

export default function ErrorPage({ code, message }: { code: string; message: string }) {
  return (
    <main className="p-8 text-center">
      <h1 className="text-2xl font-semibold">{code}</h1>
      <p className="mt-1 break-words text-muted-foreground">{message}</p>
      <a href="/" className={buttonVariants({ variant: "link" })}>Retour à la liste</a>
    </main>
  );
}
