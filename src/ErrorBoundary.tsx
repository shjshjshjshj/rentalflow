import { Component, type ReactNode } from "react";
import { t, tt } from "./i18n";
import { useLocale } from "./i18n/react";

/** 오류 화면도 언어를 따라야 하므로 언어를 구독하는 함수형 화면으로 그린다. */
function ErrorScreen({ error }: { error: Error }) {
  useLocale();
  return <main className="empty-page"><h1>{t("errorBoundary.title")}</h1><p>{tt(error.message) || t("common.unknownError")}</p><button onClick={() => location.reload()}>{t("errorBoundary.restart")}</button></main>;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: unknown) {
    console.error("Rental Flow render error", error, info);
  }
  render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} />;
    return this.props.children;
  }
}
