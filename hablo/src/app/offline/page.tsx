export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-2xl font-semibold">Brak połączenia</div>
      <p className="mt-2 text-muted">
        Hablo zapisuje postępy na serwerze, więc potrzebuje internetu. Wszystko, co zrobiłeś do tej pory, jest bezpieczne — wróć, gdy połączenie
        wróci.
      </p>
    </main>
  );
}
