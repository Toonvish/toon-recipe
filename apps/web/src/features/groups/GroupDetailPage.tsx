/**
 * GroupDetailPage — manage one group: rename/describe, members with role controls,
 * invites, leave, and delete with a typed-name confirmation.
 *
 * Every destructive or admin-only control is hidden when the role does not allow it, and
 * a 403 that slips through anyway is rendered as an inline error instead of a crash.
 */
import { useEffect, useState } from "react";
import { Save, Trash2, TriangleAlert } from "lucide-react";
import { UpdateGroupRequestSchema } from "@toon/shared";
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Input,
  LoadingBlock,
  Tabs,
  Textarea,
  buttonClasses,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { useCurrentUser, useSession } from "@/lib/session";
import { AppLink, useAppNavigate, useRouteParam } from "@/features/recipes/lib/nav";
import { hasAtLeast } from "@/features/recipes/lib/permissions";
import { MemberList } from "./components/MemberList";
import { InvitePanel } from "./components/InvitePanel";
import { ROLE_LABEL_KEYS } from "./lib/roleLabels";
import { useDeleteGroup, useGroupDetail, useUpdateGroup } from "./lib/queries";

type TabValue = "members" | "invites" | "settings";

export default function GroupDetailPage() {
  const t = useT();
  const groupId = useRouteParam("groupId");
  const user = useCurrentUser();
  const { activeGroupId, setActiveGroup, groups } = useSession();
  const navigate = useAppNavigate();

  const query = useGroupDetail(groupId);
  const [tab, setTab] = useState<TabValue>("members");

  if (query.isPending) return <LoadingBlock label={t("groups.detail.loading")} />;

  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <AppLink to="/groups" className={buttonClasses({ variant: "secondary" })}>
            {t("groups.detail.backToList")}
          </AppLink>
        }
      />
    );
  }

  const { group, members } = query.data;
  const isAdmin = hasAtLeast(group.role, "admin");
  const isOwner = group.role === "owner";

  const tabs = [
    { value: "members" as const, label: t("groups.detail.tab.members"), badge: members.length },
    ...(isAdmin ? [{ value: "invites" as const, label: t("groups.detail.tab.invites") }] : []),
    { value: "settings" as const, label: t("groups.detail.tab.settings") },
  ];

  function afterLeaveOrDelete() {
    // Fall back to any other group the user still has, otherwise the group list.
    const next = groups.find((candidate) => candidate.id !== group.id);
    if (next) setActiveGroup(next.id);
    navigate({ to: "/groups", replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <AppLink to="/groups" className="text-sm text-fg-muted hover:text-fg">
          {t("groups.detail.backLink")}
        </AppLink>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-fg">{group.name}</h1>
          <Badge variant={isOwner ? "brand" : "neutral"}>{t(ROLE_LABEL_KEYS[group.role])}</Badge>
          {group.id === activeGroupId ? (
            <Badge variant="success">{t("groups.badge.active")}</Badge>
          ) : null}
        </div>
        {group.description ? <p className="text-fg-muted">{group.description}</p> : null}
        <p className="text-sm text-fg-subtle">
          {t("groups.detail.meta", {
            members: t("groups.count.members", { count: group.memberCount }),
            recipes: t("groups.count.recipes", { count: group.recipeCount }),
            date: formatDate(group.createdAt),
          })}
        </p>
        {group.id !== activeGroupId ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setActiveGroup(group.id)}
          >
            {t("groups.detail.activate")}
          </Button>
        ) : null}
      </header>

      <Tabs
        items={tabs}
        value={tab}
        onChange={setTab}
        aria-label={t("groups.detail.tabsAriaLabel")}
        scrollable
      />

      {tab === "members" ? (
        <Card padding="md">
          <MemberList
            groupId={group.id}
            members={members}
            myRole={group.role}
            myUserId={user.id}
            onLeft={afterLeaveOrDelete}
          />
        </Card>
      ) : null}

      {tab === "invites" ? (
        <InvitePanel groupId={group.id} groupName={group.name} enabled={isAdmin} />
      ) : null}

      {tab === "settings" ? (
        <div className="flex flex-col gap-4">
          <GroupSettingsForm
            groupId={group.id}
            name={group.name}
            description={group.description ?? ""}
            canEdit={isAdmin}
          />
          {isOwner ? (
            <DangerZone
              groupId={group.id}
              groupName={group.name}
              recipeCount={group.recipeCount}
              onDeleted={afterLeaveOrDelete}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GroupSettingsForm({
  groupId,
  name: initialName,
  description: initialDescription,
  canEdit,
}: {
  groupId: string;
  name: string;
  description: string;
  canEdit: boolean;
}) {
  const t = useT();
  const updateGroup = useUpdateGroup();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
  }, [initialName, initialDescription]);

  const dirty = name !== initialName || description !== initialDescription;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(UpdateGroupRequestSchema, {
      name,
      description: description.trim().length > 0 ? description : null,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      await updateGroup.mutateAsync({ groupId, ...result.data });
      setErrors({});
      toast.success(t("groups.settings.savedToast"));
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Card padding="md">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">{t("groups.settings.heading")}</h2>
        {!canEdit ? (
          <p className="text-sm text-fg-muted">{t("groups.settings.readonlyHint")}</p>
        ) : null}
        {errors._form ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors._form}
          </p>
        ) : null}
        <Input
          label={t("groups.common.name")}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          disabled={!canEdit || updateGroup.isPending}
        />
        <Textarea
          label={t("groups.common.description")}
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          disabled={!canEdit || updateGroup.isPending}
        />
        <Button
          type="submit"
          loading={updateGroup.isPending}
          disabled={!canEdit || !dirty}
          leftIcon={<Save className="size-4" />}
          className="sm:self-start"
        >
          {t("groups.common.save")}
        </Button>
      </form>
    </Card>
  );
}

function DangerZone({
  groupId,
  groupName,
  recipeCount,
  onDeleted,
}: {
  groupId: string;
  groupName: string;
  recipeCount: number;
  onDeleted: () => void;
}) {
  const t = useT();
  const deleteGroup = useDeleteGroup();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const matches = confirmText.trim() === groupName;

  async function remove() {
    if (!matches) return;
    try {
      await deleteGroup.mutateAsync(groupId);
      toast.success(t("groups.danger.deletedToast"), groupName);
      setOpen(false);
      onDeleted();
    } catch (error) {
      toast.fromError(error, t("groups.danger.deleteFailedToast"));
    }
  }

  return (
    <Card padding="md" className="border-danger/40">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-danger">
        <TriangleAlert aria-hidden="true" className="size-5" />
        {t("groups.danger.heading")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        {t("groups.danger.warning", { count: recipeCount })}
      </p>
      <Button
        variant="danger"
        className="mt-3"
        onClick={() => {
          setConfirmText("");
          setOpen(true);
        }}
        leftIcon={<Trash2 className="size-4" />}
      >
        {t("groups.danger.deleteButton")}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissable={!deleteGroup.isPending}
        title={t("groups.danger.confirmTitle")}
        description={t("groups.danger.confirmDescription", { name: groupName })}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={deleteGroup.isPending}
              fullWidth
            >
              {t("groups.common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void remove()}
              disabled={!matches}
              loading={deleteGroup.isPending}
              fullWidth
            >
              {t("groups.danger.confirmButton")}
            </Button>
          </>
        }
      >
        <Input
          label={t("groups.danger.nameLabel")}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={groupName}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={
            confirmText.length > 0 && !matches ? t("groups.danger.nameMismatch") : undefined
          }
          disabled={deleteGroup.isPending}
        />
      </Dialog>
    </Card>
  );
}

/** Named export as well, for the feature barrel; the router imports the default. */
export { GroupDetailPage };
