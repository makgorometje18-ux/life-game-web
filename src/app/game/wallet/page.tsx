"use client";

export default function WalletPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04111c] px-6 text-white">
      <div className="game-background-photo absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,9,16,0.16)_0%,rgba(1,7,13,0.62)_48%,rgba(0,0,0,0.94)_100%)]" />

      <section className="relative z-10 w-full max-w-xl rounded-[2rem] border border-white/10 bg-black/55 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-100">Wallet Balance</p>
        <h1 className="mt-4 text-4xl font-black text-white">Top up coming soon</h1>
        <p className="mt-4 text-base leading-7 text-stone-300">
          Real-money top ups will be added here. For now, return to the game after we connect the payment system.
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/game";
          }}
          className="mt-8 rounded-2xl bg-white px-6 py-3 font-bold text-black"
        >
          Back to Game
        </button>
      </section>
    </main>
  );
}
