import type { Job, JobAnalysis, JobSummary } from "@/types/job";

// Vagas fictícias do modo visitante: quem chega sem login vê o dashboard,
// /monitoradas e a página da vaga preenchidos com isto, sem tocar no banco.
// Os ids começam com DEMO_PREFIX; nenhum id real (cuid) começa assim.
export const DEMO_PREFIX = "exemplo-";

// Skills usadas na "Compatibilidade com suas skills" das vagas de exemplo.
export const DEMO_SKILLS = ["HTML", "CSS", "JavaScript", "React", "Git", "SQL"];

const DAY = 24 * 60 * 60 * 1000;

type DemoJob = Omit<Job, "id" | "createdAt" | "appliedAt" | "description" | "checklistDone"> & {
  slug: string;
  daysAgo: number;
  checklistDone?: number[];
};

const DASHBOARD: DemoJob[] = [
  {
    slug: "frontend-estagio",
    company: "Nimbus Tecnologia",
    title: "Estágio em Desenvolvimento Front-end",
    status: "ENTREVISTA",
    url: null,
    location: "HIBRIDO",
    salary: "Bolsa de R$ 1.800",
    daysAgo: 6,
    summary:
      "Estágio no time de produto construindo telas em React para o app web da empresa, com mentoria e code review diário.",
    requirements: [
      "Cursando Ciência da Computação, Sistemas de Informação ou áreas afins",
      "HTML, CSS e JavaScript",
      "Noções de React",
      "Git no dia a dia",
    ],
    differentials: ["TypeScript", "Testes com Jest", "Figma"],
    technologies: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Git", "Jest"],
    questions: [
      "Conte sobre um projeto em que você usou React.",
      "Como você organiza o estado de um formulário grande?",
      "O que você faz quando trava num problema por muito tempo?",
    ],
    checklist: [
      "Revisar o projeto do portfólio em React",
      "Estudar o básico de TypeScript",
      "Preparar a apresentação pessoal de 2 minutos",
      "Separar dúvidas sobre o time e a mentoria",
    ],
    checklistDone: [0, 2],
  },
  {
    slug: "dados-estagio",
    company: "Ponte Analytics",
    title: "Estágio em Dados",
    status: "APLICADA",
    url: null,
    location: "REMOTO",
    salary: null,
    daysAgo: 3,
    summary:
      "Apoio ao time de BI montando consultas SQL e dashboards para as áreas de vendas e operações.",
    requirements: ["SQL básico", "Excel ou Google Sheets", "Disponibilidade de 6h por dia"],
    differentials: ["Python", "Power BI"],
    technologies: ["SQL", "Python", "Power BI", "Excel"],
    questions: ["Qual a diferença entre INNER JOIN e LEFT JOIN?", "Como você checaria se um dado está errado?"],
    checklist: ["Refazer exercícios de JOIN", "Montar um dashboard simples no Power BI"],
  },
  {
    slug: "suporte-junior",
    company: "Cardume Sistemas",
    title: "Analista de Suporte Júnior",
    status: "OFERTA",
    url: null,
    location: "PRESENCIAL",
    salary: "R$ 2.400",
    daysAgo: 18,
    summary: "Atendimento aos clientes do ERP da empresa, abertura de chamados e testes de novas versões.",
    requirements: ["Ensino superior em andamento na área de TI", "Boa comunicação", "Noções de SQL"],
    differentials: ["Experiência com help desk"],
    technologies: ["SQL", "Windows", "Redes"],
    questions: ["Como você explicaria um problema técnico para um cliente leigo?"],
    checklist: ["Responder a proposta até sexta"],
  },
  {
    slug: "backend-estagio",
    company: "Faro Pagamentos",
    title: "Estágio em Back-end Java",
    status: "REPROVADA",
    url: null,
    location: "REMOTO",
    salary: null,
    daysAgo: 25,
    summary: "Estágio em APIs de pagamento com Java e Spring Boot.",
    requirements: ["Java", "Orientação a objetos", "Inglês intermediário"],
    differentials: ["Spring Boot", "Docker"],
    technologies: ["Java", "Spring Boot", "Docker", "PostgreSQL"],
    questions: ["O que é injeção de dependência?"],
    checklist: ["Pedir feedback da entrevista"],
  },
];

const MONITORED: DemoJob[] = [
  {
    slug: "web-teresina",
    company: "Vale Digital",
    title: "Estágio em Desenvolvimento Web",
    status: "MONITORADA",
    url: null,
    location: "PRESENCIAL",
    salary: "Bolsa de R$ 1.200",
    daysAgo: 0,
    summary: "Manutenção de sites institucionais e de um sistema interno em PHP e JavaScript.",
    requirements: ["HTML, CSS e JavaScript", "Noções de PHP", "Cursando TI"],
    differentials: ["Laravel", "MySQL"],
    technologies: ["JavaScript", "PHP", "HTML", "CSS", "MySQL", "Laravel"],
    questions: ["Já publicou algum site? Como foi?"],
    checklist: ["Atualizar o GitHub com projetos web"],
  },
  {
    slug: "qa-remoto",
    company: "Trilha Software",
    title: "Estágio em Qualidade de Software (QA)",
    status: "MONITORADA",
    url: null,
    location: "REMOTO",
    salary: null,
    daysAgo: 0,
    summary: "Testes manuais e automatizados das aplicações web e mobile da empresa.",
    requirements: ["Lógica de programação", "Atenção a detalhes", "Cursando TI"],
    differentials: ["Cypress", "Selenium"],
    technologies: ["Cypress", "JavaScript", "Git"],
    questions: ["Como você escreveria um caso de teste para um login?"],
    checklist: ["Ver um tutorial de Cypress"],
  },
  {
    slug: "react-junior",
    company: "Órbita Labs",
    title: "Desenvolvedor React Júnior",
    status: "MONITORADA",
    url: null,
    location: "REMOTO",
    salary: "R$ 3.000 a R$ 3.800",
    daysAgo: 1,
    summary: "Desenvolvimento de um painel administrativo em React e Next.js.",
    requirements: ["React", "JavaScript", "Consumo de APIs REST"],
    differentials: ["Next.js", "Tailwind CSS"],
    technologies: ["React", "Next.js", "JavaScript", "Tailwind CSS", "Git"],
    questions: ["Qual a diferença entre estado e props?"],
    checklist: ["Fazer um projeto pequeno com Next.js"],
  },
];

function toJob({ slug, daysAgo, checklistDone = [], ...job }: DemoJob, now: number): Job {
  const date = new Date(now - daysAgo * DAY);
  return {
    ...job,
    id: DEMO_PREFIX + slug,
    description: "",
    appliedAt: date,
    createdAt: date,
    checklistDone,
  };
}

function toSummary(job: Job): JobSummary {
  const { id, company, title, status, location, salary, appliedAt, summary, technologies } = job;
  return { id, company, title, status, location, salary, appliedAt, summary, technologies };
}

export function isDemoJobId(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

export function getDemoDashboardJobs(now = Date.now()): JobSummary[] {
  return DASHBOARD.map((job) => toSummary(toJob(job, now)));
}

// createdAt vai junto para /monitoradas agrupar por dia, como faz com as reais.
export function getDemoMonitoredRows(now = Date.now()): (JobSummary & { createdAt: Date })[] {
  return MONITORED.map((demo) => {
    const job = toJob(demo, now);
    return { ...toSummary(job), createdAt: job.createdAt };
  });
}

export function getDemoJob(id: string, now = Date.now()): Job | null {
  const demo = [...DASHBOARD, ...MONITORED].find((job) => DEMO_PREFIX + job.slug === id);
  return demo ? toJob(demo, now) : null;
}

// Vaga de exemplo de /nova-vaga, para quem quer testar sem ter uma vaga em
// mãos. Texto realista de uma vaga de estágio em desenvolvimento web.
export const EXAMPLE_JOB = `Estágio em Desenvolvimento Web — Empresa Exemplo Tecnologia

Sobre a vaga:
Buscamos estudantes de TI, Ciência da Computação, Engenharia de Software ou áreas relacionadas para integrar nosso time de produto como estagiário(a) de desenvolvimento web.

Responsabilidades:
- Desenvolver e manter funcionalidades no frontend e backend das nossas aplicações
- Participar de code reviews e reuniões de planejamento de sprint
- Colaborar com o time de design para implementar interfaces responsivas
- Escrever testes automatizados para as funcionalidades desenvolvidas

Requisitos:
- Cursando graduação em área de TI (a partir do 3º semestre)
- Conhecimento em HTML, CSS e JavaScript
- Noções de React ou outro framework frontend
- Familiaridade com Git e fluxo de trabalho em equipe

Diferenciais:
- Experiência com TypeScript
- Conhecimento em Node.js ou Python no backend
- Experiência com banco de dados SQL

O que oferecemos:
- Bolsa-auxílio compatível com o mercado
- Vale-refeição e vale-transporte
- Modelo híbrido (2x presencial por semana)
- Mentoria com desenvolvedores seniores
- Possibilidade de efetivação

Carga horária: 30h semanais
Local: São Paulo, SP (híbrido)`;

// Análise pronta da EXAMPLE_JOB: o visitante vê o resultado da IA sem gastar
// uma chamada ao Gemini (e sem precisar de login para isso).
export const EXAMPLE_ANALYSIS: JobAnalysis = {
  company: "Empresa Exemplo Tecnologia",
  title: "Estágio em Desenvolvimento Web",
  summary:
    "Estágio no time de produto desenvolvendo funcionalidades de front-end e back-end, com code review, testes automatizados e mentoria de desenvolvedores seniores.",
  requirements: [
    "Cursando graduação em TI a partir do 3º semestre",
    "HTML, CSS e JavaScript",
    "Noções de React ou outro framework front-end",
    "Git e trabalho em equipe",
  ],
  differentials: ["TypeScript", "Node.js ou Python no back-end", "Banco de dados SQL"],
  technologies: ["HTML", "CSS", "JavaScript", "React", "Git", "TypeScript", "Node.js", "Python", "SQL"],
  questions: [
    "Conte sobre um projeto web que você desenvolveu.",
    "Como você testaria uma funcionalidade nova antes de entregar?",
    "Já participou de code review? Como foi?",
  ],
  checklist: [
    "Deixar um projeto em React no GitHub",
    "Revisar fundamentos de JavaScript",
    "Estudar o básico de TypeScript",
    "Preparar exemplos de trabalho em equipe",
  ],
  salary: null,
  location: "HIBRIDO",
};
