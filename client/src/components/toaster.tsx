import { useToast } from "../hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm transition-all ${
            t.variant === "destructive"
              ? "bg-destructive text-destructive-foreground"
              : "bg-card text-card-foreground border border-border"
          }`}
        >
          <p className="font-medium">{t.title}</p>
          {t.description && (
            <p className="text-xs mt-1 opacity-80">{t.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
