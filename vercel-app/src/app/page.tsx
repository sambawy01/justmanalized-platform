export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <div>
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-[#A9745A]">
          El Gouna · Egypt
        </p>
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">
          Just Manalized
        </h1>
        <p className="mt-3 text-sm text-[#847866]">
          Hand-embellished straw hats.
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <a
          href="https://shop.justmanalized.com"
          className="rounded-full bg-[#A9745A] px-8 py-3 font-medium text-[#FDF9F3] transition-opacity hover:opacity-90"
        >
          Shop the collection
        </a>
      </div>
    </main>
  );
}
