import { Toaster as Sonner } from "sonner";
import { useTheme } from "../../context/ThemeContext";
export const Toaster = props => {
  const { resolvedTheme } = useTheme();
  return <Sonner theme={resolvedTheme} className="toaster group" toastOptions={{ classNames: { toast: "nexus-toast", description: "text-[var(--app-text-secondary)]", actionButton: "bg-[var(--app-primary)] text-white", cancelButton: "bg-[var(--app-surface-muted)] text-[var(--app-text-primary)]" } }} {...props}/>;
};
