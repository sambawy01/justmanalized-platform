export const metadata = {
  title: "Privacy Policy — Just Manalized",
  robots: { index: false },
};

const TITLE = "Privacy Policy";
const BODY = [
  "We collect your name, email address, phone number and delivery address solely to fulfil your order: to confirm it, arrange cash-on-delivery, ship it, and contact you about it.",
  "We do not sell or share your information with anyone except the courier needed to deliver your order.",
  "Messages you send to Mana, our AI concierge, are processed to generate a reply and are not used to identify you.",
  "We also keep internal records to run the shop — your order history, together with private notes and tags we may add about your preferences. These are kept until you ask us to erase them.",
  "To ask about or delete your data, write to hello@justmanalized.com.",
];

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl text-foreground">{TITLE}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        {BODY.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className="mt-10">
        <a
          href="https://justmanalized.com/shop.html"
          className="text-primary underline underline-offset-4"
        >
          ← Back to the shop
        </a>
      </p>
    </main>
  );
}
