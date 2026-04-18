import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FAQItem = {
  question: string;
  answer: string;
};

type LandingFAQProps = {
  items: readonly FAQItem[];
};

export function LandingFAQ({ items }: LandingFAQProps) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_24px_68px_rgba(15,23,42,0.06)] sm:p-7 lg:p-8">
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, index) => (
          <AccordionItem
            key={item.question}
            value={`faq-${index}`}
            className="border-b border-slate-200 px-1 last:border-none sm:px-3 lg:px-4"
          >
            <AccordionTrigger className="py-5 text-left text-[1.02rem] font-semibold leading-7 text-slate-950 hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-5 text-sm leading-7 text-slate-600">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
