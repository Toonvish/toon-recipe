/**
 * PlanPage — placeholder.
 *
 * This is a fix-pass stand-in only: T5.2 had to declare the `/plan` route (R24/§3
 * put both `router.tsx` param arrays in one task) before this page's own task,
 * T7.4, lands in phase 7. Landing nothing here would leave the route pointing at
 * a module that does not exist — a dangling import PLAN.md §1 and §6.1(f) both
 * call out by name — so this renders only the heading key T6.1 already shipped.
 * T7.4 replaces this body wholesale; it does not need to unpick anything here.
 */
import { useT } from "@/lib/i18n";

export default function PlanPage() {
  const t = useT();
  return <h1 className="text-xl font-semibold">{t("plan.title")}</h1>;
}
