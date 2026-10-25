// types/job.ts
import { JobStatus, JobLocation } from "@prisma/client";

export type { JobStatus, JobLocation };

// Contrato padronizado que qualquer provedor de IA deve retornar.
// Trocar Gemini por outro provedor no futuro não deve mudar este tipo.
export interface JobAnalysis {
  company: string;
  title: string;
  summary: string;
  requirements: string[];
  differentials: string[];
  technologies: string[];
  questions: string[];
  checklist: string[];
  // Extraídos do texto quando a vaga informa; null/NAO_INFORMADO quando não.
  salary: string | null;
  location: JobLocation;
}

// Modelo utilizado pela aplicação.
// Os campos JSON são convertidos de string para arrays
// após a leitura do banco (no banco eles são strings, na aplicação são arrays).
export interface Job {
  id: string;
  company: string;
  title: string;
  description: string;
  status: JobStatus;
  url: string | null;
  location: JobLocation;
  salary: string | null;
  appliedAt: Date;
  summary: string | null;
  requirements: string[];
  differentials: string[];
  technologies: string[];
  questions: string[];
  checklist: string[];
  checklistDone: number[]; // índices de checklist marcados como feitos
  createdAt: Date;
}

// Recorte da vaga usado nas listagens (dashboard e /monitoradas). Leva só o
// que cards, tabela, estatísticas e filtros exibem: descrição, requisitos,
// perguntas e checklist ficam para a página de detalhe, que busca a vaga
// inteira. Isso mantém o payload da listagem pequeno conforme as vagas crescem.
export type JobSummary = Pick<
  Job,
  "id" | "company" | "title" | "status" | "location" | "salary" | "appliedAt" | "summary" | "technologies"
>;

// Body esperado no POST /api/jobs (vaga já analisada, pronta pra salvar)
export interface CreateJobRequest {
  description: string;
  company: string;
  title: string;
  summary?: string;
  requirements: string[];
  differentials?: string[];
  technologies: string[];
  questions: string[];
  checklist: string[];
  url?: string;
  location?: JobLocation;
  salary?: string;
  appliedAt?: string; // ISO date string vindo do <input type="date">
}

// Body esperado no PATCH /api/jobs/[id] — todos os campos opcionais,
// só os enviados são atualizados.
export interface UpdateJobRequest {
  status?: JobStatus;
  url?: string;
  location?: JobLocation;
  salary?: string;
  appliedAt?: string;
}
