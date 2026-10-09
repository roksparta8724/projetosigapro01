// Fachada canônica de operações da plataforma.
// O caminho público do aplicativo passa por backend/*; a implementação legada
// pode ser movida internamente sem quebrar consumidores.
export * from "@/integrations/supabase/platform";
