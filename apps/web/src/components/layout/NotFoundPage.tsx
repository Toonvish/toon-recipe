import { Link } from "@tanstack/react-router";
import { CookingPot } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** 404 route — reachable both inside and outside the app shell. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-md text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg"
        >
          <CookingPot className="size-7" />
        </span>
        <p className="mt-4 text-sm font-semibold tracking-wide text-fg-muted uppercase">404</p>
        <h1 className="mt-1 text-xl font-semibold text-fg">Diese Seite gibt es nicht</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Der Link ist vielleicht veraltet oder das Rezept wurde gelöscht.
        </p>
        <Link to="/" className={buttonClasses({ fullWidth: true, className: "mt-5" })}>
          Zu meinen Rezepten
        </Link>
      </Card>
    </div>
  );
}

export default NotFoundPage;
