import { auth } from "@/auth";
import NewJobFabClient from "./NewJobFabClient";

// Server Component: verifica sessão uma vez no SSR.
// A lógica de pathname fica no Client Component (usePathname), que atualiza
// em cada navegação client-side — o que o x-pathname header não conseguia fazer,
// pois layouts são renderizados apenas uma vez no SSR.
export default async function NewJobFab() {
  const session = await auth();
  if (!session?.user) return null;
  return <NewJobFabClient />;
}
