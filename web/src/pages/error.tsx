export default function ErrorPage({ code, message }: { code: string; message: string }) {
  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1>{code}</h1>
      <p>{message}</p>
      <a href="/">Retour à la liste</a>
    </main>
  );
}
