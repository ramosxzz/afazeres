import { useStore } from "../store";
import { Modal } from "./Modal";

export const SHORTCUTS = [
  { keys: "Ctrl K", label: "Paleta de comandos / busca" },
  { keys: "/", label: "Paleta de comandos / busca" },
  { keys: "N", label: "Nova tarefa (adição rápida)" },
  { keys: "P", label: "Novo projeto" },
  { keys: "F", label: "Iniciar / pausar foco" },
  { keys: "G D", label: "Ir para o Dōjō (início)" },
  { keys: "G P", label: "Ir para Projetos" },
  { keys: "G T", label: "Ir para Tarefas" },
  { keys: "G F", label: "Ir para Foco" },
  { keys: "G J", label: "Ir para Diário" },
  { keys: "G C", label: "Ir para Conquistas" },
  { keys: "Ctrl Enter", label: "Salvar formulário" },
  { keys: "?", label: "Mostrar atalhos" },
];

export function ShortcutsHelp() {
  const open = useStore((s) => s.helpOpen);
  const set = useStore((s) => s.set);
  return (
    <Modal open={open} onClose={() => set({ helpOpen: false })} title="Atalhos de teclado" kanji="鍵">
      <ul className="shortcut-list">
        {SHORTCUTS.map((s) => (
          <li key={s.keys + s.label}>
            <span>{s.label}</span>
            <kbd>{s.keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
