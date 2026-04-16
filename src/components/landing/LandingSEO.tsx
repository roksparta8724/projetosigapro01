import { useEffect, useMemo } from "react";

type FAQItem = {
  question: string;
  answer: string;
};

type LandingSEOProps = {
  faqItems: readonly FAQItem[];
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);

  if (!element) {
    element = document.createElement("link");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
}

export function LandingSEO({ faqItems }: LandingSEOProps) {
  const structuredData = useMemo(() => {
    const organization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SIGAPRO",
      url: typeof window !== "undefined" ? window.location.origin : "",
      description:
        "Plataforma institucional para protocolo, analise, tramitacao e aprovacao de projetos urbanos em Prefeituras.",
    };

    const software = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SIGAPRO",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      audience: {
        "@type": "Audience",
        audienceType:
          "Prefeituras, engenheiros, arquitetos, profissionais externos, analistas internos e gestores municipais",
      },
      description:
        "Plataforma institucional para protocolo digital, analise tecnica, gestao documental, controle de taxas e aprovacao de projetos urbanos.",
      featureList: [
        "Protocolo digital",
        "Gestao documental",
        "Controle de taxas",
        "Analise tecnica municipal",
        "Comunique-se estruturado",
        "Historico do processo",
        "Operacao multi-Prefeitura",
      ],
    };

    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    };

    return JSON.stringify([organization, software, faq]);
  }, [faqItems]);

  useEffect(() => {
    const previousTitle = document.title;
    const title =
      "SIGAPRO | Plataforma institucional para protocolo, analise e aprovacao de projetos urbanos";
    const description =
      "SIGAPRO e uma plataforma institucional para protocolo digital, analise tecnica, gestao documental, controle de taxas e aprovacao de projetos urbanos em Prefeituras.";
    const url = window.location.href;

    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: "index,follow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    upsertMeta('meta[property="og:image"]', {
      property: "og:image",
      content: `${window.location.origin}/favicon.png?v=2`,
    });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', {
      name: "twitter:image",
      content: `${window.location.origin}/favicon.png?v=2`,
    });
    upsertMeta('meta[name="theme-color"]', { name: "theme-color", content: "#0f172a" });
    upsertLink('link[rel="canonical"]', { rel: "canonical", href: url });

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: structuredData }}
    />
  );
}
