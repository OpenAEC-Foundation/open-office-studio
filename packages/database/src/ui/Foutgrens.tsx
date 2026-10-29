/** Vangt een onverwachte fout in één weergave op, zodat de rest van de werkruimte (en de werkkopie) blijft werken. */
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function Foutmelding({ fout, onOpnieuw }: { fout: Error; onOpnieuw: () => void }) {
  const { t } = useTranslation("database");
  return (
    <div className="melding fout" role="alert">
      <p>{t("errorBoundary.crashed", { message: fout.message })}</p>
      <p>{t("errorBoundary.unaffected")}</p>
      <button onClick={onOpnieuw}>{t("common:retry")}</button>
    </div>
  );
}

export class Foutgrens extends Component<{ children: ReactNode }, { fout: Error | null }> {
  state = { fout: null as Error | null };
  static getDerivedStateFromError(fout: Error) {
    return { fout };
  }
  render() {
    if (!this.state.fout) return this.props.children;
    return <Foutmelding fout={this.state.fout} onOpnieuw={() => this.setState({ fout: null })} />;
  }
}
