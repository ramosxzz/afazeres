import { useEffect, useReducer } from "react";

/** Re-renderiza o componente a cada `ms` enquanto `active` for verdadeiro. */
export function useTick(active: boolean, ms = 1000) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(force, ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
