import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useActiveGroup } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ROLE_LABEL_KEYS } from "./lib/roleLabels";

export interface GroupSwitcherProps {
  /** `bar` = compact trigger for the top bar, `block` = full-width for the sidebar. */
  variant?: "bar" | "block";
  className?: string;
}

/**
 * Active-group switcher. Everything group-scoped (recipes, tags, collections,
 * imports) follows this selection, which is persisted per device.
 */
export function GroupSwitcher({ variant = "bar", className }: GroupSwitcherProps) {
  const t = useT();
  const { group, groups, groupId, setActiveGroup } = useActiveGroup();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const label = group?.name ?? t("groups.switcher.noGroup");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          variant === "block" && "w-full border border-line bg-surface px-3 shadow-soft",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg"
        >
          <Users className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{label}</span>
          {variant === "block" && group ? (
            <span className="block truncate text-xs text-fg-muted">
              {t("groups.count.members", { count: group.memberCount })} ·{" "}
              {t("groups.count.recipes", { count: group.recipeCount })}
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("groups.switcher.title")}
        description={t("groups.switcher.description")}
        size="sm"
      >
        <ul className="flex flex-col gap-1 pb-2">
          {groups.map((entry) => {
            const active = entry.id === groupId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!active) setActiveGroup(entry.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150",
                    active ? "bg-brand-soft" : "hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{entry.name}</span>
                      <Badge size="sm" variant={active ? "brand" : "neutral"}>
                        {t(ROLE_LABEL_KEYS[entry.role])}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">
                      {t("groups.count.members", { count: entry.memberCount })} ·{" "}
                      {t("groups.count.recipes", { count: entry.recipeCount })}
                    </span>
                  </span>
                  {active ? (
                    <Check className="size-5 shrink-0 text-brand" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
          {groups.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">
              {t("groups.switcher.empty")}
            </li>
          ) : null}
        </ul>

        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Plus className="size-4" />}
          onClick={() => {
            setOpen(false);
            void navigate({ to: "/groups" });
          }}
        >
          {t("groups.switcher.manageButton")}
        </Button>
      </Dialog>
    </>
  );
}

export default GroupSwitcher;
