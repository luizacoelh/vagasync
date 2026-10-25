import { Prisma, Job as PrismaJob } from "@prisma/client";
import { parseArray, parseIndexArray } from "@/lib/json";
import { Job, JobSummary } from "@/types/job";

export function mapJob(job: PrismaJob): Job {
  return {
    ...job,
    requirements: parseArray(job.requirements),
    differentials: parseArray(job.differentials),
    technologies: parseArray(job.technologies),
    questions: parseArray(job.questions),
    checklist: parseArray(job.checklist),
    checklistDone: parseIndexArray(job.checklistDone),
  };
}

// Colunas buscadas nas listagens — par de JobSummary (types/job.ts).
export const JOB_SUMMARY_SELECT = {
  id: true,
  company: true,
  title: true,
  status: true,
  location: true,
  salary: true,
  appliedAt: true,
  summary: true,
  technologies: true,
} satisfies Prisma.JobSelect;

type JobSummaryRow = Prisma.JobGetPayload<{ select: typeof JOB_SUMMARY_SELECT }>;

export function mapJobSummary(job: JobSummaryRow): JobSummary {
  return { ...job, technologies: parseArray(job.technologies) };
}
