// Item de checklist somente leitura — usado na prévia de /nova-vaga, onde a
// vaga ainda não existe. Na página da vaga o checklist é marcável
// (components/job/JobChecklist.tsx).
export default function ChecklistItem({ text }: { text: string }) {
  return (
    <li className="flex gap-3 text-sm text-[#C4C7D0] py-0.5">
      <span
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-white/15 glass-chip"
        aria-hidden="true"
      />
      {text}
    </li>
  );
}
