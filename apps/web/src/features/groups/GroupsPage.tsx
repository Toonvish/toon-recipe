/**
 * GroupsPage — "Meine Gruppen": every group the user belongs to with their role,
 * plus creating a new one. Recipes, tags and collections belong to a GROUP, so this is
 * also where the user switches context (the active group is marked).
 */
import { useState } from "react";
import { Check, Plus, Users } from "lucide-react";
import { CreateGroupRequestSchema } from "@toon/shared";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { plural, roleLabels } from "@/lib/format";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { useActiveGroup } from "@/lib/session";
import { AppLink } from "@/features/recipes/lib/nav";
import { useCreateGroup, useGroups } from "./lib/queries";

export default function GroupsPage() {
  const groups = useGroups();
  const { groupId, setActiveGroup } = useActiveGroup();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 pb-tabbar">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">Gruppen</h1>
          <p className="text-sm text-fg-muted">
            Rezepte, Tags und Sammlungen gehören immer zu einer Gruppe.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
          Gruppe anlegen
        </Button>
      </header>

      {groups.isPending ? (
        <ul className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Card padding="md" className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </Card>
            </li>
          ))}
        </ul>
      ) : groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
      ) : (groups.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Noch keine Gruppe"
          description="Lege eine Gruppe an, z. B. „Familie“, und lade andere per E-Mail ein."
          action={
            <Button onClick={() => setCreateOpen(true)} fullWidth leftIcon={<Plus className="size-4" />}>
              Gruppe anlegen
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {(groups.data ?? []).map((group) => {
            const isActive = group.id === groupId;
            return (
              <li key={group.id}>
                <Card padding="md" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AppLink
                          to="/groups/$groupId"
                          params={{ groupId: group.id }}
                          className="truncate font-display text-lg font-semibold text-fg hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {group.name}
                        </AppLink>
                        <Badge variant={group.role === "owner" ? "brand" : "neutral"}>
                          {roleLabels[group.role]}
                        </Badge>
                        {isActive ? (
                          <Badge variant="success" icon={<Check />}>
                            Aktiv
                          </Badge>
                        ) : null}
                      </div>
                      {group.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">
                          {group.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-fg-subtle">
                        {plural(group.memberCount, "Mitglied", "Mitglieder")} ·{" "}
                        {plural(group.recipeCount, "Rezept", "Rezepte")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveGroup(group.id)}
                      >
                        Aktivieren
                      </Button>
                    ) : null}
                    <AppLink to="/groups/$groupId" params={{ groupId: group.id }}>
                      <Button variant="ghost" size="sm">
                        Verwalten
                      </Button>
                    </AppLink>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createGroup = useCreateGroup();
  const { setActiveGroup } = useActiveGroup();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function close() {
    setName("");
    setDescription("");
    setErrors({});
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(CreateGroupRequestSchema, {
      name,
      description: description.trim().length > 0 ? description : undefined,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const group = await createGroup.mutateAsync(result.data);
      setActiveGroup(group.id);
      toast.success("Gruppe angelegt", group.name);
      close();
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Neue Gruppe"
      description="Du wirst automatisch Besitzer:in und kannst danach Mitglieder einladen."
      size="sm"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors._form ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors._form}
          </p>
        ) : null}
        <Input
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Familie"
          error={errors.name}
          disabled={createGroup.isPending}
          autoFocus
        />
        <Textarea
          label="Beschreibung"
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Unsere gesammelten Familienrezepte."
          error={errors.description}
          disabled={createGroup.isPending}
        />
        <div className="mt-1 flex gap-2">
          <Button type="button" variant="secondary" onClick={close} fullWidth disabled={createGroup.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={createGroup.isPending} fullWidth>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { GroupsPage };
