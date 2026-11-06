import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface Meldingen {
  gereed(): void;
  fout(fout: Error): void;
}
class Foutgrens extends Component<
  { kinderen: ReactNode; fout(fout: Error): void },
  { fout: boolean }
> {
  state = { fout: false };
  static getDerivedStateFromError() {
    return { fout: true };
  }
  componentDidCatch(fout: Error) {
    this.props.fout(fout);
  }
  render() {
    return this.state.fout ? null : this.props.kinderen;
  }
}
export function render(
  host: HTMLElement,
  inhoud: ReactNode,
  meld: Meldingen,
): () => void {
  const root = createRoot(host);
  root.render(<Foutgrens fout={meld.fout} kinderen={inhoud} />);
  return () => root.unmount();
}
