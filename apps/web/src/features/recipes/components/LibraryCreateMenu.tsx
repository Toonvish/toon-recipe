import { Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ActionMenu } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useEmailVerificationBlock } from "@/lib/session";

/**
 * The library's `+` sheet — the only route to `/recipes/new` AND `/import` on a
 * phone (there is no sidebar below `lg`, and the tab bar's "Importieren" tab was
 * absorbed into this menu, see PLAN.md T8.7). Built on `ActionMenu` rather than a
 * second sheet implementation: Escape, the focus trap, the scroll lock and the
 * sheet-on-phone / centred-panel-from-`sm` behaviour all come from `Dialog` for
 * free.
 *
 * Hidden, not disabled, while the account is read-only (unconfirmed e-mail with a
 * mailer configured): both destinations are pure writes, so there is nothing this
 * menu could usefully open onto.
 */
export function LibraryCreateMenu() {
  const t = useT();
  const navigate = useNavigate();
  const emailVerificationBlock = useEmailVerificationBlock();

  if (emailVerificationBlock !== undefined) return null;

  return (
    <ActionMenu
      label={t("recipes.create.triggerLabel")}
      icon={<Plus />}
      triggerVariant="brand"
      triggerSize="md"
      items={[
        {
          label: t("ui.sidenav.newRecipe"),
          description: t("recipes.create.newRecipeHint"),
          onSelect: () => navigate({ to: "/recipes/new" }),
        },
        {
          label: t("ui.nav.import"),
          description: t("recipes.create.importHint"),
          onSelect: () => navigate({ to: "/import" }),
        },
      ]}
    />
  );
}
