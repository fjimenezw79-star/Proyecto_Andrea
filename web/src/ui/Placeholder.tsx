export function Placeholder({ title }: { title: string }) {
  return (
    <section className="px-5 py-8 md:px-10">
      <h1 className="font-serif text-5xl">{title}</h1>
    </section>
  );
}
