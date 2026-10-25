// Sinônimos de tecnologias para a comparação de skills (lib/skillGap.ts).
// As chaves já estão no formato de skillKey(): minúsculas, sem acento, sem
// espaço, ponto, hífen ou underline — então "Node.js", "NodeJS" e "node js"
// chegam aqui todos como "nodejs". O valor é a forma canônica.
//
// EDITE à vontade: só afeta a comparação vaga x perfil, nada é salvo.
export const SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  ecmascript: "javascript",
  es6: "javascript",
  ts: "typescript",

  reactjs: "react",
  nodejs: "node",
  nextjs: "next",
  vuejs: "vue",
  vue3: "vue",
  angularjs: "angular",
  expressjs: "express",
  nestjs: "nest",

  py: "python",
  python3: "python",
  golang: "go",
  csharp: "c#",
  dotnet: "net",
  netcore: "net",
  aspnet: "net",
  aspnetcore: "net",

  html5: "html",
  css3: "css",
  tailwindcss: "tailwind",
  scss: "sass",

  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  mssql: "sqlserver",
  microsoftsqlserver: "sqlserver",
  mysql8: "mysql",

  k8s: "kubernetes",
  amazonwebservices: "aws",
  googlecloud: "gcp",
  googlecloudplatform: "gcp",
  msazure: "azure",
  microsoftazure: "azure",

  rest: "restapi",
  restful: "restapi",
  apirest: "restapi",
  apisrest: "restapi",
  restapis: "restapi",

  msexcel: "excel",
  microsoftexcel: "excel",
};
